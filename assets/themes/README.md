# Faction console textures

### Physical raster equipment — local.35, 24 October 2026

Twenty versioned rendered kits under `equipment35/` replace the visible code-painted scene output. Each kit contains a fixed core housing, moving insert, utility housing, lamp relay, four portrait corners and three lens inserts. The native console reference, motion family and exact source hash are recorded in `equipment35/sources.json`. These are original companion artwork based on native references, not exported SC2 or SC1 Remastered animation. Existing native/art32 frame and scenery files remain intact; the root README owns delivery status.

`Import-EquipmentRaster35.cjs` groups whole alpha-connected components rather than cutting equal tiles. Imported originals retain their resolution, natural apertures and soft alpha; registered glass masks restrict lamp modulation. `ThemeEquipmentRaster.cjs` uniformly fits those bitmaps and moves rotors, optics, pistons or membranes behind stationary front housings. Missing sources or real openings fail explicitly. The historical Canvas/Scene renderers are not a visible fallback. Eighty small six-second atlases and forty large four-second atlases play at 24fps with cached atomic compositor clocks.

Regenerate sequentially through guarded `ThemeEquipmentImport`, `ThemeEquipmentAssets`, `ThemeLoopAssets`, `ThemeEquipmentReview`, `ThemeLoopReview`, then `ThemeEquipmentCapture`. The capture helper uses fresh contexts for thumbnails; `ThemeEquipmentFinalize` can resume completed, logged frame sets after a later capture interruption. [Assembly checks](../../verification/local35-raster-assembly.json), [asset checks](../../verification/local35-equipment-assets.json), [preserved static art](../../verification/local35-preserved-art.json) and [actual UI media](../../verification/local35-equipment-capture/index.html) record the result. Geometry-only sweeps can set `DSC_SKIP_SKIN_SCREENSHOTS=1`; the separate actual-UI recordings remain the visual evidence. All work remains local.

### Bespoke scene construction and stable playback — local.34, 24 October 2026

Local.33's four-site/shared emitter model is retired. `verification/ThemeSceneCanvas.cjs` owns fifteen individually authored electronic/crystal/optical/mechanical scenes; `ThemeSceneOrganic.cjs` owns five separate biological constructions. `ThemeScenePrimitives.cjs` shares drawing mechanics, not animation anatomy. Source functions render offline through the bundled CPU Canvas runtime. Distinct silhouettes/choreography and source hashes are stored in each loop record. No runtime Canvas, noise generation, timers or per-frame JavaScript is introduced. These are authored matching inlays, not native SC2 animation exports.

The native recess supplies the support: no miniature pedestal frame surrounds the effect. A fixed opaque bounding-edge offset registers each composition to the lower header or right casing edge without stretching it. Biological folds, sacs, plates and tissue around rigid hardware remain separate. Whole bodies stay visible; local reflections/deformation carry the motion. Sparse weld sparks have an actual seam origin. Headers/insets retain the 512×64 / 256×128,96-frame,24fps,four-second atlas contract; exposed edges feather while the attachment edge stays present.

The browser player now uses one atomic stepped transform. Semantic surface records reparent the original decoded image and clock across polling DOM replacements; pause/resume preserves phase. Whole-data opacity dips are removed. `ThemeSceneReview` checks grayscale structure, twenty renderer identities, exact period and all-frame luminance continuity; `ThemeContinuity` checks exact paused pixels, live host replacement, row rollover and accessibility. Use guarded Pilot → Assets → SceneReview/LoopReview/Continuity → Capture stages sequentially. The native sidebar character/projector art owns its space; no extra inlay overlays it. Insets are shown in the Settings stage, and attached header scenes occupy measured gaps. [Native UI recording/captures](../../verification/local34-review.html), twenty refreshed previews, layout/continuity and packaged checks are complete. The root README owns delivery identity and evidence; all work remains local.

### Evolving material loops — local.33, 24 October 2026

`verification/Build-ThemeLoops.cjs` owns authored temporal materials, separate from native console exports and the accepted art32 frames. Twenty themes each have a shallow 512×64 header composition and a 256×128 inset composition, 96 frames over four seconds at 24 fps. Both WebP atlases are 8192×384: headers use 16 columns × 6 rows, insets 32 × 3. Posters use frame 32. Continuous periodic phases and wrapped zero-alpha particle lifetimes avoid an endpoint reset. Local changes occur inside stationary material seats; no whole-sheet drift or animated perimeter trim remains. Fenix, optical and organic pilots were revised from broad sheets into unequal separated clusters before final generation.

Regenerate through guarded `ThemeLoopPilot` then `ThemeLoopAssets` stages. Jobs run one theme at a time; finalization checks all forty atlases/posters and the generator source hash before writing `theme-loop-catalog.js`. `ThemeLoopReview` checks hashes, dimensions, transparent edges, internal changes, seams, positioning and lifecycle. `ThemeLoopCapture` captures actual synthetic-data UI at every authored frame and verifies CSS row/column addressing. Never run these jobs concurrently with another render/build.

