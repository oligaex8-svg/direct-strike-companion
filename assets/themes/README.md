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
