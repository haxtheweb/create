---
name: hax-rpg-character
description: >
  Extend the rpg-character web component (haxtheweb/webcomponents,
  elements/rpg-character) with new pixel-art pieces: hats, masks, makeup,
  held items, off-hand items, feet, pets, outfit presets, expressions or poses.
  Use when someone asks to "add a hat / costume / job / pet / outfit to
  rpg-character", "draw a new rpg-character piece", "make an 8-bit X for the
  HAX avatar", "add a holiday look", or names `<rpg-character>`,
  `rpg-character-builder`, character codes, or the HAX user avatar, even if
  they don't say "skill". Covers drawing in the house style, the append-only
  character-code registry, labels in all locales, demo, tests, preview and PR.
version: 1.0.0
license: Apache-2.0
metadata:
  author: haxtheweb
  tags: [hax, webcomponents, rpg-character, pixel-art, svg, avatar, i18n]
  source: create
---

# Extend rpg-character

`rpg-character` is HAX's 8-bit avatar. Characters are stacked 113x142 SVG
layers, and every look can be saved as a short **character code**. This skill
adds new pieces without breaking a single saved code or changing anyone's
existing avatar.

Source: <https://github.com/haxtheweb/webcomponents/tree/master/elements/rpg-character>

Read these in the element before changing anything:

- `rpg-character.js`: the option lists (`hatList`, `maskList`, `makeupList`,
  `itemList`, `offhandList`, `feetList`, `petList`, `perchedPetList`,
  `costumeHats`) and `presets`, plus the render order.
- `lib/rpg-character-code.js`: the code registry (`codeSlots`).
- `lib/rpg-character-overlays.js`: expressions and poses (cell data, not files).
- `lib/rpg-character.haxProperties.json`: the English labels for every option.
- `README.md`, sections "Character codes" and "Adding art".
- The monorepo's `AGENTS.md`, for repo-wide rules such as no optional chaining
  and running precheck.

Two helper scripts ship with the element:

