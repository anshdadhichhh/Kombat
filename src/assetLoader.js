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

  async loadObject(url, format = null) {
    const lower = String(url).toLowerCase();
    const fmt = format ? String(format).toLowerCase() : null;
    if (fmt === 'glb' || fmt === 'gltf' || lower.endsWith('.glb') || lower.endsWith('.gltf')) return this.loadGLTF(url);
    if (fmt === 'fbx' || lower.endsWith('.fbx')) return this.loadFBX(url);
    // Blob URLs do not preserve filenames. Uploaded arenas are GLB, so default blob loading to GLTFLoader.
    if (lower.startsWith('blob:')) return this.loadGLTF(url);
    return this.loadFBX(url);
  }

  async loadAnimationClip(url, clipName) {
    const object = await this.loadObject(url, 'fbx');
    const rawClip = object.animations?.[0];
    if (!rawClip) throw new Error(`No animation clip found in ${url}`);
    const clip = sanitizeClipForFighter(rawClip, clipName);
    clip.name = clipName;
    return clip;
  }
}

function isLocomotionClip(name = '') { return /walk|run|step|move|forward|back/i.test(name); }
function isAttackClip(name = '') { return /punch|kick|attack|heavy|combo|knee|spin|dash|lunge/i.test(name); }

function getHorizontalRange(track) {
  const vals = track.values;
  let xMin = Infinity;
  let xMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;

  for (let j = 0; j < vals.length; j += 3) {
    const x = vals[j];
    const z = vals[j + 2];
    if (x < xMin) xMin = x;
    if (x > xMax) xMax = x;
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
  }

  const xRange = xMax - xMin;
  const zRange = zMax - zMin;
  return { xRange, zRange, range: Math.max(xRange, zRange), axis: xRange >= zRange ? 0 : 2 };
}

function findRootMotionTrack(clip) {
  const candidates = clip.tracks
    .filter((track) => track.name.endsWith('.position'))
    .map((track) => {
      const boneName = track.name.replace(/\.[^.]+$/, '');
      const rootLike = /hips|pelvis|root|bip001|armature/i.test(boneName);
      return { track, rootLike, ...getHorizontalRange(track) };
    })
    .filter((candidate) => candidate.range >= 0.05);

  const preferred = candidates.filter((candidate) => candidate.rootLike);
  const pool = preferred.length ? preferred : candidates;
  return pool.sort((a, b) => b.range - a.range)[0] || null;
}

function sampleRootMotion(rootMotion, time) {
  const { times, values } = rootMotion;
  if (time <= times[0]) return values[0] || 0;
  const lastIndex = times.length - 1;
  if (time >= times[lastIndex]) return values[lastIndex] || 0;

  for (let i = 1; i < times.length; i++) {
    if (time <= times[i]) {
      const aTime = times[i - 1];
      const bTime = times[i];
      const alpha = (time - aTime) / Math.max(0.0001, bTime - aTime);
      return THREE.MathUtils.lerp(values[i - 1], values[i], alpha);
    }
  }

  return values[lastIndex] || 0;
}

function extractRootMotion(clip) {
  const candidate = findRootMotionTrack(clip);
  if (!candidate) return null;

  const raw = candidate.track.values;
  const start = raw[candidate.axis];
  const values = [];
  let maxAbs = 0;

  for (let j = candidate.axis; j < raw.length; j += 3) {
    const value = raw[j] - start;
    values.push(value);
    maxAbs = Math.max(maxAbs, Math.abs(value));
  }

  const final = values[values.length - 1] || 0;
  const sign = final < 0 ? -1 : 1;
  const distance = Math.max(Math.abs(final), maxAbs);
  if (distance < 0.05) return null;

  const rootMotion = {
    trackName: candidate.track.name,
    axis: candidate.axis,
    times: Array.from(candidate.track.times),
    values,
    distance
  };
  rootMotion.sample = (time) => Math.abs(sampleRootMotion(rootMotion, time) * sign);
  return rootMotion;
}

export function sanitizeClipForFighter(clip, semanticName = '') {
  const shouldExtractRootMotion = isLocomotionClip(semanticName)
    || isLocomotionClip(clip.name)
    || isAttackClip(semanticName)
    || isAttackClip(clip.name);
  if (!shouldExtractRootMotion) return clip.clone();

  const rootMotion = extractRootMotion(clip);
  const cleanedTracks = clip.tracks.map((track) => {
    if (!track.name.endsWith('.position')) return track.clone();
    if (!rootMotion || track.name !== rootMotion.trackName) return track.clone();

    const cloned = track.clone();
    const vals = track.values;
    const cv = cloned.values;
    const x0 = vals[0];
    const z0 = vals[2];
    for (let j = 0; j < cv.length; j += 3) {
      cv[j + 0] = x0;
      cv[j + 2] = z0;
    }
    return cloned;
  });

  const out = new THREE.AnimationClip(`${clip.name || semanticName}_inPlace`, clip.duration, cleanedTracks);
  out.userData.rootMotion = rootMotion;
  out.optimize();
  return out;
}

export function makeFallbackFighter(color = 0x3388ff) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 8, 16), new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 16), new THREE.MeshStandardMaterial({ color: 0xffd0aa, roughness: 0.65 }));
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
