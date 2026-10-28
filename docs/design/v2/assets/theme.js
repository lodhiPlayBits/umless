// Light/dark toggle for the v2 design pages. The choice is saved per browser; with no choice it follows the system.
(function () {
  var KEY = 'umless-theme';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function system() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(mode) {
    root.setAttribute('data-theme', mode);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.dataset.mode = mode;
      button.setAttribute('aria-label', mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }

  // Runs in <head>, before first paint, so there is no flash of the wrong theme.
  apply(saved() === 'dark' || saved() === 'light' ? saved() : system());

  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-theme'));
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-theme-toggle]');
      if (!button) return;
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switch for this visit */ }
      apply(next);
    });
  });
})();
