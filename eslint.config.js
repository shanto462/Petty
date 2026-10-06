import js from '@eslint/js';
import globals from 'globals';

// Extension files are classic scripts that share globals across files
// (the manifest and popup.html load them in order), not ES modules.
const extensionGlobals = {
  ChromeMessaging: 'readonly',
  CloudEvent: 'readonly',
  EphemeralEntity: 'readonly',
  Pet: 'readonly',
  PetManager: 'readonly',
  RandomEventScheduler: 'readonly',
  SpeciesManager: 'readonly',
  SpriteAnimator: 'readonly',
  UfoAbductionEvent: 'readonly',
};

export default [
  {
    ignores: ['dist/', 'node_modules/', 'test-results/', 'playwright-report/', 'coverage/'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
        ...globals.webextensions,
        ...extensionGlobals,
      },
    },
    rules: {
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Build DOM nodes instead; content scripts run inside untrusted pages.' },
        { property: 'outerHTML', message: 'Build DOM nodes instead; content scripts run inside untrusted pages.' },
      ],
    },
  },
  {
    files: ['**/*.mjs', 'eslint.config.js', 'playwright.config.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },
  {
    // Callbacks passed to page.evaluate / worker.evaluate run inside the browser
    files: ['test/e2e/**/*.mjs', 'scripts/screenshots.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser, ...globals.webextensions },
    },
  },
];
