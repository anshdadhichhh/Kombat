import * as THREE from 'three';
import { ATTACKS, DEFAULT_ANIMATION_MAP, ANIMATION_SPEEDS } from './animationMap.js';
import { makeFallbackFighter, normalizeFbxObject } from './assetLoader.js';

const STATE = {
  IDLE: 'idle', WALK: 'walk', JUMP: 'jump', CROUCH: 'crouch', BLOCK: 'block', ATTACK: 'attack', HIT: 'hit', KO: 'ko'
};

export class Fighter {
  constructor({ id, color, startX, modelUrl, animationBaseUrl, bindings, assetLoader, isAI = false, vfx = null }) {
    this.id = id;
    this.color = color;
    this.modelUrl = modelUrl;
    this.animationBaseUrl = animationBaseUrl;
    this.bindings = bindings;
    this.assetLoader = assetLoader;
    this.isAI = isAI;
    this.vfx = vfx;

    this.group = new THREE.Group();
    this.group.position.set(startX, 0, 0);
    this.velocity = new THREE.Vector3();
    this.facing = startX < 0 ? 1 : -1;

    this.health = 100;
    this.state = STATE.IDLE;
    this.stateTime = 0;
    this.attackKind = null;
    this.attackHasHit = false;
    this.hitStop = 0;
    this.stun = 0;
    this.isGrounded = true;
    this.crouching = false;
    this.blocking = false;
    this.koStarted = false;

    this.maxSpeed = 3.2;
    this.acceleration = 22;
    this.friction = 18;
    this.jumpVelocity = 6.2;
    this.gravity = -18;
    this.radius = 0.45;
    this.height = 2.0;

    this.mixer = null;
    this.actions = new Map();
    this.currentAction = null;
    this.currentActionName = null;
    this.animationsReady = false;
  }

  async load() {
    let visual;
    try {
      visual = await this.assetLoader.loadFBX(this.modelUrl);
      normalizeFbxObject(visual, this.height);
      console.log(`[${this.id}] Loaded character mesh: ${this.modelUrl}`);
    } catch (err) {
      console.warn(`[${this.id}] Could not load ${this.modelUrl}. Using fallback fighter.`, err);
      visual = makeFallbackFighter(this.color);
    }

    this.visual = visual;
    this.group.add(visual);
    this.mixer = new THREE.AnimationMixer(visual);

    await this.loadAnimationEntry('idle');
    this.play('idle', 0.05, true, true);
    this.loadRemainingAnimations().catch((err) => console.warn(`[${this.id}] Background animation loading failed`, err));
  }

  async loadRemainingAnimations() {
    const names = Object.keys(DEFAULT_ANIMATION_MAP).filter((name) => name !== 'idle');
    await Promise.all(names.map((name) => this.loadAnimationEntry(name)));
    this.animationsReady = true;
    console.log(`[${this.id}] All available animations loaded.`);
  }

  async loadAnimationEntry(name) {
    if (this.actions.has(name)) return;
    const base = this.animationBaseUrl;
    const files = DEFAULT_ANIMATION_MAP[name];
    const fileList = Array.isArray(files) ? files : [files];
    const loadedActions = [];

    await Promise.all(fileList.map(async (file, index) => {
      const url = `${base}/${encodeURIComponent(file)}`;
      try {
        const actionName = fileList.length === 1 ? name : `${name}_${index}`;
        const clip = await this.assetLoader.loadAnimationClip(url, actionName);
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = true;
        loadedActions.push(action);
        console.log(`[${this.id}] Loaded animation ${name}: ${file}`);
      } catch (err) {
        console.warn(`[${this.id}] Missing/bad animation ${name}: ${url}`, err.message || err);
      }
    }));

    if (loadedActions.length === 1) this.actions.set(name, loadedActions[0]);
    if (loadedActions.length > 1) this.actions.set(name, loadedActions);
    if (name === 'idle' && !this.actions.has('idle')) console.error(`[${this.id}] Idle animation not loaded: ${base}/Idle.fbx`);
  }

  pickAction(name) {
    const entry = this.actions.get(name);
    if (!Array.isArray(entry)) return entry;
    return entry[Math.floor(Math.random() * entry.length)];
  }

  play(name, fade = 0.08, loop = true, forceRestart = false) {
    const next = this.pickAction(name);
    if (!next) return false;
    if (!forceRestart && next === this.currentAction && next.isRunning()) return true;
    next.reset();
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.setEffectiveTimeScale(ANIMATION_SPEEDS[name] ?? 1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.fadeIn(fade).play();
    if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(fade);
    this.currentAction = next;
    this.currentActionName = name;
    return true;
  }

  update(dt, input, opponent, arena) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.mixer?.update(dt * 0.25);
      return;
    }