`theme-vfx.js/.css` owns the cached atlas player and free-space placement. Three surfaces maximum; no runtime pixel generation, timers or per-frame JS. Hidden/blurred/offscreen/dialog/reduced-motion/forced-colour gates remain. Reduced motion uses a still poster. Missing or interrupted theme loads cannot restore old pixels. Keep Default boxes and existing native/art32 frames unchanged. Acceptance evidence and local build status live in the root README local.33 resume. Further local refinement is authorized; Git publication is not.

### Textured inset artwork — local.32, 24 October 2026

The seven weakest interior treatments were reworked: Mecha, Machined, Mira, Cerberus, Zerg, Dehaka and Classic Zerg. `art32/sources.json` records seven versioned image_gen source frames, their original SC2 console references and import parameters. This is newly authored matching artwork, not exported game art. Native outer shells and controls remain unchanged. The new construction distinguishes ceramic armour, foundry steel, welded salvage, infested containment, wet chitin, matte primal plates and swollen classic tissue.

Run the guarded **ThemeArtAssets** stage for these interiors; it runs the base field generator, then imports the seven frames. `Build-ThemeArt32.cjs` scales corner sculpture uniformly, extends only quiet rail profiles, joins them in premultiplied RGBA and freezes matching samples on both sides of each nine-slice cut. The runtime contract stays 160×100 SVG/slice32. Full-resolution source/atlas PNGs and [provenance](art32/imported-frames.json) stay in the project. [Checks](../../verification/local32-art-assets.json) verify exact joins, preserved corner cores and transparent wells.

`theme-art.css` supplies hierarchy and paint outsets within existing gutters; compact banks and scrollable tables retain contained frames. Seven fields use quieter material relief. Four VFX materials localize charge/heat/leaks/sparks; their energy now follows the casing. Independent review accepted the desktop profiles. [Before/after](../../verification/local32-art-comparison.webp) and [seven full-size captures](../../verification/local32-art-gallery.html) show actual synthetic-data UI. [935 prior art files](../../verification/local32-preserved-art.json) and [48 other VFX textures](../../verification/local32-preserved-vfx.json) remain unchanged. Local only.

### Material-based animation — local.31, 24 October 2026

The moving VFX wireframes and hard striped sweeps are retired. `Build-ThemeVfx.cjs` now generates sixty transparent 480×240 PNG materials offline from deterministic density, interference, caustic and particle fields. Fenix uses filled projection panes; Protoss uses refractive planes; Ihan-rii uses dielectric sheets; Terran/Nova use optical/phosphor coatings; mechanical and biological themes retain separate thermal, cellular, fluid and spore treatments. These are authored companion effects, not original game animation exports. The exact sixty legacy VFX SVG files are removed only after successful replacement generation; native game artwork is untouched.

`theme-vfx.css` maps material light across the header film and composites independently moving cached layers. Particles retain their proportions. The existing Default layout, native frame assets, measured text clearance and pause/accessibility lifecycle remain intact. There is no live noise generation or additional animation loop in JavaScript. [Texture checks](../../verification/local31-vfx-browser.json) cover all sixty PNGs, fully transparent canvas edges, material motion and interaction gates. [Full UI recording](../../verification/local31-interface-effects.gif), [material closeups](../../verification/local31-graphical-effects.gif) and [all-theme gallery](../../verification/local31-theme-gallery.webp) use synthetic data. Twenty derived thumbnails are refreshed; hashes/provenance remain in `preview-sources.json`. Work stays local.

### Stronger holographic and energy materials — local.30, 24 October 2026

Sixty VFX layers now contain fuller centered geometry, illuminated cores, translucent energy volumes and independently moving structures. Fenix uses projected lattices and segmented bases; psionic themes use crystal/conduit or void constructions; military themes use scanners, targeting and reactors; each biological console has its own membranes, vesicles, spores or infected containment. A fourth CSS sweep layer supplies the matching material movement. These are authored companion effects, not animations extracted from the game. [Geometry checks](../../verification/local30-vfx-artwork.json) confirm twenty different compositions independent of palette.

`theme-vfx.js` measures actual text ranges before placing a complete featured-commander projection. Dense/compact panels instead illuminate their existing bezel channel. Header/sidebar effects stay in existing unused space; isolated negative stacking keeps the panel effect beneath readable content. The existing six-surface budget, stable refresh phase and pause/accessibility gates remain. [Material checks](../../verification/local30-vfx-browser.json) include rendered-pixel movement, text clearance and Preview interruption. [Full interface recording](../../verification/local30-interface-effects.gif), [closeups](../../verification/local30-graphical-effects.gif) and [twenty-theme gallery](../../verification/local30-theme-gallery.webp) use actual synthetic-data UI captures. [949 prior native/authored assets](../../verification/local30-preserved-theme-art.json) remain unchanged; twenty derived thumbnails were refreshed with their hashes in `preview-sources.json`. Work stays local.

### Graphical console effects — local.29, 24 October 2026

