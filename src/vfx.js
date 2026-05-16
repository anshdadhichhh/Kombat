import * as THREE from 'three';

function makeImpactTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.42);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,235,120,0.9)');
  g.addColorStop(1, 'rgba(255,235,120,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const r1 = size * 0.12;
    const r2 = size * (0.32 + (i % 3) * 0.04);
    const w = 0.075;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

function makeRingTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.28, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,120,0.5)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export class VFXSystem {
  constructor(scene) {
    this.scene = scene;
    this.sprites = [];
    this.impactTex = makeImpactTexture();
    this.ringTex = makeRingTexture();
  }

  spawnHit(position, direction = new THREE.Vector3(1, 0, 0), blocked = false) {
    const baseSize = blocked ? 0.42 : 0.62;
    this.spawnSprite(this.impactTex, position, 0xfff2aa, baseSize, 0.13, {
      rotation: Math.random() * Math.PI,
      grow: 3.4,
      additive: true
    });

    const ringPos = position.clone();
    ringPos.y += 0.02;
    this.spawnSprite(this.ringTex, ringPos, blocked ? 0xaaddff : 0xffffff, blocked ? 0.55 : 0.82, 0.16, {
      rotation: Math.atan2(direction.y, direction.x),
      grow: 4.2,
      additive: true
    });

    this.spawnSpeedLines(position, direction, blocked ? 3 : 6);
  }

  spawnSpeedLines(position, direction, count = 5) {
    const dir = direction.clone().normalize();
    for (let i = 0; i < count; i++) {
      const geo = new THREE.PlaneGeometry(0.55 + Math.random() * 0.35, 0.035);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfff4b0,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide
      });
      const line = new THREE.Mesh(geo, mat);
      line.position.copy(position).add(new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(0.25),
        THREE.MathUtils.randFloatSpread(0.3),
        THREE.MathUtils.randFloatSpread(0.15)
      ));
      line.rotation.z = Math.atan2(dir.y, dir.x) + THREE.MathUtils.randFloatSpread(0.35);
      line.userData.life = 0.10 + Math.random() * 0.05;
      line.userData.maxLife = line.userData.life;
      line.userData.velocity = dir.clone().multiplyScalar(1.5 + Math.random() * 1.5);
      this.scene.add(line);
      this.sprites.push(line);
    }
  }

  spawnDust(position, count = 1) {
    // Small ground ring, not explosion smoke.
    this.spawnSprite(this.ringTex, position.clone().add(new THREE.Vector3(0, 0.04, 0)), 0xb9aa88, 0.35, 0.18, {
      rotation: -Math.PI / 2,
      grow: 3.0,
      additive: false
    });
  }

  spawnFlash(position, color = 0xffffff, size = 0.55, life = 0.16) {
    this.spawnSprite(this.impactTex, position, color, size, life, { grow: 2.2, additive: true });
  }

  spawnSprite(texture, position, color, size, life, opts = {}) {
    const mat = new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0.9,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
      depthWrite: false,
      rotation: opts.rotation || 0,
      toneMapped: false
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    sprite.userData.grow = opts.grow || 2.5;
    sprite.userData.velocity = new THREE.Vector3();
    this.scene.add(sprite);
    this.sprites.push(sprite);
  }

  update(dt) {
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const obj = this.sprites[i];
      obj.userData.life -= dt;
      const fade = Math.max(obj.userData.life / obj.userData.maxLife, 0);
      obj.position.addScaledVector(obj.userData.velocity || new THREE.Vector3(), dt);
      obj.scale.multiplyScalar(1 + dt * (obj.userData.grow || 2.5));
      obj.material.opacity = fade * 0.9;
      if (obj.userData.life <= 0) {
        this.scene.remove(obj);
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
        this.sprites.splice(i, 1);
      }
    }
  }
}


// import * as THREE from 'three';

