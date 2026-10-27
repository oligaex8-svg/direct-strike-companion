# Native Protoss Pylon — local.42

Native data comes from the owner's installed StarCraft II archives, not generated concept art. Pylon.m3: mods/liberty.sc2mod/base.sc2assets/Assets/Buildings/Protoss/Pylon/Pylon.m3. SHA256: c129f33bcf1d70b41a93a2513bdd61394a3f370627d6ca2a1eea6601d2ccf788. The model contains 1,153 vertices and 1,354 triangles. Its looping Stand sequence runs from 0 to 13,333 ms; the rendered gold assembly rotation and crystal bob follow its native bone tracks.

Native diffuse, emissive and normal DDS textures retain their source UVs. The field uses campaigns/liberty.sc2campaign/base.sc2assets/Assets/Textures/pylonradius1b_512.dds. Exact archive paths and hashes are in native/sources.json. Texture PNGs are lossless DDS decodes. Native data remains Blizzard artwork. These source files and the Blender scene are local authoring evidence; only the atlas, poster and runtime catalog are embedded by this milestone.

The small M3Studio parser is pinned to bef1b08136d73d6b530d07068dbb510aeba4c6db from https://github.com/Solstice245/m3studio. Its GPL-2.0 license, source and pin remain in verification/vendor/m3studio; the parser is not bundled in the app. Export-Pylon42.py extracts geometry, UVs, inverse binds and native animation keys. Render-Pylon42.py reconstructs rigid regions in Blender 5.2.3 LTS. Lighting, static orthographic camera, material adaptation and field-plane presentation are authored, rather than a claim of pixel-identical SC2 rendering. protoss-pylon.blend packs the four source textures.

Local.43 replaces the initial loop with 312 unique frames over 13 seconds at 24 fps. Pack-Pylon42.cjs crops only shared transparent margins, producing tiles measured in the runtime catalog in a lossless 16×20 WebP atlas. The decoded image is approximately 83 MiB (see catalog for the current dimensions), shared between visible instances and loaded only when a Protoss object has room or its Settings demo opens. Reduced motion and decode failure use the poster.

One noninteractive sidebar object and the Settings demo preserve Default geometry. No data-panel copies or texture backgrounds. Browser proof: verification/local42-pylon/report.json; actual loop: verification/local42-pylon/native-pylon.gif. Local unpublished prototype only.

## Correction — local.43

The initial import omitted game-side actor rotation and effects, so it was not the complete Pylon presentation. Native Liberty ActorData, UnitData and TurretData excerpts now live alongside the source model with effects-sources43.json provenance. PylonCrystalRotate uses Ref_Turret at 27.9492 degrees/s; PylonRingRotate uses Ref_TurretZ at 54.8437 degrees/s. The closed 13-second UI cycle uses one and two turns (27.6923 and 55.3846 degrees/s, less than 1% adjustment). Stand also plays, resampled from its 13.333 seconds. The fixed camera does not rotate.

Pylon_Specular supplies roughness/specularity; EnviroTest2 supplies subtle crystal reflection. The M3's original single emitter is reconstructed as deterministic camera-facing Glow_Blue2 billboards following its native attachment, rate, lifespans, speed and alpha envelope. This reproduces its purpose with Blender materials, not SC2's exact particle renderer. Crystal transmission/coat, the fill light and restrained bloom are authored additions. Bloom is composited from alpha-weighted blue radiance under the original RGBA frame during packing, avoiding a rectangular transparent-background artifact.

Current screenshots, loop and acceptance live in verification/local43-pylon. The saved Blender scene contains native movement, controller rotations and emitter quads; the export's final bloom is in Pack-Pylon42.cjs. Other themes, one-object placement, Default geometry and runtime lifecycle gates remain unchanged.

## Correction and ambient details — local.45

Native per-vertex normals are now preserved. Crystal alpha follows the Pylon_Specular alpha layer (channel2 = Alpha Only, pinned M3Studio bl_enum_reference.py), while unsupported fake transmission/environment-as-emission are removed. Source normals, reduced normal-map strength and 2× offline supersampling followed by UI-size downsampling reduce faceted shimmer. Rendering remains a Blender adaptation, not an exact SC2 renderer.

The native grid stays physically anchored while shader energy fronts travel through its cells. An authored occasional group of 22 native Glow_Blue2 sprites gathers from the field toward the crystal. This is a transfer-inspired UI effect, not a claim to replay the full SC2 building warp-in actor. The rejected hard cylinder was removed before delivery. Current loop, raw render and alpha/closure evidence are in verification/local45-pylon; its runtime asset path stays themes/protoss42 for compatibility.
