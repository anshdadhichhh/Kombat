import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { AssetLoader } from './assetLoader.js';
import { setupArenaConfigTools, setupCameraConfigTools, applyCameraConfig, setupAttackTimingTools } from './configtools.js';
import { Fighter } from './fighter.js';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS } from './input.js';
import { AIInput } from './aiInput.js';
import { VFXSystem } from './vfx.js';
import { SoundManager } from './audio.js';


const NEUTRAL_INPUT = { isDown: () => false, wasPressed: () => false, endFrame: () => {} };
const CAM_DIR = new THREE.Vector3(-0.0597, -0.0302, 0.9978);
const CAM_MIN_DIST = 9.59;
const CAM_MAX_DIST = 30;

export class FightingGame {
  constructor(container = document.body) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.input = new KeyboardInput();
    this.aiInput = new AIInput(P2_BINDINGS);
    this.loader = new AssetLoader();
    this.arena = { halfWidth: 1000 };
    this.roundOver = false;
    this.assetsReady = false;
    this.fightStarted = false;
    this.loadedArena = null;
    this.arenaRoot = null;
    this.arenas = {};
    this.currentArenaFile = null;
    this.transformControls = null;
    this.transformHelper = null;
    this.orbitControls = null;
    this.syncingArenaUi = false;
    this.skyPlane = null;

    // Multi-round match state
    this.currentRound = 1;
    this.roundsWon = { p1: 0, p2: 0 };
    this.matchOver = false;
    this.roundTransition = { active: false, timer: 0, phase: 'idle', winner: null, resultText: '' };

    // Countdown before first round
    this.countdownActive = false;
    this.countdownTimer = 0;
    this.lastCountdownDisplay = -1;

    // Background GLB model state
    this.bgModelRoot = null;
    this.bgModelObject = null;

