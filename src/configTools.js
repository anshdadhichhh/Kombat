// configtools.js
const ARENA_KEYS = ['arenaScale', 'arenaX', 'arenaY', 'arenaZ', 'arenaRotX', 'arenaRotY', 'arenaRotZ'];
const ARENA_STORAGE_KEY = 'tekkenStyleArenaTransformConfig';
const CAMERA_STORAGE_KEY = 'tekkenStyleCameraConfig';

function readNumber(id, fallback = 0) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const v = Number.parseFloat(el.value);
  return Number.isFinite(v) ? v : fallback;
}

function setNumber(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = String(value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// ===== ARENA CONFIG =====
export function getArenaConfig() {
  return {
    arenaFile: 'public/assets/arena/arena.glb',
    transform: {
      scale: readNumber('arenaScale', 1),
      position: {
        x: readNumber('arenaX', 0),
        y: readNumber('arenaY', 0),
        z: readNumber('arenaZ', 0)
      },
      rotationDegrees: {
        x: readNumber('arenaRotX', 0),
        y: readNumber('arenaRotY', 0),
        z: readNumber('arenaRotZ', 0)
      }
    }
  };
}

export function applyArenaConfig(config) {
  const t = config?.transform || config;
  if (!t) return;
  setNumber('arenaScale', t.scale ?? 1);
  setNumber('arenaX', t.position?.x ?? t.x ?? 0);
  setNumber('arenaY', t.position?.y ?? t.y ?? 0);
  setNumber('arenaZ', t.position?.z ?? t.z ?? 0);
  setNumber('arenaRotX', t.rotationDegrees?.x ?? t.rx ?? 0);
  setNumber('arenaRotY', t.rotationDegrees?.y ?? t.ry ?? 0);
  setNumber('arenaRotZ', t.rotationDegrees?.z ?? t.rz ?? 0);
}

// ===== CAMERA CONFIG =====
export function getCameraConfig(camera, orbitControls) {
  if (!camera || !orbitControls) return null;
  return {
    camera: {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      // Optional: capture FOV if you tweak it
      fov: camera.fov
    },
    controls: {
      target: {
        x: orbitControls.target.x,
        y: orbitControls.target.y,
        z: orbitControls.target.z
      },
      // Optional: save orbit state for exact recreation
      polarAngle: orbitControls.getPolarAngle?.() || 0,
      azimuthalAngle: orbitControls.getAzimuthalAngle?.() || 0,
      distance: camera.position.distanceTo(orbitControls.target)
    }
  };
}

export function applyCameraConfig(config, camera, orbitControls) {
  if (!config || !camera || !orbitControls) return;
  
  // Apply camera position
  if (config.camera?.position) {
    camera.position.set(
      config.camera.position.x,
      config.camera.position.y,
      config.camera.position.z
    );
  }
  if (config.camera?.fov !== undefined) {
    camera.fov = config.camera.fov;
    camera.updateProjectionMatrix();
  }
  
  // Apply controls target
  if (config.controls?.target) {
    orbitControls.target.set(
      config.controls.target.x,
      config.controls.target.y,
      config.controls.target.z
    );
  }
  
  // Optional: restore orbit angles if available
  if (config.controls?.polarAngle !== undefined && orbitControls.setPolarAngle) {
    orbitControls.setPolarAngle(config.controls.polarAngle);
  }
  if (config.controls?.azimuthalAngle !== undefined && orbitControls.setAzimuthalAngle) {
    orbitControls.setAzimuthalAngle(config.controls.azimuthalAngle);
  }
  
  orbitControls.update();
}

// ===== UI HELPERS =====
function showConfig(config, outputId = 'arenaConfigOutput') {
  const out = document.getElementById(outputId);
  if (out) out.value = JSON.stringify(config, null, 2);
}

function copyConfigToClipboard(config) {
  return navigator.clipboard?.writeText(JSON.stringify(config, null, 2));
}

// ===== SETUP FUNCTIONS =====
export function setupArenaConfigTools() {
  const exportBtn = document.getElementById('exportArenaConfig');
  const copyBtn = document.getElementById('copyArenaConfig');
  const saveBtn = document.getElementById('saveArenaConfig');
  const loadBtn = document.getElementById('loadArenaConfig');
  const applyBtn = document.getElementById('applyArenaConfig');
  const out = document.getElementById('arenaConfigOutput');

  exportBtn?.addEventListener('click', () => showConfig(getArenaConfig()));
  copyBtn?.addEventListener('click', async () => {
    const config = getArenaConfig();
    showConfig(config);
    await copyConfigToClipboard(config);
  });
  saveBtn?.addEventListener('click', () => {
    const config = getArenaConfig();
    localStorage.setItem(ARENA_STORAGE_KEY, JSON.stringify(config));
    showConfig(config);
  });
  loadBtn?.addEventListener('click', () => {
    const raw = localStorage.getItem(ARENA_STORAGE_KEY);
    if (!raw) return;
    const config = JSON.parse(raw);
    applyArenaConfig(config);
    showConfig(config);
  });
  applyBtn?.addEventListener('click', () => {
    if (!out?.value) return;
    try {
      const config = JSON.parse(out.value);
      applyArenaConfig(config);
      showConfig(config);
    } catch (e) {
      console.error('Failed to apply arena config:', e);
    }
  });

  ARENA_KEYS.forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => showConfig(getArenaConfig()));
  });
}

