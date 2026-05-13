export class KeyboardInput {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
      if ([
        'ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space',
        'KeyA','KeyD','KeyW','KeyS','KeyJ','KeyK','KeyL',
        'Numpad1','Numpad2','Numpad3'
      ].includes(code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
  }

  isDown(code) { return this.down.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
}

export const P1_BINDINGS = {
  left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS',
  punch: 'KeyJ', kick: 'KeyK', heavy: 'KeyL'
};

export const P2_BINDINGS = {
  left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown',
  punch: 'Numpad1', kick: 'Numpad2', heavy: 'Numpad3'
};