    // Arena boundary circle
    this.boundaryCircle = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a9c7);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.01, 10000);
    this.camera.position.set(0, 3.8, 12.5);
    this.camera.lookAt(0, 1.25, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.vfx = new VFXSystem(this.scene, this.camera);
    this.sound = new SoundManager();
this.setupOrbitControls();
this.setupTransformControls();
setupCameraConfigTools(this.camera, this.orbitControls); 
setupAttackTimingTools();
this.setupAttackTimingLabelUpdates();
window.addEventListener('resize', () => this.onResize());
    this.setupReplayButton();
    this.setupPlayButton();
    this.setupSliders();
    this.setupTransformButtons();
    this.setupBackgroundControls();
    this.setupArenaUpload();
    this.setupArenaSelector();
    this.setupBgModelControls();
  }

  async init() {
    this.showBoot('Loading arena GLB and fighters...', false);
    this.addLights();
    this.addSkyFallback();
    this.animate();
    try {
      await Promise.all([this.loadArenaFromFolder(), this.loadFighters()]);
      try {
        await this.loadBgModelFromUrl('/assets/backgrounds/sketch_background_terrain.glb');
      } catch (bgErr) {
        console.warn('Background model not loaded:', bgErr.message || bgErr);
      }
      this.loadSounds();
      this.updateAttackTimingFromUI();
      this.createBoundaryCircle();
      this.setupBoundaryControls();
      this.assetsReady = true;
      this.setBackgroundImage('/assets/backgrounds/bg.png');
      this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
      this.sound.play('choose', 0.5);
      this.applyDefaultCameraConfig(); 
      this.updateBgModelSectionVisibility();

      console.log('ALL ASSETS LOADED: arena from public/assets/arena + fighters + animations.');
    } catch (err) {
      console.error('Game asset load failed:', err);
      this.showBoot(`Asset load failed. Check console. ${err.message || err}`, false);
    }
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x4b3a2c, 1.9));
    const sun = new THREE.DirectionalLight(0xfff0d2, 3.0);
    sun.position.set(-8, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x83b9ff, 1.1);
    rim.position.set(8, 5, -6);
    this.scene.add(rim);
  }

  addSkyFallback() {
    this.skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(300, 140), new THREE.MeshBasicMaterial({ color: 0x91b7d5, depthWrite: false }));
    this.skyPlane.position.set(0, 35, -90);
    this.scene.add(this.skyPlane);
  }

  setupOrbitControls() {
    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.target.set(0, 1.25, 0);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.enabled = false;
    this.orbitControls.update();
  }

  setupBackgroundControls() {
    const file = document.getElementById('backgroundImage');
    if (file) file.addEventListener('change', () => {
      const picked = file.files?.[0];
      if (!picked) return;
      const url = URL.createObjectURL(picked);
      this.setBackgroundImage(url, () => URL.revokeObjectURL(url));
    });
    const path = document.getElementById('backgroundPath');
    const btn = document.getElementById('loadBackgroundPath');
    if (path && btn) btn.addEventListener('click', () => this.setBackgroundImage(path.value));
  }

  setBackgroundImage(url, onLoadDone = null) {
    if (!url) return;
    new THREE.TextureLoader().load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
      tex.needsUpdate = true;
      if (!this.skyPlane) this.addSkyFallback();
      this.skyPlane.material.map = tex;
      this.skyPlane.material.color.set(0xffffff);
      this.skyPlane.material.needsUpdate = true;
      onLoadDone?.();
    }, undefined, (err) => console.warn('Background image failed to load:', url, err));
  }

  setupTransformControls() {
    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.setSize(1.15);
    this.transformControls.setMode('translate');
    this.transformControls.addEventListener('objectChange', () => this.syncArenaUiFromObject());
    this.transformControls.addEventListener('dragging-changed', (e) => {
      if (this.orbitControls) this.orbitControls.enabled = !e.value && Boolean(document.getElementById('orbitMode')?.checked);
    });
    this.transformHelper = this.transformControls.getHelper ? this.transformControls.getHelper() : this.transformControls;
    this.scene.add(this.transformHelper);
  }

  setupTransformButtons() {
    const modes = { gizmoTranslate: 'translate', gizmoRotate: 'rotate', gizmoScale: 'scale' };
    Object.entries(modes).forEach(([id, mode]) => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => this.transformControls?.setMode(mode));
    });
    const orbit = document.getElementById('orbitMode');
    if (orbit) orbit.addEventListener('change', () => {
      this.orbitControls.enabled = orbit.checked;
      this.transformControls.enabled = true;
    });
    const resetCam = document.getElementById('resetCamera');
    if (resetCam) resetCam.addEventListener('click', () => {
  this.applyDefaultCameraConfig(); 
});
  }

  updateAttackTimingFromUI() {
  
  
  if (typeof ATTACKS !== 'undefined') {
    ATTACKS.punch = {
      ...ATTACKS.punch,
      startup: this.num('punchStartup', 0.035),
      active: this.num('punchActive', 0.10),
      recovery: this.num('punchRecovery', 0.075),
      range: this.num('punchRange', 1.15),
      push: this.num('punchPush', 0.18),
      damage: this.num('punchDamage', 7)
    };
    ATTACKS.kick = {
      ...ATTACKS.kick,
      startup: this.num('kickStartup', 0.14),
      active: this.num('kickActive', 0.20),
      recovery: this.num('kickRecovery', 0.28),
      range: this.num('kickRange', 1.65),
      push: this.num('kickPush', 0.30),
      damage: this.num('kickDamage', 12)
    };
    ATTACKS.heavy = {
      ...ATTACKS.heavy,
      startup: this.num('heavyStartup', 0.20),
      active: this.num('heavyActive', 0.24),
      recovery: this.num('heavyRecovery', 0.40),
      range: this.num('heavyRange', 1.45),
      push: this.num('heavyPush', 0.40),
      damage: this.num('heavyDamage', 16)
    };
  }
}

  setupArenaUpload() {
    const input = document.getElementById('arenaUpload');
    if (!input) return;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        await this.loadArenaFromUrl(url, `uploaded:${file.name}`);
      } finally {
        URL.revokeObjectURL(url);
      }
    });
  }

  async loadArenaFromUrl(url, name = 'uploaded') {
    const obj = await this.loader.loadObject(url, 'glb');
    obj.name = `ArenaModel:${name}`;
    this.prepareArenaModel(obj);
    if (this.arenaRoot) this.scene.remove(this.arenaRoot);
    const root = new THREE.Group();
    root.name = `ArenaRoot:${name}`;
    root.add(obj);
    this.scene.add(root);
    this.arenaRoot = root;
    this.loadedArena = obj;
    this.transformControls.attach(root);
    this.applyArenaDefaultForFile(name.includes('arena.glb') ? 'arena.glb' : name);
    this.updateBgModelSectionVisibility();
    console.log(`Loaded arena from upload: ${name}`);
  }

  async loadArenaFromFolder() {
    const files = ['arena.glb', 'arena1.glb', 'arena2.glb', 'arena3.glb'];
    let first = null;
    for (const file of files) {
      try {
        const obj = await this.loader.loadObject(`/assets/arena/${file}`, 'glb');
        obj.name = `ArenaModel:${file}`;
        this.arenas[file] = obj;
        if (!first) {
          this.prepareArenaModel(obj);
          const root = new THREE.Group();
          root.name = `ArenaRoot:${file}`;
          root.add(obj);
          this.scene.add(root);
          this.arenaRoot = root;
          this.loadedArena = obj;
          this.currentArenaFile = file;
          this.transformControls.attach(root);
          this.applyArenaDefaultForFile(file);
          console.log(`Loaded arena from public/assets/arena/${file}`);
          first = file;
        } else {
          console.log(`Cached arena from public/assets/arena/${file}`);
        }
      } catch (err) {
        console.warn(`Arena file not loaded: ${file}`, err.message || err);
      }
    }
    if (!first) {
      console.warn('No arena GLB found in public/assets/arena. Using simple fallback floor.');
      const floor = this.makeFallbackFloor();
      const root = new THREE.Group();
      root.name = 'ArenaRoot:fallback';
      root.add(floor);
      this.scene.add(root);
      this.arenaRoot = root;
      this.loadedArena = floor;
      this.transformControls.attach(root);
      this.applyArenaSliders();
    }
  }

  prepareArenaModel(obj) {
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy?.() || 1;
    obj.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
        const materials = child.material ? (Array.isArray(child.material) ? child.material : [child.material]) : [];
        materials.forEach((mat) => this.enhanceMaterial(mat, maxAnisotropy));
      }
    });
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const center = new THREE.Vector3();
    box.getCenter(center);
    obj.position.x -= center.x;
    obj.position.z -= center.z;
    obj.position.y -= box.min.y;
  }

  enhanceMaterial(mat, maxAnisotropy) {
    if (!mat) return;
    if (mat.map) { mat.map.colorSpace = THREE.SRGBColorSpace; mat.map.anisotropy = maxAnisotropy; mat.map.needsUpdate = true; }
    if (mat.emissiveMap) { mat.emissiveMap.colorSpace = THREE.SRGBColorSpace; mat.emissiveMap.anisotropy = maxAnisotropy; mat.emissiveMap.needsUpdate = true; }
    if (mat.normalMap) { mat.normalScale?.set?.(1.35, 1.35); mat.normalMap.anisotropy = maxAnisotropy; mat.normalMap.needsUpdate = true; }
    if (mat.roughnessMap) { mat.roughnessMap.anisotropy = maxAnisotropy; mat.roughnessMap.needsUpdate = true; }
    if (mat.aoMap) mat.aoMapIntensity = 1.25;
    if ('roughness' in mat && mat.roughness === undefined) mat.roughness = 0.78;
    if ('metalness' in mat && mat.metalness === undefined) mat.metalness = 0.0;
    mat.needsUpdate = true;
  }

  makeFallbackFloor() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x5c5148, roughness: 0.85 }));
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    return floor;
  }

