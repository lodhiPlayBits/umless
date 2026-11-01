#!/usr/bin/env bash
# Server watchdog (launch roadmap, Phase 3 step 5): emails the owner when something on this host
# needs them. Run from cron every 10 minutes (docs/runbooks/monitoring.md):
#
#   */10 * * * * /home/ubuntu/umless/umless/deploy/watchdog.sh >> /var/tmp/umless-watchdog/cron.log 2>&1
#
# Checks: the root disk over DISK_PERCENT, any umless container not running or unhealthy (the
# backup container turns unhealthy when no backup has succeeded for 26 hours), and the public
# health endpoint. Mail goes through Resend with RESEND_API_KEY and CONTACT_TO (and CONTACT_FROM,
# if set) from backend/.env, the same as the contact form. A problem is mailed when it starts,
# again every REPEAT_HOURS while it lasts, and once more when it clears.
#
#   watchdog.sh --test   sends one test email and exits.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${UMLESS_ENV_FILE:-$ROOT/backend/.env}"
STATE="${UMLESS_WATCHDOG_STATE:-/var/tmp/umless-watchdog}"
DISK_PERCENT="${UMLESS_DISK_PERCENT:-80}"
REPEAT_HOURS="${UMLESS_ALERT_REPEAT_HOURS:-6}"
HEALTH_URL="${UMLESS_HEALTH_URL:-https://umless.in/api/health}"
CONTAINERS="${UMLESS_CONTAINERS:-umless-nginx umless-backend umless-frontend umless-redis umless-backup}"
# Tests point this at a local stub instead of Resend.
RESEND_URL="${UMLESS_RESEND_URL:-https://api.resend.com/emails}"

mkdir -p "$STATE"
chmod 700 "$STATE"
# One run at a time, if a slow check overlaps the next cron tick.
exec 9>"$STATE/lock"
flock -n 9 || exit 0

# One value from the .env file, without sourcing it (values may hold spaces or quotes).
env_value() {
  local line
  line="$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#\"}"; line="${line%\"}"
  line="${line#\'}"; line="${line%\'}"
  printf '%s' "$line"
}

RESEND_API_KEY="$(env_value RESEND_API_KEY)"
TO="$(env_value CONTACT_TO)"
FROM="$(env_value CONTACT_FROM)"
FROM="${FROM:-umless <onboarding@resend.dev>}"

send_mail() {  # subject, text
  if [[ -z "$RESEND_API_KEY" || -z "$TO" ]]; then
    echo "$(date -u +%FT%TZ) can't mail (RESEND_API_KEY or CONTACT_TO missing in $ENV_FILE): $1" >&2
    return 1
  fi
  local body
  body="$(jq -n --arg from "$FROM" --arg to "$TO" --arg subject "$1" --arg text "$2" \
    '{from: $from, to: [$to], subject: $subject, text: $text}')"
  # The key goes in through curl's stdin config, so it never shows in `ps`.
  printf 'header = "Authorization: Bearer %s"\n' "$RESEND_API_KEY" |
    curl -sS --fail-with-body --max-time 20 -K - \
      -H "Content-Type: application/json" --data "$body" \
      "$RESEND_URL" >/dev/null
}

if [[ "${1:-}" == "--test" ]]; then
  send_mail "[umless] watchdog test" "The umless watchdog on $(hostname) can send email. $(date -u +%FT%TZ)"
  echo "Test email sent to $TO"
  exit 0
fi

# --- checks: each problem is one line "key<TAB>description" -----------------------------

problems=()

used="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
if (( used > DISK_PERCENT )); then
  problems+=("disk"$'\t'"The root disk is ${used}% full (alert above ${DISK_PERCENT}%). Docker images and logs are the usual cause: docker image prune -a; docker builder prune.")
fi

for name in $CONTAINERS; do
  # A missing container makes inspect print a blank line before failing: ignore its output then.
  if ! status="$(docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name" 2>/dev/null)"; then
    status="missing none"
  fi
  state="${status%% *}"
  health="${status##* }"
  if [[ "$state" != "running" ]]; then
    problems+=("container-$name"$'\t'"Container $name is $state. Check: docker logs --tail 100 $name")
  elif [[ "$health" == "unhealthy" ]]; then
    problems+=("container-$name"$'\t'"Container $name is running but unhealthy. Check: docker inspect --format '{{json .State.Health}}' $name")
  fi
done

if ! curl -sS --fail --max-time 10 -o /dev/null "$HEALTH_URL" 2>/dev/null; then
  problems+=("health"$'\t'"$HEALTH_URL doesn't answer 200 from the server itself.")
fi

# --- alert on new, ongoing (every REPEAT_HOURS) and cleared problems ------------------------

now="$(date +%s)"
active=()
for problem in ${problems[@]+"${problems[@]}"}; do
  key="${problem%%$'\t'*}"
  text="${problem#*$'\t'}"
  active+=("$key")
  marker="$STATE/$key"
  if [[ ! -f "$marker" ]] || (( now - $(cat "$marker") >= REPEAT_HOURS * 3600 )); then
    if send_mail "[umless] $text" "$text"$'\n\n'"Host: $(hostname), $(date -u +%FT%TZ). This repeats every ${REPEAT_HOURS} h until it clears."; then
      echo "$now" > "$marker"
      echo "$(date -u +%FT%TZ) alerted: $key"
    fi
  fi
done

for marker in "$STATE"/*; do
  key="$(basename "$marker")"
  [[ "$key" == "lock" || "$key" == "cron.log" ]] && continue
  [[ -f "$marker" ]] || continue
  if [[ " ${active[*]-} " != *" $key "* ]]; then
    if send_mail "[umless] resolved: $key" "The problem \"$key\" on $(hostname) has cleared ($(date -u +%FT%TZ))."; then
      rm -f "$marker"
      echo "$(date -u +%FT%TZ) resolved: $key"
    fi
  fi
done