    if (this.health <= 0) {
      if (!this.koStarted) {
        this.koStarted = true;
        this.setState(STATE.KO);
        this.play('ko', 0.05, false, true);
      }
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    this.stateTime += dt;
    this.crouching = input.isDown(this.bindings.down);
    this.blocking = this.crouching && opponent?.state === STATE.ATTACK;

    if (this.stun > 0) {
      this.stun -= dt;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    if (this.state === STATE.ATTACK) {
      this.updateAttack(opponent);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    const left = input.isDown(this.bindings.left);
    const right = input.isDown(this.bindings.right);
    const wantsJump = input.wasPressed(this.bindings.up);
    const punch = input.wasPressed(this.bindings.punch);
    const kick = input.wasPressed(this.bindings.kick);
    const heavy = input.wasPressed(this.bindings.heavy);

    if (punch) this.startAttack('punch');
    else if (kick) this.startAttack('kick');
    else if (heavy) this.startAttack('heavy');
    else if (wantsJump && this.isGrounded) {
      this.velocity.y = this.jumpVelocity;
      this.isGrounded = false;
      this.setState(STATE.JUMP);
      this.play('jump', 0.05, false, true);
      this.vfx?.spawnDust(this.getFootPosition(), 18);
    } else {
      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;

      if (move !== 0) this.velocity.x = THREE.MathUtils.damp(this.velocity.x, move * this.maxSpeed, this.acceleration, dt);
      else this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);

      if (this.crouching) {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction * 1.5, dt);
        this.setState(this.blocking ? STATE.BLOCK : STATE.CROUCH);
        this.play(this.blocking ? 'block' : 'crouch', 0.08);
      } else if (Math.abs(this.velocity.x) > 0.08) {
        this.setState(STATE.WALK);
        const movingTowardFacing = Math.sign(this.velocity.x) === this.facing;
        this.play(movingTowardFacing ? 'walkForward' : 'walkBack', 0.08);
      } else {
        this.setState(STATE.IDLE);
        this.play('idle', 0.12);
      }
    }

    this.integrate(dt, arena);
    this.mixer?.update(dt);
  }

  setState(s) {
    if (this.state !== s) {
      this.state = s;
      this.stateTime = 0;
    }
  }

  startAttack(kind) {
    if (this.health <= 0) return;
    this.attackKind = kind;
    this.attackHasHit = false;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, 1 / 60);
    this.setState(STATE.ATTACK);
    this.play(kind, 0.025, false, true);
  }

  updateAttack(opponent) {
    const atk = ATTACKS[this.attackKind];
    const t = this.stateTime;
    if (!atk) return;
    if (!this.attackHasHit && t >= atk.startup && t <= atk.startup + atk.active) {
      const dx = opponent.group.position.x - this.group.position.x;
      const dist = Math.abs(dx);
      const correctSide = Math.sign(dx) === this.facing;
      if (correctSide && dist <= atk.range && opponent.health > 0) {
        const hit = opponent.receiveHit(atk, this);
        this.attackHasHit = true;
        const hitPoint = new THREE.Vector3((this.group.position.x + opponent.group.position.x) * 0.5, 1.25, 0);
        this.vfx?.spawnHit(hitPoint, new THREE.Vector3(this.facing, 0.15, 0), Boolean(hit?.blocked));
      }
    }
    if (t >= atk.startup + atk.active + atk.recovery) {
      this.attackKind = null;
      this.setState(STATE.IDLE);
      this.play('idle', 0.08);
    }
  }

  receiveHit(atk, attacker) {
    if (this.health <= 0) return { blocked: false, ko: true };
    const isBlocking = this.blocking && this.facing === -attacker.facing;
    const damage = isBlocking ? Math.ceil(atk.damage * 0.2) : atk.damage;
    this.health = Math.max(0, this.health - damage);
    const dir = Math.sign(this.group.position.x - attacker.group.position.x) || attacker.facing;
    this.group.position.x += dir * atk.push;
    this.stun = this.health <= 0 ? 0 : (isBlocking ? 0.12 : 0.32);
    this.hitStop = this.health <= 0 ? 0 : 0.035;
    attacker.hitStop = this.health <= 0 ? 0 : 0.025;
    if (this.health <= 0) {
      this.koStarted = true;
      this.setState(STATE.KO);
      this.play('ko', 0.05, false, true);
    } else {
      this.setState(STATE.HIT);
      this.play('hit', 0.05, false, true);
    }
    return { blocked: isBlocking, ko: this.health <= 0 };
  }

  integrate(dt, arena) {
    const wasGrounded = this.isGrounded;
    this.velocity.y += this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
      if (!wasGrounded) {
        this.vfx?.spawnDust(this.getFootPosition(), 18);
        if (this.state === STATE.JUMP) {
          this.setState(STATE.IDLE);
          this.play('idle', 0.1);
        }
      }
    } else {
      this.isGrounded = false;
    }
  }

  getFootPosition() {
    return new THREE.Vector3(this.group.position.x, 0.05, this.group.position.z);
  }

  faceOpponent(opponent) {
    this.facing = opponent.group.position.x >= this.group.position.x ? 1 : -1;
    this.group.rotation.y = this.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  }
}
