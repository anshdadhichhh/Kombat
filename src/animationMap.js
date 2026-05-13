// Rename these files to match your actual FBX animation filenames.
// Put shared animation FBXs in public/assets/animations/ OR per-character animation FBXs beside the model.
export const DEFAULT_ANIMATION_MAP = {
  idle: 'idle.fbx',
  walkForward: 'walk_forward.fbx',
  walkBack: 'walk_back.fbx',
  jump: 'jump.fbx',
  crouch: 'crouch.fbx',
  block: 'block.fbx',
  punch: 'punch.fbx',
  kick: 'kick.fbx',
  heavy: 'heavy.fbx',
  hit: 'hit_react.fbx',
  ko: 'ko.fbx',
  victory: 'victory.fbx'
};

export const ATTACKS = {
  punch: { damage: 7, startup: 0.09, active: 0.16, recovery: 0.20, range: 1.15, height: 'mid', push: 0.18 },
  kick:  { damage: 10, startup: 0.13, active: 0.18, recovery: 0.26, range: 1.45, height: 'mid', push: 0.26 },
  heavy: { damage: 16, startup: 0.22, active: 0.22, recovery: 0.42, range: 1.25, height: 'high', push: 0.38 }
};