export function setupCameraConfigTools(camera, orbitControls) {
  const exportCamBtn = document.getElementById('exportCameraConfig');
  const copyCamBtn = document.getElementById('copyCameraConfig');
  const saveCamBtn = document.getElementById('saveCameraConfig');
  const loadCamBtn = document.getElementById('loadCameraConfig');
  const applyCamBtn = document.getElementById('applyCameraConfig');
  const camOut = document.getElementById('cameraConfigOutput');

  exportCamBtn?.addEventListener('click', () => {
    const config = getCameraConfig(camera, orbitControls);
    showConfig(config, 'cameraConfigOutput');
  });

  copyCamBtn?.addEventListener('click', async () => {
    const config = getCameraConfig(camera, orbitControls);
    showConfig(config, 'cameraConfigOutput');
    await copyConfigToClipboard(config);
  });

  saveCamBtn?.addEventListener('click', () => {
    const config = getCameraConfig(camera, orbitControls);
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(config));
    showConfig(config, 'cameraConfigOutput');
  });

  loadCamBtn?.addEventListener('click', () => {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return;
    try {
      const config = JSON.parse(raw);
      applyCameraConfig(config, camera, orbitControls);
      showConfig(config, 'cameraConfigOutput');
    } catch (e) {
      console.error('Failed to load camera config:', e);
    }
  });

  applyCamBtn?.addEventListener('click', () => {
    if (!camOut?.value) return;
    try {
      const config = JSON.parse(camOut.value);
      applyCameraConfig(config, camera, orbitControls);
      showConfig(config, 'cameraConfigOutput');
    } catch (e) {
      console.error('Failed to apply camera config:', e);
    }
  });

  // Auto-update preview when orbiting (optional, can be heavy)
  // orbitControls?.addEventListener('change', () => {
  //   const config = getCameraConfig(camera, orbitControls);
  //   showConfig(config, 'cameraConfigOutput');
  // });
}

// ===== ATTACK TIMING CONFIG =====
const ATTACK_TIMING_KEYS = ['punchStartup', 'punchActive', 'punchRecovery', 'kickStartup', 'kickActive', 'kickRecovery', 'heavyStartup', 'heavyActive', 'heavyRecovery'];
const ATTACK_TIMING_STORAGE_KEY = 'tekkenStyleAttackTimingConfig';