`theme-vfx.js`, `theme-vfx.css` and `theme-vfx-layout.css` add animated materials in unused header/sidebar space and a narrow illuminated frame trim. Twenty themes have distinct three-layer artwork: Purifier matrix currents, Khala conduits, Nerazim wisps, Tal'darim blade energy, Terran scanners, organic veins/spores, mechanical reactors and classic instrument effects. `verification/Build-ThemeVfx.cjs` generates the sixty SVGs and their token/manifest files under `wwwroot/themes/vfx/`. These effects are authored companion graphics, not animations exported from SC2. Existing native frame images remain intact.

Only transform/opacity animate. The lifecycle caps active surfaces at six, preserves phase through refreshes, and pauses offscreen, inactive-window and background-dialog effects. Reduced motion keeps a static material; forced colours remove it. An interrupted Preview also cancels its finite opacity cue. No data, text, native frame shape or layout moves. Settings provides a live selected-theme effects stage and localized Preview action.

[Actual interface recording](../../verification/local29-interface-effects.gif), [material closeups](../../verification/local29-graphical-effects.gif) and [browser checks](../../verification/local29-vfx-browser.json) use synthetic data. The latter cover all twenty materials, desktop/narrow containment, stable refreshes, pause gates and Preview interruption. [Layout comparisons](../../verification/local29-layout-browser.json) and [Settings comparisons](../../verification/local29-settings-browser.json) preserve Default geometry. Local only; no publication.

### Whole-tool motion — local.28, 24 October 2026

The motion layer now responds across all nine pages: pointer navigation enters the inner content well, dialogs enter as one connected frame, disclosures reveal their bodies, and changed sorting/filtering/paging receives finite feedback. Controls have restrained pointer hover/press response. Percentage rails reveal once when first visible. Delayed list updates keep one bounded interaction intent until actual content changes, then consume it; unchanged polling does not replay an entry. Keyboard navigation, reduced motion, forced colours and hidden windows stay immediate. Explicit **Preview animations** in Settings can replay nearby surfaces without changing values, focus, settings or navigation.

`ui-motion.js`/`.css` own behavior and paint; `appearance.js` adds the localized preview action. The actual-app [animated sample](../../verification/local28-tool-motion.gif) uses synthetic data. [Flow checks](../../verification/local28-tool-motion-browser.json) cover all pages, delayed sorting, filtering, paging, dialogs, disclosures, themes, preview, polling and accessibility gating at desktop and narrow widths. Static theme-layout checks run in reduced-motion mode to compare settled positions separately from intentional entry transforms.

### Surface polish and finite feedback — local.27, 24 October 2026

`theme-polish.css` quietens repeated header lighting and fades native sidebar scenery on all four edges. `ui-motion.js`/`.css` add decorative rails only for known 0–100 percentages, 200ms feedback when a value changes, and the existing 160ms pointer-light timing. Numeric ratings have change feedback rather than an invented maximum. Unchanged polling, first readings, keyboard interaction, hidden windows and reduced-motion settings remain still. Forced colours hide the decoration. The existing layout and native frame artwork are preserved.

The authored Zerg field now uses irregular membranes and branching veins instead of a regular grid. `Build-ThemeIdentity.cjs` owns that surface; it remains new companion artwork, not an SC2 export. [Art preservation](../../verification/local27-theme-art-preservation.json) compares 947 prior theme images/vectors: only `zerg-identity-field.svg` changed. All twenty actual-interface preview images were refreshed and recorded in `preview-sources.json`.

### Interface previews — local.25, 23 October 2026

`wwwroot/themes/previews/` contains twenty WebP captures of the actual companion profile interface, including Default and Fenix. Each uses the same synthetic `LocalPreviewFixture.cjs` data and 1000px viewport; no live accounts or user screenshots are captured. Uniform resizing preserves the original aspect ratio. `preview-sources.json` records dimensions, file sizes and SHA-256 hashes. These are composed interface captures containing the existing theme artwork, rather than new game exports. The images are bundled for offline use.

Regenerate after changing theme art: set `DSC_THEME_PREVIEW_CAPTURE=1`, `DSC_SKIN_REVIEW_WIDTHS=1000`, and `DSC_SKIN_REVIEW_SCOPE=outer-frames`, then run the guarded `SharedSkinReview` stage. Clear the capture flag for ordinary verification. The picker uses `theme-previews.css` to prevent active-theme border art from covering another theme's screenshot.

### Race and character identities — local.23, 23 October 2026

`identity-sources.json` separates 36 newly authored SVG frame/surface assets from 15 original SC2 PNGs. Native commander scenery comes from the SC2 co-op detail screens; the Tal'darim crystal, Simulant reactor ring and Arcade joystick components come from their own console flavour textures. Originals under `identity-native/` are copied byte-for-byte to runtime files with `identity-native-` names. The generator embeds the two small original corner fittings without recolouring them. Source URLs, image dimensions and SHA-256 hashes are recorded per asset. Scenery is a material reference and atmospheric layer; no claim is made that every co-op background belonged to the original console skin.

