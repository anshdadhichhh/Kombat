import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export class AssetLoader {
  constructor(loadingManager = new THREE.LoadingManager()) {
    this.fbx = new FBXLoader(loadingManager);
    this.gltf = new GLTFLoader(loadingManager);
    this.cache = new Map();
  }

  cloneObject(source) {
    const clone = SkeletonUtils.clone(source);
    clone.animations = source.animations || [];
    return clone;
  }

  async loadFBX(url) {
    if (this.cache.has(url)) return this.cloneObject(this.cache.get(url));
    const object = await this.fbx.loadAsync(url);
    this.cache.set(url, object);
    return this.cloneObject(object);
  }

  async loadGLTF(url) {
    if (this.cache.has(url)) return this.cloneObject(this.cache.get(url));
    const gltf = await this.gltf.loadAsync(url);
    const object = gltf.scene;
    object.animations = gltf.animations || [];
    this.cache.set(url, object);
    return this.cloneObject(object);
  }

  async loadObject(url) {
    const lower = url.toLowerCase();
    if (lower.endsWith('.glb') || lower.endsWith('.gltf')) return this.loadGLTF(url);
    return this.loadFBX(url);
  }

  async loadAnimationClip(url, clipName) {
    const object = await this.loadObject(url);
    const clip = object.animations?.[0];
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

export function normalizeObject(object, targetHeight = 2.0) {
  object.traverse((child) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => { m.side = THREE.FrontSide; });
        else child.material.side = THREE.FrontSide;
      }
    }
  });

  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.001) {
    const scale = targetHeight / size.y;
    object.scale.multiplyScalar(scale);
  }

  object.updateMatrixWorld(true);
  const fixedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= fixedBox.min.y;
  return object;
}

// Backwards-compatible name used by older code.
export const normalizeFbxObject = normalizeObject;
