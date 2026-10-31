#!/usr/bin/env bash
# shellcheck disable=SC2015  # `check && pass || fail`: pass only echoes, so fail runs only on a failed check
# Public smoke test after a deploy, from outside the server: DNS, TLS, nginx, frontend, backend.
#   bash .github/scripts/smoke-test.sh https://umless.in
set -uo pipefail
url=${1:?usage: smoke-test.sh <https://host>}
url=${url%/}
host=${url#https://}
fails=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

# The backend may still be starting right after the deploy: wait up to a minute for health.
for _ in $(seq 12); do
    curl -fsS --max-time 10 "$url/api/health" 2>/dev/null | grep -q '"ok"' && break
    sleep 5
done

body=$(curl -fsS --max-time 15 "$url/" 2>/dev/null) && grep -q 'id="root"' <<<"$body" \
    && pass "home page serves the app" || fail "home page serves the app"

asset=$(grep -o '/assets/index-[^"]*\.js' <<<"${body:-}" | head -1)
bundle=$([ -n "$asset" ] && curl -fsS --max-time 15 "$url$asset" 2>/dev/null)
[ -n "$bundle" ] && pass "app bundle $asset loads" || fail "app bundle loads"
# Sign-in needs Clerk's production key baked into the bundle (a missing key still renders a page).
grep -q 'pk_live_' <<<"${bundle:-}" && pass "bundle has Clerk's production key" || fail "bundle has Clerk's production key"

curl -fsS --max-time 10 "$url/api/health" 2>/dev/null | grep -q '"ok"' \
    && pass "/api/health ok" || fail "/api/health ok"

# Sign-in is enforced and the API answers in its own error shape (proves nginx → backend).
for path in /api/questions /api/account /api/payments; do
    out=$(curl -sS --max-time 10 -w ' %{http_code}' "$url$path" 2>/dev/null)
    [[ "$out" == *'"code":"unauthorized"'*' 401' ]] && pass "$path needs sign-in (401)" || fail "$path needs sign-in (got: ${out: -60})"
done

loc=$(curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' "http://$host/")
[ "$loc" = "301 https://$host/" ] && pass "http → https" || fail "http → https (got: $loc)"
loc=$(curl -sS -o /dev/null --max-time 10 -w '%{http_code} %{redirect_url}' "https://www.$host/")
[ "$loc" = "301 https://$host/" ] && pass "www → bare domain" || fail "www → bare domain (got: $loc)"

curl -fsSI --max-time 10 "$url/" 2>/dev/null | grep -qi '^strict-transport-security:' \
    && pass "HSTS header" || fail "HSTS header"

# Certificate: curl already verified it; also warn early if renewal has stopped.
end=$(echo | openssl s_client -connect "$host:443" -servername "$host" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$end" ]; then
    days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
    [ "$days" -ge 7 ] && pass "TLS certificate valid for $days more days" || fail "TLS certificate expires in $days days"
else
    fail "TLS certificate readable"
fi

echo
[ "$fails" -eq 0 ] && { echo "Smoke test passed."; exit 0; }
echo "Smoke test failed: $fails check(s)."
exit 1
