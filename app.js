import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
let startupError = null;

function reportRuntimeError(message) {
  startupError = message;
  const status = document.querySelector('#model-status');
  if (status) status.textContent = `Preview error: ${message}`;
  console.error(message);
}

window.addEventListener('error', (event) => {
  reportRuntimeError(event.message || 'The preview could not start.');
});

window.addEventListener('unhandledrejection', (event) => {
  reportRuntimeError(event.reason?.message || 'The preview could not start.');
});

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
camera.position.set(0, 1.7, 7);

const renderer = new THREE.WebGLRenderer({
  canvas,
  alpha: true,
  antialias: true
});

renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xffffff, 0x19152e, 2));

const key = new THREE.DirectionalLight(0xffffff, 2);
key.position.set(3, 5, 5);
scene.add(key);

const root = new THREE.Group();
root.position.y = -2.2;
scene.add(root);

let avatar = null;
let fallback = null;
let wave = 0;
let talking = 0;
let walking = true;
let blink = 0;
let nextBlink = 2.5;
let rig = null;
let mixer = null;
let baseAction = null;
let waveAction = null;
const clock = new THREE.Clock();
const modelLoader = new GLTFLoader();

const material = (color, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness });

function makePreview() {
  const g = new THREE.Group();
  const skin = material(0xd59f7d, 0.9);
  const suit = material(0x15161b, 0.75);
  const shirt = material(0xf5f4ef, 0.9);
  const hair = material(0x211812, 1);
  const eye = material(0x59371e, 0.35);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 1.65, 8, 20), suit);
  torso.position.y = 1.15;
  g.add(torso);

  const collar = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.75, 4), shirt);
  collar.rotation.y = Math.PI / 4;
  collar.position.set(0, 1.55, 0.43);
  g.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.73, 32, 24), skin);
  head.scale.set(1, 0.98, 0.9);
  head.position.y = 2.7;
  g.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.77, 32, 20), hair);
  hairMesh.scale.set(1.02, 0.72, 0.95);
  hairMesh.position.set(0, 3.08, -0.05);
  g.add(hairMesh);

  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.59, 28, 18), hair);
  beard.scale.set(1.1, 0.72, 0.8);
  beard.position.set(0, 2.25, 0.39);
  g.add(beard);

  const eyes = [];
  for (const x of [-0.19, 0.19]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), eye);
    e.position.set(x, 2.8, 0.65);
    g.add(e);
    eyes.push(e);
  }

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin);
  nose.scale.set(0.7, 1.4, 0.8);
  nose.position.set(0, 2.6, 0.72);
  g.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 10),
    material(0x37151a, 0.7)
  );
  mouth.scale.set(1.5, 0.35, 0.45);
  mouth.position.set(0, 2.38, 0.78);
  g.add(mouth);

  const arms = [];
  for (const x of [-1.08, 1.08]) {
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.25, 8, 12), suit);
    a.position.set(x, 1.15, 0);
    a.rotation.z = x < 0 ? 0.22 : -0.22;
    g.add(a);
    arms.push(a);
  }

  const legs = [];
  for (const x of [-0.35, 0.35]) {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.8, 8, 12), suit);
    l.position.set(x, -0.75, 0);
    g.add(l);
    legs.push(l);

    const s = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.18, 0.8), material(0x080808));
    s.position.set(x, -1.8, 0.18);
    g.add(s);
  }

  g.userData.animation = { arms, legs, eyes, mouth };
  return g;
}

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const scale = 4.5 / Math.max(size.y, 0.001);
  model.scale.setScalar(scale);
  model.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );
}

function setAvatar(model, animations = []) {
  if (avatar) root.remove(avatar);
  if (mixer) mixer.stopAllAction();
  avatar = model;
  rig = createRig(model);
  mixer = animations.length ? new THREE.AnimationMixer(model) : null;
  baseAction = null;
  waveAction = null;
  if (mixer && animations.length) {
    const baseClip = animations.find((clip) =>
      /mixamo|idle|walk/i.test(clip.name) && !/wave/i.test(clip.name)
    ) || animations.find((clip) => !/wave/i.test(clip.name)) || animations[0];
    const waveClip = animations.find((clip) => /wave/i.test(clip.name) && clip.duration > 0.5);

    try {
      baseAction = mixer.clipAction(baseClip);
      baseAction.setLoop(THREE.LoopRepeat, Infinity).play();
      waveAction = waveClip ? mixer.clipAction(waveClip) : null;
    } catch (error) {
      mixer = null;
      reportRuntimeError(`Animation setup failed: ${error.message}`);
    }
  }
  root.add(avatar);
}

