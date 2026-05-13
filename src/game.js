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
    this.arena = { halfWidth: 8.5 };
    this.roundOver = false;
    this.assetsReady = false;
    this.fightStarted = false;
    this.fixedCamera = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101827);
    this.scene.fog = new THREE.Fog(0x101827, 22, 80);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 500);
    this.camera.position.set(0, 4.1, 11.2);
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
  }

  async init() {
    this.showBoot('Building arena and loading all fighter assets...', false);
    this.buildArena();
    this.animate();
    try {
      await this.loadFighters();
      this.assetsReady = true;
      this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
      console.log('ALL ASSETS LOADED: procedural arena + both fighter meshes + all configured animations.');
    } catch (err) {
      console.error('Game asset load failed:', err);
      this.showBoot(`Asset load failed. Check console. ${err.message || err}`, false);
    }
  }

  buildArena() {
    this.addLights();
    this.addStage();
    this.addRopesAndPosts();
    this.addBackdrop();
    this.addProps();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x302014, 1.8));

    const key = new THREE.DirectionalLight(0xffffff, 2.5);
    key.position.set(-5, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88aaff, 1.4);
    fill.position.set(6, 5, 6);
    this.scene.add(fill);

    const colors = [0xffcc66, 0x66ccff, 0xff6688, 0xffffff];
    [-6, -2, 2, 6].forEach((x, i) => {
      const spot = new THREE.SpotLight(colors[i], 2.2, 28, Math.PI / 5, 0.45, 1.2);
      spot.position.set(x, 8, 4.5);
      spot.target.position.set(0, 0, 0);
      this.scene.add(spot, spot.target);
    });
  }

  addStage() {
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.55, metalness: 0.08 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.35, metalness: 0.25 });
    const mat = new THREE.MeshStandardMaterial({ color: 0x202633, roughness: 0.65 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(20, 0.65, 10), mat);
    base.position.y = -0.42;
    base.receiveShadow = true;
    this.scene.add(base);

    const top = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.18, 8.2), floorMat);
    top.position.y = 0.02;
    top.receiveShadow = true;
    this.scene.add(top);

    const center = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshStandardMaterial({ color: 0x3f485e, roughness: 0.55 }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.125;
    this.scene.add(center);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    const line1 = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.012, 0.05), lineMat);
    line1.position.y = 0.14;
    const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 8.0), lineMat);
    line2.position.y = 0.145;
    this.scene.add(line1, line2);

    const frontTrim = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.25, 0.25), trimMat);
    frontTrim.position.set(0, -0.08, 5.12);
    const backTrim = frontTrim.clone(); backTrim.position.z = -5.12;
    const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 10.4), trimMat); leftTrim.position.set(-10.12, -0.08, 0);
    const rightTrim = leftTrim.clone(); rightTrim.position.x = 10.12;
    this.scene.add(frontTrim, backTrim, leftTrim, rightTrim);
  }

  addRopesAndPosts() {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.35, metalness: 0.35 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xff365e, roughness: 0.4, metalness: 0.05 });
    const corners = [[-9.1, -4.1], [9.1, -4.1], [-9.1, 4.1], [9.1, 4.1]];
    corners.forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 2.4, 16), postMat);
      post.position.set(x, 1.2, z);
      post.castShadow = true;
      this.scene.add(post);
    });
    [0.85, 1.35, 1.85].forEach((y) => {
      const front = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 18.2, 12), ropeMat);
      front.rotation.z = Math.PI / 2; front.position.set(0, y, 4.15);
      const back = front.clone(); back.position.z = -4.15;
      const left = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 8.3, 12), ropeMat);
      left.rotation.x = Math.PI / 2; left.position.set(-9.15, y, 0);
      const right = left.clone(); right.position.x = 9.15;
      this.scene.add(front, back, left, right);
    });
  }

  addBackdrop() {
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x172033, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(28, 10, 0.35), wallMat);
    wall.position.set(0, 4.5, -9.2);
    wall.receiveShadow = true;
    this.scene.add(wall);

    const bannerMat = new THREE.MeshStandardMaterial({ color: 0xffc857, roughness: 0.45, emissive: 0x443000 });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(9.5, 1.3, 0.08), bannerMat);
    banner.position.set(0, 5.8, -8.95);
    this.scene.add(banner);

    const crowdMat = new THREE.MeshStandardMaterial({ color: 0x0b1020, roughness: 0.8 });
    for (let i = 0; i < 22; i++) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.8 + Math.random() * 0.7, 0.45), crowdMat);
      block.position.set(-12 + i * 1.12, 0.35, -7.7 - Math.random() * 0.8);
      this.scene.add(block);
    }
  }

  addProps() {
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.75 });
    for (const x of [-7.5, 7.5]) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), crateMat);
      crate.position.set(x, 0.32, 5.9);
      crate.castShadow = true;
      this.scene.add(crate);
    }
  }

  async loadFighters() {
    // User is P1 on the RIGHT. AI is P2 on the LEFT.
    this.p1 = new Fighter({ id: 'P1-RIGHT', color: 0x2f7dff, startX: 2.6, modelUrl: '/assets/characters/player1/character.fbx', animationBaseUrl: '/assets/characters/player1', bindings: P1_BINDINGS, assetLoader: this.loader, vfx: this.vfx });
    this.p2 = new Fighter({ id: 'AI-LEFT', color: 0xff374f, startX: -2.6, modelUrl: '/assets/characters/player2/character.fbx', animationBaseUrl: '/assets/characters/player2', bindings: P2_BINDINGS, assetLoader: this.loader, isAI: true, vfx: this.vfx });
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
    if (!this.fightStarted) {
      this.p1.play('idle', 0.12);
      this.p2.play('idle', 0.12);
      this.p1.mixer?.update(dt);
      this.p2.mixer?.update(dt);
      return;
    }
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    // Absolutely no body collision, no resolveBodyPush, no separation.
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
    this.p1.group.position.set(2.6, 0, 0);
    this.p2.group.position.set(-2.6, 0, 0);
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
    this.updateHud();
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