`verification/Build-ThemeIdentity.cjs` draws eighteen distinct connected information bezels and etched fields using race-specific contours and lighting, including lobed evolution tissue and segmented matte primal bone. These are new companion artwork, not game exports. All four rails and the viewing-well transparency are checked in `verification/local23-identity-assets.json`. Original outer SC2 art and approved Fenix assets remain unchanged (`verification/local23-preserved-art.json`). No full console is shrunk into a heading or stretched across an information panel. The new CSS preserves Default geometry, masks scenery edges, reserves sidebar clearance and removes decoration in forced colours.

### Remaining theme interiors — local.21, 23 October 2026

`theme-interiors.css` reuses each theme's unchanged `<id>-console-panel-frame.png` and `<id>-console-header-band.png` from `native-skin-frame-tokens.css`. Complete native family turns and rails receive smaller paint scales and recessed lighting; source pixels are not regenerated, recoloured or replaced. Primary wells use 20px slices, subordinate wells 16px, with original 16px source cuts. Outer sculpture, navigation housing and accepted Fenix art remain unchanged. CSS etching, scanlines and organic contour patterns are new procedural application paint, separately tuned per theme. They are not claimed as native textures. Abathur/Evolved and Dehaka/Primal share the same original helper, and Classic controls retain their race family artwork; the distinct console perimeters and colour treatments remain. All 903 existing theme-art/Fenix/layout assets checked against local.20 retain identical SHA-256 hashes (`verification/local21-preserved-art.json`).

### Recessed Purifier information wells — local.20, 23 October 2026

`wwwroot/themes/fenix-inset-frame.svg` is newly authored vector UI artwork, not an SC2 export. Its transparent centre and complete 16px corner slices form a connected chamfered bezel; the dark upper lip and lower reflected edge distinguish recessed data panels from the raised outer housing. `purifier-atmosphere.css` uses 18px paint for main wells and 14px for secondary information, without changing layout. Original SC2 textures and the approved authored outer frame are unchanged.

### Purifier matrix and projection refinement — local.17, 23 October 2026

`wwwroot/themes/fenix-matrix.svg` now uses finer tessellation, sparse conductor paths, nodes and a vertical fade. New authored `fenix-circuit-light.svg` lines up with those paths for subtle hover/focus light; `fenix-projector.svg` supplies segmented rings and a projected base beneath the unchanged original Purifier sigil. These are code-native SVG artwork, not original SC2 textures. `purifier-atmosphere.css` controls their composition, readable dark fields and accessibility variants. The local.16 outer frame and original badge/socket textures remain unchanged.

### Level Purifier rail — local.16, 23 October 2026

`authored-fenix-frame-v2.png` is a targeted built-in image-generation edit of v1 using `console-fenix.png` as the material reference. It replaces long raised shoulders with compact connected corners, one integrated amber iris and a level energy-channel rail. The complete source is imported uniformly through the existing nine-slice pipeline. It remains authored artwork, not an original SC2 export. The sibling prompt and provenance files record this edit; v1 is retained. `fenix-purifier-badge.png` and `fenix-command-glow.png` are byte-identical runtime copies of the native story-mode category icon and Fenix co-op button hover. Their source hashes remain in `purifier-holographic-sources.json`. No hover-sprite fill covers a portrait; the new badge is limited to headers wide enough to have clear space. See README's local.16 milestone for acceptance evidence.

### Purifier holographic surfaces — local.15, 23 October 2026

`purifier-holographic-sources.json` records six original SC2 Fenix co-op and Purifier story-mode textures with archive URLs, dimensions and SHA-256. The runtime `fenix-energy-gradient.png` and `fenix-purifier-sigil.png` are byte-identical copies of the co-op gradient and complete story-mode hover projection. `wwwroot/themes/fenix-matrix.svg` is newly authored vector geometry based on the native amber honeycomb/circuit language; it is not an original SC2 texture. `purifier-atmosphere.css` combines these with recessed glass, faint static scanlines and hover edge-light. The accepted local.14 frame and all layout geometry remain unchanged. The sigil appears only in clear desktop sidebar space; forced colours removes the imagery, and reduced motion removes the hover transition. See the current README milestone for rendered and packaged checks. Local only.

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

The user's gold armour, emerald gems and violet controls identify the Nerazim Protoss in-game console, rather than the default blue Protoss menu atlas. `Fetch-HudComponents.cjs` now retains its original console render, eighteen native control states/textures and the unit-info rail. Current `hud-sources.json` contains 308 original resources across sixteen native control families and nineteen console renders; `nerazim-console-sources.json` records the twenty sources owning this variant.

Protoss now uses `defaultprotoss`; Nerazim is a separate saved option, as are Alarak/Tal’darim and the other catalogued native families. `Build-HudComponents.cjs` invokes `Build-NerazimConsole.cjs`, `Build-NativeConsoles.cjs` and `Build-HudFields.cjs` after the common assets. Two separately masked shoulders preserve the real sculpted silhouette and jewels. Only the plain centre rail stretches; a small overlap hides transparent shoulder tails. The body frame omits the old rectangular top edge, and casing masks remove actual game-command icons and empty minimap/portrait wells. Dedicated native violet control states, gemmed field casings, portrait borders and gold unit-info dividers carry the identity through the interior. The live title and commands stay below the decorative band. No fake game controls, runtime downloads or new animation are added. All live data and semantic colours remain independent.
## Local reconstructed controls — 23 October 2026

