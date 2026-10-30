/**
 * Clerk keeps `__client_uat` (or `__client_uat_<suffix>`) on our domain: "0" or missing when
 * nobody is signed in on this browser. Read once, before Clerk has loaded.
 */
export function hasClerkSessionCookie(cookie = document.cookie): boolean {
  return cookie
    .split(';')
    .map((part) => part.trim().split('='))
    .some(([name, value]) => /^__client_uat(_.+)?$/.test(name) && value !== undefined && value !== '0' && value !== '')
}
