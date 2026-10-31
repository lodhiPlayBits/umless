#!/bin/sh
# SSH forced command for CI's deploy key. In ~/.ssh/authorized_keys:
#   command="/home/ubuntu/umless/umless/deploy/ci-deploy.sh",restrict ssh-ed25519 AAAA… umless-ci
# Whatever the client asks for arrives in SSH_ORIGINAL_COMMAND; the only thing accepted is
# "deploy <sha>". No shell, no port forwarding, no other command.
set -eu
log="$HOME/umless-deploys.log"

# shellcheck disable=SC2086  # split "deploy <sha>" into words on purpose
set -- ${SSH_ORIGINAL_COMMAND:-}
if [ "$#" -ne 2 ] || [ "$1" != deploy ]; then
    echo "This key can only run: deploy <commit sha>" >&2
    exit 2
fi
case "$2" in
    *[!0-9a-f]*) echo "Not a commit sha: $2" >&2; exit 2 ;;
esac
if [ "${#2}" -lt 7 ] || [ "${#2}" -gt 40 ]; then echo "Not a commit sha: $2" >&2; exit 2; fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy $2 from ${SSH_CLIENT%% *}" >> "$log"
# Output goes to CI and to the log; the exit code must be deploy.sh's, not tee's.
status_file=$(mktemp)
# set +e inside: deploy.sh failing must still reach the echo.
{ set +e; sg docker -c "sh $HOME/umless/umless/deploy/deploy.sh $2" 2>&1; echo $? > "$status_file"; } | tee -a "$log"
status=$(cat "$status_file"); rm -f "$status_file"
echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) deploy $2 exited $status" >> "$log"
exit "$status"