applyArenaDefaultForFile(file) {
  
  const configs = {
    'arena.glb': { 
      scale: 60.925, 
      x: 2.46,    
      y: -11.15,   
      z: -5.21 ,  
      rx: 0, 
      ry: 133.2, 
      rz: 0 
    },

    'arena2.glb': { 
      scale: 816.856, 
      x: 155.74,   
      y: -89.26,   
      z: -61.37,   
      rx: 0, 
      ry: 133.2, 
      rz: 0 
    },
    
    'arena1.glb': { scale: 32.503, x: -0.12, y: -5.82, z: -2.61, rx: 0, ry: 133.2, rz: 0 },
    'arena3.glb': { scale: 32.503, x: -0.12, y: -5.82, z: -2.61, rx: 0, ry: 133.2, rz: 0 },
  };
  
  const c = configs[file];
  if (c) {
    this.setInput('arenaScale', c.scale);
    this.setInput('arenaX', c.x);
    this.setInput('arenaY', c.y);
    this.setInput('arenaZ', c.z);
    this.setInput('arenaRotX', c.rx);
    this.setInput('arenaRotY', c.ry);
    this.setInput('arenaRotZ', c.rz);
  }
  this.applyArenaSliders();
}
applyDefaultCameraConfig() {
  
  const defaultCam = {
    camera: {
      position: { 
        x: -0.5721527370856918,   
        y: 0.9597972147533198,    
        z: 9.56584352411778   
      },
      fov: 42
    },
    controls: {
      target: { x: 0, y: 1.25, z: 0 },  
      distance: 9.587332201349113,     
      polarAngle: 1.6010703501795667,
      azimuthalAngle: -0.05974087991286296,         
    }
  };
  
  applyCameraConfig(defaultCam, this.camera, this.orbitControls);
}

  setupSliders() {
    ['arenaScale','arenaX','arenaY','arenaZ','arenaRotX','arenaRotY','arenaRotZ','p1StartX','p1StartY','p1StartZ','p2StartX','p2StartY','p2StartZ'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { this.applyArenaSliders(); this.applyPlayerStartSliders(); });
    });
  }

  num(id, fallback) { const el = document.getElementById(id); return el ? Number.parseFloat(el.value) : fallback; }

  applyArenaSliders() {
    const a = this.arenaRoot;
    if (!a || this.syncingArenaUi) return;
    const s = this.num('arenaScale', 1);
    const x = this.num('arenaX', 0);
    const y = this.num('arenaY', 0);
    const z = this.num('arenaZ', 0);
    const rx = this.num('arenaRotX', 0);
    const ry = this.num('arenaRotY', 0);
    const rz = this.num('arenaRotZ', 0);
    a.scale.setScalar(s);
    a.position.set(x, y, z);
    a.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
    this.label('arenaScaleValue', s.toFixed(3));
    this.label('arenaXValue', x.toFixed(2));
    this.label('arenaYValue', y.toFixed(2));
    this.label('arenaZValue', z.toFixed(2));
    this.label('arenaRotXValue', rx.toFixed(1));
    this.label('arenaRotYValue', ry.toFixed(1));
    this.label('arenaRotZValue', rz.toFixed(1));
  }

  syncArenaUiFromObject() {
    const a = this.arenaRoot;
    if (!a) return;
    this.syncingArenaUi = true;
    this.setInput('arenaScale', a.scale.x);
    this.setInput('arenaX', a.position.x);
    this.setInput('arenaY', a.position.y);
    this.setInput('arenaZ', a.position.z);
    this.setInput('arenaRotX', THREE.MathUtils.radToDeg(a.rotation.x));
    this.setInput('arenaRotY', THREE.MathUtils.radToDeg(a.rotation.y));
    this.setInput('arenaRotZ', THREE.MathUtils.radToDeg(a.rotation.z));
    this.syncingArenaUi = false;
    this.applyArenaSliders();
  }

  setInput(id, value) { const el = document.getElementById(id); if (el) el.value = String(value); }
  label(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

  applyPlayerStartSliders() {
    if (!this.p1 || !this.p2 || this.fightStarted) return;
    this.p1.group.position.set(this.num('p1StartX', -2.6), this.num('p1StartY', 0), this.num('p1StartZ', 0));
    this.p2.group.position.set(this.num('p2StartX', 2.6), this.num('p2StartY', 0), this.num('p2StartZ', 0));
    this.label('p1StartXValue', this.p1.group.position.x.toFixed(2));
    this.label('p1StartYValue', this.p1.group.position.y.toFixed(2));
    this.label('p1StartZValue', this.p1.group.position.z.toFixed(2));
    this.label('p2StartXValue', this.p2.group.position.x.toFixed(2));
    this.label('p2StartYValue', this.p2.group.position.y.toFixed(2));
    this.label('p2StartZValue', this.p2.group.position.z.toFixed(2));
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
  }

  setupAttackTimingLabelUpdates() {
  
  const updateLabel = (id, suffix = 's') => {
    const el = document.getElementById(id);
    const label = document.getElementById(id + 'Value');
    if (el && label) {
      el.addEventListener('input', () => {
        label.textContent = parseFloat(el.value).toFixed(3) + suffix;
      });
    }
  };
  
  
  ['punchStartup','punchActive','punchRecovery','kickStartup','kickActive','kickRecovery','heavyStartup','heavyActive','heavyRecovery'].forEach(id => updateLabel(id, 's'));
  
  
  ['punchRange','punchPush','kickRange','kickPush','heavyRange','heavyPush'].forEach(id => updateLabel(id, ''));
  
  
  ['punchDamage','kickDamage','heavyDamage'].forEach(id => {
    const el = document.getElementById(id);
    const label = document.getElementById(id + 'Value');
    if (el && label) {
      el.addEventListener('input', () => {
        label.textContent = Math.round(parseFloat(el.value));
      });
    }
  });
}

  async loadFighters() {
    this.p1 = new Fighter({ id: 'P1-LEFT', color: 0x2f7dff, startX: -2.6, modelUrl: '/assets/characters/player1/character.fbx', animationBaseUrl: '/assets/characters/player1', bindings: P1_BINDINGS, assetLoader: this.loader, vfx: this.vfx, sound: this.sound });
    this.p2 = new Fighter({ id: 'AI-RIGHT', color: 0xff374f, startX: 2.6, modelUrl: '/assets/characters/player2/character.fbx', animationBaseUrl: '/assets/characters/player2', bindings: P2_BINDINGS, assetLoader: this.loader, isAI: true, vfx: this.vfx, sound: this.sound });
    await Promise.all([this.p1.load(), this.p2.load()]);
    this.scene.add(this.p1.group, this.p2.group);
    this.applyPlayerStartSliders();
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
  }

  setupArenaSelector() {
    const sel = document.getElementById('arenaSelect');
    if (sel) sel.addEventListener('change', () => this.switchArena(sel.value));
  }

  async switchArena(fileName) {
    if (fileName === this.currentArenaFile || !this.arenas[fileName]) return;
    const obj = await this.loader.loadObject(`/assets/arena/${fileName}`, 'glb');
    obj.name = `ArenaModel:${fileName}`;
    this.prepareArenaModel(obj);
    if (this.loadedArena && this.loadedArena.parent) {
      this.loadedArena.parent.remove(this.loadedArena);
    }
    this.arenaRoot.add(obj);
    this.loadedArena = obj;
    this.currentArenaFile = fileName;
    this.applyArenaDefaultForFile(fileName);
    this.applyDefaultCameraConfig();
    this.updateBgModelSectionVisibility();
  }

  // ====== BACKGROUND GLB MODEL ======

  setupBgModelControls() {
    const input = document.getElementById('bgModelUpload');
    if (input) input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      try {
        await this.loadBgModelFromUrl(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    });

    ['bgModelScale','bgModelX','bgModelY','bgModelZ','bgModelRotX','bgModelRotY','bgModelRotZ'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.applyBgModelSliders());
    });
  }

  async loadBgModelFromUrl(url) {
    const obj = await this.loader.loadObject(url, 'glb');
    obj.name = 'BackgroundModel';
    this.prepareArenaModel(obj);

    if (this.bgModelObject) {
      if (this.bgModelObject.parent) this.bgModelObject.parent.remove(this.bgModelObject);
    }
    if (!this.bgModelRoot) {
      this.bgModelRoot = new THREE.Group();
      this.bgModelRoot.name = 'BackgroundModelRoot';
      this.scene.add(this.bgModelRoot);
    }

    this.bgModelRoot.add(obj);
    this.bgModelObject = obj;
    this.applyBgModelSliders();
    console.log('Loaded background GLB model');
  }

  applyBgModelSliders() {
    const obj = this.bgModelObject || this.bgModelRoot;
    if (!obj) return;
    const s = this.num('bgModelScale', 1);
    const x = this.num('bgModelX', 0);
    const y = this.num('bgModelY', 0);
    const z = this.num('bgModelZ', 0);
    const rx = this.num('bgModelRotX', 0);
    const ry = this.num('bgModelRotY', 0);
    const rz = this.num('bgModelRotZ', 0);
    obj.scale.setScalar(s);
    obj.position.set(x, y, z);
    obj.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
    this.label('bgModelScaleValue', s.toFixed(3));
    this.label('bgModelXValue', x.toFixed(2));
    this.label('bgModelYValue', y.toFixed(2));
    this.label('bgModelZValue', z.toFixed(2));
    this.label('bgModelRotXValue', rx.toFixed(1));
    this.label('bgModelRotYValue', ry.toFixed(1));
    this.label('bgModelRotZValue', rz.toFixed(1));
  }

  updateBgModelSectionVisibility() {
    const section = document.getElementById('bgModelSection');
    if (!section) return;
    section.style.display = this.currentArenaFile === 'arena.glb' ? 'block' : 'none';
    if (this.bgModelRoot) this.bgModelRoot.visible = this.currentArenaFile !== 'arena2.glb';
  }

  // ====== ARENA BOUNDARY CIRCLE ======

  setupBoundaryControls() {
    const checkbox = document.getElementById('showBoundary');
    if (checkbox) checkbox.addEventListener('change', () => this.updateBoundaryVisibility());

    ['boundaryX', 'boundaryRadius'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.updateBoundaryCircle());
    });

    this.updateBoundaryCircle();
    this.updateBoundaryVisibility();
  }

  createBoundaryCircle() {
    const segments = 64;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.5 });
    this.boundaryCircle = new THREE.LineLoop(geo, mat);
    this.boundaryCircle.position.y = 0.05;
    this.scene.add(this.boundaryCircle);
    this.updateBoundaryCircle();
    this.updateBoundaryVisibility();
  }

  updateBoundaryCircle() {
    if (!this.boundaryCircle) return;
    this.boundaryCircle.position.x = this.num('boundaryX', 0);
    this.boundaryCircle.scale.setScalar(this.num('boundaryRadius', 7));
    this.label('boundaryXValue', this.boundaryCircle.position.x.toFixed(2));
    this.label('boundaryRadiusValue', this.num('boundaryRadius', 7).toFixed(2));
  }

  updateBoundaryVisibility() {
    if (!this.boundaryCircle) return;
    const show = document.getElementById('showBoundary');
    this.boundaryCircle.visible = !show || show.checked;
  }

  clampToBoundary(fighter) {
    if (!this.boundaryCircle || !this.boundaryCircle.visible) return;
    const cx = this.boundaryCircle.position.x;
    const r = this.boundaryCircle.scale.x;
    if (r <= 0.01) return;
    const dx = fighter.group.position.x - cx;
    const dz = fighter.group.position.z - 0;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > r) {
      const s = r / dist;
      fighter.group.position.x = cx + dx * s;
      fighter.group.position.z = dz * s;
    }
  }

  updateSmartCamera() {
    const midX = (this.p1.group.position.x + this.p2.group.position.x) / 2;
    const sep = Math.abs(this.p1.group.position.x - this.p2.group.position.x);
    const lookTarget = new THREE.Vector3(midX, 1.25, 0);
    const targetDist = THREE.MathUtils.clamp(Math.max(CAM_MIN_DIST, sep + 4.39), CAM_MIN_DIST, CAM_MAX_DIST);
    const targetPos = lookTarget.clone().add(CAM_DIR.clone().multiplyScalar(targetDist));
    this.camera.position.lerp(targetPos, 0.04);
    this.camera.lookAt(lookTarget);
    this.orbitControls.target.copy(lookTarget);
  }

  // ====== SOUND SYSTEM ======

  loadSounds() {
    const base = '/assets/sound effects';
    const list = [
      ['choose', `${base}/Choose your Fighter.mp3`],
      ['round1', `${base}/Round 1.wav`],
      ['round2', `${base}/Round 2.wav`],
      ['ko', `${base}/KO.wav`],
      ['punch', `${base}/punch.mp3`],
      ['punch2', `${base}/punch (2).mp3`],
      ['punch3', `${base}/punch (3).mp3`],
      ['kick', `${base}/kick.mp3`],
      ['whiff', `${base}/play this sound when player doesnt hit anything but punches or kicks.wav`],
      ['jumpAttackEnd', `${base}/sound to play at the end of jump attack animation.wav`],
    ];
    list.forEach(([name, url]) => this.sound.load(name, url));
  }

  // ====== MATCH / ROUND SYSTEM ======

  setupReplayButton() {
    const btn = document.getElementById('replayBtn');
    if (btn) btn.addEventListener('click', () => this.playAgain());
  }
  setupPlayButton() { const btn = document.getElementById('playBtn'); if (btn) btn.addEventListener('click', () => this.startFight()); }
  startFight() { if (!this.assetsReady) return; this.fightStarted = true; this.hideBoot(); this.clock.getDelta(); this.countdownActive = true; this.countdownTimer = 3.0; this.lastCountdownDisplay = -1; }
  handleCountdown(dt) {
    const el = document.getElementById('countdownText');
    if (!el) return;
    this.countdownTimer -= dt;
    const t = this.countdownTimer;
    if (t > 0) {
      const d = Math.ceil(t);
      if (d !== this.lastCountdownDisplay) {
        this.lastCountdownDisplay = d;
        el.textContent = String(d);
        el.style.display = 'block';
      }
    } else if (t > -0.5) {
      if (this.lastCountdownDisplay !== 0) {
        this.lastCountdownDisplay = 0;
        el.textContent = 'FIGHT!';
        this.sound.play('round1', 0.7);
      }
    } else {
      el.style.display = 'none';
      this.countdownActive = false;
    }
  }
  showBoot(message, showPlay) { const boot = document.getElementById('boot'); const msg = document.getElementById('bootMessage'); const btn = document.getElementById('playBtn'); if (!boot) return; boot.style.display = 'grid'; if (msg) msg.textContent = message; if (btn) btn.style.display = showPlay ? 'inline-block' : 'none'; }
  hideBoot() { const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none'; }

  animate() {
    requestAnimationFrame(() => this.animate());
    try {
      const dt = Math.min(this.clock.getDelta(), 1 / 30);
      this.orbitControls?.update();
      this.update(dt);
      this.vfx.update(dt);
      this.renderer.render(this.scene, this.camera);
    } catch (err) { console.error('Render error:', err); }
    this.input.endFrame();
    this.aiInput.endFrame();
  }

  update(dt) {
    if (!this.assetsReady || !this.p1 || !this.p2) return;
    if (!this.fightStarted) { this.p1.play('idle', 0.12); this.p2.play('idle', 0.12); this.p1.mixer?.update(dt); this.p2.mixer?.update(dt); return; }
    if (this.countdownActive) {
      this.handleCountdown(dt);
      this.p1.play('idle', 0.12);
      this.p2.play('idle', 0.12);
      this.p1.mixer?.update(dt);
      this.p2.mixer?.update(dt);
      this.updateSmartCamera();
      return;
    }
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    if (this.roundTransition.active) {
      this.handleRoundTransition(dt);
      try { this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena); } catch (e) { console.error('P1 update error:', e); }
      try { this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena); } catch (e) { console.error('P2 update error:', e); }
    } else if (!this.roundOver) {
      this.aiInput.update(dt, this.p2, this.p1);
      try { this.p1.update(dt, this.input, this.p2, this.arena); } catch (e) { console.error('P1 update error:', e); }
      try { this.p2.update(dt, this.aiInput, this.p1, this.arena); } catch (e) { console.error('P2 update error:', e); }
      this.checkRoundOver();
    } else {
      try { this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena); } catch (e) { console.error('P1 update error:', e); }
      try { this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena); } catch (e) { console.error('P2 update error:', e); }
    }
    this.clampToBoundary(this.p1);
    this.clampToBoundary(this.p2);
    this.updateHud();
    this.updateSmartCamera();
  }

  handleRoundTransition(dt) {
    this.roundTransition.timer += dt;
    const roundTextEl = document.getElementById('roundText');
    if (!roundTextEl) return;

    if (this.roundTransition.phase === 'roundEnd') {
      roundTextEl.textContent = this.roundTransition.resultText;

      if (this.roundTransition.timer >= 1.5) {
        this.recordRoundResult(this.roundTransition.winner);
        if (this.matchOver) {
          this.showMatchResult();
        } else {
          if (this.roundTransition.winner !== null) {
            this.currentRound++;
          }
          this.roundTransition.phase = 'starting';
          this.roundTransition.timer = 0;
          roundTextEl.textContent = `Starting Round ${this.currentRound}`;
          if (this.currentRound === 2) this.sound.play('round2', 0.7);
        }
      }
    } else if (this.roundTransition.phase === 'starting') {
      if (this.roundTransition.timer >= 1.5) {
        this.resetFighterState();
        this.roundOver = false;
        this.roundTransition.active = false;
        this.roundTransition.phase = 'idle';
      }
    } else if (this.roundTransition.phase === 'matchOver') {
      if (this.roundTransition.timer >= 1.0) {
        const winnerText = this.roundsWon.p1 > this.roundsWon.p2 ? 'P1 WINS THE MATCH!' : (this.roundsWon.p2 > this.roundsWon.p1 ? 'AI WINS THE MATCH!' : 'DRAW MATCH!');
        const overlay = document.getElementById('matchWinnerText');
        if (overlay) {
          overlay.textContent = winnerText;
          overlay.style.display = 'block';
        }
        const replayBtn = document.getElementById('replayBtn');
        if (replayBtn) replayBtn.style.display = 'block';
        this.roundTransition.active = false;
      }
    }
  }

  showMatchResult() {
    const winnerText = this.roundsWon.p1 > this.roundsWon.p2
      ? 'P1 WINS THE MATCH!'
      : (this.roundsWon.p2 > this.roundsWon.p1 ? 'AI WINS THE MATCH!' : 'DRAW MATCH!');
    const roundTextEl = document.getElementById('roundText');
    if (roundTextEl) roundTextEl.textContent = winnerText;
    this.roundTransition.phase = 'matchOver';
    this.roundTransition.timer = 0;
  }

  recordRoundResult(winner) {
    if (winner === 'p1') this.roundsWon.p1++;
    else if (winner === 'p2') this.roundsWon.p2++;
    this.updateRoundIndicators();

    if (this.roundsWon.p1 >= 2 || this.roundsWon.p2 >= 2 || this.currentRound >= 3) {
      this.matchOver = true;
    }
  }

  checkRoundOver() {
    if (this.roundOver || this.roundTransition.active) return;
    if (!(this.p1.health <= 0 || this.p2.health <= 0)) return;

    this.roundOver = true;
    this.sound.play('ko', 0.8);
    const isDraw = this.p1.health <= 0 && this.p2.health <= 0;
    let winner = null;
    let resultText = 'DRAW';
    if (!isDraw) {
      winner = this.p1.health <= 0 ? 'p2' : 'p1';
      resultText = winner === 'p1' ? 'P1 WINS' : 'AI WINS';
    }

    this.roundTransition.active = true;
    this.roundTransition.phase = 'roundEnd';
    this.roundTransition.timer = 0;
    this.roundTransition.winner = winner;
    this.roundTransition.resultText = resultText;
  }

  resetFighterState() {
    if (!this.p1 || !this.p2) return;
    this.p1.health = 100;
    this.p2.health = 100;
    this.p1.koStarted = this.p2.koStarted = false;
    this.p1.stun = this.p2.stun = 0;
    this.p1.hitStop = this.p2.hitStop = 0;
    this.p1.attackKind = null;
    this.p2.attackKind = null;
    this.p1.group.position.set(this.num('p1StartX', -2.6), this.num('p1StartY', 0), this.num('p1StartZ', 0));
    this.p2.group.position.set(this.num('p2StartX', 2.6), this.num('p2StartY', 0), this.num('p2StartZ', 0));
    this.p1.velocity.set(0, 0, 0);
    this.p2.velocity.set(0, 0, 0);
    this.p1.setState('idle');
    this.p2.setState('idle');
    this.p1.play('idle', 0.05, true, true);
    this.p2.play('idle', 0.05, true, true);
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
  }

  playAgain() {
    if (!this.p1 || !this.p2) return;
    this.matchOver = false;
    this.currentRound = 1;
    this.roundsWon = { p1: 0, p2: 0 };
    this.roundOver = false;
    this.roundTransition = { active: false, timer: 0, phase: 'idle', winner: null, resultText: '' };

    this.resetFighterState();

    document.getElementById('roundText').textContent = 'ROUND 1';
    document.getElementById('replayBtn').style.display = 'none';
    const overlay = document.getElementById('matchWinnerText');
    if (overlay) overlay.style.display = 'none';
    this.updateRoundIndicators();
    this.updateHud();
    this.clock.getDelta();
  }

  updateRoundIndicators() {
    const p1Dots = document.querySelectorAll('#p1Indicators .roundDot');
    p1Dots.forEach((dot, i) => dot.classList.toggle('active', i < this.roundsWon.p1));
    const p2Dots = document.querySelectorAll('#p2Indicators .roundDot');
    p2Dots.forEach((dot, i) => dot.classList.toggle('active', i < this.roundsWon.p2));
  }

  updateHud() {
    document.getElementById('p1Health').style.width = `${this.p1.health}%`;
    document.getElementById('p2Health').style.width = `${this.p2.health}%`;
    
    const p1OnLeft = this.p1.group.position.x < this.p2.group.position.x;
    const p1Label = document.querySelector('.barWrap:first-child span');
    const p2Label = document.querySelector('.barWrap.right span');
    if (p1Label && p2Label) {
      p1Label.textContent = p1OnLeft ? 'P1 LEFT' : 'P1 RIGHT';
      p2Label.textContent = p1OnLeft ? 'AI RIGHT' : 'AI LEFT';
    }
  }

  onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
}
