/**
 * aiInput.js — Improved AI controller
 *
 * Fixes:
 *  - AI no longer spams attacks from far away (checks actual range before attacking)
 *  - Attack cooldown prevents button-mash spam
 *  - Walk-then-attack approach pattern feels natural
 *  - Blocking is reactive to incoming attacks with a delay (human-like)
 *  - Random variation prevents perfectly predictable behaviour
 */

export class AIInput {
  constructor(bindings) {
    this.bindings = bindings;

    // Internal virtual button state
    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();

    // AI decision state
    this._attackCooldown = 0;
    this._thinkTimer = 0;
    this._thinkInterval = 0.18; // re-evaluate every 180ms
    this._blockReactionDelay = 0;
    this._blockHeld = false;
    this._currentDecision = null; // 'approach' | 'retreat' | 'attack' | 'block' | 'idle'

    // Tuning
    this.ATTACK_RANGE_PUNCH = 1.8;
    this.ATTACK_RANGE_KICK  = 2.2;
    this.ATTACK_RANGE_HEAVY = 2.6;
    this.APPROACH_STOP_DIST = 1.4; // stop walking when this close
    this.RETREAT_DIST       = 0.6; // retreat if closer than this
    this.ATTACK_COOLDOWN    = 0.55; // minimum seconds between attacks
    this.BLOCK_REACTION_MS  = 110;  // ms to react to opponent attacking
    this.AGGRESSION         = 0.72; // 0–1; higher = attacks more often
  }

  // ── Public interface (mirrors KeyboardInput) ──────────────────────────────

  isDown(key) { return this._down.has(key); }
  wasPressed(key) { return this._pressed.has(key); }
  wasReleased(key) { return this._released.has(key); }

  endFrame() {
    this._pressed.clear();
    this._released.clear();
  }

  // ── Main update — called from game.js before p2.update() ─────────────────

  update(dt, self, opponent) {
    // Clear last frame's pressed state
    const prevDown = new Set(this._down);
    this._down.clear();

    // Tick timers
    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (this._blockReactionDelay > 0) this._blockReactionDelay -= dt;
    this._thinkTimer -= dt;

    const dx = opponent.group.position.x - self.group.position.x;
    const dist = Math.abs(dx);
    const opponentAttacking = opponent.state === 'attack';

    // ── Block reaction ───────────────────────────────────────────────────────
    if (opponentAttacking && !this._blockHeld) {
      // Start block reaction timer if we haven't already
      if (this._blockReactionDelay <= 0) {
        this._blockReactionDelay = this.BLOCK_REACTION_MS / 1000;
      }
    }
    if (!opponentAttacking) {
      this._blockHeld = false;
      this._blockReactionDelay = 0;
    }
    if (this._blockReactionDelay <= 0 && opponentAttacking && dist < this.ATTACK_RANGE_HEAVY + 0.3) {
      this._blockHeld = true;
    }

    // ── Re-evaluate decision ─────────────────────────────────────────────────
    if (this._thinkTimer <= 0) {
      this._thinkTimer = this._thinkInterval * (0.8 + Math.random() * 0.4);
      this._currentDecision = this._decide(dist, opponentAttacking, self, opponent);
    }

    // ── Execute decision ─────────────────────────────────────────────────────
    const b = this.bindings;
    const decision = this._currentDecision;

    const towardOpponent = dx > 0 ? b.right : b.left;
    const awayFromOpponent = dx > 0 ? b.left : b.right;

    if (this._blockHeld && opponentAttacking) {
      // Crouching block
      this._press(b.down);
    } else if (decision === 'approach') {
      this._press(towardOpponent);
    } else if (decision === 'retreat') {
      this._press(awayFromOpponent);
    } else if (decision === 'attack_punch') {
      this._pressOnce(b.punch);
      this._attackCooldown = this.ATTACK_COOLDOWN;
    } else if (decision === 'attack_kick') {
      this._pressOnce(b.kick);
      this._attackCooldown = this.ATTACK_COOLDOWN;
    } else if (decision === 'attack_heavy') {
      this._pressOnce(b.heavy);
      this._attackCooldown = this.ATTACK_COOLDOWN * 1.4;
    }
    // 'idle' — hold no buttons

    // Compute pressed/released from prev vs current
    for (const key of this._down) {
      if (!prevDown.has(key)) this._pressed.add(key);
    }
    for (const key of prevDown) {
      if (!this._down.has(key)) this._released.add(key);
    }
  }

  // ── Decision logic ────────────────────────────────────────────────────────

  _decide(dist, opponentAttacking, self, opponent) {
    // Don't attack while on cooldown or while opponent is in hit/ko state
    const canAttack = this._attackCooldown <= 0 && !opponentAttacking && opponent.health > 0;

    // Too close — back off briefly
    if (dist < this.RETREAT_DIST) return 'retreat';

    // In punch range
    if (dist <= this.ATTACK_RANGE_PUNCH && canAttack) {
      if (Math.random() < this.AGGRESSION) {
        // Pick a random attack weighted by range appropriateness
        const r = Math.random();
        if (r < 0.5) return 'attack_punch';
        if (r < 0.8) return 'attack_kick';
        return 'attack_heavy';
      }
      return 'idle'; // sometimes just stand there (makes AI feel human)
    }

    // In kick range
    if (dist <= this.ATTACK_RANGE_KICK && canAttack) {
      if (Math.random() < this.AGGRESSION * 0.8) {
        return Math.random() < 0.6 ? 'attack_kick' : 'attack_punch';
      }
      return 'approach';
    }

    // In heavy range
    if (dist <= this.ATTACK_RANGE_HEAVY && canAttack) {
      if (Math.random() < this.AGGRESSION * 0.5) {
        return 'attack_heavy';
      }
      return 'approach';
    }

    // Out of range — walk toward opponent
    return 'approach';
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _press(key) {
    this._down.add(key);
  }

  // pressOnce simulates a button tap (only registers wasPressed for one frame)
  _pressOnce(key) {
    this._down.add(key);
    this._pressed.add(key);
  }
}