// /**
//  * HELPER: Generates a sharp, aggressive starburst texture for hits.
//  */
// function makeImpactTexture(size = 256) {
//     const c = document.createElement('canvas');
//     c.width = c.height = size;
//     const ctx = c.getContext('2d');
//     const cx = size / 2;
//     const cy = size / 2;

//     ctx.clearRect(0, 0, size, size);
//     ctx.globalCompositeOperation = 'lighter';

//     // 1. Core Glow
//     const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4);
//     g.addColorStop(0, 'rgba(255, 255, 255, 1)');
//     g.addColorStop(0.3, 'rgba(255, 220, 100, 0.6)');
//     g.addColorStop(1, 'rgba(255, 100, 0, 0)');
//     ctx.fillStyle = g;
//     ctx.fillRect(0, 0, size, size);

//     // 2. Aggressive Spikes
//     ctx.fillStyle = 'rgba(255, 255, 255, 1)';
//     const spikes = 14;
//     for (let i = 0; i < spikes; i++) {
//         const angle = (i / spikes) * Math.PI * 2;
//         // Alternate lengths for "crunchy" look
//         const length = (i % 2 === 0) ? size * 0.48 : size * 0.3;
//         const width = 0.06;

//         ctx.beginPath();
//         ctx.moveTo(cx + Math.cos(angle - width) * (size * 0.1), cy + Math.sin(angle - width) * (size * 0.1));
//         ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
//         ctx.lineTo(cx + Math.cos(angle + width) * (size * 0.1), cy + Math.sin(angle + width) * (size * 0.1));
//         ctx.closePath();
//         ctx.fill();
//     }

//     const tex = new THREE.CanvasTexture(c);
//     tex.needsUpdate = true;
//     return tex;
// }

// /**
//  * HELPER: Generates a clean ring for impact shockwaves or dust.
//  */
// function makeRingTexture(size = 256) {
//     const c = document.createElement('canvas');
//     c.width = c.height = size;
//     const ctx = c.getContext('2d');
//     const cx = size / 2;
//     const cy = size / 2;

//     ctx.clearRect(0, 0, size, size);
    
//     // Outer faint ring
//     ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
//     ctx.lineWidth = 12;
//     ctx.beginPath();
//     ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
//     ctx.stroke();

//     // Inner bright sharp ring
//     ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
//     ctx.lineWidth = 4;
//     ctx.beginPath();
//     ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
//     ctx.stroke();

//     const tex = new THREE.CanvasTexture(c);
//     tex.needsUpdate = true;
//     return tex;
// }

// export class VFXSystem {
//     constructor(scene) {
//         this.scene = scene;
//         this.sprites = [];
//         this.impactTex = makeImpactTexture();
//         this.ringTex = makeRingTexture();
        
//         // Shared geometry to save memory on speed lines
//         this.quadGeo = new THREE.PlaneGeometry(1, 1);
//     }

//     /**
//      * Spawns a full Tekken-style hit effect (Flash + Ring + Speedlines)
//      */
//     spawnHit(position, direction = new THREE.Vector3(1, 0.5, 0), blocked = false) {
//         const color = blocked ? 0x88ccff : 0xffcc33;
//         const impactScale = blocked ? 0.7 : 1.3;

//         // 1. The Immediate Flash (Star shape)
//         this.spawnSprite(this.impactTex, position, 0xffffff, impactScale, 0.12, {
//             rotation: Math.random() * Math.PI,
//             grow: 6.0,
//             additive: true
//         });

//         // 2. The Shockwave Ring
//         const ringPos = position.clone().addScaledVector(direction, 0.05);
//         this.spawnSprite(this.ringTex, ringPos, color, impactScale * 0.8, 0.15, {
//             rotation: Math.atan2(direction.y, direction.x),
//             grow: 5.0,
//             additive: true
//         });

//         // 3. Speed Lines flying outward
//         this.spawnSpeedLines(position, direction, blocked ? 4 : 8, color);
//     }

//     /**
//      * Spawns lines that stretch along their velocity vector.
//      */
//     spawnSpeedLines(position, direction, count = 5, color = 0xfff4b0) {
//         const baseDir = direction.clone().normalize();