`wwwroot/native-console-catalog.json` owns nineteen skin IDs and their original family/render assignments; Default remains the twentieth choice. The generated JavaScript catalog is bundled offline. Matching native menu/command states and attached shoulder silhouettes preserve their authored proportions. The outer shell intentionally omits its rectangular top rail, which otherwise shows through the shaped header. Straight rail samples alone repeat between fixed caps; native information wells and square portrait slots remain separate roles.

`Build-HudFields.cjs` assembles the chat atlas’s upper and lower caps into edge-only frames. The atlas interior never scales behind text. Eleven-pixel painted corners, repeating plain edges and reserved text insets support arbitrary input width and textarea height. Toolbars use a dark work surface rather than enlarged chat art. Semantic rating, membership and result colours stay independent. All assets are local; no runtime game-archive extraction is needed. This draft is not published: the owner requires an explicit instruction before pushing.

`Rasterize-HudAssets.cjs` bakes 114 native shell/shoulder/rail/well assemblies and nineteen field frames into 133 PNGs offline, preserving their colours and alpha. All nineteen skins, including Classic, use this assembly. Nineteen additional preview PNGs show the complete original console. The generated runtime tokens use PNGs; source SVG assemblies remain editable. This avoids repeatedly rendering embedded SVG source images in the browser. The full `Build-HudComponents.cjs` pipeline awaits native generation and runs the raster step last; run that step after invoking a lower-level generator directly.

Frame-join correction: outer shells now continue the console's outside walls and use full 32×32 lower-turn samples at their native proportions. The unit-info well is not a substitute for those outside turns. Chat top rails use the same top-band coordinates as the jeweled caps; lower rails/caps use the atlas's separate lower assembly. The earlier unrelated long-strip samples shifted the rail baseline and visibly broke the joins. Native sidebar decoration is owned by the current bank/menu rules; the obsolete whole-sidebar pseudo-element frame is disabled.

Complete-source correction: `verification/native-console-layouts.json` records each skin's inner-well cut boundaries and the Terran/Nova casing contour that excludes light-volume proxies. Exterior silhouettes remain original source pixels. Left and right header intervals now cover all 992 source columns and meet at a quiet rail; the old 340–600 gap lost complete crests and cut fangs. Classic Zerg uses its own quiet split. `Test-NativeFrameAssets.cjs` verifies contiguous coverage, retained source apexes and exact native helper-frame source identity. Closed information panels use each family's actual helper-button frame, rather than perspective armour corners. Profile contents share that single well. Settings uses a separate complete menu perimeter and full-console option previews.

### Native shell backing and utility chrome — 23 October 2026

Each header shoulder now contains a panel-coloured backing traced from the rendered native alpha, after the existing interior/proxy exclusions. The first opaque source pixel in each column starts the backing; it continues to the lower page join, while the exterior above it stays transparent. Original artwork is composited above the backing unchanged. The centre rail comes from the same backed quiet slice. The page heading holds that exact colour for its first 20 pixels before fading into the content well, matching the lower join at both header sizes.

`native-chrome.css` carries the skin through the application gutter, full sidebar material, matching closed utility dock and status strip. No extra illustration is stretched across the window. `DashboardCaptionPalette.cs` reads the embedded canonical catalog for the Windows caption, blending 18% accent into its surface so the native draggable bar remains distinct. Classic palettes match the generator defaults. Startup and successful appearance saves update the caption; high contrast restores Windows ownership. No frameless window, custom hit testing or WebView native command bridge is introduced.

### Border-only refinement — 23 October 2026

The owner requires the original sidebar and main UI layout. `frame-trim.css` changes decorative paint only: matching native perimeters, navigation-rack trim and a quiet heading seam. Native outer walls now sample24 source pixels into32 atlas pixels, matching the header's source scale when painted at8px. Header exclusions retain the original outer wall legs through source y256 so they reach those body rails. Fenix co-op filigree uses its entire35x63 upper and85x48 lower corners with uniform scale, joined by plain rail samples. No control/navigation rearrangement, tiled control-strip material or extra inner panel rectangle ships. `Test-FrameTrim.cjs` compares exact DOM geometry with the trim enabled and disabled across20 choices and desktop/compact widths.

### Substantial in-game faction frames — 23 October 2026

The primary panel treatment now supersedes the fine trim above. `ingame-frame-sources.json` records25 original assets and their URLs/hashes. `Build-GameFrames.cjs` uses the large native Protoss, Terran and Zerg panel corners and connecting rails, preserving whole corner silhouettes, uniform proportions and source alpha. Hidden RGB lightmaps in transparent pixels are not black-keyed or made opaque. Quiet interior cross-sections connect behind the corner pieces; Zerg walls repeat full-width rows256–259, excluding the tapered strip ends. Generated1024px atlases have320px corner bands and a transparent content well.

