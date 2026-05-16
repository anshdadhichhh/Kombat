export class AIInput {
  constructor(bindings) {
    this.bindings = bindings;

    this._down = new Set();
    this._pressed = new Set();
    this._released = new Set();

    this._attackCooldown = 0;
    this._thinkTimer = 0;
    this._thinkInterval = 0.18;
    this._blockReactionDelay = 0;
    this._blockHeld = false;
    this._currentDecision = 'idle';
    this._retreatTimer = 0;

    this.ATTACK_RANGE_PUNCH = 1.18;
    this.ATTACK_RANGE_KICK = 1.68;
    this.ATTACK_RANGE_HEAVY = 1.5;
    this.PREFERRED_MAX_DIST = 2.35;
    this.RETREAT_DIST = 0.95;
    this.ATTACK_COOLDOWN = 0.7;
    this.BLOCK_REACTION_MS = 140;
    this.AGGRESSION = 0.58;
  }

  isDown(key) { return this._down.has(key); }
  wasPressed(key) { return this._pressed.has(key); }
  wasReleased(key) { return this._released.has(key); }

  endFrame() {
    this._pressed.clear();
    this._released.clear();
  }

  update(dt, self, opponent) {
    const prevDown = new Set(this._down);
    this._down.clear();

    if (this._attackCooldown > 0) this._attackCooldown -= dt;
    if (this._blockReactionDelay > 0) this._blockReactionDelay -= dt;
    if (this._retreatTimer > 0) this._retreatTimer -= dt;
    this._thinkTimer -= dt;

    const dx = opponent.group.position.x - self.group.position.x;
    const dist = Math.abs(dx);
    const opponentAttacking = opponent.state === 'attack';

    if (opponentAttacking && !this._blockHeld && this._blockReactionDelay <= 0) {
      this._blockReactionDelay = this.BLOCK_REACTION_MS / 1000;
    }
    if (!opponentAttacking) {
      this._blockHeld = false;
      this._blockReactionDelay = 0;
    }
    if (this._blockReactionDelay <= 0 && opponentAttacking && dist < this.ATTACK_RANGE_KICK + 0.35) {
      this._blockHeld = true;
    }

    if (this._thinkTimer <= 0) {
      this._thinkTimer = this._thinkInterval * (0.8 + Math.random() * 0.4);
      this._currentDecision = this._decide(dist, opponentAttacking, self, opponent);
    }

    const b = this.bindings;
    const towardOpponent = dx > 0 ? b.right : b.left;
    const awayFromOpponent = dx > 0 ? b.left : b.right;
    const decision = this._currentDecision;

    if (this._blockHeld || decision === 'block') {
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
      this._attackCooldown = this.ATTACK_COOLDOWN * 1.35;
    }

    for (const key of this._down) {
      if (!prevDown.has(key)) this._pressed.add(key);
    }
    for (const key of prevDown) {
      if (!this._down.has(key)) this._released.add(key);
    }
  }

  _decide(dist, opponentAttacking, self, opponent) {
    const canAttack = this._attackCooldown <= 0 && !opponentAttacking && opponent.health > 0;
    const justGotHit = self.state === 'hit' || self.stun > 0;

    if (justGotHit) {
      this._retreatTimer = 0.28 + Math.random() * 0.28;
      return Math.random() < 0.35 ? 'block' : 'retreat';
    }

    if (this._retreatTimer > 0) return 'retreat';

    if (opponentAttacking && dist <= this.ATTACK_RANGE_KICK + 0.35) {
      const roll = Math.random();
      if (roll < 0.62) return 'block';
      if (roll < 0.88) return 'retreat';
      return 'idle';
    }

    if (dist < this.RETREAT_DIST) {
      this._retreatTimer = 0.18 + Math.random() * 0.28;
      return Math.random() < 0.8 ? 'retreat' : 'block';
    }

    if (dist <= this.ATTACK_RANGE_PUNCH && canAttack) {
      if (Math.random() < this.AGGRESSION) {
        const r = Math.random();
        if (r < 0.55) return 'attack_punch';
        if (r < 0.85) return 'attack_kick';
        return 'attack_heavy';
      }
      return Math.random() < 0.45 ? 'retreat' : 'idle';
    }

    if (dist <= this.ATTACK_RANGE_KICK && canAttack) {
      if (Math.random() < this.AGGRESSION * 0.78) {
        return Math.random() < 0.65 ? 'attack_kick' : 'attack_punch';
      }
      return Math.random() < 0.3 ? 'retreat' : 'idle';
    }

    if (dist <= this.ATTACK_RANGE_HEAVY && canAttack) {
      if (Math.random() < this.AGGRESSION * 0.5) return 'attack_heavy';
      return Math.random() < 0.45 ? 'approach' : 'idle';
    }

    if (dist < this.PREFERRED_MAX_DIST) {
      const roll = Math.random();
      if (roll < 0.22) return 'retreat';
      if (roll < 0.62) return 'idle';
      return 'approach';
    }

    return Math.random() < 0.78 ? 'approach' : 'idle';
  }

  _press(key) {
    this._down.add(key);
  }

  _pressOnce(key) {
    this._down.add(key);
    this._pressed.add(key);
  }
}
