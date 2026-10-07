# Changelog

All notable changes to Petty are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Petty now shows and ships only its own art. The Bit Therapy pets stay in the repository but are switched off until their author gives permission (see NOTICE.md), and so is the UFO random event, which uses a Bit Therapy sprite. The extension zip shrinks from 4.5 MB to under 1 MB.
- Birds glide down to a landing at a gentle angle instead of dropping straight down, and lean into their climbs and descents.

### Added

- Birds that fly: sparrow, robin, bluebird and kingfisher. They cruise across the page, sit on trees, and hop and peck on the ground. Songbirds sing on a branch.
- Two trees (oak and cherry) with five perches each, and a pond with shimmering water and a fish.
- The kingfisher fishes when a pond is on the page: it hovers, dives, and carries its catch to a free branch to eat it.
- A heron in a straw hat, twice the size of a normal pet. It walks, practices crane-style kung fu, wades into a pond to strike at fish and swallow a big carp, and sometimes flies through its own storm cloud with rain and lightning.
- Ponds are bigger and come in four kinds, each with its own shape and bank: a lily pond with a frog and a dragonfly, a kidney-shaped koi pond with a red bridge and a stone lantern, a wide reedy marsh with a log, and a desert oasis with a palm tree that birds can sit in.
- With several ponds on the page, fishing birds spread out over them and move between them.
- A new toolbar icon: the heron's head in its straw hat, on a round sky badge (16, 32, 48 and 128 px).
- The storm cloud random event is back with Petty's own animated cloud: now and then it follows one of your pets around for half a minute to a minute.
- `npm run sprites` draws this new art in code (`scripts/sprites/`). It is Petty's own art and MIT licensed.

### Fixed

- A bird could hang in the air in its flying animation when the window got smaller while it flew to a spot.
- A heron at the edge of a pond could strike at fish in the grass; it now faces the middle of the pond.
- A pet could show the wrong animation when it asked for two animations in a row and the first one finished loading last.

## [2.1.0] - 2026-10-07

First public release.

### Added

- Redesigned popup: compact layout, light, dark and auto themes, search combined with category chips, each pet listed once, walk animation on hover, keyboard support, and an inline "Clear all" confirmation.
- `npm run build` creates a minified, reproducible, store-ready zip on any OS.
- Unit tests, end-to-end tests that load the real extension in Chromium, CI, CodeQL, Dependabot, and a release workflow with signed build provenance.
- README, contributing guide, security policy, privacy policy and third-party notices.

### Changed

- Physics now runs in the visible tab on `requestAnimationFrame`. The service worker only stores the roster and last positions, so pets move at full speed whether or not the popup is open.
- Random events use `chrome.alarms` and run only in the active tab.
- Species data and sprite frame counts are compiled into one catalog at build time, so pages no longer fetch 43 JSON files.
- The extension is now named "Petty: Browser Pets" and the source lives in `src/`.
- Debug action bubbles above pets are off by default.

### Fixed

- Pets slowed down or froze when the popup was closed.
- The first message after the service worker woke up could be lost, so a page or the popup sometimes showed no pets.
- Pets could spawn below the visible window.
- Every page logged failed requests while Petty looked for sprite frames that do not exist.
- A random UFO event ran in every open tab and respawned one extra pet per tab.
- Pets froze in tabs that were open while the extension was reloaded or updated; they are now cleared instead.
- Pets without a drag animation no longer freeze on their last frame while dragged.

### Removed

- The `tabs` permission, which Petty did not need. Chrome no longer warns that Petty can read your browsing history.
- Code obfuscation from the build. The Chrome Web Store does not allow obfuscated code.

### Security

- All messages from web pages to the service worker are validated, and only known fields are accepted.
- No `innerHTML` in code that runs inside web pages.

[Unreleased]: https://github.com/shanto462/Petty/compare/v2.1.0...HEAD
[2.1.0]: https://github.com/shanto462/Petty/releases/tag/v2.1.0
