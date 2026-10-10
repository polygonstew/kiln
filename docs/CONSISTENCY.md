# Keeping things on-model

The user's main requirement: once an actor, item or style exists, every later image of it must
read as the same thing (design, colours, proportions, art style). Speed matters less.

## 1. Style bible (game-wide)

`<asset folder>/kiln/style.json`, edited from the **Style** chip in the top bar (`style.js`).

- `words`: added to **every** prompt (Forge, poses, Scenes)
- `avoid`: added to every negative prompt
- `light`: light direction, also turned into prompt words
- `outline`, `hw`: defaults for Forge
- `palette`: optional master palette. Forge offers it as the "Style" palette mode, and Scenes and
  HUD pull colours from it
- `scale`: intended hero height in px (documented; not enforced yet)

## 2. Actor identity (per actor)

Stored on the actor (`actor.identity` in `kiln/actor-<name>.json`):

| Field | Meaning |
|---|---|
| `desc` (on actor) | what it is, in words |
| `ref` | reference image (data URL, ≤512 px, flattened on white). The generator redraws from it |
| `refW` | width of `ref`, so the scale can be converted for any source size |
| `scale` | sprite pixels per reference pixel |
| `figH` | figure height in px of the reference sprite |
| `refSprite` | the canonical sprite frame (data URL) |
| `seed` | seed of the reference (local engine) |

Set automatically when Forge makes a **New actor**, or from Animate → Identity → **Use this
frame as reference** (an upscaled card of the frame, so any drawn or sliced actor can be extended).

## 3. Locked generation (Forge "Making frames for X")

Animate → **Make more frames** sends the identity to Forge. Then:

- **Cloud:** reference image + "Redraw this exact … Keep the identical design, costume,
  proportions, colours, line weight and facing direction; only the pose or action changes."
  One request per pose. This is the most consistent option.
- **Local:** img2img from the reference with a *Freedom* (denoise) slider.
- Pixelize is **locked**: `lock: actor.pal` (exact palette), `scale = id.scale * id.refW / src.width`
  (the same pixel scale, so a crouch is shorter instead of blown up), anchor bottom. A wide pose
  grows the canvas instead of being squashed, and Animate offers to widen every frame.
- Checks shown in the bar: **height vs reference** and **colour match %** (palette-histogram
  similarity, warns below 60%) to flag off-model results before you add them.

## 4. Scenes

All layers go through one look (palette rules). With the cloud engine and "Match" on, a
described layer is generated with a composite of the layers behind it as a *style reference*.

## 5. Palette tools in Animate

- Double-click a palette swatch to recolour that colour in every frame (variants, swaps).
- "From frames" rebuilds the palette from the colours actually used.
- The palette counter warns when the actor goes over the hardware limit picked in "Check".
