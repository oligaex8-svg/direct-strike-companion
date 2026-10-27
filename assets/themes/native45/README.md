# Native Terran technology, local presentation 45

Source models are Blizzard's installed SC2 SensorTower and TechLab, extracted read-only. `model-sources.json` records original archive paths and hashes. `texture-requests.json` lists only textures referenced by mesh batches. SensorTower_Splat and TechLab particle-only textures are not required.

`verification/Export-Terran45.py` uses the pinned M3Studio reader. It exports unchanged native positions, triangle topology, UV0/UV1 with region UV scaling, decoded native normals, inverse binds, bone defaults, materials, and all selected native tracks. Each model uses rigid weight 255 and no triangle crosses a bone boundary, permitting exact partition into animated bone submeshes. Extra event/reference keys retain their native fields; source M3 remains authoritative.

Sensor: 3265 vertices, 1644 triangles. Native Stand is 4000 ms; its five bone tracks animate warning-light/damage scales, **not radar rotation**. The authorized authored UI controller rotates only the native `Top` upper sensor assembly once per eight seconds while the lower housing remains fixed. `--no-sensor-scan` disables that controller. Camera and complete object remain fixed.

Reactor option: the actual TechLab, 3181 vertices, 1722 triangles. Native `Stand Attached Work` lasts 6667 ms. Quaternion tracks 677755605 (`Bone_Bldg_Tech_Lab_p_30`, 20 keys) and 801337750 (`..._31`, 26 keys) spin the genuine mechanism. Native emissive multiplier tracks 1303611445 and 817925741 pulse 1.5–1.15–1.5. The 160-frame loop at 24 fps changes duration by 0.005%.

From the project root in PowerShell:

```powershell
$py = 'C:/Program Files (x86)/Steam/steamapps/common/Blender/5.2/python/bin/python.exe'
$blender = 'C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe'
& $py verification/Export-Terran45.py --check
& $py verification/Export-Terran45.py
& $blender --background --threads 1 --python verification/Render-Terran45.py -- --device sensor --pilot
& $blender --background --threads 1 --python verification/Render-Terran45.py -- --device reactor --pilot
# After pilot review and the required resource check, omit --pilot for full frames.
```

Convert DDS to the exact PNG paths in the request list before running Blender. Missing PNGs cause a clear error; no fallback materials. Renderer packs textures into `terran-sensor.blend` / `terran-reactor.blend`. `--prepare-only` saves a blend without rendering. RGBA frames are 256×320, EEVEE, one CPU render thread, fixed orthographic camera; sensor is 192 frames/8000 ms, reactor 160 frames/6666.667 ms. Reports and pilots go under `verification/local45-terran/<device>/`. Fingerprints include script, exported data, Blender version, controller choice and all texture contents.

Presentation approximations: native mesh and sampled bone tracks are retained; materials translate SC2 to Blender PBR (including packed normal reconstruction and native red-channel specular). RGB emissive uses native scalar tracks; team-color emissive masks, particles and game-specific additive compositing are not fully reproduced. Warning quads use alpha-weighted emission. No added props, AI art, holographic rings, camera orbit or whole-model turntable.

2026-10-25 script milestone: read-only exporter validation passed for both models, including rigid partitions, index bounds, complete selected track counts (10/28), JSON serialization and Python syntax. Blender execution, pilots, visual loop/normal inspection and full rendering remain for parent integration. Scripts have not launched Blender. Next authorized step: parent resource check, export, convert PNGs and render/review pilots before full rendering.


Integrated local.45: Sensor Tower occupies the existing sidebar gap, and the Tech Lab work mechanism docks beside header controls, omitted when space is insufficient. Native images remain uniformly scaled. Both devices appear in the Settings demonstration. Runtime: wwwroot/native-tech.js/.css. Packing: verification/Pack-Terran45.cjs. Eight Default geometry comparisons, two lifecycle groups and two final placement checks passed; evidence and actual UI/object recordings live in verification/local45-native-ui. Original mesh/model hashes are retained in the runtime catalog. The prototype remains local and unpublished.
