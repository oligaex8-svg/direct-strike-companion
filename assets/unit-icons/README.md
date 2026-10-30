# SC2 unit icons

Original installed StarCraft II `UnitIcon` art, converted from DDS to PNG without
resizing or repainting. `sources.json` records exact archive paths, catalog fields,
dependency priority and source/output SHA-256 hashes. Runtime files are in
`wwwroot/images/units`; the generated exact-key catalog is `unit-icon-catalog.js`.

`aliases.json` is a curated **visual identity** mapping for Direct Strike's renamed
unit types, not a claim that the tracker uses Blizzard's original catalog IDs.
It keeps Fenix champions separate from regular Purifier troops, Primal evolutions
separate from regular Zerg units, and Mecha Lurkers separate from organic Lurkers.
Burrowed/shade/wreckage variants use the corresponding unit's icon. Dehaka uses
his standard hero portrait; Fenix's Walker/Praetor use Dragoon/Praetor portraits.
Some Fenix and Tychus entries deliberately use the matching campaign-menu unit's icon field.
The Direct Strike Zagara aliases map the hero to ZaGara, her hunter-killers
and dropped roaches to their SC2 counterparts, the splitterling parent and
spawn to the big and medium HotS forms respectively, and lightweight swarmlings
to the HotS swarmling. Other documented aliases cover matching commander and
unit forms observed in the locally saved replay library.
The Alarak `Destroyer` alias uses `VoidRayTaldarim`: installed
`mods/starcoop/starcoop.sc2mod/base.sc2data/GameData/EffectData.xml`,
`CEffectCreateUnit id="AlarakDestroyerCU"`, identifies its `SpawnUnit` as
`VoidRayTaldarim`; the Starcoop `AbilData.xml` destroyer magazine likewise
uses that unit. The corresponding actor `UnitIcon` is recorded in sources.json.
`map-unit-icons.json` records four exact `CActorUnit` `UnitIcon` bindings from
the replay's Starlight Assets dependency, verified by the archive and actor XML
SHA-256 values in that file. The extracted map evidence is recorded in
`verification/replay-map-source.json`; the image bytes are the installed SC2
textures named by those bindings. The Revitalizer uses its actor's healing-ward
icon, which differs from the deployment ability button's icon.
No runtime fuzzy lookup, filename guessing, or commander portrait substitution.
`button-aliases.json` records tracker units identified through a named SC2
button rather than an exact unit actor; `HornerStrikeFighter` uses the
`TrainHHBomber` button's original icon. Unmapped types and Unknown/Other retain
a neutral silhouette. `ParasiticBombRelayDummy` represents an invisible effect:
its installed voidmulti `UnitData.xml` has relay and dodge abilities with
`Face="ParasiticBomb"`, whose void `ButtonData.xml` supplies the ability icon.
That icon does not identify a caster or assign ability damage.

The saved-library audit covered 17 commanders and 276 distinct identified types; Zeratul
was absent from the sample, so its replay coverage is not established.
Missing/locked
placeholder textures are excluded from the generated catalog.

Reproduce with the existing resource guard: `UnitIconCatalog` (or `UnitIconMore`
to reuse the saved path index), `Build-UnitIconCatalog.py`, then `UnitIcons`.
Extraction reads the installed game only; temporary XML/DDS files stay under the
ignored `verification/unit-icon-work` folder. The packaged app needs no game
installation or network access to show the icons. Local icon mappings are visual
labels only and never change recorded kills, losses or unit attribution.
