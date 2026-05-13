// Animation filenames for your current FBX folders.
// Put the same filenames in BOTH folders:
// public/assets/characters/player1/
// public/assets/characters/player2/
//
// Values can be a string or an array. Arrays are picked randomly when played.
export const DEFAULT_ANIMATION_MAP = {
  idle: 'Idle.fbx',
  walkForward: 'Medium Step Forward.fbx',
  walkBack: 'Step Backward.fbx',
  jump: 'Jumping.fbx',
  crouch: 'Block.fbx',
  block: 'Block.fbx',

  // Punch randomly uses one of these two animations.
  punch: ['Cross Punch.fbx', 'Cross Punch mirror.fbx'],

  // Kick / heavy mapped to your stronger attack animations.
  kick: 'Flying Kick.fbx',
  heavy: 'Jump Attack.fbx',

  // Hit reaction randomly uses one of these three animations.
  hit: ['Head Hit.fbx', 'Hit To Body.fbx', 'Receive Punch To The Face.fbx'],

  ko: 'Dying.fbx',
  victory: 'Idle.fbx'
};

export const ATTACKS = {
  punch: { damage: 7, startup: 0.09, active: 0.16, recovery: 0.20, range: 1.15, height: 'mid', push: 0.18 },
  kick:  { damage: 12, startup: 0.16, active: 0.20, recovery: 0.32, range: 1.65, height: 'mid', push: 0.30 },
  heavy: { damage: 16, startup: 0.22, active: 0.24, recovery: 0.44, range: 1.45, height: 'mid', push: 0.40 }
};
