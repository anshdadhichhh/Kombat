# FBX Asset Setup

This starter is a browser JavaScript / Three.js 3D fighting game. It expects your FBX files under `public/assets`.

## Required file layout

```text
public/assets/
  arena/
    arena.fbx
  characters/
    player1/
      character.fbx
      idle.fbx
      walk_forward.fbx
      walk_back.fbx
      jump.fbx
      crouch.fbx
      block.fbx
      punch.fbx
      kick.fbx
      heavy.fbx
      hit_react.fbx
      ko.fbx
      victory.fbx
    player2/
      character.fbx
      idle.fbx
      walk_forward.fbx
      walk_back.fbx
      jump.fbx
      crouch.fbx
      block.fbx
      punch.fbx
      kick.fbx
      heavy.fbx
      hit_react.fbx
      ko.fbx
      victory.fbx
```

If your filenames differ, edit `src/animationMap.js`.

## Important FBX rules

1. Each `character.fbx` should contain the skinned mesh and skeleton in T-pose.
2. Animation FBXs should use the same skeleton hierarchy/bone names as `character.fbx`.
3. For easiest loading, export animations as separate FBX files with one take/clip each.
4. Three.js sometimes needs FBX units fixed. If a model is too large/small, change `targetHeight` in `normalizeFbxObject()` or arena scale in `game.js`.
5. If your animations are embedded in one FBX instead of separate files, you can load clips from `character.fbx` and map them by clip name.

## Controls

- P1: `A/D` move, `W` jump, `S` crouch/block, `J` punch, `K` kick, `L` heavy.
- P2: arrow keys move/jump/crouch, numpad `1/2/3` attacks.

## Current gameplay features

- Side-on 3D camera like classic arena fighters.
- Two players on one keyboard.
- Health bars.
- Walk forward/back, jump, crouch/block.
- Three attacks with startup/active/recovery timing.
- Hit detection, damage, pushback, hit stun, block chip damage.
- Round win text.
- Fallback dummy fighters and arena if your FBX files are not installed yet.

## Next upgrades

- Add combo state machine.
- Add throw input.
- Add low/high hit rules.
- Add AI opponent.
- Add gamepad support using the browser Gamepad API.
- Add online multiplayer using WebRTC or WebSocket rollback netcode.
