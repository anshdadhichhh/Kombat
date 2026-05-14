export class AIInput {
  constructor(bindings) {
    this.bindings = bindings;
    this.down = new Set();
    this.pressed = new Set();
    this.timer = 0;
    this.nextAttackAt = 0.8 + Math.random() * 0.5;
    this.blockTimer = 0;
    this.pauseUntil = 0;
  }

  update(dt, self, opponent) {
    this.down.clear();
    this.pressed.clear();
    if (!self || !opponent || self.health <= 0) return;

    this.timer += dt;
    const dx = opponent.group.position.x - self.group.position.x;
    const dist = Math.abs(dx);
    const opponentAttacking = opponent.state === 'attack';

    // Reactive blocking — brief window after opponent attacks
    if (opponentAttacking && dist < 1.8 && Math.random() < 0.06) {
      this.blockTimer = 0.28;
    }
    if (this.blockTimer > 0) {
      this.blockTimer -= dt;
      this.down.add(this.bindings.down);
      return;
    }

    // Idle pause — stand still for a moment
    if (this.timer < this.pauseUntil) return;
    if (Math.random() < 0.003) {
      this.pauseUntil = this.timer + 0.3 + Math.random() * 0.5;
      return;
    }

    // Spacing behaviour
    if (dist > 3.0) {
      // Too far — approach
      if (dx > 0) this.down.add(this.bindings.right);
      else this.down.add(this.bindings.left);
    } else if (dist < 1.2) {
      // Too close — back off 30% of the time
      if (Math.random() < 0.3) {
        if (dx > 0) this.down.add(this.bindings.left);
        else this.down.add(this.bindings.right);
      }
    } else if (dist > 2.2) {
      // Moderate distance — inch closer
      if (dx > 0) this.down.add(this.bindings.right);
      else this.down.add(this.bindings.left);
    }
    // Between 1.2-2.2: sweet spot, hold position

    // Attack — varied timing, not always attacking
    if (dist < 1.6 && this.timer >= this.nextAttackAt) {
      const r = Math.random();
      if (r < 0.35) this.pressed.add(this.bindings.punch);
      else if (r < 0.55) this.pressed.add(this.bindings.kick);
      else if (r < 0.7) this.pressed.add(this.bindings.heavy);
      // 30% chance: feint / do nothing
      this.nextAttackAt = this.timer + 0.5 + Math.random() * 1.0;
    }
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
