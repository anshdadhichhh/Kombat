import * as THREE from 'three';
import { AssetLoader } from './assetLoader.js';
import { Fighter } from './fighter.js';
import { KeyboardInput, P1_BINDINGS, P2_BINDINGS } from './input.js';

export class FightingGame {
  constructor(container = document.body) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.input = new KeyboardInput();
    this.loader = new AssetLoader();
    this.arena = { halfWidth: 7.5 };
    this.roundOver = false;
    this.assetsReady = false;
    this.loadingEl = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070912);
    this.scene.fog = new THREE.Fog(0x070912, 12, 30);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 3.0, 8.8);
    this.camera.lookAt(0, 1.1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    window.addEventListener('resize', () => this.onResize());
  }

  async init() {
    this.addLights();
    this.makeFallbackArena();
    this.showLoading('Loading fighters...');

    // Start rendering immediately so you never get a black screen while FBX files load.
    this.animate();

    try {
      await this.loadArena();
      await this.loadFighters();
      this.assetsReady = true;
      this.hideLoading();
    } catch (err) {
      console.error('Game asset load failed:', err);
      this.showLoading(`Asset load failed. Check console. ${err.message || err}`);
    }
  }

  addLights() {
    const hemi = new THREE.HemisphereLight(0x8fb7ff, 0x241006, 1.3);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(-4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    this.scene.add(key);
    const rim = new THREE.PointLight(0x3366ff, 2, 18);
    rim.position.set(4, 3, -4);
    this.scene.add(rim);
  }

  async loadArena() {
    try {
      const arena = await this.loader.loadFBX('/assets/arena/arena.fbx');
      arena.traverse((c) => {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      });
      arena.scale.setScalar(0.01); // common FBX export scale; adjust if your arena is too small/large
      this.scene.add(arena);
    } catch (err) {
      console.warn('Could not load /assets/arena/arena.fbx. Keeping fallback arena.', err);
    }
  }

  makeFallbackArena() {
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(18, 0.2, 7),
      new THREE.MeshStandardMaterial({ color: 0x30333d, metalness: 0.1, roughness: 0.45 })
    );
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(18, 18, 0xffaa33, 0x555a66);
    grid.position.y = 0.01;
    this.scene.add(grid);

    for (let i = -8; i <= 8; i += 4) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: 0xff5533, emissive: 0x441000 })
      );
      pillar.position.set(i, 1.1, -3.2);
      this.scene.add(pillar);
    }
  }

  async loadFighters() {
    this.p1 = new Fighter({
      id: 'P1', color: 0x2f7dff, startX: -2.2,
      modelUrl: '/assets/characters/player1/character.fbx',
      animationBaseUrl: '/assets/characters/player1',
      bindings: P1_BINDINGS, assetLoader: this.loader
    });
    this.p2 = new Fighter({
      id: 'P2', color: 0xff374f, startX: 2.2,
      modelUrl: '/assets/characters/player2/character.fbx',
      animationBaseUrl: '/assets/characters/player2',
      bindings: P2_BINDINGS, assetLoader: this.loader
    });
    await Promise.all([this.p1.load(), this.p2.load()]);
    this.scene.add(this.p1.group, this.p2.group);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 1 / 30);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  update(dt) {
    if (!this.assetsReady || !this.p1 || !this.p2) {
      return;
    }

    if (!this.roundOver) {
      this.p1.faceOpponent(this.p2);
      this.p2.faceOpponent(this.p1);
      this.resolveBodyPush();
      this.p1.update(dt, this.input, this.p2, this.arena);
      this.p2.update(dt, this.input, this.p1, this.arena);
      this.updateHud();
      this.checkRoundOver();
    }
    this.updateCamera(dt);
  }

  resolveBodyPush() {
    const minDist = this.p1.radius + this.p2.radius;
    const dx = this.p2.group.position.x - this.p1.group.position.x;
    const dist = Math.abs(dx);
    if (dist > 0 && dist < minDist) {
      const overlap = minDist - dist;
      const dir = Math.sign(dx);
      this.p1.group.position.x -= dir * overlap * 0.5;
      this.p2.group.position.x += dir * overlap * 0.5;
    }
  }

  updateCamera(dt) {
    const centerX = (this.p1.group.position.x + this.p2.group.position.x) * 0.5;
    const distance = Math.abs(this.p1.group.position.x - this.p2.group.position.x);
    const targetZ = THREE.MathUtils.clamp(7.5 + distance * 0.35, 8.0, 11.5);
    const target = new THREE.Vector3(centerX, 2.7, targetZ);
    this.camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    this.camera.lookAt(centerX, 1.15, 0);
  }

  updateHud() {
    document.getElementById('p1Health').style.width = `${this.p1.health}%`;
    document.getElementById('p2Health').style.width = `${this.p2.health}%`;
  }

  checkRoundOver() {
    const text = document.getElementById('roundText');
    if (this.p1.health <= 0 || this.p2.health <= 0) {
      this.roundOver = true;
      text.textContent = this.p1.health <= 0 && this.p2.health <= 0 ? 'DRAW' : (this.p1.health <= 0 ? 'P2 WINS' : 'P1 WINS');
    }
  }

  showLoading(message) {
    if (!this.loadingEl) {
      this.loadingEl = document.createElement('div');
      this.loadingEl.style.cssText = `
        position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%);
        padding: 14px 18px; border: 1px solid #fff; border-radius: 8px;
        background: rgba(0,0,0,.72); color: white; z-index: 20;
        font: 16px system-ui, Arial; text-align: center; max-width: 80vw;
      `;
      document.body.appendChild(this.loadingEl);
    }
    this.loadingEl.textContent = message;
  }

  hideLoading() {
    this.loadingEl?.remove();
    this.loadingEl = null;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
