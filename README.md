# Tekken-Style JavaScript Fighting Game Starter

A browser-based 3D fighter starter made with **JavaScript + Three.js + Vite**. It is ready for your FBX T-pose character, FBX animation files, and FBX arena.

## Run it

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Add your FBX files

Put your files here:

```text
public/assets/arena/arena.fbx
public/assets/characters/player1/character.fbx
public/assets/characters/player1/idle.fbx
public/assets/characters/player1/walk_forward.fbx
public/assets/characters/player1/walk_back.fbx
public/assets/characters/player1/jump.fbx
public/assets/characters/player1/crouch.fbx
public/assets/characters/player1/block.fbx
public/assets/characters/player1/punch.fbx
public/assets/characters/player1/kick.fbx
public/assets/characters/player1/heavy.fbx
public/assets/characters/player1/hit_react.fbx
public/assets/characters/player1/ko.fbx

public/assets/characters/player2/...same files...
```

If you only have one character, copy the same FBX files into both `player1` and `player2` first. Later you can add palette/material swaps.

If your filenames are different, edit:

```text
src/animationMap.js
```

Full asset notes are in `docs/ASSET_SETUP.md`.

## Controls

**Player 1**
- Move: `A` / `D`
- Jump: `W`
- Crouch/block: `S`
- Punch: `J`
- Kick: `K`
- Heavy: `L`

**Player 2**
- Move: `←` / `→`
- Jump: `↑`
- Crouch/block: `↓`
- Punch: numpad `1`
- Kick: numpad `2`
- Heavy: numpad `3`

## Main files

- `src/main.js` — boot entry.
- `src/game.js` — scene, camera, arena, HUD, game loop.
- `src/fighter.js` — movement, state machine, attacks, hit/block logic.
- `src/input.js` — keyboard input.
- `src/assetLoader.js` — FBX loader and fallback meshes.
- `src/animationMap.js` — animation filenames and attack frame data.

## What it includes

- Tekken-style side camera.
- 3D movement on a 2D fighting line.
- Two local players.
- FBX model + animation loading.
- Health bars and round result.
- Attack startup/active/recovery.
- Hit stun, block chip damage, pushback.
- Fallback capsule fighters and arena so the project runs before assets are added.
