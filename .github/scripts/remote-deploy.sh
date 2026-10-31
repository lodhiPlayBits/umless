#!/usr/bin/env bash
# Run deploy.sh for one commit on the server, over SSH with CI's deploy key. The key is
# restricted on the server to deploy/ci-deploy.sh, so "deploy <sha>" is all it can do.
#   DEPLOY_SSH_KEY, DEPLOY_KNOWN_HOSTS (secrets), DEPLOY_HOST, DEPLOY_USER (workflow env)
set -euo pipefail
sha=${1:?usage: remote-deploy.sh <7-char sha>}

: "${DEPLOY_SSH_KEY:?secret DEPLOY_SSH_KEY is missing}"
: "${DEPLOY_KNOWN_HOSTS:?secret DEPLOY_KNOWN_HOSTS is missing}"
mkdir -p ~/.ssh && chmod 700 ~/.ssh
printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/deploy_key
printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
chmod 600 ~/.ssh/deploy_key ~/.ssh/known_hosts

# StrictHostKeyChecking: only the pinned host key is accepted (no trust on first use).
ssh -i ~/.ssh/deploy_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
    -o ServerAliveInterval=30 -o ConnectTimeout=20 \
    "${DEPLOY_USER}@${DEPLOY_HOST}" "deploy ${sha}"
