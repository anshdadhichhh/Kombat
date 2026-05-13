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
    this.arena = { halfWidth: 1000 };
    this.roundOver = false;
    this.assetsReady = false;
    this.fightStarted = false;
    this.fallbackArena = null;
    this.loadedArena = null;
    this.arenaBaseScale = new THREE.Vector3(1, 1, 1);
    this.arenaBasePosition = new THREE.Vector3(0, 0, 0);
    this.arenaBaseRotation = new THREE.Euler(0, 0, 0);
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
    this.vfx = new VFXSystem(this.scene, this.camera);

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
      this.applyAllTransforms();
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
    const uniqueUrls = [...new Set([`/assets/arena/${name}`, '/assets/arena/arena1.glb', '/assets/arena/arena2.glb', '/assets/arena/arena.glb', '/assets/arena/arena.gltf', '/assets/arena/arena.fbx'])];

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
    this.applyArenaTransform();
  }

  replaceArena(arenaObject) {
    if (this.loadedArena && this.loadedArena !== this.fallbackArena) this.scene.remove(this.loadedArena);
    this.fitArenaToStage(arenaObject);
    this.scene.add(arenaObject);
    this.loadedArena = arenaObject;
    this.captureArenaBaseTransform(arenaObject);
    this.applyArenaTransform();
    if (this.fallbackArena) this.fallbackArena.visible = false;
    this.vfx?.spawnFlash(new THREE.Vector3(0, 1.2, 0.8), 0x99ccff, 1.2, 0.18);
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
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center); box.getSize(size);
    object.position.x -= center.x;
    object.position.z -= center.z;
    object.position.y -= box.min.y;
    const maxDim = Math.max(size.x, size.z);
    if (maxDim > 0.001) object.scale.multiplyScalar(Math.min(40 / maxDim, 1));
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
    const ids = [
      'arenaScaleX','arenaScaleY','arenaScaleZ','arenaX','arenaY','arenaZ','arenaRotX','arenaRotY','arenaRotZ',
      'p1Scale','p1X','p1Y','p1Z','p1RotX','p1RotY','p1RotZ',
      'p2Scale','p2X','p2Y','p2Z','p2RotX','p2RotY','p2RotZ'
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => this.applyAllTransforms());
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

  setupReplayButton() { const btn = document.getElementById('replayBtn'); if (btn) btn.addEventListener('click', () => this.resetRound()); }
  setupPlayButton() { const btn = document.getElementById('playBtn'); if (btn) btn.addEventListener('click', () => this.startFight()); }
  startFight() { if (!this.assetsReady) return; this.fightStarted = true; this.hideBoot(); this.clock.getDelta(); }
  showBoot(message, showPlay) { const boot = document.getElementById('boot'); const msg = document.getElementById('bootMessage'); const btn = document.getElementById('playBtn'); if (!boot) return; boot.style.display = 'grid'; if (msg) msg.textContent = message; if (btn) btn.style.display = showPlay ? 'inline-block' : 'none'; }
  hideBoot() { const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none'; }

  captureArenaBaseTransform(object) { if (!object) return; this.arenaBaseScale.copy(object.scale); this.arenaBasePosition.copy(object.position); this.arenaBaseRotation.copy(object.rotation); }
  n(id, fallback) { const el = document.getElementById(id); return el ? (Number.parseFloat(el.value) || 0) : fallback; }
  applyAllTransforms() { this.applyArenaTransform(); this.applyCharacterTransforms(); }

  applyArenaTransform() {
    const o = this.loadedArena || this.fallbackArena;
    if (!o) return;
    const sx = this.n('arenaScaleX', 1), sy = this.n('arenaScaleY', 1), sz = this.n('arenaScaleZ', 1);
    const x = this.n('arenaX', 0), y = this.n('arenaY', 0), z = this.n('arenaZ', 0);
    const rx = this.n('arenaRotX', 0), ry = this.n('arenaRotY', 0), rz = this.n('arenaRotZ', 0);
    o.scale.set(this.arenaBaseScale.x * sx, this.arenaBaseScale.y * sy, this.arenaBaseScale.z * sz);
    o.position.copy(this.arenaBasePosition).add(new THREE.Vector3(x, y, z));
    o.rotation.set(this.arenaBaseRotation.x + THREE.MathUtils.degToRad(rx), this.arenaBaseRotation.y + THREE.MathUtils.degToRad(ry), this.arenaBaseRotation.z + THREE.MathUtils.degToRad(rz));
    this.label('arenaScaleXValue', sx.toFixed(2)); this.label('arenaScaleYValue', sy.toFixed(2)); this.label('arenaScaleZValue', sz.toFixed(2));
    this.label('arenaXValue', x.toFixed(1)); this.label('arenaYValue', y.toFixed(1)); this.label('arenaZValue', z.toFixed(1));
    this.label('arenaRotXValue', rx.toFixed(0)); this.label('arenaRotYValue', ry.toFixed(0)); this.label('arenaRotZValue', rz.toFixed(0));
  }

  applyCharacterTransforms() { if (!this.p1 || !this.p2) return; this.applyOneCharacter(this.p1, 'p1'); this.applyOneCharacter(this.p2, 'p2'); }
  applyOneCharacter(f, prefix) {
    const scale = this.n(`${prefix}Scale`, 1), x = this.n(`${prefix}X`, f.startX), y = this.n(`${prefix}Y`, 0), z = this.n(`${prefix}Z`, 0);
    const rx = this.n(`${prefix}RotX`, 0), ry = this.n(`${prefix}RotY`, 0), rz = this.n(`${prefix}RotZ`, 0);
    f.applyVisualTransform({ scale, x: 0, y: 0, z: 0, rx, ry, rz });
    if (!this.fightStarted || this.roundOver) f.group.position.set(x, y, z); else { f.group.position.y = y; f.group.position.z = z; }
    this.label(`${prefix}ScaleValue`, scale.toFixed(2)); this.label(`${prefix}XValue`, x.toFixed(1)); this.label(`${prefix}YValue`, y.toFixed(1)); this.label(`${prefix}ZValue`, z.toFixed(1));
    this.label(`${prefix}RotXValue`, rx.toFixed(0)); this.label(`${prefix}RotYValue`, ry.toFixed(0)); this.label(`${prefix}RotZValue`, rz.toFixed(0));
  }
  label(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

  async loadFighters() {
    this.p1 = new Fighter({ id: 'P1', color: 0x2f7dff, startX: -2.4, modelUrl: '/assets/characters/player1/character.fbx', animationBaseUrl: '/assets/characters/player1', bindings: P1_BINDINGS, assetLoader: this.loader, vfx: this.vfx });
    this.p2 = new Fighter({ id: 'P2-AI-RIGHT', color: 0xff374f, startX: 2.4, modelUrl: '/assets/characters/player2/character.fbx', animationBaseUrl: '/assets/characters/player2', bindings: P2_BINDINGS, assetLoader: this.loader, isAI: true, vfx: this.vfx });
    await Promise.all([this.p1.load(), this.p2.load()]);
    this.scene.add(this.p1.group, this.p2.group);
    this.applyCharacterTransforms();
    this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1);
  }

  animate() { requestAnimationFrame(() => this.animate()); const dt = Math.min(this.clock.getDelta(), 1 / 30); this.update(dt); this.vfx.update(dt); this.renderer.render(this.scene, this.camera); this.input.endFrame(); this.aiInput.endFrame(); }
  update(dt) {
    if (!this.assetsReady || !this.p1 || !this.p2) return;
    if (!this.fightStarted) { this.p1.play('idle', 0.12); this.p2.play('idle', 0.12); this.p1.mixer?.update(dt); this.p2.mixer?.update(dt); return; }
    this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1);
    if (!this.roundOver) { this.aiInput.update(dt, this.p2, this.p1); this.p1.update(dt, this.input, this.p2, this.arena); this.p2.update(dt, this.aiInput, this.p1, this.arena); this.checkRoundOver(); }
    else { this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena); this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena); }
    this.updateHud(); if (!this.fixedCamera) this.updateCamera(dt);
  }
  updateCamera(dt) { const centerX = (this.p1.group.position.x + this.p2.group.position.x) * 0.5; const distance = Math.abs(this.p1.group.position.x - this.p2.group.position.x); const targetZ = THREE.MathUtils.clamp(8.5 + distance * 0.25, 9.5, 12.5); const target = new THREE.Vector3(centerX, 3.1, targetZ); this.camera.position.lerp(target, 1 - Math.pow(0.001, dt)); this.camera.lookAt(centerX, 1.15, 0); }
  updateHud() { document.getElementById('p1Health').style.width = `${this.p1.health}%`; document.getElementById('p2Health').style.width = `${this.p2.health}%`; }
  checkRoundOver() { if (!(this.p1.health <= 0 || this.p2.health <= 0)) return; const text = document.getElementById('roundText'); this.roundOver = true; text.textContent = this.p1.health <= 0 && this.p2.health <= 0 ? 'DRAW' : (this.p1.health <= 0 ? 'AI WINS' : 'P1 WINS'); const replay = document.getElementById('replayBtn'); if (replay) replay.style.display = 'block'; }
  resetRound() { if (!this.p1 || !this.p2) return; this.roundOver = false; this.p1.health = 100; this.p2.health = 100; this.p1.koStarted = this.p2.koStarted = false; this.p1.stun = this.p2.stun = 0; this.p1.hitStop = this.p2.hitStop = 0; this.applyCharacterTransforms(); this.p1.velocity.set(0,0,0); this.p2.velocity.set(0,0,0); this.p1.setState('idle'); this.p2.setState('idle'); this.p1.play('idle',0.05,true,true); this.p2.play('idle',0.05,true,true); this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1); document.getElementById('roundText').textContent = 'ROUND 1'; document.getElementById('replayBtn').style.display = 'none'; this.updateHud(); }
  onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
}
