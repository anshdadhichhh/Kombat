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

    // Preserve animation fidelity. Only locomotion root X/Z is cleaned; idle/attacks/hits/KO are untouched.
    const clip = sanitizeClipForFighter(rawClip, clipName);
    clip.name = clipName;
    return clip;
  }
}

function isLocomotionClip(name = '') {
  return /walk|run|step|move|forward|back/i.test(name);
}

// Previous version stripped Hips/Pelvis from ALL clips, making idle/combat look sloppy.
// This version only touches top-level Root/Armature horizontal travel for walk/step clips.
export function sanitizeClipForFighter(clip, semanticName = '') {
  if (!isLocomotionClip(semanticName) && !isLocomotionClip(clip.name)) return clip.clone();

  const rootLike = /(^|[.:/])(root|armature|scene)$/i;
  const hipsLike = /hips|pelvis/i;
  const cleanedTracks = clip.tracks.map((track) => {
    if (!track.name.endsWith('.position')) return track.clone();
    if (hipsLike.test(track.name)) return track.clone();
    if (!rootLike.test(track.name) && track.name !== '.position') return track.clone();

    const cloned = track.clone();
    const v = cloned.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i + 0] = x0;
      // preserve Y bob/height
      v[i + 2] = z0;
    }
    return cloned;
  });

  const out = new THREE.AnimationClip(`${clip.name || semanticName}_inPlace`, clip.duration, cleanedTracks);
  out.optimize();
  return out;
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
  if (size.y > 0.001) object.scale.multiplyScalar(targetHeight / size.y);

  object.updateMatrixWorld(true);
  const fixedBox = new THREE.Box3().setFromObject(object);
  object.position.y -= fixedBox.min.y;
  return object;
}

export const normalizeFbxObject = normalizeObject;