//         for (let i = 0; i < count; i++) {
//             const mat = new THREE.MeshBasicMaterial({
//                 color: color,
//                 transparent: true,
//                 opacity: 1.0,
//                 blending: THREE.AdditiveBlending,
//                 depthWrite: false,
//                 side: THREE.DoubleSide
//             });

//             const line = new THREE.Mesh(this.quadGeo, mat);
            
//             // Randomize direction slightly from the impact normal
//             const spread = 0.8;
//             const velocityDir = baseDir.clone().applyAxisAngle(
//                 new THREE.Vector3(0, 0, 1), 
//                 (Math.random() - 0.5) * spread
//             );

//             line.position.copy(position);
            
//             // Orient the mesh to face its movement direction (Stretching)
//             line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), velocityDir);
            
//             const thickness = 0.04 + Math.random() * 0.03;
//             const length = 0.4 + Math.random() * 0.6;
//             line.scale.set(thickness, length, 1);

//             line.userData = {
//                 life: 0.1 + Math.random() * 0.1,
//                 maxLife: 0.1 + Math.random() * 0.1,
//                 velocity: velocityDir.multiplyScalar(5 + Math.random() * 7),
//                 grow: -0.5, // Shrink thickness over time
//                 isLine: true
//             };

//             this.scene.add(line);
//             this.sprites.push(line);
//         }
//     }

//     spawnDust(position) {
//         this.spawnSprite(this.ringTex, position.clone().add(new THREE.Vector3(0, 0.01, 0)), 0xffffff, 0.4, 0.2, {
//             rotation: -Math.PI / 2, // Flat on ground
//             grow: 4.0,
//             additive: false
//         });
//     }

//     spawnFlash(position, color = 0xffffff, size = 1.0, life = 0.1) {
//         this.spawnSprite(this.impactTex, position, color, size, life, { grow: 5.0, additive: true });
//     }

//     /**
//      * Generic sprite spawner for billboards
//      */
//     spawnSprite(texture, position, color, size, life, opts = {}) {
//         const mat = new THREE.SpriteMaterial({
//             map: texture,
//             color: color,
//             transparent: true,
//             opacity: 1.0,
//             blending: opts.additive !== false ? THREE.AdditiveBlending : THREE.NormalBlending,
//             depthWrite: false,
//             rotation: opts.rotation || 0,
//             toneMapped: false
//         });

//         const sprite = new THREE.Sprite(mat);
//         sprite.position.copy(position);
//         sprite.scale.set(size, size, size);
        
//         sprite.userData = {
//             life: life,
//             maxLife: life,
//             grow: opts.grow || 2.0,
//             velocity: opts.velocity || new THREE.Vector3()
//         };

//         this.scene.add(sprite);
//         this.sprites.push(sprite);
//     }

//     update(dt) {
//         if (dt <= 0) return;

//         for (let i = this.sprites.length - 1; i >= 0; i--) {
//             const obj = this.sprites[i];
//             const data = obj.userData;

//             data.life -= dt;
//             const progress = data.life / data.maxLife; // 1.0 down to 0.0

//             // Apply movement
//             obj.position.addScaledVector(data.velocity || new THREE.Vector3(), dt);
            
//             // Apply scale growth
//             const scaleFactor = 1 + (data.grow * dt);
//             obj.scale.multiplyScalar(scaleFactor);

//             // Speed lines specific: get thinner as they die
//             if (data.isLine) {
//                 obj.scale.x *= 0.9; 
//             }

//             // Exponential fade out (feels "snappier" than linear)
//             obj.material.opacity = Math.pow(progress, 1.5);

//             // Cleanup
//             if (data.life <= 0) {
//                 this.scene.remove(obj);
//                 if (obj.material) obj.material.dispose();
//                 // Geometry is shared (this.quadGeo), so don't dispose it here
//                 this.sprites.splice(i, 1);
//             }
//         }
//     }
// }