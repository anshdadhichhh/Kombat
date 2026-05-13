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
    this.loadedArena = null;
    this.arenaBaseScale = new THREE.Vector3(1, 1, 1);
    this.arenaBasePosition = new THREE.Vector3(0, 0, 0);
    this.arenaBaseRotation = new THREE.Euler(0, 0, 0);

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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.vfx = new VFXSystem(this.scene, this.camera);
    window.addEventListener('resize', () => this.onResize());
    this.setupReplayButton();
    this.setupPlayButton();
    this.setupSliders();
  }

  async init() {
    this.showBoot('Loading arena GLB and fighters...', false);
    this.addLights();
    this.addSkyFallback();
    this.animate();
    try {
      await Promise.all([this.loadArenaFromFolder(), this.loadFighters()]);
      this.assetsReady = true;
      this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
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
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(300, 140), new THREE.MeshBasicMaterial({ color: 0x91b7d5, depthWrite: false }));
    sky.position.set(0, 35, -90);
    this.scene.add(sky);
  }

  async loadArenaFromFolder() {
    const files = ['arena.glb', 'arena1.glb', 'arena2.glb', 'arena.gltf', 'arena.fbx'];
    for (const file of files) {
      try {
        const obj = await this.loader.loadObject(`/assets/arena/${file}`);
        obj.name = `Arena:${file}`;
        this.prepareArena(obj);
        this.scene.add(obj);
        this.loadedArena = obj;
        this.captureArenaBaseTransform(obj);
        this.applyArenaSliders();
        console.log(`Loaded arena from public/assets/arena/${file}`);
        return;
      } catch (err) {
        console.warn(`Arena file not loaded: ${file}`, err.message || err);
      }
    }
    console.warn('No arena GLB found in public/assets/arena. Using simple fallback floor.');
    this.loadedArena = this.makeFallbackFloor();
    this.captureArenaBaseTransform(this.loadedArena);
    this.applyArenaSliders();
  }

  prepareArena(obj) {
    obj.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
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

  makeFallbackFloor() {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.35, 10), new THREE.MeshStandardMaterial({ color: 0x5c5148, roughness: 0.85 }));
    floor.position.y = -0.18;
    floor.receiveShadow = true;
    this.scene.add(floor);
    return floor;
  }

  captureArenaBaseTransform(obj) {
    this.arenaBaseScale.copy(obj.scale);
    this.arenaBasePosition.copy(obj.position);
    this.arenaBaseRotation.copy(obj.rotation);
  }

  setupSliders() {
    ['arenaScale','arenaX','arenaY','arenaZ','arenaRotX','arenaRotY','arenaRotZ'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.applyArenaSliders());
    });
  }

  num(id, fallback) { const el = document.getElementById(id); return el ? Number.parseFloat(el.value) : fallback; }

  applyArenaSliders() {
    const a = this.loadedArena;
    if (!a) return;
    const s = this.num('arenaScale', 1);
    const x = this.num('arenaX', 0);
    const y = this.num('arenaY', 0);
    const z = this.num('arenaZ', 0);
    const rx = this.num('arenaRotX', 0);
    const ry = this.num('arenaRotY', 0);
    const rz = this.num('arenaRotZ', 0);
    a.scale.copy(this.arenaBaseScale).multiplyScalar(s);
    a.position.copy(this.arenaBasePosition).add(new THREE.Vector3(x, y, z));
    a.rotation.set(this.arenaBaseRotation.x + THREE.MathUtils.degToRad(rx), this.arenaBaseRotation.y + THREE.MathUtils.degToRad(ry), this.arenaBaseRotation.z + THREE.MathUtils.degToRad(rz));
    this.label('arenaScaleValue', s.toFixed(2));
    this.label('arenaXValue', x.toFixed(1));
    this.label('arenaYValue', y.toFixed(1));
    this.label('arenaZValue', z.toFixed(1));
    this.label('arenaRotXValue', rx.toFixed(0));
    this.label('arenaRotYValue', ry.toFixed(0));
    this.label('arenaRotZValue', rz.toFixed(0));
  }

  label(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

  async loadFighters() {
    // Human/P1 LEFT, AI/P2 RIGHT.
    this.p1 = new Fighter({ id: 'P1-LEFT', color: 0x2f7dff, startX: -2.6, modelUrl: '/assets/characters/player1/character.fbx', animationBaseUrl: '/assets/characters/player1', bindings: P1_BINDINGS, assetLoader: this.loader, vfx: this.vfx });
    this.p2 = new Fighter({ id: 'AI-RIGHT', color: 0xff374f, startX: 2.6, modelUrl: '/assets/characters/player2/character.fbx', animationBaseUrl: '/assets/characters/player2', bindings: P2_BINDINGS, assetLoader: this.loader, isAI: true, vfx: this.vfx });
    await Promise.all([this.p1.load(), this.p2.load()]);
    this.scene.add(this.p1.group, this.p2.group);
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
  }

  setupReplayButton() { const btn = document.getElementById('replayBtn'); if (btn) btn.addEventListener('click', () => this.resetRound()); }
  setupPlayButton() { const btn = document.getElementById('playBtn'); if (btn) btn.addEventListener('click', () => this.startFight()); }
  startFight() { if (!this.assetsReady) return; this.fightStarted = true; this.hideBoot(); this.clock.getDelta(); }
  showBoot(message, showPlay) { const boot = document.getElementById('boot'); const msg = document.getElementById('bootMessage'); const btn = document.getElementById('playBtn'); if (!boot) return; boot.style.display = 'grid'; if (msg) msg.textContent = message; if (btn) btn.style.display = showPlay ? 'inline-block' : 'none'; }
  hideBoot() { const boot = document.getElementById('boot'); if (boot) boot.style.display = 'none'; }

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
    if (!this.fightStarted) { this.p1.play('idle', 0.12); this.p2.play('idle', 0.12); this.p1.mixer?.update(dt); this.p2.mixer?.update(dt); return; }
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    if (!this.roundOver) { this.aiInput.update(dt, this.p2, this.p1); this.p1.update(dt, this.input, this.p2, this.arena); this.p2.update(dt, this.aiInput, this.p1, this.arena); this.checkRoundOver(); }
    else { this.p1.update(dt, NEUTRAL_INPUT, this.p2, this.arena); this.p2.update(dt, NEUTRAL_INPUT, this.p1, this.arena); }
    this.updateHud();
  }

  updateHud() { document.getElementById('p1Health').style.width = `${this.p1.health}%`; document.getElementById('p2Health').style.width = `${this.p2.health}%`; }
  checkRoundOver() { if (!(this.p1.health <= 0 || this.p2.health <= 0)) return; const text = document.getElementById('roundText'); this.roundOver = true; text.textContent = this.p1.health <= 0 && this.p2.health <= 0 ? 'DRAW' : (this.p1.health <= 0 ? 'AI WINS' : 'P1 WINS'); const replay = document.getElementById('replayBtn'); if (replay) replay.style.display = 'block'; }
  resetRound() { if (!this.p1 || !this.p2) return; this.roundOver = false; this.p1.health = 100; this.p2.health = 100; this.p1.koStarted = this.p2.koStarted = false; this.p1.stun = this.p2.stun = 0; this.p1.hitStop = this.p2.hitStop = 0; this.p1.group.position.set(-2.6, 0, 0); this.p2.group.position.set(2.6, 0, 0); this.p1.velocity.set(0, 0, 0); this.p2.velocity.set(0, 0, 0); this.p1.setState('idle'); this.p2.setState('idle'); this.p1.play('idle', 0.05, true, true); this.p2.play('idle', 0.05, true, true); this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1); document.getElementById('roundText').textContent = 'ROUND 1'; document.getElementById('replayBtn').style.display = 'none'; this.updateHud(); }
  onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
}