Nineteen offline frame PNGs and `game-frame-tokens.css` share three authored race geometries. Core race and Classic choices retain original frame RGB/alpha; related skins adapt energy and selected casing materials to their native controls. These are documented companion adaptations, not nineteen exclusive original corner sets. Nerazim uses jade energy with gold casing; its violet controls are separate. Fenix uses ivory/amber, with its co-op filigree retained for small details. The existing single-column navigation, content composition and compact spacing do not move. Fields, short controls and semantic data colours retain their separate roles.

### Native section details and registered joins — 23 October 2026

`Build-ThemeDetails.cjs` adds nineteen original skin-specific ornaments: Purifier co-op/faction detail, Tal'darim faction underline, five own-family unitinfo bands and twelve complete native console upper trims. Each mapping is recorded in `verification/theme-detail-assets.json`; `theme-detail-sources.json` records thirteen original PNGs and exact provenance, including eight newly fetched sources. The remaining complete console sources retain their existing manifests. These ornaments retain native RGB/alpha and uniform proportions; no recoloured fallback is used. Runtime CSS uses contain in reserved heading lips, outside live text. The entire original composition remains intact, with native information-well rims for inner groups and stronger race armour reserved for the outer console.

`Build-GameFrames.cjs` now registers each quiet rail's material width and position against both complete corner endpoints. A bounded endpoint search rejects nearly transparent decorative tails instead of treating their RGB as solid material. Outer side corridors exclude disconnected lower lips. Whole corners remain intact; only quiet rail cross-sections align between endpoints. The offline HUD build invokes both generators after native rasterization. Guarded stages can regenerate them separately without rebuilding unrelated artwork.

### Current own-skin rims and Default layout — 23 October 2026

This supersedes the shared race-frame and miniature section-ornament treatments above. `Build-NativeSkinFrames.cjs` uses each skin's own original console render for outside walls, complete lower feet and a closed minimap-front bezel. Original complete upper contour/backing assemblies stay on the main shell. Quiet rails extend between fixed-proportion artwork. The 114 new PNGs have exact source-region, alpha/RGBA and provenance hashes in `verification/native-skin-frame-assets.json`; all six Zerg bezel silhouettes differ. No colour adaptation or common race-frame fallback is used by this assembly.

Panel atlases are 128 px with 32 px source corners and a transparent well. An 18 px paint reservation yields approximately 5–6 px of visible native front rim. Absolute overlays keep heading fills from covering the turns without enlarging Default's boxes. Native menu/field state textures keep their separate roles. Detached heading strips and paired Purifier brackets are disabled. The old game-frame/detail token stylesheets are removed from runtime registration; their files remain as historical source assets.

The HUD pipeline now builds own-skin parts and regenerates the Default geometry stylesheet after native rasterization. `Test-SharedSkinLayout.cjs` compares rendered elements and text directly against Default across every category, rather than comparing one theme with decoration enabled/disabled. See `DESIGN.md` for the current contract and `README.md` for the verified local.7 milestone. Publication remains on hold.

### Connected substantial native frames — local.8, 23 October 2026

Superseded by the complete-frame correction below; the owner rejected the hybrid upper edge in local.9.

This supersedes the thin minimap-front atlases and masked lower-foot treatment above. `Build-ConnectedSkinFrames.cjs` preserves complete 16px corners from each native family's 92×62 helper frame and its actual adjoining edge intervals. The connected opaque-black viewing matte is removed; original RGB and outside alpha remain. Sections paint those corners at 26px, the main shell at 32px, giving approximately 6–10px visible native material. The shell's central top interval is omitted beneath the sculpted own-console crown; all four complete bezel corners survive.

The skin's original upper silhouette is masked with its existing per-console boundaries, then unused transparent padding is trimmed before uniform 34/24px display. Quiet middle source columns connect the complete left/right intervals. As of local.9, the crown retains native RGBA and clear cutouts rather than baking in interior backing that hides the structural bezel at upper joins. One shell/header gradient fills the surface below the artwork without an inset rectangular step. Existing padded headings use their own console's quiet information-well rail as an attached seam. Shared family bezels remain authentic game sharing, while nineteen distinct own-console crowns supply the visible variant identity. The severed lower reactor/foot motifs are no longer painted.

`Test-ConnectedSkinFrames.cjs` checks all 114 outputs, exact source corner RGB/outside alpha, transparent wells, source-only crown RGBA, crown/rail column identity and six distinct Zerg silhouettes. See `DESIGN.md` and the local.9 README milestone for current acceptance and stable screenshots. Work remains unpublished.

### Complete native perimeter — local.10, 23 October 2026

The raw `console-<id>.png` previews are screen-edge artwork with clipped exterior terminations and manually excluded game controls. They cannot supply closed exterior frame corners. The prior crown-over-bezel combination also retained orphaned helper corner arms after deleting the helper's top interval. These caused the stepped and cut-off upper edge despite exact Default layout measurements.

The outer perimeter now uses each skin family's complete original `ui_console_helperbutton_background_<family>.png`, 92×62, with all four 16px corners and entire adjoining rails kept together. Main paint remains 32px; sections use 26px. Only the connected viewing-well matte is cleared; RGB, painted alpha and outside shadows remain native. Open-ended crown outputs and runtime layers are removed. The menu-atlas alternative was rejected: x154 clips Fenix rim pixels at x153, adjacent frames contaminate wider crops, and Arcade's panel is transparent.