- [`scripts/pixel-art.py`](https://github.com/haxtheweb/webcomponents/blob/master/elements/rpg-character/scripts/pixel-art.py)
  draws pieces as character grids, adds the outline and writes SVGs.
  `--read` prints existing layers as ASCII.
- [`scripts/preview.mjs`](https://github.com/haxtheweb/webcomponents/blob/master/elements/rpg-character/scripts/preview.mjs)
  renders a contact sheet with the real element and fails on 404s.

## Rules that are never broken

1. **The registry is append-only.** A character code stores each choice as its
   index in `codeSlots`. Add a new option to the **end** of its slot's
   `values`, and add a new slot to the **end** of `codeSlots`. Never insert,
   reorder, rename or delete; a retired option keeps its place. Breaking this
   silently changes every saved avatar.
2. **New pieces are never seed-derived.** `traitsFromSeed` and the seed-driven
   lists (skin, hair, face, shirt 0-9, ...) stay as they are, so the avatar a
   username already gets never changes. New content is opt-in through an
   attribute, a preset, the builder or seasonal mode. Costume and holiday
   hats also go in `costumeHats`, so `hat="random"` doesn't pick them.
3. **Original stand-ins, not copies.** Art should make someone think "oh, that
   sorta looks like ...", never reproduce a trademarked character, mascot,
   logo, team mark or film costume. Use generic shapes and colors, with no
   wordmarks or brand names. Name options generically (`lion`, `theater`,
   `helmet`), not after the thing they evoke.
4. **No race or ethnicity features.** These are cartoons with intentionally
   fake skin tones. Don't add pieces that depict a real ethnicity, nationality
   costume or religious dress as a "look".
5. **Every option has a label in every locale.** The builder and the HAX
   editor read labels from the haxProperties locale files. An unlabeled option
   shows its raw value.

## The house style

- 22 columns x 28 rows of 5px cells; cell (col, row) sits at x = 3 + 5col,
  y = 2 + 5row. Draw on the grid only, with no anti-aliasing and no gradients.
- Flat fills, at most one highlight and one shade per color, and a 1-cell black
  (`#000`) outline around the silhouette. `pixel-art.py` adds the outline for
  you.
- Translucent fills (glass, water, ghosts) use an opacity, not a lighter color.
- Held items (`lib/item/`) sit in the right hand at about rows 21-22,
  cols 15-16. Draw around the hand and call `hand()` so it stays visible.
  Off-hand items (`lib/offhand/`) sit on the left at about rows 16-20,
  cols 1-6.
- Hats (`lib/hat/`) cover the top of the head, with the brim on about rows
  7-10. Masks (`lib/mask/`) cover the face and draw over the hair but under
  the hat. Makeup (`lib/makeup/`) is small face detail: lips, noses, beards,
  paint.
- Ground pets sit bottom-left by the feet (rows 20-27, cols 0-5). Perched pets
  sit on the left shoulder (rows 11-18, cols 0-4), and floating pets go
  top-left. A perched pet also goes in `perchedPetList`, which changes when it
  is drawn.
- A preset outfit is `lib/shirt/<name>.svg` plus `lib/pants/<name>.svg`.
  Start from `shirt/0.svg` / `pants/0.svg` as ASCII (`--read`) so the body
  silhouette matches exactly.

Always check a new piece against its neighbors:

```bash
cd elements/rpg-character
python3 scripts/pixel-art.py --read lib/base/0.svg lib/item/sword.svg lib/hat/pirate.svg
```

## Workflow

### 1. Set up

Work in a clone of <https://github.com/haxtheweb/webcomponents>, branched from
the latest `master`. Run `yarn install` at the root. All paths below are
relative to `elements/rpg-character`.

### 2. Decide where the piece goes

| You're adding                         | Art folder                                      | List in `rpg-character.js`     | `codeSlots` entry     |
| ------------------------------------- | ----------------------------------------------- | ------------------------------ | --------------------- |
| a hat or helmet                       | `lib/hat/`                                      | `hatList` (+ `costumeHats`)    | `hat`                 |
| a full-face mask                      | `lib/mask/`                                     | `maskList`                     | `mask`                |
| lipstick, a nose, a beard, face paint | `lib/makeup/`                                   | `makeupList`                   | `makeup`              |
| something held in the right hand      | `lib/item/`                                     | `itemList`                     | `item`                |
| something held in the left hand       | `lib/offhand/`                                  | `offhandList`                  | `offhand`             |
| skates, a board, footwear             | `lib/feet/`                                     | `feetList`                     | `feet`                |
| a pet                                 | `lib/pet/`                                      | `petList` (+ `perchedPetList`) | `pet`                 |
| a job, sport or costume outfit        | `lib/shirt/` + `lib/pants/`                     | `presets` (new key)            | `preset`              |
| an expression or a pose               | none (cells in `lib/rpg-character-overlays.js`) | derived from the overlays      | `expression` / `pose` |

A preset bundles an outfit with optional gear, for example
`pirate: { hat: "pirate", item: "sword" }`. Explicit attributes always win
over a preset's gear. If a preset needs a new hat or item, add that piece
first, as its own option.

### 3. Draw it

Use `pixel-art.py` as a library for a batch, or pass it a JSON spec:

```bash
python3 scripts/pixel-art.py my-pieces.json --lib lib --preview /tmp/preview.txt
```

The spec format and the `Grid` helpers (`rect`, `dot`, `span`, `paste`,
`hand`, `outline`) are documented at the top of the script. Read the ASCII
preview before looking at pixels; most mistakes (an off-by-one brim, a covered
hand) are obvious in it.

### 4. Register it

- Append the name to the end of its list in `rpg-character.js`, and to
  `costumeHats` or `perchedPetList` when that applies.
- Append the same name to the end of the matching slot's `values` in
  `lib/rpg-character-code.js`. This step is what makes it saveable.
- For a preset, add the key to `presets` and append it to the `preset` slot.

### 5. Label it everywhere

- Add the English label to the property's `options` in
  `lib/rpg-character.haxProperties.json`, in the same order as the list.
- Add the translated label to every `locales/rpg-character.haxProperties.*.json`
  (about 100 files). If a translation skill such as `hax-i18n-translate` is
  installed, use it. Otherwise write the translations and merge them by
  `property`.
- Check for collisions: two options must not share a label in any locale.
  Watch for words like ball, cap or hat that many languages translate
  identically.

### 6. Show and test it

- Add the piece to the matching gallery in `demo/index.html`, plus the
  `<option>` in any demo picker.
- Add a test to `test/rpg-character.test.js`. Assert that the layer renders
  (an SVG `<image>` in the shadow root whose `href` ends in your file), and that
  `encodeCharacter` / `decodeCharacter` round-trip the new value. Follow the
  "expanded wardrobe" and "character codes" blocks.
- Never change an existing expected code string in the tests. If one breaks,
  you broke rule 1.

### 7. Look at it in context

```bash
yarn start   # serves the monorepo on http://localhost:8000
node scripts/preview.mjs sheet.json /tmp/sheet.png --cols 6
```

Put the new piece in `sheet.json` with the combinations it will meet. For a hat,
include `pose: "cheer"` (raised hands draw over hats) and `shaved: true`. For
an item, include an off-hand item. For a pet, include a shield and skates. For a
mask, include a wide hat. Fix anything that clips, hides a hand or looks like a
copy of something real.

### 8. Verify and open the PR

From `elements/rpg-character`:

```bash
yarn test          # all suites pass
yarn run build     # regenerates custom-elements.json and docs
```

From the monorepo root, run `node scripts/precheck.mjs` and fix anything it
reports. Then open a PR against `master` that says which slots it touches,
includes the preview sheet, and confirms the registry changes are appends
only. Don't merge your own PR.

## Common mistakes

- A new option was inserted alphabetically into `codeSlots` instead of
  appended. Every code after it now decodes wrong.
- A new piece was made reachable from the seed, so existing users' avatars
  changed overnight.
- The art filename doesn't match the option value. `preview.mjs` catches this
  as a 404.
- A held item covers the hand, or an off-hand item sits under a ground pet.
- A label was added in English only, so the builder shows raw values in other
  languages.
- A costume hat was left out of `costumeHats`, so `hat="random"` hands people
  a Santa hat in July.
