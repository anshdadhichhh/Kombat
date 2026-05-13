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
    const rawClip = object.animations?.[0];
    if (!rawClip) throw new Error(`No animation clip found in ${url}`);
    const clip = removeRootMotion(rawClip, { keepVertical: false });
    clip.name = clipName;
    return clip;
  }
}

// Fighting games should move the controller object with physics, not animation root motion.
// This strips FBX root/hip translation tracks so walk/punch/jump clips don't pull the mesh back to origin.
export function removeRootMotion(clip, { keepVertical = false } = {}) {
  const rootNames = ['Root', 'Armature', 'Hips', 'mixamorigHips', 'mixamorig: Hips', 'Bip001', 'Pelvis'];
  const cleanedTracks = [];

  for (const track of clip.tracks) {
    const isPositionTrack = track.name.endsWith('.position');
    const isRootLike = track.name === '.position' || rootNames.some((name) => track.name.includes(name));

    if (!isPositionTrack || !isRootLike) {
      cleanedTracks.push(track.clone());
      continue;
    }

    if (!keepVertical) continue;

    const cloned = track.clone();
    for (let i = 0; i < cloned.values.length; i += 3) {
      cloned.values[i + 0] = cloned.values[0];
      cloned.values[i + 2] = cloned.values[2];
    }
    cleanedTracks.push(cloned);
  }

  return new THREE.AnimationClip(`${clip.name || 'clip'}_inPlace`, clip.duration, cleanedTracks);
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
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => { m.side = THREE.FrontSide; });
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

export const normalizeFbxObject = normalizeObject;
