# Blackwater asset pipeline

The physical kit is rendered offline by Blender and consumed as sprites. Player
colors, emblems, status rings, labels, paths, contacts, and effects remain
code-native so one art set serves all six seats and no secret state is baked into
public pixels.

From the project root:

```bash
blender --background --factory-startup \
  --python tools/blender/generate_assets.py -- \
  --output assets/generated/raw \
  --blend assets/source/blender/blackwater-kit.blend

npm --prefix tools/assets ci
npm --prefix tools/assets run build
npm --prefix tools/assets run verify
```

The build produces:

- `assets/generated/raw/`: 384px transparent Blender PNG masters;
- `assets/generated/sprites/`: independently addressable lossless WebP sprites;
- `assets/generated/atlas/`: 2048px lossless WebP atlas pages;
- `assets/generated/water/`: deterministic TV, phone, and flow textures;
- `assets/generated/manifest.json`: frame, pivot, trim, hash, and budget metadata;
- `assets/generated/contact-sheet.webp`: integrated visual inspection sheet.

`generate_assets.py` is the authoritative model source. The generated `.blend`
file is an inspectable catalog, not a hand-edited dependency.