export function getAttackTimingConfig() {
  return {
    punch: {
      startup: readNumber('punchStartup', 0.035),
      active: readNumber('punchActive', 0.10),
      recovery: readNumber('punchRecovery', 0.075),
      range: readNumber('punchRange', 1.15),
      push: readNumber('punchPush', 0.18),
      damage: readNumber('punchDamage', 7)
    },
    kick: {
      startup: readNumber('kickStartup', 0.14),
      active: readNumber('kickActive', 0.20),
      recovery: readNumber('kickRecovery', 0.28),
      range: readNumber('kickRange', 1.65),
      push: readNumber('kickPush', 0.30),
      damage: readNumber('kickDamage', 12)
    },
    heavy: {
      startup: readNumber('heavyStartup', 0.20),
      active: readNumber('heavyActive', 0.24),
      recovery: readNumber('heavyRecovery', 0.40),
      range: readNumber('heavyRange', 1.45),
      push: readNumber('heavyPush', 0.40),
      damage: readNumber('heavyDamage', 16)
    }
  };
}

export function applyAttackTimingConfig(config) {
  if (!config) return;
  
  // Punch
  if (config.punch) {
    setNumber('punchStartup', config.punch.startup ?? 0.035);
    setNumber('punchActive', config.punch.active ?? 0.10);
    setNumber('punchRecovery', config.punch.recovery ?? 0.075);
    setNumber('punchRange', config.punch.range ?? 1.15);
    setNumber('punchPush', config.punch.push ?? 0.18);
    setNumber('punchDamage', config.punch.damage ?? 7);
  }
  
  // Kick
  if (config.kick) {
    setNumber('kickStartup', config.kick.startup ?? 0.14);
    setNumber('kickActive', config.kick.active ?? 0.20);
    setNumber('kickRecovery', config.kick.recovery ?? 0.28);
    setNumber('kickRange', config.kick.range ?? 1.65);
    setNumber('kickPush', config.kick.push ?? 0.30);
    setNumber('kickDamage', config.kick.damage ?? 12);
  }
  
  // Heavy
  if (config.heavy) {
    setNumber('heavyStartup', config.heavy.startup ?? 0.20);
    setNumber('heavyActive', config.heavy.active ?? 0.24);
    setNumber('heavyRecovery', config.heavy.recovery ?? 0.40);
    setNumber('heavyRange', config.heavy.range ?? 1.45);
    setNumber('heavyPush', config.heavy.push ?? 0.40);
    setNumber('heavyDamage', config.heavy.damage ?? 16);
  }
}

export function setupAttackTimingTools() {
  const exportBtn = document.getElementById('exportAttackTiming');
  const copyBtn = document.getElementById('copyAttackTiming');
  const saveBtn = document.getElementById('saveAttackTiming');
  const loadBtn = document.getElementById('loadAttackTiming');
  const applyBtn = document.getElementById('applyAttackTiming');
  const out = document.getElementById('attackTimingOutput');

  exportBtn?.addEventListener('click', () => showConfig(getAttackTimingConfig(), 'attackTimingOutput'));
  
  copyBtn?.addEventListener('click', async () => {
    const config = getAttackTimingConfig();
    showConfig(config, 'attackTimingOutput');
    await copyConfigToClipboard(config);
  });
  
  saveBtn?.addEventListener('click', () => {
    const config = getAttackTimingConfig();
    localStorage.setItem(ATTACK_TIMING_STORAGE_KEY, JSON.stringify(config));
    showConfig(config, 'attackTimingOutput');
  });
  
  loadBtn?.addEventListener('click', () => {
    const raw = localStorage.getItem(ATTACK_TIMING_STORAGE_KEY);
    if (!raw) return;
    try {
      const config = JSON.parse(raw);
      applyAttackTimingConfig(config);
      showConfig(config, 'attackTimingOutput');
    } catch (e) {
      console.error('Failed to load attack timing config:', e);
    }
  });
  
  applyBtn?.addEventListener('click', () => {
    if (!out?.value) return;
    try {
      const config = JSON.parse(out.value);
      applyAttackTimingConfig(config);
      showConfig(config, 'attackTimingOutput');
    } catch (e) {
      console.error('Failed to apply attack timing config:', e);
    }
  });

  // Auto-update preview when sliders change
  ATTACK_TIMING_KEYS.forEach((id) => {
    document.getElementById(id)?.addEventListener('input', () => {
      showConfig(getAttackTimingConfig(), 'attackTimingOutput');
      // Optional: live-update if game is running
      if (window.gameInstance?.p1) {
        window.gameInstance.updateAttackTimingFromUI();
      }
    });
  });
}