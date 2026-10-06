// Theme - Applies the saved Light / Auto / Dark choice before the popup paints.
// Loaded in <head> so there is no flash of the wrong theme.

(function () {
  const STORAGE_KEY = 'petty-theme';
  const CHOICES = ['light', 'auto', 'dark'];
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function read() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return CHOICES.includes(saved) ? saved : 'auto';
    } catch {
      return 'auto'; // Storage can be unavailable; fall back to the system setting
    }
  }

  function apply(choice) {
    const resolved = choice === 'auto' ? (systemDark.matches ? 'dark' : 'light') : choice;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = choice;
  }

  function set(choice) {
    if (!CHOICES.includes(choice)) return;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Not saved, but still applied for this session
    }
    apply(choice);
  }

  apply(read());
  systemDark.addEventListener('change', () => apply(read()));

  window.PettyTheme = { CHOICES, get: read, set };
})();
