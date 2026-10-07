# Changelog

All notable changes to Petty are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Birds that fly: sparrow, robin, bluebird and kingfisher. They cruise across the page, sit on trees, and hop and peck on the ground. Songbirds sing on a branch.
- Two trees (oak and cherry) with five perches each, and a pond with shimmering water and a fish.
- The kingfisher fishes when a pond is on the page: it hovers, dives, and carries its catch to a free branch to eat it.
- `npm run sprites` draws this new art in code (`scripts/sprites/`). It is Petty's own art and MIT licensed.

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
