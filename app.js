import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

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
const voiceSelect = document.querySelector('#voice-select');
const characterFile = document.querySelector('#character-file');
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
const fbxLoader = new FBXLoader();
const defaultModelPath = 'Saeed_AI.glb';
let availableVoices = [];

let avatar = null;
let rig = null;
let mixer = null;
let baseAction = null;
let walkAction = null;
let waveAction = null;
let idleWalkDirection = 1;
let lastInteraction = Date.now();
let boredNoticeSent = false;
const state = {
  talking: 0,
  voiceEnabled: true,
  animationsEnabled: false,
  idleWalkingEnabled: false,
  avatarMood: 'neutral',
  autoWalk: false,
  lastIdleSpeech: 0,
  gmailConnected: false,
  gmailAddress: '',
  snoozedUntil: 0,
  idleTimer: 0,
  avatarScale: 1,
  textScale: 1,
  voiceVolume: 1,
  voiceName: ''
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

function isLikelyMaleVoice(voice) {
  return /male|man|david|daniel|mark|tom|john|guy|harry|liam|alex|ahmed|karim|zayd|salim|omar/i.test(voice.name);
}

function getPreferredVoice() {
  return availableVoices.find((voice) => voice.name === state.voiceName)
    || availableVoices.find((voice) => isLikelyMaleVoice(voice) && /ar|en/i.test(voice.lang))
    || availableVoices.find((voice) => isLikelyMaleVoice(voice))
    || availableVoices.find((voice) => /ar|en/i.test(voice.lang))
    || availableVoices[0];
}

function populateVoiceOptions() {
  if (!('speechSynthesis' in window)) return;

  availableVoices = speechSynthesis.getVoices().slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!availableVoices.length) return;

  const preferred = getPreferredVoice();
  voiceSelect.replaceChildren();
  availableVoices.forEach((voice) => {
    const option = document.createElement('option');
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  if (!state.voiceName && preferred) state.voiceName = preferred.name;
  voiceSelect.value = state.voiceName || preferred?.name || '';
  voiceStatus.textContent = preferred?.name || 'Auto';
}

function speak(text) {
  if (!state.voiceEnabled || !('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  const preferred = getPreferredVoice();

  if (preferred) {
    utterance.voice = preferred;
    utterance.lang = preferred.lang;
    voiceStatus.textContent = preferred.name;
  } else {
    voiceStatus.textContent = 'Auto';
  }

  utterance.rate = 0.9;
  utterance.pitch = 0.82;
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
      if (state.animationsEnabled) baseAction.play();
    }

    if (waveClip) {
      waveAction = mixer.clipAction(waveClip);
    }
  }

  root.add(avatar);
}

function handleModelLoad(gltf, label = 'Saeed 3D') {
  const model = gltf.scene;
  fitModel(model);
  setAvatar(model, gltf.animations);
  setStatus('Saeed live');
  showToast(`${label} loaded`);
}

function loadCharacterFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['glb', 'fbx'].includes(extension)) {
    showToast('Choose a GLB or FBX character file');
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  const onLoad = (result) => {
    const gltf = extension === 'fbx'
      ? { scene: result, animations: result.animations || [] }
      : result;
    handleModelLoad(gltf, file.name);
    URL.revokeObjectURL(objectUrl);
  };
  const onError = (error) => {
    console.error(`Could not load character file ${file.name}.`, error);
    setStatus('Character load failed');
    showToast(`Could not load ${file.name}`);
    URL.revokeObjectURL(objectUrl);
  };

  setStatus('Loading character');
  if (extension === 'fbx') {
    fbxLoader.load(objectUrl, onLoad, undefined, onError);
  } else {
    modelLoader.load(objectUrl, onLoad, undefined, onError);
  }
}

const fallbackAvatar = buildFallbackAvatar();
setAvatar(fallbackAvatar);

modelLoader.load(
  defaultModelPath,
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
    showToast('Character movement is coming in the next version');
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
    reply = 'Character movement will be added in the next version.';
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
  if (!state.idleWalkingEnabled) state.autoWalk = false;
  showToast(state.idleWalkingEnabled ? 'Idle walk on' : 'Idle walk off');
});

voiceSelect.addEventListener('change', () => {
  state.voiceName = voiceSelect.value;
  const selected = getPreferredVoice();
  voiceStatus.textContent = selected?.name || 'Auto';
  showToast(`Voice: ${selected?.name || 'Auto'}`);
});

characterFile.addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadCharacterFile(file);
  event.target.value = '';
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
  speechSynthesis.onvoiceschanged = populateVoiceOptions;
  populateVoiceOptions();
}

function updateAvatarPose(delta) {
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

}

function handleIdleBehavior() {
  state.autoWalk = false;
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

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.033);
  const t = performance.now() / 1000;

  updateAvatarPose(delta);

  renderer.render(scene, camera);
}

animate();
