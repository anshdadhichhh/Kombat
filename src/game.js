import * as THREE from 'three';
import { AssetLoader } from './assetLoader.js';
import { Fighter } from './fighter.js';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS } from './input.js';
import { AIInput } from './aiInput.js';
import { VFXSystem } from './vfx.js';

const NEUTRAL_INPUT = { isDown: () => false, wasPressed: () => false, endFrame: () => {} };

export class FightingGame {
  constructor(container = document.body) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.input = new KeyboardInput();
    this.aiInput = new AIInput(P2_BINDINGS);
    this.loader = new AssetLoader();
    this.arena = { halfWidth: 7.5 };
    this.roundOver = false;
    this.assetsReady = false;
    this.fightStarted = false;
    this.fallbackArena = null;
    this.loadedArena = null;
    this.arenaBaseScale = new THREE.Vector3(1, 1, 1);
    this.arenaBasePosition = new THREE.Vector3(0, 0, 0);
    this.selectedArena = 'arena1.glb';
    this.fixedCamera = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fb6e8);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 10000);
    this.camera.position.set(0, 3.2, 11.0);
    this.camera.lookAt(0, 1.15, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x8fb6e8, 1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = false;
    this.container.appendChild(this.renderer.domElement);
    this.vfx = new VFXSystem(this.scene);

    window.addEventListener('resize', () => this.onResize());
    this.setupSliders();
    this.setupReplayButton();
    this.setupArenaSelect();
    this.setupPlayButton();
  }

  async init() {
    this.addEnvironment();
    this.addLights();
    this.makeFallbackArena();
    this.showBoot('Loading ALL assets: arena, characters, and every animation...', false);
    this.animate();
    try {
      await Promise.all([this.loadArena(), this.loadFighters()]);
      this.assetsReady = true;
      this.applyCharacterSliders();
      this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
      console.log('ALL ASSETS LOADED: arena + both character meshes + all configured animations. PLAY button enabled.');
    } catch (err) {
      console.error('Game asset load failed:', err);
      this.showBoot(`Asset load failed. Check console. ${err.message || err}`, false);
    }
  }

  addEnvironment() {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(5000, 2500), new THREE.MeshBasicMaterial({ color: 0x8fb6e8, depthWrite: false }));
    back.position.set(0, 500, -1600);
    this.scene.add(back);
    // No giant ground plane here: it was hiding mountain/arena geometry when Y offset was adjusted.
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x78624a, 2.3));
    const key = new THREE.DirectionalLight(0xffffff, 3.0);
    key.position.set(-4, 8, 6);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xdde8ff, 1.6);
    fill.position.set(5, 4, 5);
    this.scene.add(fill);
    const front = new THREE.PointLight(0xffffff, 1.4, 1000);
    front.position.set(0, 3, 6);
    this.scene.add(front);
  }

  async loadArena(requestedName = null) {
    const select = document.getElementById('arenaSelect');
    const name = requestedName || select?.value || this.selectedArena || 'arena1.glb';
    this.selectedArena = name;
    const uniqueUrls = [...new Set([
      `/assets/arena/${name}`,
      '/assets/arena/arena1.glb',
      '/assets/arena/arena2.glb',
      '/assets/arena/arena.glb',
      '/assets/arena/arena.gltf',
      '/assets/arena/arena.fbx'
    ])];

    for (const url of uniqueUrls) {
      try {
        const arenaObject = await this.loader.loadObject(url);
        arenaObject.name = `LoadedArena:${url}`;
        this.replaceArena(arenaObject);
        console.log(`Loaded arena: ${url}`);
        return;
      } catch (err) {
        console.warn(`Arena not loaded from ${url}`, err.message || err);
      }
    }
    console.warn('No arena1.glb / arena2.glb / arena.glb / arena.fbx found. Keeping fallback arena.');
    this.loadedArena = this.fallbackArena;
    this.captureArenaBaseTransform(this.fallbackArena);
    this.applyArenaSliders();
  }

  replaceArena(arenaObject) {
    if (this.loadedArena && this.loadedArena !== this.fallbackArena) this.scene.remove(this.loadedArena);
    this.fitArenaToStage(arenaObject);
    this.scene.add(arenaObject);
    this.loadedArena = arenaObject;
    this.captureArenaBaseTransform(arenaObject);
    this.applyArenaSliders();
    if (this.fallbackArena) this.fallbackArena.visible = false;
    this.vfx?.spawnFlash(new THREE.Vector3(0, 1.2, 0), 0x99ccff, 1.2, 0.18);
  }

  fitArenaToStage(object) {
    object.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.frustumCulled = false;
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => { if ('color' in m && m.color?.getHex?.() === 0x000000) m.color.set(0x777777); });
        }
      }
    });
    object.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= box.min.y;
    const maxDim = Math.max(size.x, size.z);
    if (maxDim > 0.001) object.scale.multiplyScalar(Math.min(40 / maxDim, 1));
    this.groundObject(object, 0);
  }

  groundObject(object, groundY = 0) {
    object.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(object);
    object.position.y += groundY - box.min.y;
  }

  makeFallbackArena() {
    this.fallbackArena = new THREE.Group();
    this.fallbackArena.name = 'FallbackArena';
    const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.2, 7), new THREE.MeshStandardMaterial({ color: 0x596675, roughness: 0.45 }));
    floor.position.y = -0.1;
    this.fallbackArena.add(floor);
    const grid = new THREE.GridHelper(18, 18, 0xffdd77, 0x8794a5);
    grid.position.y = 0.01;
    this.fallbackArena.add(grid);
    this.scene.add(this.fallbackArena);
    this.loadedArena = this.fallbackArena;
    this.captureArenaBaseTransform(this.fallbackArena);
  }

  setupSliders() {
    [
      'arenaScale', 'arenaX', 'arenaY', 'arenaZ',
      'charScale', 'charY', 'charZ', 'p1X', 'p2X'
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        this.applyArenaSliders();
        this.applyCharacterSliders();
      });
    });
  }

  setupArenaSelect() {
    const select = document.getElementById('arenaSelect');
    if (!select) return;
    select.addEventListener('change', async () => {
      this.showBoot(`Loading ${select.value}...`, false);
      await this.loadArena(select.value);
      if (this.assetsReady && !this.fightStarted) this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
      else this.hideBoot();
    });
  }

  setupReplayButton() {
    const btn = document.getElementById('replayBtn');
    if (btn) btn.addEventListener('click', () => this.resetRound());
  }

  setupPlayButton() {
    const btn = document.getElementById('playBtn');
    if (btn) btn.addEventListener('click', () => this.startFight());
  }

  startFight() {
    if (!this.assetsReady) return;
    this.fightStarted = true;
    this.hideBoot();
    this.clock.getDelta();
  }

  showBoot(message, showPlay) {
    const boot = document.getElementById('boot');
    const msg = document.getElementById('bootMessage');
    const btn = document.getElementById('playBtn');
    if (!boot) return;
    boot.style.display = 'grid';
    if (msg) msg.textContent = message;
    if (btn) btn.style.display = showPlay ? 'inline-block' : 'none';
  }

  hideBoot() {
    const boot = document.getElementById('boot');
    if (boot) boot.style.display = 'none';
  }

  captureArenaBaseTransform(object) {
    if (!object) return;
    this.arenaBaseScale.copy(object.scale);
    this.arenaBasePosition.copy(object.position);
  }

  sliderNumber(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    return Number.parseFloat(el.value) || fallback;
  }

  applyArenaSliders() {
    const object = this.loadedArena || this.fallbackArena;
    if (!object) return;
    const scale = this.sliderNumber('arenaScale', 1);
    const x = this.sliderNumber('arenaX', 0);
    const y = this.sliderNumber('arenaY', 0);
    const z = this.sliderNumber('arenaZ', 0);
    object.scale.copy(this.arenaBaseScale).multiplyScalar(scale);
    object.position.copy(this.arenaBasePosition).add(new THREE.Vector3(x, 0, z));
    this.groundObject(object, 0);
    object.position.y += y;
    this.setSliderLabel('arenaScaleValue', scale.toFixed(2));
    this.setSliderLabel('arenaXValue', x.toFixed(1));
    this.setSliderLabel('arenaYValue', y.toFixed(1));
    this.setSliderLabel('arenaZValue', z.toFixed(1));
  }

  applyCharacterSliders() {
    if (!this.p1 || !this.p2) return;
    const scale = this.sliderNumber('charScale', 1);
    const y = this.sliderNumber('charY', 0);
    const z = this.sliderNumber('charZ', 0);
    const p1x = this.sliderNumber('p1X', -2.4);
    const p2x = this.sliderNumber('p2X', 2.4);
    this.p1.applyVisualTransform({ scale, y, z });
    this.p2.applyVisualTransform({ scale, y, z });
    if (!this.fightStarted || this.roundOver) {
      this.p1.group.position.x = p1x;
      this.p2.group.position.x = p2x;
    }
    this.setSliderLabel('charScaleValue', scale.toFixed(2));
    this.setSliderLabel('charYValue', y.toFixed(1));
    this.setSliderLabel('charZValue', z.toFixed(1));
    this.setSliderLabel('p1XValue', p1x.toFixed(1));
    this.setSliderLabel('p2XValue', p2x.toFixed(1));
  }

  setSliderLabel(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async loadFighters() {
    this.p1 = new Fighter({ id: 'P1', color: 0x2f7dff, startX: -2.4, modelUrl: '/assets/characters/player1/character.fbx', animationBaseUrl: '/assets/characters/player1', bindings: P1_BINDINGS, assetLoader: this.loader, vfx: this.vfx });
    this.p2 = new Fighter({ id: 'P2-AI', color: 0xff374f, startX: 2.4, modelUrl: '/assets/characters/player2/character.fbx', animationBaseUrl: '/assets/characters/player2', bindings: P2_BINDINGS, assetLoader: this.loader, isAI: true, vfx: this.vfx });
    await Promise.all([this.p1.load(), this.p2.load()]);
    this.scene.add(this.p1.group, this.p2.group);
    this.applyCharacterSliders();
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.update(dt);
    this.vfx.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.aiInput.endFrame();
  }

  update(dt) {
    if (!this.assetsReady || !this.p1 || !this.p2) return;
    if (!this.fightStarted) {
      this.p1.play('idle', 0.12);
      this.p2.play('idle', 0.12);
      this.p1.mixer?.update(dt);
      this.p2.mixer?.update(dt);
      return;
    }

    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    // NO body collision/push. Characters can pass/cross each other.
    if (!this.roundOver) {
      this.aiInput.update(dt, this.p2, this.p1);
      this.p1.update(dt, this.input, this.p2, this.arena);
      this.p2.update(dt, this.aiInput, this.p1, this.arena);
      this.checkRoundOver();
    } else {
      this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena);
      this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena);
    }
    this.updateHud();
    if (!this.fixedCamera) this.updateCamera(dt);
  }

  updateCamera(dt) {
    const centerX = (this.p1.group.position.x + this.p2.group.position.x) * 0.5;
    const distance = Math.abs(this.p1.group.position.x - this.p2.group.position.x);
    const targetZ = THREE.MathUtils.clamp(8.5 + distance * 0.25, 9.5, 12.5);
    const target = new THREE.Vector3(centerX, 3.1, targetZ);
    this.camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(centerX, 1.15, 0);
  }

  updateHud() {
    document.getElementById('p1Health').style.width = `${this.p1.health}%`;
    document.getElementById('p2Health').style.width = `${this.p2.health}%`;
  }

  checkRoundOver() {
    if (!(this.p1.health <= 0 || this.p2.health <= 0)) return;
    const text = document.getElementById('roundText');
    this.roundOver = true;
    text.textContent = this.p1.health <= 0 && this.p2.health <= 0 ? 'DRAW' : (this.p1.health <= 0 ? 'AI WINS' : 'P1 WINS');
    const replay = document.getElementById('replayBtn');
    if (replay) replay.style.display = 'block';
  }

  resetRound() {
    if (!this.p1 || !this.p2) return;
    this.roundOver = false;
    this.p1.health = 100;
    this.p2.health = 100;
    this.p1.koStarted = this.p2.koStarted = false;
    this.p1.stun = this.p2.stun = 0;
    this.p1.hitStop = this.p2.hitStop = 0;
    this.p1.group.position.set(this.sliderNumber('p1X', -2.4), 0, 0);
    this.p2.group.position.set(this.sliderNumber('p2X', 2.4), 0, 0);
    this.p1.velocity.set(0, 0, 0);
    this.p2.velocity.set(0, 0, 0);
    this.p1.setState('idle');
    this.p2.setState('idle');
    this.p1.play('idle', 0.05, true, true);
    this.p2.play('idle', 0.05, true, true);
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    document.getElementById('roundText').textContent = 'ROUND 1';
    document.getElementById('replayBtn').style.display = 'none';
    this.vfx.spawnFlash(new THREE.Vector3(0, 1.2, 0), 0xffffff, 1.2, 0.18);
    this.updateHud();
  }

  showLoading(message) { this.showBoot(message, false); }
  hideLoading() { this.hideBoot(); }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
