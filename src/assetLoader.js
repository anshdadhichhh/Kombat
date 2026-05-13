import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export class AssetLoader {
  constructor(loadingManager = new THREE.LoadingManager()) {
    this.fbx = new FBXLoader(loadingManager);
    this.cache = new Map();
  }

  async loadFBX(url) {
    if (this.cache.has(url)) return this.cache.get(url).clone(true);
    const object = await this.fbx.loadAsync(url);
    this.cache.set(url, object);
    return object.clone(true);
  }

  async loadAnimationClip(url, clipName) {
    const fbx = await this.fbx.loadAsync(url);
    const clip = fbx.animations?.[0];
    if (!clip) throw new Error(`No animation clip found in ${url}`);
    clip.name = clipName;
    return clip;
  }
}

export function makeFallbackFighter(color = 0x3388ff) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.32, 1.05, 8, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.55 })
  );
  body.position.y = 1.05;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xffd0aa, roughness: 0.65 })
  );
  head.position.y = 1.85;
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
  const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), gloveMat);
  const rHand = lHand.clone();
  lHand.position.set(-0.42, 1.25, 0.02);
  rHand.position.set(0.42, 1.25, 0.02);
  group.add(body, head, lHand, rHand);
  group.userData.fallbackHands = { lHand, rHand };
  return group;
}

export function normalizeFbxObject(object, targetHeight = 2.0) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) child.material.side = THREE.FrontSide;
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.001) {
    const scale = targetHeight / size.y;
    object.scale.multiplyScalar(scale);
  }

  const fixedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= fixedBox.min.y;
  return object;
}
