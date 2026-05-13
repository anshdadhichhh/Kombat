// Animation filenames for your current FBX folders.
// Put the same filenames in BOTH folders:
// public/assets/characters/player1/
// public/assets/characters/player2/
// Values can be a string or an array. Arrays are picked randomly when played.
export const DEFAULT_ANIMATION_MAP = {
  idle: 'Idle.fbx',
  walkForward: 'Medium Step Forward.fbx',
  walkBack: 'Step Backward.fbx',
  jump: 'Jumping.fbx',
  crouch: 'Block.fbx',
  block: 'Block.fbx',
  punch: ['Cross Punch.fbx', 'Cross Punch mirror.fbx'],
  kick: 'Flying Kick.fbx',
  heavy: 'Jump Attack.fbx',
  hit: ['Head Hit.fbx', 'Hit To Body.fbx', 'Receive Punch To The Face.fbx'],
  ko: 'Dying.fbx',
  victory: 'Idle.fbx'
};

export const ANIMATION_SPEEDS = {
  punch: 2.25,
  kick: 1.18,
  heavy: 1.08,
  hit: 1.15,
  ko: 1.0,
  jump: 1.0,
  idle: 1.0,
  walkForward: 1.0,
  walkBack: 1.0,
  block: 1.0,
  crouch: 1.0
};

export const ATTACKS = {
  // Very fast punch startup/recovery to match faster punch animation playback.
  punch: { damage: 7, startup: 0.035, active: 0.10, recovery: 0.075, range: 1.15, height: 'mid', push: 0.18 },
  kick:  { damage: 12, startup: 0.14, active: 0.20, recovery: 0.28, range: 1.65, height: 'mid', push: 0.30 },
  heavy: { damage: 16, startup: 0.20, active: 0.24, recovery: 0.40, range: 1.45, height: 'mid', push: 0.40 }
};
