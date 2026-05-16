import * as THREE from 'three';
import { ATTACKS, DEFAULT_ANIMATION_MAP, ANIMATION_SPEEDS } from './animationMap.js';
import { makeFallbackFighter, normalizeFbxObject } from './assetLoader.js';

const STATE = {
  IDLE: 'idle', WALK: 'walk', JUMP: 'jump', CROUCH: 'crouch', BLOCK: 'block', ATTACK: 'attack', HIT: 'hit', KO: 'ko'
};

export class Fighter {
  constructor({ id, color, startX, modelUrl, animationBaseUrl, bindings, assetLoader, isAI = false, vfx = null, sound = null }) {
    this.id = id;
    this.color = color;
    this.modelUrl = modelUrl;
    this.animationBaseUrl = animationBaseUrl;
    this.bindings = bindings;
    this.assetLoader = assetLoader;
    this.isAI = isAI;
    this.vfx = vfx;
    this.sound = sound;
    this.startX = startX;

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
    this.visualBaseScale = new THREE.Vector3(1, 1, 1);
    this.visualBasePosition = new THREE.Vector3(0, 0, 0);
    this.visualOffset = { scale: 1, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    this.attackStartX = startX;
    this.attackMotionApplied = 0;
    this.attackRootMotion = null;
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
    this.visualBaseScale.copy(visual.scale);
    this.visualBasePosition.copy(visual.position);
    this.mixer = new THREE.AnimationMixer(visual);

    await this.loadAllAnimations();
    this.animationsReady = true;
    this.play('idle', 0.05, true, true);
    console.log(`[${this.id}] ALL animations loaded; ready.`);
  }

  async loadAllAnimations() {
    const names = Object.keys(DEFAULT_ANIMATION_MAP);
    await Promise.all(names.map((name) => this.loadAnimationEntry(name)));
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
        // FIX: Do NOT clamp attack/hit/ko animations to their last frame —
        // that causes the "stuck in place" look when the animation ends.
        // Instead let them fall through to idle via the state machine.
        if (name === 'ko') {
          action.clampWhenFinished = true;
        } else {
          action.clampWhenFinished = false;
        }
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

  applyVisualTransform({ scale = 1, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0 } = {}) {
    this.visualOffset = { scale, x, y, z, rx, ry, rz };
    if (!this.visual) return;
    this.visual.scale.copy(this.visualBaseScale).multiplyScalar(scale);
    this.visual.position.copy(this.visualBasePosition).add(new THREE.Vector3(x, y, z));
    this.visual.rotation.set(THREE.MathUtils.degToRad(rx), THREE.MathUtils.degToRad(ry), THREE.MathUtils.degToRad(rz));
  }

  pickAction(name) {
    const entry = this.actions.get(name);
    if (!Array.isArray(entry)) return entry;
    return entry[Math.floor(Math.random() * entry.length)];
  }

  play(name, fade = 0.08, loop = true, forceRestart = false) {
    const next = this.pickAction(name);
    if (!next) {
      if (!this._warnedMissing?.[name]) {
        (this._warnedMissing ??= {})[name] = true;
        console.warn(`[${this.id}] No animation action for "${name}"`);
      }
      return false;
    }
    if (!forceRestart && next === this.currentAction && next.isRunning()) return true;
    try {
      next.paused = false;
      next.reset();
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.setEffectiveTimeScale(ANIMATION_SPEEDS[name] ?? 1);
      next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      if (!loop) {
        next.repetitions = 1;
      }
      next.fadeIn(fade).play();
      if (this.currentAction && this.currentAction !== next) this.currentAction.fadeOut(fade);
      this.currentAction = next;
      this.currentActionName = name;
    } catch (err) {
      console.error(`[${this.id}] Animation error on "${name}":`, err);
      return false;
    }
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
      this.integrate(dt, arena, opponent);
      this.mixer?.update(dt);

      // Freeze on final KO frame
      if (
        this.currentActionName === 'ko' &&
        this.currentAction &&
        this.currentAction.time >= this.currentAction.getClip().duration
      ) {
        this.currentAction.paused = true;
      }
      
      return;
    }

    this.stateTime += dt;
    this.crouching = input.isDown(this.bindings.down);
    this.blocking = this.crouching && opponent?.state === STATE.ATTACK;

    if (this.stun > 0) {
      this.stun -= dt;
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena, opponent);
      this.mixer?.update(dt);
      return;
    }

    if (this.state === STATE.ATTACK) {
      this.updateAttack(opponent, arena);
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      this.integrate(dt, arena, opponent);
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

      if (move !== 0) {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, move * this.maxSpeed, this.acceleration, dt);
      } else {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction, dt);
      }

