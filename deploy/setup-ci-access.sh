#!/bin/sh
# One-time setup so GitHub Actions can deploy to this server (docs/runbooks/deploys.md). Run it
# yourself, on the server, as ubuntu:
#   sh ~/umless/umless/deploy/setup-ci-access.sh
#
# 1. A read-only GitHub deploy key, so deploy.sh can `git fetch` without your credentials.
#    Pushes keep going over https, as now.
# 2. CI's SSH key, allowed to run only deploy/ci-deploy.sh ("deploy <sha>"): no shell, no
#    forwarding. Its private half is printed once for the DEPLOY_SSH_KEY secret, then deleted.
# 3. The host key line for the DEPLOY_KNOWN_HOSTS secret.
# Safe to run again: it skips what's already there.
set -eu
repo="$HOME/umless/umless"
ro_key="$HOME/.ssh/umless_github_ro"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"

echo "== 1. Read-only GitHub deploy key (for git fetch)"
if [ ! -f "$ro_key" ]; then
    ssh-keygen -q -t ed25519 -N "" -C "umless-server-readonly" -f "$ro_key"
fi
if ! grep -q "umless_github_ro" "$HOME/.ssh/config" 2>/dev/null; then
    printf '\nHost github.com\n    IdentityFile %s\n    IdentitiesOnly yes\n' "$ro_key" >> "$HOME/.ssh/config"
    chmod 600 "$HOME/.ssh/config"
fi
grep -q "^github.com " "$HOME/.ssh/known_hosts" 2>/dev/null || ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
git -C "$repo" remote set-url origin git@github.com:lodhiPlayBits/umless.git
git -C "$repo" remote set-url --push origin https://github.com/lodhiPlayBits/umless
echo "Add this on GitHub → repo Settings → Deploy keys → Add deploy key"
echo "(title: umless-server, leave 'Allow write access' OFF):"
echo
cat "$ro_key.pub"
echo

echo "== 2. CI's deploy key (only 'deploy <sha>')"
if grep -q "umless-ci" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
    echo "Already in authorized_keys; to replace it, delete the line ending in 'umless-ci' and run this again."
else
    tmp=$(mktemp -d)
    ssh-keygen -q -t ed25519 -N "" -C "umless-ci" -f "$tmp/ci"
    printf 'command="%s/deploy/ci-deploy.sh",restrict %s\n' "$repo" "$(cat "$tmp/ci.pub")" >> "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    echo "Copy everything between the lines into the GitHub secret DEPLOY_SSH_KEY"
    echo "(repo Settings → Secrets and variables → Actions). It is shown once, then deleted:"
    echo "--------------------------------------------------------------------------------"
    cat "$tmp/ci"
    echo "--------------------------------------------------------------------------------"
    rm -rf "$tmp"
fi
echo

echo "== 3. Host key for the GitHub secret DEPLOY_KNOWN_HOSTS (copy the line below)"
printf 'umless.in %s\n' "$(cut -d' ' -f1-2 /etc/ssh/ssh_host_ed25519_key.pub)"
echo
echo "Then check the read-only key works (after adding it on GitHub):  git -C $repo fetch origin"