function createRig(model) {
  const result = {
    arms: [],
    legs: [],
    eyes: [],
    mouth: [],
    morphs: []
  };
  const names = (object) => `${object.name} ${object.parent?.name || ''}`.toLowerCase();

  if (model.userData.animation) {
    result.arms = model.userData.animation.arms;
    result.legs = model.userData.animation.legs;
    result.eyes = model.userData.animation.eyes;
    result.mouth = [model.userData.animation.mouth];
  }

  model.traverse((object) => {
    const name = names(object);
    if (object.isBone) {
      if (/arm|hand|shoulder/.test(name)) result.arms.push(object);
      if (/leg|thigh|shin|foot/.test(name)) result.legs.push(object);
    }
    if (object.isMesh) {
      if (/eye|eyelid/.test(name)) result.eyes.push(object);
      if (/mouth|lip|jaw/.test(name)) result.mouth.push(object);
      if (object.morphTargetDictionary) result.morphs.push(object);
    }
  });

  result.armRest = result.arms.map((part) => part.rotation.clone());
  result.legRest = result.legs.map((part) => part.rotation.clone());
  return result;
}

fallback = makePreview();
setAvatar(fallback);

modelLoader.load(
  'T-Pose_model.glb',
  (g) => {
    const model = g.scene;
    fitModel(model);
    setAvatar(model, g.animations);
    document.querySelector('#model-status').textContent = 'Showing your default Saeed model.';
  },
  undefined,
  (err) => {
    document.querySelector('#model-status').textContent = 'Showing the Saeed preview character.';
    console.error('Could not load the default Saeed model.', err);
  }
);

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

const log = document.querySelector('#chat-log');

