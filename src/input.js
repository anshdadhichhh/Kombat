export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.controlCodes = [
      'KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','KeyC','KeyZ','KeyX'
    ];

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      if (this.controlCodes.includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
  }

  matches(codeOrCodes, set) {
    const codes = Array.isArray(codeOrCodes) ? codeOrCodes : [codeOrCodes];
    return codes.some((code) => set.has(code));
  }

  isDown(codeOrCodes) { return this.matches(codeOrCodes, this.down); }
  wasPressed(codeOrCodes) { return this.matches(codeOrCodes, this.pressed); }
  endFrame() { this.pressed.clear(); }
}

// Only these keys are used for the human player: W A S D Q E C Z X.
// A/D move, W jump, S block/crouch, Q or Z punch, E or C kick, X heavy.
export const P1_BINDINGS = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'KeyW',
  down: 'KeyS',
  punch: ['KeyQ', 'KeyZ'],
  kick: ['KeyE', 'KeyC'],
  heavy: 'KeyX'
};

// P2 is AI now, so these are virtual codes only. No numeric/arrow keys are required.
export const P2_BINDINGS = {
  left: 'AI_LEFT',
  right: 'AI_RIGHT',
  up: 'AI_UP',
  down: 'AI_DOWN',
  punch: 'AI_PUNCH',
  kick: 'AI_KICK',
  heavy: 'AI_HEAVY'
};
