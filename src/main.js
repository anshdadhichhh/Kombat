import './style.css';
import { FightingGame } from './game.js';
import { setupArenaConfigTools } from './configTools.js';

setupArenaConfigTools();

const game = new FightingGame(document.body);
game.init().catch((err) => {
  console.error(err);
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:20px;top:20px;right:20px;padding:16px;background:#300;color:#fff;z-index:9999;white-space:pre-wrap';
  box.textContent = `Game failed to start:\n${err.stack || err.message || err}`;
  document.body.appendChild(box);
});
