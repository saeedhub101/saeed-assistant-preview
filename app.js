import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.querySelector('#scene');
const contextMenu = document.querySelector('#context-menu');
const chatWindow = document.querySelector('#chat-window');
const settingsWindow = document.querySelector('#settings-window');
const chatLog = document.querySelector('#chat-log');
const chatForm = document.querySelector('#chat-form');
const chatInput = document.querySelector('#chat-input');
const toast = document.querySelector('#toast');
const toggleSound = document.querySelector('#toggle-sound');
const toggleAnimations = document.querySelector('#toggle-animations');
const toggleIdleWalk = document.querySelector('#toggle-idle-walk');
const sizeSlider = document.querySelector('#size-slider');
const textSlider = document.querySelector('#text-slider');
const volumeSlider = document.querySelector('#volume-slider');
const sizeValue = document.querySelector('#size-value');
const textValue = document.querySelector('#text-value');
const volumeValue = document.querySelector('#volume-value');
const gmailInput = document.querySelector('#gmail-input');
const accountStatus = document.querySelector('#account-status');
const voiceStatus = document.querySelector('#voice-status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.6, 6.8);

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xffffff, 0x151d29, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
keyLight.position.set(3, 5, 5);
scene.add(keyLight);

const root = new THREE.Group();
root.position.set(0, -1.8, 0);
scene.add(root);

const clock = new THREE.Clock();
const modelLoader = new GLTFLoader();

let avatar = null;
let rig = null;
let mixer = null;
let baseAction = null;
let walkAction = null;
let waveAction = null;
let idleWalkDirection = 1;
let lastInteraction = Date.now();
let boredNoticeSent = false;
let dragActive = false;
let startedDragOnAvatar = false;

const state = {
  talking: 0,
  voiceEnabled: true,
  animationsEnabled: true,
  idleWalkingEnabled: true,
  avatarMood: 'neutral',
  autoWalk: false,
  lastIdleSpeech: 0,
  gmailConnected: false,
  gmailAddress: '',
  snoozedUntil: 0,
  idleTimer: 0,
  avatarScale: 1,
  textScale: 1,
  voiceVolume: 1
};

const screenBounds = { minX: -5.2, maxX: 5.2 };
const material = (color, roughness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness });

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => toast.classList.add('hidden'), 2400);
}

function setStatus(text) {
  const pill = document.querySelector('#status-pill');
  if (pill) pill.lastChild.textContent = text;
}

