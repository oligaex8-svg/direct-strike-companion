# Faction console textures

These original StarCraft II UI textures belong to Blizzard Entertainment. They
were obtained from the [SC2Mapster Asset Explorer](https://asset-explorer.sc2arcade.com/ui.html)
archive for the companion's local faction styles. No community-authored texture
is used here.

For each of `protoss`, `terran` and `zerg`, the source files are:

- `ui_frame_default_<race>.png` — game panel-frame atlas.
- `ui_console_controlgroupbutton_normal_default<race>.png` — game console control.

Archive paths are `https://dist.sc2arcade.com/star-assets/ui-png/<filename>`.
`node verification/Build-FactionConsoles.cjs` retains the original pixels and
repositions atlas sections into nine-slice SVG frames, a scored glass inset and
the original button image under `wwwroot/themes/`. The generated SVGs embed their
source pixels and work offline with the existing content security policy.

The default dashboard, source-rating colours, results, layout and behavior are
independent of these decorative assets. No shaders or animated effects run.

## Menu console — 22 October 2026

The default style now uses the game's **menu** construction rather than the HUD
portrait-frame atlas. The original archive images are:

- `ui_battlenet_glues_pageassets_dialogstandardborder_noglow.png` — outer work frame.
- `ui_battlenet_glues_standardbuttons_small_border_outer.png` — neutral button rail,
  tinted blue in the generated SVG; text and keyboard outlines stay independent.
- `ui_battlenet_glues_pageassets_dialog_hexpattern.png` — restrained header material.

These are from the same [SC2Mapster Asset Explorer](https://asset-explorer.sc2arcade.com/ui.html)
and [original texture archive](https://dist.sc2arcade.com/star-assets/ui-png/).
The builder copies them into `wwwroot/themes/menu-*`; faction HUD frames remain
on the single outer workspace, with recessed data surfaces inside. It retains
source hashes in `verification/faction-texture-sources.json`.

The title face is [Michroma](https://github.com/google/fonts/tree/main/ofl/michroma),
bundled locally with its SIL Open Font License (`Michroma-OFL.txt`). It is an
approximation of the menu lettering, not an extracted Blizzard font. Russian
titles use the existing Cyrillic face. No font or artwork requests run at runtime.

The compact sidebar uses `ui_battlenet_glues_topnav_buttonselected.png` from the
same archive for the selected-tab silhouette. `nav-*.svg` are eleven small,
authored interface glyphs with a common 16px grid and 1.3px stroke; they are not
Blizzard assets. The asset builder generates them alongside the menu resources.

## Faction construction — 22 October 2026

Custom themes use `ui_console_commandbutton_normal_default<race>.png` from the
same original archive for native blue, amber and green command controls. The
builder also retains the central twelve-pixel crown from `ui_frame_default_<race>.png`
as `<race>-crest.svg`. Frame slices and crops preserve the source pixels; no
invented raster material is used. `factions.css` owns faction-only corner shapes,
inset edges and plate treatments. Header crowns are decorative and cannot
intercept input. Names, numbers and table bodies stay clear of the artwork.
The default menu and source/result colours remain independent of this layer.

## Material palettes — 22 October 2026

Protoss combines deep blue panels with warm gold; Terran uses cool steel with
mint controls. Zerg uses an amethyst/magenta palette. Its original frame,
crown, glass and command/control artwork receive one shared SVG colour matrix
in `Build-FactionConsoles.cjs`; source contours, texture detail and alpha remain
intact. Filtered command/control SVGs embed the source PNGs for offline use.
No filter is applied to page text, portraits, ratings or semantic list colours.

## In-game HUD component families — 22 October 2026

`hud-sources.json` records the archive URL, dimensions and SHA-256 for 72 original control textures (18 states/roles across default Protoss, Terran, Zerg and Purifier) and four original console-render previews. `Fetch-HudComponents.cjs` fetches these public catalogs and images; `Build-HudComponents.cjs` adapts their documented regions into offline SVG assets and emits `hud-assets.css`. Source PNGs are retained unchanged.

Menu buttons, command slots, control groups, chat fields, menu strips, helper panels, timers, tooltip trims and small controls have separate assets. Modern HUDs use their original normal/hover/pressed/selected images. Text remains live, unfiltered and independently readable; optional dark image wells retain the bevels. The original Zerg family keeps its image-only amethyst treatment. Data tables retain neutral steel headers and independent rating/result colours.

Fenix uses the game's Purifier control family and the Fenix console-render panel. The Classic Terran, Protoss and Zerg variants use their corresponding console-render minimap contours and command-slot regions, plus race-matched 2-D control textures for compact fields and labels. Plain rail samples stretch; ornamental corners do not. Exact black in the render previews is keyed as the viewing matte while original alpha and non-black pixels remain. Classic command-slot hover/press uses a restrained image-only brightness change. These are companion adaptations of the game HUD, not interactive minimaps or game command panels.

## Purifier structural details — 22 October 2026

Fenix also uses six original SC2 co-op top-bar/story-mode textures: the separate upper/lower filigree strips and corner caps, full-bar underlay, and Purifier underline. `purifier-detail-sources.json` records exact URLs, dimensions and SHA-256. `node verification/Build-PurifierDetails.cjs --fetch` fetches missing originals and builds six offline SVGs; `Build-HudComponents.cjs` invokes the same builder after the common families.

The main armour frame samples matching bounds of the Fenix console deck, retaining the dark recess, ivory rim and lower reactor. A separate iris crest stays above the content inset. Navigation racks use their own control-side rail sample. Inner panel brackets use co-op filigree, while heading joins, subordinate commander rows and utility dividers use paired energy lines and a central nexus. Plain rails stretch independently of the corners; the original pixels and transparency remain intact. Live text and source/result colours are independent. All changes are scoped to Fenix, with a forced-colours fallback; no layout animation or new runtime requests are introduced.
## Nerazim reference construction — 22 October 2026

The user's gold armour, emerald gems and violet controls identify the Nerazim Protoss in-game console, rather than the default blue Protoss menu atlas. `Fetch-HudComponents.cjs` now retains its original console render, eighteen native control states/textures and the unit-info rail. Current `hud-sources.json` contains 96 original resources; `nerazim-console-sources.json` records the twenty sources owning this variant.

`Build-HudComponents.cjs` uses Nerazim for the existing Protoss role and invokes `Build-NerazimConsole.cjs` after the common assets. Two separately masked shoulders preserve the real sculpted silhouette and jewels. Only the plain centre rail stretches; a small overlap hides transparent shoulder tails. The body frame omits the old rectangular top edge, and casing masks remove actual game-command icons and empty minimap/portrait wells. Dedicated native violet control states, gemmed field casings, portrait borders and gold unit-info dividers carry the identity through the interior. The live title and commands stay below the decorative band. No fake game controls, runtime downloads or new animation are added. All live data and semantic colours remain independent.