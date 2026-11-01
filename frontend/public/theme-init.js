// Apply the saved theme before first paint (src/shared/theme/theme.ts owns it after that).
// A file, not an inline script, so the Content-Security-Policy needs no 'unsafe-inline' or hash.
try {
  var t = localStorage.getItem('umless-theme')
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
} catch (e) {}
