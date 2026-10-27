# REJECTED by owner — 26 October 2026

Removed from production and archived in rejected-web/. Do not restore these generated surrounds. Prior native borders are authoritative.

# Architectural support, local.52

The three base-race environments are new image-generated companion artwork in the SC2 campaign style, not extracted SC2 architecture or rendered native models. Terran uses weathered bulkheads and recessed conduits; Protoss uses sculpted gold/ivory architecture and blue inlays; Zerg uses chitin, wet tissue and an incubation cavity. Original PNGs are retained here. `wwwroot/themes/console52/catalog.json` records source/output SHA-256 and the fixed nine-slice sections. `verification/Build-Console52.cjs` reproduces the compressed assets from these local sources.

The single environment supplies the unused sidebar equipment recess and exterior structural surround. Existing native control states, frame sculptures, campaign equipment atlases and Default layout stay intact. Only straight spans extend; corner sections retain their shared aspect ratio. No image is repeated in information cards or used behind text. Default, Fenix and character-specific skins are excluded; do not spread these base-race images across all character themes.

`console-environment.js/.css` owns inert, pointer-transparent absolute paint. ResizeObserver measures only the existing recess between navigation and utility controls. Omit the bay below 145px and all new artwork at mobile widths or forced colours. Supporting architecture is static; existing intrinsic game-object animation retains its prior lifecycle behavior.

Acceptance evidence is under `verification/local52-composition/`. This is a composition milestone for three base races, not completion of all twenty themes. The next bounded step is a distinct character-specific environment with its own source/reference evidence, after the owner reviews this direction. Local work authorized; Git publication remains unauthorized.
