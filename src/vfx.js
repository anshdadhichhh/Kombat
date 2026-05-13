import * as THREE from 'three';

export class VFXSystem {
  constructor(scene) {
    this.scene = scene;
    this.max = 240;
    this.cursor = 0;
    this.positions = new Float32Array(this.max * 3);
    this.colors = new Float32Array(this.max * 3);
    this.velocities = Array.from({ length: this.max }, () => new THREE.Vector3());
    this.life = new Float32Array(this.max);
    this.maxLife = new Float32Array(this.max);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0, this.max);

    this.material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.sprites = [];
    this.spriteMaterial = new THREE.SpriteMaterial({
      color: 0xffdd55,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
  }

  spawnHit(position, direction = new THREE.Vector3(1, 0, 0), count = 28) {
    const normal = direction.clone().normalize();
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.max;
      const p = i * 3;
      this.positions[p + 0] = position.x;
      this.positions[p + 1] = position.y;
      this.positions[p + 2] = position.z;

      const spread = new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(1.1),
        THREE.MathUtils.randFloat(0.0, 0.9),
        THREE.MathUtils.randFloatSpread(0.9)
      );
      this.velocities[i].copy(normal).multiplyScalar(THREE.MathUtils.randFloat(1.8, 4.5)).add(spread);
      this.life[i] = this.maxLife[i] = THREE.MathUtils.randFloat(0.16, 0.34);

      this.colors[p + 0] = 1.0;
      this.colors[p + 1] = THREE.MathUtils.randFloat(0.55, 0.95);
      this.colors[p + 2] = 0.08;
    }
    this.spawnFlash(position, 0xffee77, 0.65, 0.18);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  spawnDust(position, count = 14) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor++ % this.max;
      const p = i * 3;
      this.positions[p + 0] = position.x + THREE.MathUtils.randFloatSpread(0.25);
      this.positions[p + 1] = Math.max(position.y, 0.05);
      this.positions[p + 2] = position.z + THREE.MathUtils.randFloatSpread(0.25);
      this.velocities[i].set(
        THREE.MathUtils.randFloatSpread(1.2),
        THREE.MathUtils.randFloat(0.4, 1.6),
        THREE.MathUtils.randFloatSpread(0.8)
      );
      this.life[i] = this.maxLife[i] = THREE.MathUtils.randFloat(0.22, 0.45);
      this.colors[p + 0] = 0.65;
      this.colors[p + 1] = 0.55;
      this.colors[p + 2] = 0.42;
    }
  }

  spawnFlash(position, color = 0xffffff, size = 0.55, life = 0.16) {
    const mat = this.spriteMaterial.clone();
    mat.color.set(color);
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(size, size, size);
    sprite.userData.life = life;
    sprite.userData.maxLife = life;
    this.scene.add(sprite);
    this.sprites.push(sprite);
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const p = i * 3;
      this.velocities[i].y -= 5.5 * dt;
      this.positions[p + 0] += this.velocities[i].x * dt;
      this.positions[p + 1] += this.velocities[i].y * dt;
      this.positions[p + 2] += this.velocities[i].z * dt;
      const fade = Math.max(this.life[i] / this.maxLife[i], 0);
      this.colors[p + 0] *= fade;
      this.colors[p + 1] *= fade;
      this.colors[p + 2] *= fade;
    }

    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const s = this.sprites[i];
      s.userData.life -= dt;
      const fade = Math.max(s.userData.life / s.userData.maxLife, 0);
      s.material.opacity = fade * 0.75;
      const grow = 1 + dt * 4.5;
      s.scale.multiplyScalar(grow);
      if (s.userData.life <= 0) {
        this.scene.remove(s);
        s.material.dispose();
        this.sprites.splice(i, 1);
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}