      if (this.crouching) {
        this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction * 1.5, dt);
        this.setState(this.blocking ? STATE.BLOCK : STATE.CROUCH);
        // FIX: Loop crouch/block so they don't freeze on last frame
        this.play(this.blocking ? 'block' : 'crouch', 0.08, true);
      } else if (move !== 0) {
        const animName = Math.sign(move) === this.facing ? 'walkForward' : 'walkBack';
        if (this.state !== STATE.WALK || this.currentActionName !== animName) {
          this.setState(STATE.WALK);
          // FIX: Loop walk animations — they should cycle smoothly
          this.play(animName, 0.08, true, false);
        }
      } else if (this.state === STATE.WALK || this.state === STATE.JUMP) {
        // Returning from walk/jump — transition to idle
        if (this.isGrounded) {
          this.setState(STATE.IDLE);
          this.play('idle', 0.15);
        }
      } else {
        // FIX: Only restart idle if we're not already in idle playing smoothly
        if (this.state !== STATE.IDLE) {
          this.setState(STATE.IDLE);
          this.play('idle', 0.15);
        } else if (!this.currentAction?.isRunning()) {
          this.play('idle', 0.1, true, true);
        }
      }
    }

    this.integrate(dt, arena, opponent);
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
    this.attackStartX = this.group.position.x;
    this.attackMotionApplied = 0;
    this.attackRootMotion = null;

    this.velocity.x = 0; // Kill horizontal velocity immediately for crisp attack start
    this.setState(STATE.ATTACK);
    if (this.play(kind, 0.025, false, true)) {
      this.attackRootMotion = this.currentAction?.getClip()?.userData?.rootMotion || null;
    }
  }

  updateAttack(opponent, arena) {
    const atk = ATTACKS[this.attackKind];
    const t = this.stateTime;
    if (!atk) return;
    this.applyAttackMotion(atk, t, arena);

    // FIX: Forward lunge — commit the destination position instead of doing a
    // one-shot teleport that integrate() can later undo.
   


    if (!this.attackHasHit && t >= atk.startup && t <= atk.startup + atk.active) {
      const dx = opponent.group.position.x - this.group.position.x;
      const dist = Math.abs(dx);
      const correctSide = Math.sign(dx) === this.facing;
      if (correctSide && dist <= atk.range && opponent.health > 0) {
        const hit = opponent.receiveHit(atk, this);
        this.attackHasHit = true;
        const frontZ = this.group.position.z + 0.65;
        const hitPoint = new THREE.Vector3((this.group.position.x + opponent.group.position.x) * 0.5, 1.35, frontZ);
        this.vfx?.spawnHit(hitPoint, new THREE.Vector3(this.facing, 0.15, 0.25), Boolean(hit?.blocked));
        const hitSound = { punch: 'punch', kick: 'punch2', heavy: 'punch3' }[this.attackKind] || 'punch';
        this.sound?.play(hitSound, 0.7);
      }
    }

    if (t >= atk.startup + atk.active + atk.recovery) {
      this.applyAttackMotion(atk, Infinity, arena);
      this.attackKind = null;
      // FIX: Keep the committed lunge position — don't snap back.
      // The lunge target IS where the character now stands.
 
      this.setState(STATE.IDLE);
      this.play('idle', 0.1);
    }
  }

  applyAttackMotion(atk, t, arena) {
    const total = Math.max(0.001, atk.startup + atk.active + atk.recovery);
    const progress = t === Infinity ? 1 : THREE.MathUtils.clamp(t / total, 0, 1);
    const lungeDistance = Math.max(0, atk.lunge ?? 0);
    let targetMotion = 0;

    if (this.attackRootMotion?.distance > 0 && this.attackRootMotion?.sample) {
      const clipDuration = this.currentAction?.getClip()?.duration || total;
      const clipTime = clipDuration * progress;
      targetMotion = (this.attackRootMotion.sample(clipTime) / this.attackRootMotion.distance) * lungeDistance;
    } else {
      targetMotion = THREE.MathUtils.smootherstep(progress, 0, 1) * lungeDistance;
    }

    targetMotion = THREE.MathUtils.clamp(targetMotion, 0, lungeDistance);
    const delta = targetMotion - this.attackMotionApplied;
    if (Math.abs(delta) < 0.0001) return;

    this.group.position.x += delta * this.facing;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);
    this.attackMotionApplied = Math.abs(this.group.position.x - this.attackStartX);
  }

  receiveHit(atk, attacker) {
    if (this.health <= 0) return { blocked: false, ko: true };
    const isBlocking = this.blocking && this.facing === -attacker.facing;
    const damage = isBlocking ? Math.ceil(atk.damage * 0.2) : atk.damage;
    this.health = Math.max(0, this.health - damage);
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

  integrate(dt, arena, opponent = null) {
    const wasGrounded = this.isGrounded;
    this.velocity.y += this.gravity * dt;
    this.group.position.x += this.velocity.x * dt;
    this.group.position.y += this.velocity.y * dt;
    this.group.position.x = THREE.MathUtils.clamp(this.group.position.x, -arena.halfWidth, arena.halfWidth);

    // FIX: Fighters pass through each other — remove collision push entirely.
    // If you want soft push-apart, uncomment the block below, but the original
    // logic was inverted and caused jitter. Passthrough is intentional here.

    // Optional soft push-apart (uncomment if you want fighters to not overlap):
    /*
    if (opponent && this.health > 0 && opponent.health > 0 && this.state !== STATE.ATTACK) {
      const dx = this.group.position.x - opponent.group.position.x;
      const minDist = this.radius + opponent.radius;
      if (Math.abs(dx) < minDist && Math.abs(dx) > 0.01) {
        const pushDir = Math.sign(dx);
        const overlap = minDist - Math.abs(dx);
        this.group.position.x += pushDir * overlap * 0.5;
      }
    }
    */

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
    return new THREE.Vector3(this.group.position.x, 0.05, this.group.position.z + 0.45);
  }

  faceOpponent(opponent) {
    this.facing = opponent.group.position.x >= this.group.position.x ? 1 : -1;
    this.group.rotation.y = this.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
  }
}
