import * as THREE from 'three';
import { ATTACKS, DEFAULT_ANIMATION_MAP } from './animationMap.js';
import { makeFallbackFighter, normalizeFbxObject } from './assetLoader.js';

const STATE = {
  IDLE: 'idle', WALK: 'walk', JUMP: 'jump', CROUCH: 'crouch', BLOCK: 'block', ATTACK: 'attack', HIT: 'hit', KO: 'ko'
};

export class Fighter {
  constructor({ id, color, startX, modelUrl, animationBaseUrl, bindings, assetLoader }) {
    this.id = id;
    this.color = color;
    this.modelUrl = modelUrl;
    this.animationBaseUrl = animationBaseUrl;
    this.bindings = bindings;
    this.assetLoader = assetLoader;

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

    this.speed = 3.2;
    this.jumpVelocity = 6.2;
    this.gravity = -18;
    this.radius = 0.45;
    this.height = 2.0;

    this.mixer = null;
    this.actions = new Map();
    this.currentAction = null;
  }

  async load() {
    let visual;
    try {
      visual = await this.assetLoader.loadFBX(this.modelUrl);
      normalizeFbxObject(visual, this.height);
    } catch (err) {
      console.warn(`[${this.id}] Could not load ${this.modelUrl}. Using fallback fighter.`, err);
      visual = makeFallbackFighter(this.color);
    }
    this.visual = visual;
    this.group.add(visual);

    this.mixer = new THREE.AnimationMixer(visual);
    await this.loadAnimations();
    this.play('idle', 0.1);
  }

  async loadAnimations() {
    const base = this.animationBaseUrl;
    const entries = Object.entries(DEFAULT_ANIMATION_MAP);
    await Promise.all(entries.map(async ([name, file]) => {
      try {
        const clip = await this.assetLoader.loadAnimationClip(`${base}/${file}`, name);
        const action = this.mixer.clipAction(clip);
        action.clampWhenFinished = true;
        this.actions.set(name, action);
      } catch (_) {
        // Missing animation is ok for a starter. The state machine still works.
      }
    }));
  }

  play(name, fade = 0.08, loop = true) {
    const next = this.actions.get(name);
    if (!next || next === this.currentAction) return;
    next.reset();
    next.enabled = true;
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    next.fadeIn(fade).play();
    if (this.currentAction) this.currentAction.fadeOut(fade);
    this.currentAction = next;
  }

  update(dt, input, opponent, arena) {
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.mixer?.update(dt * 0.1);
      return;
    }

    this.stateTime += dt;
    this.crouching = input.isDown(this.bindings.down);
    this.blocking = this.crouching && opponent?.state === STATE.ATTACK;

    if (this.health <= 0) {
      this.setState(STATE.KO);
      this.play('ko', 0.1, false);
      this.mixer?.update(dt);
      return;
    }

    if (this.stun > 0) {
      this.stun -= dt;
      this.velocity.x = 0;
      this.play('hit', 0.05, false);
      this.integrate(dt, arena);
      this.mixer?.update(dt);
      return;
    }

    if (this.state === STATE.ATTACK) {
      this.updateAttack(dt, opponent);
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
      this.play('jump', 0.05, false);
    } else {
      let move = 0;
      if (left) move -= 1;
      if (right) move += 1;
      this.velocity.x = move * this.speed;

      if (this.crouching) {
        this.velocity.x *= 0.25;
        this.setState(this.blocking ? STATE.BLOCK : STATE.CROUCH);
        this.play(this.blocking ? 'block' : 'crouch', 0.08);
      } else if (Math.abs(move) > 0.01) {
        this.setState(STATE.WALK);
        const movingTowardFacing = Math.sign(move) === this.facing;
        this.play(movingTowardFacing ? 'walkForward' : 'walkBack', 0.1);
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
    this.attackKind = kind;
    this.attackHasHit = false;
    this.velocity.x = 0;
    this.setState(STATE.ATTACK);
    this.play(kind, 0.04, false);
  }

  updateAttack(dt, opponent) {
    const atk = ATTACKS[this.attackKind];
    const t = this.stateTime;
    if (!this.attackHasHit && t >= atk.startup && t <= atk.startup + atk.active) {
      const dist = Math.abs(opponent.group.position.x - this.group.position.x);
      const correctSide = Math.sign(opponent.group.position.x - this.group.position.x) === this.facing;
      if (correctSide && dist <= atk.range + this.radius + opponent.radius) {
        opponent.receiveHit(atk, this);
        this.attackHasHit = true;
      }
    }
    if (t >= atk.startup + atk.active + atk.recovery) {
      this.attackKind = null;
      this.setState(STATE.IDLE);
      this.play('idle', 0.08);
    }
  }

  receiveHit(atk, attacker) {
    const isBlocking = this.blocking && this.facing === -attacker.facing;
    const damage = isBlocking ? Math.ceil(atk.damage * 0.2) : atk.damage;
    this.health = Math.max(0, this.health - damage);
    const dir = Math.sign(this.group.position.x - attacker.group.position.x) || attacker.facing;
    this.group.position.x += dir * atk.push;
    this.stun = isBlocking ? 0.12 : 0.32;
    this.hitStop = 0.05;
    attacker.hitStop = 0.035;
    if (this.health <= 0) this.setState(STATE.KO);
    else this.setState(STATE.HIT);
  }

  integrate(dt, arena) {
    this.velocity.y += this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }

  faceOpponent(opponent) {
    this.facing = opponent.group.position.x >= this.group.position.x ? 1 : -1;
    this.group.rotation.y = this.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  }
}
