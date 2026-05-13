export class AIInput {
  constructor(bindings) {
    this.bindings = bindings;
    this.down = new Set();
    this.pressed = new Set();
    this.timer = 0;
    this.nextAttackAt = 0.6;
    this.blockTimer = 0;
  }

  update(dt, self, opponent) {
    this.down.clear();
    this.pressed.clear();
    if (!self || !opponent || self.health <= 0) return;

    this.timer += dt;
    const dx = opponent.group.position.x - self.group.position.x;
    const dist = Math.abs(dx);
    const opponentAttacking = opponent.state === 'attack';

    if (opponentAttacking && dist < 1.8 && Math.random() < 0.08) {
      this.blockTimer = 0.35;
    }
    if (this.blockTimer > 0) {
      this.blockTimer -= dt;
      this.down.add(this.bindings.down);
      return;
    }

    // AI is always player2/right-side character. It moves toward P1, but NEVER backs up
    // when too close. This removes the automatic separation feeling and allows crossing.
    if (dist > 1.0) {
      if (dx > 0) this.down.add(this.bindings.right);
      else this.down.add(this.bindings.left);
    }

    if (dist < 1.45 && this.timer >= this.nextAttackAt) {
      const r = Math.random();
      if (r < 0.55) this.pressed.add(this.bindings.punch);
      else if (r < 0.85) this.pressed.add(this.bindings.kick);
      else this.pressed.add(this.bindings.heavy);
      this.nextAttackAt = this.timer + 0.55 + Math.random() * 0.55;
    }
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}
