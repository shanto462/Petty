# Contributing to Petty

Thanks for your interest in Petty! Bug reports, ideas and pull requests are all welcome.

## Before you start

- **Bugs and ideas:** open an [issue](https://github.com/shanto462/Petty/issues/new/choose) first, so we can agree on the approach before you write code.
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Set up

You need [Node.js](https://nodejs.org/) 22 or newer.

```bash
git clone https://github.com/shanto462/Petty.git
cd Petty
npm ci
npx playwright install chromium
```

To try your changes, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `src/` folder. After each change, click the reload icon for Petty and refresh the page you are testing on.

## Making a change

1. Create a branch from `main`, for example `fix/drag-on-iframes`.
2. Make your change. Keep pull requests small and focused on one thing.
3. Add or update tests:
   - Logic that does not need a browser (physics, validation, catalog) goes in `test/unit/`.
   - Behavior you can only see in a real browser goes in `test/e2e/`.
4. Run the full check. CI runs the same thing:

   ```bash
   npm run check
   ```

5. Add a line to `CHANGELOG.md` under **Unreleased**.
6. Open a pull request and fill in the template.

## Code guidelines

- Formatting is handled by Prettier (`npm run format`) and linting by ESLint (`npm run lint`).
- Extension files are classic scripts, not ES modules. Files share globals in the order the manifest and `popup.html` load them; wrap new files in an IIFE like the existing ones.
- Content scripts run inside every web page. Build DOM nodes with `createElement` and `textContent`, never `innerHTML`, and validate anything you send to the service worker.
- Do not add remote code, analytics or network requests.
- Ask before adding a permission. Every permission changes what users see when they install Petty.
- Do not obfuscate code. Minified code is fine; obfuscated code is rejected by the Chrome Web Store.

## Adding or changing pets

See "Adding a pet" in the [README](README.md#adding-a-pet). After changing `species/` or the sprites, run `npm run generate` and commit the updated `src/shared/catalog.js`.

Only contribute art you made yourself, or art whose license allows its use in Petty. Say where the art comes from in your pull request. See [NOTICE.md](NOTICE.md) for the rules that apply to the existing sprites.

## Commit messages

Write short, clear messages in the imperative mood, for example `Fix pets falling through the taskbar on Windows`. Prefixes such as `fix:`, `feat:` or `docs:` are welcome but not required.

## License

By contributing, you agree that your code is released under the [MIT License](LICENSE).