The generator records 57 current outputs. Source checks verify complete regions, all four painted intervals, exact native material and absent crown fragments. Shared Evolved/Primal and Classic frame assets remain genuine game sharing; exclusive geometry is not claimed. Variant controls, materials and own-console information seams remain. See `DESIGN.md` and the local.10 README milestone for verification and screenshots; work stays unpublished.

### Restored own-console artwork — local.11, 23 October 2026

The owner rejected the generic outer helper frame in local.10. `Compose-ConsolePerimeter.cjs` now reconstructs a closed perimeter from each original console's information-well turn. The opposite turns are reflections of that same source, and straight profiles come from the corner's actual adjacent pixels. Original dark casing is preserved; only exact-black viewing matte is cleared. There are nineteen distinct outer atlases, including all six Zerg variants. This is native-pixel reconstruction, not a claim that the collection previews contain complete exterior frames.

The Purifier iris's intact left half is reflected to close the source-clipped housing and seated over its own casing. Lower turns are reflected upper turns, avoiding the cut preview bottom. The generator records regions, masks, reflections, source hashes and generated hashes. Small control frames retain their native family artwork. Classic navigation/action states now use native race-matched control textures rather than a cropped bank of command slots. See the current DESIGN and README acceptance evidence. Local only.

### Original Purifier shoulders — local.12, 23 October 2026

The owner rejected local.11's Fenix silhouette. `Compose-PurifierFrame.cjs` now keeps the original asymmetric shoulders from `console-fenix.png`, region `[112,106,880,118]`, including the one iris in its original right housing. The iris is neither extracted nor reflected. Complete caps and bottom turns from `ui_console_chatbar_background_purifier.png` finish the open ends; quiet native rail intervals join them. The backing follows the assembled contour instead of stopping at an inset rectangle. The masks preserve the full left rail thickness and exclude the unrelated descending fragment on the right. Source and fitting hashes, slices and adaptation notes are recorded in `verification/native-skin-frame-assets.json`.

The 758×192 atlas uses independent top/right/bottom/left slices of 128/464/48/278 and renders at 0.5 desktop or 0.32 compact. Original shoulders retain their proportions; only straight rails extend. The eighteen other theme asset sets and all smaller native family frames are unchanged. See DESIGN and the local.12 README milestone for source checks, actual rendered screenshots, Default layout comparisons and packaged evidence. Local only.

### Curved shoulder connections — local.13, 23 October 2026

Local.12 still retained square game-control recesses under the shoulder artwork. `Compose-PurifierFrame.cjs` now replaces those inner boundaries with smooth monotone contours. A ten-pixel bevel cross-section from the console's quiet rail follows each curve, joining the centre rail without a downward square notch. The upper armour, single iris, external end fittings and lower frame remain. This deliberately adapts native material to the application's frame; the original game well geometry is unsuitable here. Asset checks now reject abrupt inner-edge jumps on either shoulder. See the local.13 README milestone for rendered closeups and package evidence. Other eighteen theme asset sets remain unchanged; local only.

### Purpose-drawn Purifier frame — local.14, 23 October 2026

The owner authorized drawing new matching elements after rejecting the assembled joins. `authored-fenix-frame-v1.png` is a complete frame drawn using built-in image generation, with the native Purifier console as material/style reference. It is authored artwork, not an original Blizzard export. [Generation prompts](authored-fenix-frame-v1.prompt.txt) and [provenance](authored-fenix-frame-v1.provenance.json) record the inputs and accepted output. A final edge-cleanup generation retained the frame composition. Near-zero alpha pixels in the source are composited correctly in the actual browser render; no chromatic matte is painted around the in-app frame.

`Compose-AuthoredPurifierFrame.cjs` uniformly imports source region `[15,107,2142,506]` to a 758×179 atlas. Independent slices are 128/256/36/200 (top/right/bottom/left). Common quiet rail profiles meet exactly at all slice boundaries, while the complete shoulders, iris and corner returns keep their proportions. Matching surface highlights and recesses were drawn together, avoiding independent caps and game-control wells. The earlier `Compose-PurifierFrame.cjs` is historical and is no longer selected by the generator. Smaller native family frames and the eighteen other skin asset sets remain unchanged. Local only; see README for current evidence.


### Local.39 complete focal fields — rejected

Retired by the owner in local.40. The physical equipment-kit assets were rejected, not only their placement. Generated scenes/runtime are archived under rejected-local39 and excluded from wwwroot. Do not reactivate this direction.

verification/Build-FocalScenes39.cjs recomposes the existing equipment35/imported physical kits into seventeen tall sidebar bays and eighteen wide Settings scenes. Arcade uses original SC2 joystick ball/stick/base artwork for its Settings scene; its existing sidebar animation is preserved. Fenix retains its approved original field/runtime. Catalog source hashes distinguish the image-generated SC2-referenced companion kits from original native scenery. These are authored companion scenes, not extracted SC2 animation clips.

