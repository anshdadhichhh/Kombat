# Arena file

Put ONE arena file here and rename it to one of these exact names:

```text
arena.glb
arena.gltf
arena.fbx
```

Recommended: use `arena.glb` if possible. GLB usually loads better in Three.js than FBX.

The game tries loading in this order:

1. `public/assets/arena/arena.glb`
2. `public/assets/arena/arena.gltf`
3. `public/assets/arena/arena.fbx`

If none exist, the fallback grid arena is used.