function say(who, text) {
  const entry = document.createElement('div');
  entry.className = `message ${who === 'You' ? 'you' : ''}`;
  entry.innerHTML = `<b>${who}</b>${text}`;
  chatLog.appendChild(entry);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function speak(text) {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const arabicMale = voices.find(v => /ar/i.test(v.lang) && /male|man|ahmed|karim|zayd|salim|omar/i.test(v.name));
  const englishMale = voices.find(v => /en/i.test(v.lang) && /male|man|david|daniel|mark|tom|john|guy|harry|liam|alex/i.test(v.name));
  const preferred = arabicMale || englishMale || voices.find(v => /ar|en/i.test(v.lang)) || voices[0];

  if (preferred) {
    utterance.voice = preferred;
    utterance.lang = preferred.lang;
    voiceStatus.textContent = preferred.lang.toUpperCase();
  } else {
    voiceStatus.textContent = 'Auto';
  }

  utterance.rate = 0.9;
  utterance.pitch = 0.9;
  utterance.volume = Math.max(0, Math.min(1, state.voiceVolume));
  state.talking = 1;
  utterance.onend = () => {
    state.talking = 0;
  };
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function applyDisplaySettings() {
  root.scale.setScalar(state.avatarScale);
  sizeValue.textContent = `${Math.round(state.avatarScale * 100)}%`;
  textValue.textContent = `${Math.round(state.textScale * 100)}%`;
  volumeValue.textContent = `${Math.round(state.voiceVolume * 100)}%`;
  chatLog.style.fontSize = `${14 * state.textScale}px`;
  chatInput.style.fontSize = `${14 * state.textScale}px`;
}

function buildFallbackAvatar() {
  const group = new THREE.Group();
  const skin = material(0xd9a57b, 0.88);
  const suit = material(0x141921, 0.8);
  const shirt = material(0xf4f2ee, 0.82);
  const hair = material(0x1d120d, 1);
  const eye = material(0x4f3325, 0.5);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 1.5, 8, 18), suit);
  torso.position.y = 1.0;
  group.add(torso);

  const shirtPiece = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.72, 5), shirt);
  shirtPiece.rotation.y = Math.PI / 4;
  shirtPiece.position.set(0, 1.58, 0.35);
  group.add(shirtPiece);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.72, 28, 22), skin);
  head.scale.set(1, 0.96, 0.9);
  head.position.y = 2.6;
  group.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.78, 30, 18), hair);
  hairMesh.scale.set(1.08, 0.75, 0.96);
  hairMesh.position.set(0, 3.05, -0.03);
  group.add(hairMesh);

  const eyes = [];
  for (const x of [-0.18, 0.18]) {
    const eyeMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 14), eye);
    eyeMesh.position.set(x, 2.72, 0.6);
    group.add(eyeMesh);
    eyes.push(eyeMesh);
  }

  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), material(0x3d171c, 0.6));
  mouth.scale.set(1.5, 0.35, 0.4);
  mouth.position.set(0, 2.38, 0.73);
  group.add(mouth);

  const arms = [];
  const armY = 1.15;
  for (const x of [-1.05, 1.05]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.28, 8, 12), suit);
    arm.position.set(x, armY, 0.02);
    arm.rotation.z = x < 0 ? 0.9 : -0.9;
    arm.rotation.x = 0.15;
    group.add(arm);
    arms.push(arm);
  }

  const legs = [];
  for (const x of [-0.33, 0.33]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 1.7, 6, 12), suit);
    leg.position.set(x, -0.75, 0);
    group.add(leg);
    legs.push(leg);
  }

  group.userData.animation = { arms, legs, eyes, mouth };
  return group;
}

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const scale = 4.2 / Math.max(size.y || 1, 0.001);
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
}

function normalizePose(model) {
  model.traverse((object) => {
    const name = (object.name || '').toLowerCase();

    if (object.isBone && /(arm|upperarm|forearm|hand|shoulder)/i.test(name)) {
      object.rotation.x = 0.12;
      object.rotation.z = /left|l/.test(name) ? 0.82 : -0.82;
    }

    if (object.isBone && /(leg|shin|thigh|foot)/i.test(name)) {
      object.rotation.x = 0.08;
    }
  });
}