wwwroot/themes/focal39/catalog.json records source provenance, exact loop checks, stationary pixels outside each natural aperture, poster/base/atlas hashes and dimensions. Each scene has144 frames over six seconds; only the active theme is decoded. The generator feathers environment edges before drawing the intact housing, and clears the animated crop from the fixed base so transparent pixels are not composited twice. Run generation, browser checks and captures through the existing resource guard’s Focal39 stages. Actual UI captures and loops live in verification/local39-hover-scenes/. No publication is authorized.

### Native casing motion — local.46, 25 October 2026

`wwwroot/themes/race46/catalog.json` records exact source hashes and authored adaptations. `Build-RaceEffects46.cjs` keys one native WarpLine4 optical flare for Protoss border channels, uses native Glow_Red1 for small Terran casing lamps, and combines native Zerg shell/well alpha with native creep colour/height for three subtle tissue phases. These are source-derived presentation effects, not exported engine animations. `race-effects.js/.css` confines them to outer shell/navigation/utility casings and Settings; information text backgrounds stay quiet. Original frame geometry, accessibility gates and Default layout are retained. Browser evidence lives in `verification/local46-native-ui/report.json`.

### Protoss power optics — local.47, 25 October 2026

The edge-orbit channels are retired. `Build-Protoss47.cjs` creates six source-registered blue-inlay masks from the current native shell/composed native well, plus a 160-frame power-field/warp atlas from PylonRadius1D, Shockwave_BlackRing1 and Glow_Blue2. `themes/protoss47/catalog.json` records exact source hashes and labels the charge/warp timing as authored presentation. RGB/alpha handling follows each layer's intended optical role; this is not a game-engine capture. The native Pylon model/texture/Stand/controller atlas remains unchanged. The runtime attaches the field to the Pylon's ground ellipse, keeps reading surfaces clear and introduces no Default geometry changes. Browser evidence and full-cycle UI recording live in `verification/local47-protoss/`.

### Campaign assemblies — local.48, 25 October 2026

`campaign48/README.md` owns the visual reference breakdown, exact native source roles and authored adaptations. Shipped `wwwroot/themes/campaign48/` holds the Hyperion map station and Leviathan nest, packed from 2× renders. `campaign-interiors.js/.css` places one assembly against the existing utility casing and supplies the Settings preview. Native source tracks animate the projection, LCDs, egg and floor tissue; backgrounds behind data remain quiet. Protoss Pylon/grid/warp and Fenix remain intact. The separate articulating Artanis core remains a rendered study rather than an automatic Pylon replacement. Actual UI/lifecycle evidence is in `verification/local48-campaign-ui/`, while each render's provenance and evaluated-skin checks live in `verification/local48-campaign/<device>/render.json`.

### Hyperion authored casing — local.49, 25 October 2026

`hyperion49/DIRECTION.md` owns the complete Terran material hierarchy. `PROMPTS.md` records exact built-in image generation prompts and lineage; the three adjacent PNGs preserve the authored originals. They are companion artwork using the native Hyperion bridge as a material reference, not exported game frames. `Build-Hyperion49.cjs` crops only transparent margins and losslessly packs hull/well/control WebP textures, preserving complete corners and extending quiet rails. The corner-lamp overlay derives from actual amber source pixels, so no sticker gadgets are repeated around panels. `wwwroot/themes/hyperion49/catalog.json` records source and crop hashes/slices. The new skin covers all Terran categories and dialogs while preserving Default positions and the native station. Nineteen other thumbnail captures and all other skins are preserved. Acceptance and actual screenshots: `verification/local49-hyperion/`; package: `verification/local49-package-assets.json`.

### Correction after local.49 — native equipment, local.50

The owner rejected the replacement Hyperion casing and keycaps. They are archived in `hyperion49/rejected-web/` and removed from production. Preserve previous SC2 frame/control art. `campaign48/README.md` now owns the original Armory console/native screen video addition. `wwwroot/themes/terran50/` contains its alpha-bounded native reconstruction atlas and source hashes. The existing holomap remains unchanged. Actual interface animation and five layout/lifecycle cases are in `verification/local50-terran/`. Do not treat the historical local.49 finish review as owner acceptance.

### Native equipment integration and optics — local.51

`equipment51/README.md` owns source-registered bloom/sheens and provenance. Four half-resolution optical atlases are derived from exact existing native equipment renders, with one shared pose transform per source. Working intensity follows actual replay analysis; ambient native loops remain continuous. Terran equipment is grouped by one layout helper, and preview-only duplicate casings are suppressed where they crossed source models. Original buttons, main frame art and Default positions remain unchanged. Eight geometry/work/lifecycle cases, fixed-pose optical differences and failed-request checks live in `verification/local51-equipment/`. Vents, cryotube and bridge candidates were inspected, but static/unsupported material families were not shipped as partial substitutes.

Local.52: console52/ owns newly generated architectural support for the three base races. This is companion artwork rather than native SC2 export. Existing native equipment, controls and frame art remain intact; no generated image enters information panels. Source/output hashes and layout provenance are in wwwroot/themes/console52/catalog.json.
