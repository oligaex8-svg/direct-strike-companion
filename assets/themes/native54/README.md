# Character theme objects — local.54

This set supplies the fifteen themes that did not receive the base-race equipment work. It does not replace the restored frames or change Default layout. No image-generated equipment or architectural surround is used.

All geometry, weights, UVs, normal/specular/emissive textures and selected animation keys come from the installed SC2 data. `sources.json` and `texture-sources.json` record exact archive paths and hashes. `Export-Character54.py` selects the clips; `Render-Character54.py` reconstructs them offline with authored fixed cameras, lighting and a material translation. These are not captures from the SC2 engine. Native affine transforms are preserved through the existing two-factor skin palette, with Blender vertex-position checks and complete projected-bound checks.

| Theme | Native model | Native clip |
| --- | --- | --- |
| Nerazim | Dark_Templar_Pylon | Stand |
| Alarak | Pylon_Taldarim | Stand |
| Ihan-rii | Pylon_Ihanrii | Stand |
| Nova | SensorTower_CovertOps | Stand |
| Mira | TechLab_HornerHan_Coop | Stand Attached Work |
| Machined | Factory | Stand Work |
| Tyrador | SensorTower_Silver | Stand |
| Abathur | EvolutionChamber | Stand Work |
| Dehaka | Dehaka_Primal_Barracks_Coop | Stand |
| Cerberus | EvolutionChamber_RCZ | Stand Work |
| Mecha | EvolutionChamber_Mecha | Stand Work |
| Arcade | SM_MarSaraBarJukebox | Work |
| Classic Terran | CommandCenter_Remastered | Stand Work |
| Classic Protoss | Nexus_Remastered | Stand Work |
| Classic Zerg | Hatchery_Remastered | Stand Work |

Machined's factory, Abathur's evolution chamber and Arcade's Mar Sara jukebox are thematic selections of original game equipment, not claims of exclusive named skins. The native `ConsoleSkinData.xml` maps internal `ConsoleTerran_Silver` to `Tyrador` and `ConsoleZerg_RCZ` to `Cerberus` (lines 331–348 in the saved identity source). Blizzard also lists the [Tyrador, Cerberus, Ihan-rii and Classic structure collections](https://news.blizzard.com/en-gb/article/23557934/starcraft-ii-5-0-4-patch-notes).

The offline RGBA export excludes only enumerated screen-space displacement passes, which cannot refract an absent game scene. Factory and Command Center each omit a 220-triangle distortion region; the jukebox omits a 24-triangle distortion pass while retaining its opaque geometry. Cubic reflections and non-mesh projected coordinates use the existing documented renderer adaptations. All exclusions and material adaptations remain in each render's provenance.

Production packing retains original clip duration, unions alpha over every frame, adds transparent padding and bounds each decoded atlas to 128 MiB and 8192px. One original object occupies available sidebar space; the same object appears separately in Settings. Generated surface41 layers retire after the replacement decodes. The five approved themes are excluded. Hidden windows, native blur, modals, offscreen views, reduced motion and forced colours retain their existing safeguards.

Verification owners: `verification/local54-characters/` for native model renders; `verification/local54-character-ui/` for actual application captures, motion and layout checks. Current acceptance is recorded in the root README after those checks complete.