function createRig(model) {
  const result = {
    arms: [],
    legs: [],
    head: null,
    eyes: [],
    mouth: [],
    morphs: []
  };

  if (model.userData.animation) {
    result.arms = model.userData.animation.arms || [];
    result.legs = model.userData.animation.legs || [];
    result.eyes = model.userData.animation.eyes || [];
    result.mouth = model.userData.animation.mouth ? [model.userData.animation.mouth] : [];
  }

  model.traverse((object) => {
    const name = `${object.name || ''} ${(object.parent && object.parent.name) || ''}`.toLowerCase();
    if (object.isBone) {
      if (/head|neck/i.test(name) && !result.head) result.head = object;
      if (/arm|hand|shoulder|forearm|upperarm/.test(name)) result.arms.push(object);
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
  result.headRest = result.head ? result.head.rotation.clone() : null;
  return result;
}

function setAvatar(model, animations = []) {
  if (avatar) root.remove(avatar);
  if (mixer) mixer.stopAllAction();

  avatar = model;
  avatar.position.set(0, 0, 0);
  normalizePose(avatar);

  rig = createRig(model);
  mixer = animations.length ? new THREE.AnimationMixer(model) : null;

  baseAction = null;
  walkAction = null;
  waveAction = null;

  if (mixer && animations.length) {
    const walkClip = animations.find((clip) => /(walk|stride|step|move|run)/i.test(clip.name));
    const idleClip = animations.find((clip) => /(idle|stand|breath|pose)/i.test(clip.name));
    const waveClip = animations.find((clip) => /wave/i.test(clip.name));

    if (walkClip) {
      walkAction = mixer.clipAction(walkClip);
      walkAction.setLoop(THREE.LoopRepeat);
    }

    if (idleClip) {
      baseAction = mixer.clipAction(idleClip);
      baseAction.setLoop(THREE.LoopRepeat);
      baseAction.play();
    }

    if (waveClip) {
      waveAction = mixer.clipAction(waveClip);
    }
  }

  root.add(avatar);
}

function handleModelLoad(gltf) {
  const model = gltf.scene;
  fitModel(model);
  setAvatar(model, gltf.animations);
  setStatus('Saeed live');
  showToast('Saeed 3D loaded');
}

const fallbackAvatar = buildFallbackAvatar();
setAvatar(fallbackAvatar);

modelLoader.load(
  'saeed-3d.glb',
  handleModelLoad,
  undefined,
  (error) => {
    console.error('Could not load Saeed 3D model.', error);
    setStatus('Fallback avatar');
  }
);

function clearContextMenu() {
  contextMenu.classList.add('hidden');
}

function openChat() {
  chatWindow.classList.remove('hidden');
  clearContextMenu();
  setTimeout(() => chatInput.focus(), 50);
}

function openSettings() {
  settingsWindow.classList.remove('hidden');
  clearContextMenu();
}

function closeWindow(name) {
  if (name === 'chat') chatWindow.classList.add('hidden');
  if (name === 'settings') settingsWindow.classList.add('hidden');
}

contextMenu.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'chat') openChat();
  if (action === 'hello') {
    state.lastInteraction = Date.now();
    say('Saeed', 'Hello, I am Saeed. I am ready to help.');
    speak('Hello, I am Saeed. I am ready to help.');
    clearContextMenu();
  }
  if (action === 'mute') {
    state.voiceEnabled = !state.voiceEnabled;
    toggleSound.checked = state.voiceEnabled;
    showToast(state.voiceEnabled ? 'Sound on' : 'Sound muted');
    clearContextMenu();
  }
  if (action === 'snooze') {
    state.snoozedUntil = Date.now() + 2 * 60 * 60 * 1000;
    showToast('Snoozed for 2 hours');
    clearContextMenu();
  }
  if (action === 'settings') openSettings();
  if (action === 'walk') {
    state.autoWalk = !state.autoWalk;
    showToast(state.autoWalk ? 'Walking mode on' : 'Walking mode off');
    clearContextMenu();
  }
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  state.lastInteraction = Date.now();
  say('You', text);

  const q = text.toLowerCase();
  let reply = 'I am ready to help you.';

  if (/(hello|hi|hey)/.test(q)) reply = 'Hello! I am Saeed, your personal 3D assistant.';
  else if (/(time|clock)/.test(q)) reply = `The time is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
  else if (/(date|day)/.test(q)) reply = `Today is ${new Date().toLocaleDateString()}.`;
  else if (/(joke|funny)/.test(q)) reply = 'Why did the developer cross the road? To deploy the app.';
  else if (/(wave|hello)/.test(q)) reply = 'Of course. Hello there!';
  else if (/(gmail|calendar|meeting|reminder|birthday)/.test(q)) reply = state.gmailConnected ? 'Your calendar is connected. I can remind you before meetings and birthdays.' : 'Please connect your Gmail in Settings so I can manage reminders and calendar events.';
  else if (/(arabic|مرحبا|السلام)/.test(q)) reply = 'مرحبا، أنا سعيد، مساعدك الرقمي، وأنا أستطيع التحدث بالعربية أو الإنجليزية.';
  else if (/(walk|move|around)/.test(q)) {
    state.autoWalk = true;
    reply = 'I am walking around the desktop now.';
  }

  say('Saeed', reply);
  speak(reply);
  chatInput.value = '';
});

window.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const x = Math.min(event.clientX, window.innerWidth - 220);
  const y = Math.min(event.clientY, window.innerHeight - 220);
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  contextMenu.classList.remove('hidden');
  state.lastInteraction = Date.now();
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.menu-item') && !event.target.closest('#context-menu')) {
    clearContextMenu();
  }
  if (!event.target.closest('.window') && !event.target.closest('[data-action="settings"]')) {
    settingsWindow.classList.add('hidden');
  }
  if (!event.target.closest('#chat-window') && !event.target.closest('#chat-form') && !event.target.closest('[data-action="chat"]')) {
    chatWindow.classList.add('hidden');
  }
});

document.querySelector('[data-close="chat"]').addEventListener('click', () => closeWindow('chat'));
document.querySelector('[data-close="settings"]').addEventListener('click', () => closeWindow('settings'));

toggleSound.addEventListener('change', () => {
  state.voiceEnabled = toggleSound.checked;
  if (state.voiceEnabled) showToast('Voice enabled'); else showToast('Voice muted');
});

toggleAnimations.addEventListener('change', () => {
  state.animationsEnabled = toggleAnimations.checked;
  if (!state.animationsEnabled && mixer) mixer.stopAllAction();
  if (state.animationsEnabled && mixer && baseAction) baseAction.play();
  showToast(state.animationsEnabled ? 'Animations on' : 'Animations off');
});

toggleIdleWalk.addEventListener('change', () => {
  state.idleWalkingEnabled = toggleIdleWalk.checked;
  showToast(state.idleWalkingEnabled ? 'Idle walk on' : 'Idle walk off');
});

sizeSlider.addEventListener('input', (event) => {
  state.avatarScale = Number(event.target.value);
  applyDisplaySettings();
  showToast(`Character size ${Math.round(state.avatarScale * 100)}%`);
});

textSlider.addEventListener('input', (event) => {
  state.textScale = Number(event.target.value);
  applyDisplaySettings();
  showToast(`Text size ${Math.round(state.textScale * 100)}%`);
});

volumeSlider.addEventListener('input', (event) => {
  state.voiceVolume = Number(event.target.value);
  applyDisplaySettings();
  showToast(`Volume ${Math.round(state.voiceVolume * 100)}%`);
});

document.querySelector('#connect-gmail').addEventListener('click', () => {
  const value = gmailInput.value.trim();
  if (!value) {
    showToast('Add your Gmail address first');
    return;
  }

  state.gmailConnected = true;
  state.gmailAddress = value;
  accountStatus.textContent = `Connected: ${value}`;
  showToast('Gmail connected for reminders');
  speak('Your Gmail is connected. I can remind you about calendar events and birthdays.');
});

applyDisplaySettings();
say('System', 'Saeed is online.');
say('Saeed', 'Hello, I am ready to help.');
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speak('Hello, I am Saeed.');
}

function updateAvatarPose(delta, t) {
  if (!avatar) return;

  if (state.animationsEnabled && mixer) {
    mixer.update(delta);

    if (state.autoWalk && walkAction) {
      walkAction.play();
    } else if (walkAction && walkAction.isRunning()) {
      walkAction.stop();
    }

    if (baseAction && !waveAction?.isRunning()) {
      if (!baseAction.isRunning()) baseAction.play();
    }
  }

  if (rig?.head && rig.headRest) {
    const moodPose = {
      neutral: { x: 0, y: 0, z: 0 },
      happy: { x: -0.08, y: 0.12, z: -0.06 },
      sad: { x: 0.12, y: -0.07, z: 0.04 },
      angry: { x: -0.04, y: -0.1, z: 0.02 }
    }[state.avatarMood];

    rig.head.rotation.set(
      rig.headRest.x + moodPose.x,
      rig.headRest.y + moodPose.y,
      rig.headRest.z + moodPose.z
    );
  }

  if (rig?.arms && rig.armRest && !state.animationsEnabled) {
    const sway = Math.sin(t * 2.4) * 0.12;
    rig.arms.forEach((part, index) => {
      const rest = rig.armRest[index];
      if (rest) {
        part.rotation.x = rest.x + sway * (index % 2 === 0 ? 1 : -1);
        part.rotation.z = rest.z + (index % 2 === 0 ? 0.75 : -0.75);
      }
    });
  }

  if (rig?.legs && rig.legRest && !state.animationsEnabled) {
    const step = Math.sin(t * 2.2) * 0.26;
    rig.legs.forEach((part, index) => {
      const rest = rig.legRest[index];
      if (rest) {
        part.rotation.x = rest.x + (index % 2 === 0 ? step : -step) * 0.8;
      }
    });
  }

  if (rig?.eyes?.length) {
    const blink = Math.sin(t * 9.5) > 0.97 ? 0.1 : 1;
    rig.eyes.forEach((mesh) => {
      mesh.scale.y = blink;
    });
  }

  if (rig?.mouth?.length) {
    const mouthMotion = 0.35 + state.talking * (0.2 + Math.abs(Math.sin(t * 18)) * 0.3);
    rig.mouth.forEach((mesh) => {
      mesh.scale.y = mouthMotion;
    });
  }
}

function updateAutoWalk(delta) {
  if (!state.autoWalk || !avatar) return;

  avatar.position.x += idleWalkDirection * delta * 0.8;

  if (avatar.position.x > screenBounds.maxX) {
    avatar.position.x = screenBounds.maxX;
    idleWalkDirection = -1;
  }

  if (avatar.position.x < screenBounds.minX) {
    avatar.position.x = screenBounds.minX;
    idleWalkDirection = 1;
  }
}

function handleIdleBehavior() {
  const now = Date.now();
  const idleSeconds = (now - lastInteraction) / 1000;

  if (state.snoozedUntil > now) return;

  if (idleSeconds > 5 && state.idleWalkingEnabled) {
    state.autoWalk = true;
  }

  if (idleSeconds > 60 && !boredNoticeSent) {
    boredNoticeSent = true;
    showToast('Saeed is getting bored');
    speak('Hey, I am getting bored. Let me know if you want me to walk around or chat.');
  }

  if (idleSeconds > 300) {
    state.autoWalk = true;
    if (now - state.lastIdleSpeech > 120000) {
      state.lastIdleSpeech = now;
      speak('Hey, I am here. I can walk, talk, and help you.');
    }
  }
}

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resizeRenderer);
resizeRenderer();

let dragStart = null;
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragStart = { x: event.clientX, y: event.clientY, avatarX: avatar?.position.x || 0 }; 
  startedDragOnAvatar = true;
  dragActive = true;
  state.lastInteraction = Date.now();
});

window.addEventListener('pointermove', (event) => {
  if (!dragActive || !avatar) return;

  const dx = event.clientX - dragStart.x;
  const nextX = dragStart.avatarX + (dx / window.innerWidth) * 12;
  avatar.position.x = Math.min(screenBounds.maxX, Math.max(screenBounds.minX, nextX));
});

window.addEventListener('pointerup', () => {
  dragActive = false;
  dragStart = null;
  startedDragOnAvatar = false;
});

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  const t = performance.now() / 1000;

  handleIdleBehavior();
  updateAutoWalk(delta);
  updateAvatarPose(delta, t);

  if (!state.autoWalk && avatar && !state.animationsEnabled) {
    avatar.rotation.y = Math.sin(t * 1.3) * 0.2;
    avatar.position.y = Math.sin(t * 3.2) * 0.05;
  }

  renderer.render(scene, camera);
}

animate();
