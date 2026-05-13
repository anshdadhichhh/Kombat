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
    this.arena = { halfWidth: 9.5 };
    this.roundOver = false;
    this.assetsReady = false;
    this.fightStarted = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a9c7);
    this.scene.fog = new THREE.Fog(0x87a9c7, 28, 95);

    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.05, 500);
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
  }

  async init() {
    this.showBoot('Building Tekken-style arena and loading fighters...', false);
    this.buildArena();
    this.animate();
    try {
      await this.loadFighters();
      this.assetsReady = true;
      this.showBoot('ALL ASSETS LOADED. Press PLAY to start.', true);
      console.log('ALL ASSETS LOADED: procedural rocky arena + both fighter meshes + all configured animations.');
    } catch (err) {
      console.error('Game asset load failed:', err);
      this.showBoot(`Asset load failed. Check console. ${err.message || err}`, false);
    }
  }

  makeRockMaterial(base = 0x5c5148) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5b534a';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2600; i++) {
      const v = 75 + Math.random() * 80;
      ctx.fillStyle = `rgba(${v},${v * 0.95},${v * 0.82},${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 5, 1 + Math.random() * 5);
    }
    for (let i = 0; i < 45; i++) {
      ctx.strokeStyle = `rgba(30,25,20,${0.15 + Math.random() * 0.25})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 512, Math.random() * 512);
      ctx.lineTo(Math.random() * 512, Math.random() * 512);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 3);
    return new THREE.MeshStandardMaterial({ color: base, map: tex, roughness: 0.88, metalness: 0.02 });
  }

  buildArena() {
    this.addLights();
    this.addSkyBackdrop();
    this.addRockGround();
    this.addRockFormations();
    this.addAtmosphereProps();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x4b3a2c, 1.9));
    const sun = new THREE.DirectionalLight(0xfff0d2, 3.0);
    sun.position.set(-8, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x83b9ff, 1.1);
    rim.position.set(8, 5, -6);
    this.scene.add(rim);
  }

  addSkyBackdrop() {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 42), new THREE.MeshBasicMaterial({ color: 0x91b7d5, depthWrite: false }));
    sky.position.set(0, 15, -26);
    this.scene.add(sky);
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x374055, roughness: 0.9 });
    for (let i = 0; i < 13; i++) {
      const h = 3 + Math.random() * 7;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6 + Math.random() * 2.8, h, 5), mountainMat);
      cone.position.set(-25 + i * 4.4, h / 2 - 1.3, -21 - Math.random() * 3);
      cone.rotation.y = Math.random() * Math.PI;
      this.scene.add(cone);
    }
  }

  addRockGround() {
    const ground = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 9.5, 12, 1, 6), this.makeRockMaterial());
    ground.position.y = -0.22;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const center = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), new THREE.MeshStandardMaterial({ color: 0x6b6255, roughness: 0.9 }));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.025;
    this.scene.add(center);
    const dirt = new THREE.Mesh(new THREE.RingGeometry(3.4, 6.6, 96), new THREE.MeshStandardMaterial({ color: 0x4f463c, roughness: 0.95 }));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.018;
    this.scene.add(dirt);
  }

  addRockFormations() {
    const rockMat = this.makeRockMaterial(0x655b50);
    const positions = [[-11,0.6,-4.8],[-8.5,0.35,-5.5],[10.5,0.6,-4.8],[8.4,0.4,-5.6],[-12,0.65,4.8],[12,0.65,4.7],[-5.5,0.25,5.4],[5.4,0.25,5.4]];
    positions.forEach(([x, y, z], i) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + (i % 3) * 0.28, 0), rockMat);
      rock.scale.set(1.4 + Math.random(), 0.55 + Math.random() * 0.55, 0.8 + Math.random());
      rock.position.set(x, y, z);
      rock.rotation.set(Math.random(), Math.random() * Math.PI, Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    });
  }

  addAtmosphereProps() {
    const torchMat = new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
    [-7.5, 7.5].forEach((x) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 12), torchMat);
      pole.position.set(x, 1.2, -5.8);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 16), flameMat);
      flame.position.set(x, 2.65, -5.8);
      this.scene.add(pole, flame);
    });
  }

  async loadFighters() {
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
    if (!this.fightStarted) {
      this.p1.play('idle', 0.12);
      this.p2.play('idle', 0.12);
      this.p1.mixer?.update(dt);
      this.p2.mixer?.update(dt);
      return;
    }
    this.p1.faceOpponent(this.p2);
    this.p2.faceOpponent(this.p1);
    // No collision resolution. Characters can pass through each other.
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

  updateHud() { document.getElementById('p1Health').style.width = `${this.p1.health}%`; document.getElementById('p2Health').style.width = `${this.p2.health}%`; }
  checkRoundOver() { if (!(this.p1.health <= 0 || this.p2.health <= 0)) return; const text = document.getElementById('roundText'); this.roundOver = true; text.textContent = this.p1.health <= 0 && this.p2.health <= 0 ? 'DRAW' : (this.p1.health <= 0 ? 'AI WINS' : 'P1 WINS'); const replay = document.getElementById('replayBtn'); if (replay) replay.style.display = 'block'; }
  resetRound() { if (!this.p1 || !this.p2) return; this.roundOver = false; this.p1.health = 100; this.p2.health = 100; this.p1.koStarted = this.p2.koStarted = false; this.p1.stun = this.p2.stun = 0; this.p1.hitStop = this.p2.hitStop = 0; this.p1.group.position.set(-2.6, 0, 0); this.p2.group.position.set(2.6, 0, 0); this.p1.velocity.set(0, 0, 0); this.p2.velocity.set(0, 0, 0); this.p1.setState('idle'); this.p2.setState('idle'); this.p1.play('idle', 0.05, true, true); this.p2.play('idle', 0.05, true, true); this.p1.faceOpponent(this.p2); this.p2.faceOpponent(this.p1); document.getElementById('roundText').textContent = 'ROUND 1'; document.getElementById('replayBtn').style.display = 'none'; this.updateHud(); }
  onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }
}