function say(who, text) {
  const d = document.createElement('div');
  d.className = 'message ' + (who === 'You' ? 'you' : '');
  d.innerHTML = '<b>' + who + '</b>' + text;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

let muted = false;

function speak(text) {
  if (muted || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const preferred = voices.find(v => /en/i.test(v.lang)) || voices[0];
  if (preferred) u.voice = preferred;
  u.rate = 1;
  u.pitch = 1.05;
  talking = 1;
  u.onend = () => {
    talking = 0;
  };
  speechSynthesis.speak(u);
}

function respond(text) {
  const q = text.toLowerCase();

  if (q.includes('hello') || q === 'hi') {
    return 'Hello! I am Saeed, your personal 3D assistant.';
  }

  if (q.includes('joke')) {
    return 'Why did the developer cross the road? To deploy the app.';
  }

  if (q.includes('time')) {
    return `The time is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  }

  if (q.includes('date')) {
    return `Today is ${new Date().toLocaleDateString()}.`;
  }

  if (q.includes('who are')) {
    return 'I am Saeed, your friendly desktop companion.';
  }

  if (q.includes('wave')) {
    wave = 1.5;
    return 'Of course. Hello!';
  }

  return 'I can greet you, tell jokes, show the time and date, wave, and preview your 3D model.';
}

function send(text) {
  text = text.trim();
  if (!text) return;

  say('You', text);

  const reply = respond(text);
  say('Saeed', reply);
  talking = 1;
  speak(reply);
}

document.querySelector('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.querySelector('#chat-input');
  send(input.value);
  input.value = '';
});

document.querySelectorAll('[data-command]').forEach((button) => {
  button.onclick = () => send(button.dataset.command);
});

document.querySelector('#wave-button').onclick = () => {
  wave = waveAction ? waveAction.getClip().duration : 1.5;
  if (waveAction && baseAction) {
    baseAction.fadeOut(0.2);
    waveAction.reset().setLoop(THREE.LoopOnce, 1);
    waveAction.clampWhenFinished = true;
    waveAction.fadeIn(0.2).play();
  }
  say('Saeed', 'Hello!');
  speak('Hello!');
};

document.querySelector('#mute-button').onclick = (e) => {
  muted = !muted;
  e.target.textContent = muted ? 'Unmute voice' : 'Mute voice';
};

document.querySelector('#model-upload').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  modelLoader.load(
    URL.createObjectURL(file),
    (g) => {
      const model = g.scene;
      fitModel(model);
      setAvatar(model, g.animations);
      document.querySelector('#model-status').textContent = 'Loaded: ' + file.name;
    },
    undefined,
    (err) => {
      document.querySelector('#model-status').textContent = 'Could not load this GLB file.';
      console.error(err);
    }
  );
};

say('System', 'Saeed is online.');
say('Saeed', 'Hello! Load your GLB model or ask me something.');

function animate() {
  requestAnimationFrame(animate);

  const t = performance.now() / 1000;
  const delta = clock.getDelta();
  const step = Math.sin(t * 5.2);
  const oppositeStep = Math.sin(t * 5.2 + Math.PI);
  const talkingAmount = talking > 0 ? 1 : 0;

  if (t > nextBlink && blink === 0) {
    blink = 1;
    nextBlink = t + 2.8 + Math.random() * 3.5;
  }
  blink = Math.max(0, blink - 0.16);
  const blinkAmount = blink > 0.5 ? (blink - 0.5) * 2 : blink * 2;

  if (avatar) {
    mixer?.update(delta);
    if (!mixer) {
      avatar.rotation.y = Math.sin(t * 0.7) * 0.045;
      avatar.rotation.x = Math.sin(t * 2.6) * 0.012;
      avatar.position.y = walking ? Math.abs(step) * 0.035 : 0;
    }

    if (walking && rig && !mixer) {
      rig.legs.forEach((part, index) => {
        const rest = rig.legRest[index];
        const stride = index % 2 === 0 ? step : oppositeStep;
        part.rotation.x = rest.x + stride * 0.32;
      });

      rig.arms.forEach((part, index) => {
        const rest = rig.armRest[index];
        const stride = index % 2 === 0 ? oppositeStep : step;
        part.rotation.x = rest.x + stride * 0.12;
        part.rotation.z = rest.z + Math.sin(t * 2.6 + index) * 0.035;
      });
    }

    if (wave > 0) {
      if (!mixer) {
        const waveProgress = 1 - wave / 1.5;
        avatar.rotation.z = Math.sin(waveProgress * Math.PI) * 0.035;
        const wavingArm = rig?.arms[rig.arms.length - 1];
        if (wavingArm) {
          wavingArm.rotation.z += Math.sin(t * 12) * 0.45;
          wavingArm.rotation.x -= 0.5;
        }
      }
      wave = Math.max(0, wave - delta);
      if (wave === 0 && waveAction && baseAction) {
        waveAction.fadeOut(0.2);
        baseAction.reset().fadeIn(0.2).play();
      }
    } else {
      if (!mixer) avatar.rotation.z = 0;
    }

    rig?.eyes.forEach((eye) => {
      eye.scale.y = Math.max(0.08, 1 - blinkAmount * 0.92);
    });

    rig?.mouth.forEach((mouth) => {
      mouth.scale.y = 0.35 + talkingAmount * (0.18 + Math.abs(Math.sin(t * 14)) * 0.35);
    });

    rig?.morphs.forEach((mesh) => {
      Object.entries(mesh.morphTargetDictionary).forEach(([name, index]) => {
        const lowerName = name.toLowerCase();
        if (/blink|eye.?close|eyelid/.test(lowerName)) {
          mesh.morphTargetInfluences[index] = blinkAmount;
        } else if (/mouth|jaw|viseme|talk|open/.test(lowerName)) {
          mesh.morphTargetInfluences[index] = talkingAmount * (0.15 + Math.abs(Math.sin(t * 12)) * 0.5);
        }
      });
    });
  }

  renderer.render(scene, camera);
}

animate();
