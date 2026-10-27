# Native campaign Zerg egg — local presentation 46

Chosen source: `SMX1_EggRoomZerglingEgg.m3`, from Swarm campaign StoryModeCharacters/Zerg. `model-sources.json` records archive path and SHA-256 (`b95079c305903c10f18631b133e9f42e684416d48820e7d57740fc650c10433f`). This is the actual campaign organism, not a recolored technology prop or an invented egg primitive. EggMonsterT1 was inspected but has no embedded sequences, so it was not used.

The selected egg has 663 native vertices, 1112 triangles, five bones and one material. Every vertex has blended skin: 298 use two influences, 198 use three, and 167 use four. The exporter preserves original topology, all integer weights/lookup mappings, UV channels, decoded normals, bone defaults/inverse binds, material references and all five Stand tracks. No rigid single-bone assumption is made.

Native `Stand` is 0–2300 ms. Bone_Box006 scale track 1496294323 has 14 keys, reaching 1.120124; Bone_Box007 track 1142964933 has 13 keys, reaching 1.057436. Native emissive multiplier 1503494838 pulses 0.1 → 0.7 → 0.1. These create the original organic breathing and light pulse. There is no invented mutation sequence or rotation. Nonlooping Cover clips are not misrepresented as idle loops.

The renderer evaluates the original native bone hierarchy and inverse binds, then bakes the resulting skin matrices into an identity-bind Blender armature. Mesh vertex groups retain all original weights; linear blend skinning and native normals remain active. This avoids reinterpretation of native rest-bone rolls. It rejects significant matrix decomposition error and, before rendering, checks actual Blender-deformed vertices against native weighted positions at frames 1, 28 and 55.

Run from the project root after converting the three requested DDS files to exact PNG paths in `zerg-texture-requests.json`:

```powershell
$py = 'C:/Program Files (x86)/Steam/steamapps/common/Blender/5.2/python/bin/python.exe'
$blender = 'C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe'
& $py verification/Export-Zerg46.py --check
& $py verification/Export-Zerg46.py
& $blender --background --threads 1 --python verification/Render-Zerg46.py -- --device egg --pilot
# After the required resource check and pilot review, omit --pilot for all frames.
```

`--prepare-only` saves the packed portable `zerg-egg.blend` without rendering. Output is fixed-camera 256×320 transparent RGBA, EEVEE, one CPU render thread, 166 frames at 24 fps (6916.667 ms), three native breath cycles retimed by 0.24%. Pilot and packer-compatible `render.json` live under `verification/local46-zerg/egg`. Missing PNGs or changed source hashes cause clear failures. Fingerprints cover script, exported native data, Blender version and texture contents.

Authored presentation: camera, lighting and organic Blender PBR adaptation (low subsurface scattering and wet coat). Native DXT5nm is reconstructed from alpha/green; specular uses the native red channel. The original emissive alpha mask receives a muted green/yellow tissue tint and the original scalar pulse. No line veins, particles or procedural surface markings are added. Optional creep ground uses an explicitly authored feathered footprint, described below. Native event payloads remain exported but do not trigger gameplay effects.

2026-10-25 implementation milestone: exporter read-only validation passed for 663 vertices/1112 triangles/five native tracks, exact weight sums, palette lookup bounds, normalized normals, UV alignment, strict JSON and manifest agreement; both scripts parse. Lightweight native matrix evaluation found maximum normalized column nonorthogonality 3.93e-7, surface movement 0.020554 native units and exact loop closure. Blender execution, its embedded weighted-deformation checks, screenshots, texture appearance and full rendering remain pending parent integration. No Blender/render/build was launched by this worker. Next authorized step: parent converts PNGs, checks resources, exports, then renders and reviews the pilot before full rendering.


Optional native creep ground: when `textures/creep.png`, `textures/creepheight.png` and `textures/creepspecularmask.png` are present, the renderer places a small elliptical footprint beneath the egg. A radial smootherstep alpha mask fades the surface before its 96-sided perimeter, avoiding a rectangular tile or visible crop edge. Camera fitting includes the footprint. Real creep diffuse, height bump and specular-mask textures produce physical wet surface detail; emission stays zero. An authored slow wetness pulse follows one cycle of the native egg emissive envelope across the three-breath output loop. Egg geometry, skin weights and animation are unchanged. All ground geometry, feathering, material adaptation and timing are identified as authored presentation in metadata. `--no-creep` disables it. Missing optional creep PNGs omit only the ground and record paths/reason in console, blend provenance and full-render report; required egg PNGs remain strict. Fingerprints include enabled creep textures and state. This addition has passed Python compilation; Blender/visual checks remain pending parent execution.

### Local.46 integration — 25 October 2026

Parent integration completed the guarded pilot, full 166-frame render and atlas packing. Blender-deformed vertices matched native weighted positions within 8.98e-8; palette decomposition error was 1.90e-7. The packed scene is `zerg-egg.blend`. Final rendered ground uses native creep height for an irregular feather, with authored purple tint and a subtle slow footprint/wetness pulse; it is not a direct SC2 engine capture. The transparent atlas is 223×263 per tile, 39.38 MiB decoded. Runtime `native-tech.js` places one egg in the existing sidebar gap, with a separate Settings demonstration and posters for reduced motion. The final renderer report and actual loop are `verification/local46-zerg/egg/render.json` and `egg.gif`. Browser integration, Default geometry at three sizes, modal/native-blur/reduced-motion/forced-colour gates passed in `verification/local46-native-ui/report.json`. Owner visual approval remains outstanding; local work only, no publication.
