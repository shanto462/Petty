# Third-party notices

Petty is an independent browser port of **Bit Therapy** (formerly "Desktop Pets"), a macOS app by Federico Curzel. Petty is not affiliated with or endorsed by its author.

Bit Therapy is distributed under two different licenses: one for code and one for assets. The same split applies here.

## Code

Petty's JavaScript reimplements behavior from the Bit Therapy source code, which is:

> MIT License, Copyright (c) 2022 Federico Curzel

That copyright notice is kept in [LICENSE](LICENSE), which covers all source code in this repository.

## Pixel art (not MIT)

Most sprite images in [`src/assets/sprites/`](src/assets/sprites/) are © Federico Curzel and the Bit Therapy contributors. They are **not** covered by this repository's MIT License.

**Switched off until permission is granted.** Their species are marked `"source": "bit-therapy"` in [`species/`](species/), and `DISABLED_SOURCES` in [`scripts/lib/catalog.mjs`](scripts/lib/catalog.mjs) keeps them out of the catalog and out of the build, so the extension neither shows nor ships them. The UFO random event uses a Bit Therapy sprite too and is switched off in `RANDOM_EVENTS` (`src/shared/config.js`); the storm cloud event uses Petty's own cloud instead of Bit Therapy's.

The Bit Therapy asset license allows uses such as commentary and non-commercial media, but it does not allow including the assets in an application or other software without the author's explicit permission. All rights not explicitly granted are reserved by the author.

> **Permission status:** pending. The maintainer is asking the author for written permission to include the sprites in Petty. Replace this line with the date and form of the permission once it is granted.

**Petty's own art:** the birds, heron, trees, ponds and storm cloud (`sparrow`, `robin`, `bluebird`, `kingfisher`, `heron`, `tree_oak`, `tree_cherry`, `pond`, `pond_koi`, `pond_marsh`, `pond_oasis` and `effect_*` frames such as the storm cloud, the jumping fish and the mermaid, and the toolbar icons in `src/icons/`) are original Petty art, drawn by the code in [`scripts/sprites/`](scripts/sprites/). They are not from Bit Therapy and are covered by the MIT License in [LICENSE](LICENSE).

If you fork Petty or reuse its code, do not redistribute the Bit Therapy sprites unless you have your own permission from the author. You can replace them with your own art; see "Adding a pet" in the [README](README.md).

## Characters and trademarks

Some of the switched-off Bit Therapy pets are inspired by internet memes or by characters owned by others (for example Nyan Cat, Grumpy Cat, and the Cromulons from Rick and Morty). All names, characters and trademarks belong to their respective owners. Their appearance here does not imply any affiliation or endorsement.
