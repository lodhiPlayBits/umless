#!/bin/sh
# Deploy one commit of main to this server (docs/runbooks/deploys.md). CI runs it over SSH after
# every merge to main (deploy/ci-deploy.sh), and again with the previous commit to roll back.
# By hand:
#   sg docker -c 'sh ~/umless/umless/deploy/deploy.sh <commit sha>'
#
# Refuses if the checkout has local changes. Pulls the images CI built for that commit from OCIR
# (tag = its 7-character sha; the server never builds), backs up the database, keeps rollback
# tags, recreates only the services whose image changed, checks the site, and rolls back by
# itself if the check fails. Needs `docker login bom.ocir.io` and the read-only deploy key.
set -eu
cd "$(dirname "$0")/.."

ref=${1:-}
case "$ref" in
    "" | *[!0-9a-f]*) echo "usage: deploy.sh <commit sha, 7-40 hex characters>" >&2; exit 2 ;;
esac
if [ "${#ref}" -lt 7 ] || [ "${#ref}" -gt 40 ]; then echo "usage: deploy.sh <commit sha, 7-40 hex characters>" >&2; exit 2; fi
if [ -n "$(git status --porcelain)" ]; then
    echo "The checkout has uncommitted changes; deploys only run pushed commits." >&2
    git status --short >&2
    exit 1
fi
git fetch --quiet origin
git cat-file -e "$ref^{commit}" 2>/dev/null || { echo "Commit $ref isn't on origin." >&2; exit 1; }
previous=$(git rev-parse HEAD)
git checkout --quiet --detach "$ref"
tag=$(git rev-parse HEAD | cut -c1-7)  # CI tags images with the 7-character sha
echo "Deploying $tag (was $(echo "$previous" | cut -c1-7))."

cd deploy
. ./.env
stamp=$(date -u +%Y%m%d-%H%M%S)
registry=${UMLESS_REGISTRY:-bom.ocir.io/bmej3eov9wnf/umless}
# OCIR repository:local image name:container:compose service. The compose files use the local
# names, so CI's images are pulled, then tagged with those.
# The backup service isn't here: CI doesn't build it (it rarely changes); see docs/runbooks/deploys.md.
services="backend:umless-backend:umless-backend:backend frontend:umless-frontend:umless-frontend:frontend gateway:umless-gateway:umless-nginx:nginx redis:umless-redis:umless-redis:redis"
field() { echo "$1" | cut -d: -f"$2"; }
back() { cd .. && git checkout --quiet --detach "$previous"; }

echo "0/5 Pull $tag from $registry"
# Before anything is touched: a missing image (CI unfinished or failed) stops here.
changed=""
for s in $services; do
    image="$registry/$(field "$s" 1):$tag"
    if ! docker pull --quiet "$image" >/dev/null; then
        echo "Couldn't pull $image. Did CI's build-push finish for $tag? Is the server logged in to bom.ocir.io?" >&2
        back
        exit 1
    fi
    new=$(docker image inspect -f '{{.Id}}' "$image")
    running=$(docker inspect -f '{{.Image}}' "$(field "$s" 3)" 2>/dev/null || echo none)
    [ "$new" = "$running" ] || changed="$changed $(field "$s" 4)"
done
if [ -z "$changed" ]; then
    echo "Every image is the one already running: nothing to restart. $tag is live."
    exit 0
fi
echo "Changed:$changed"

echo "1/5 Backup"
docker exec umless-backup python3 backup.py once

echo "2/5 Rollback tags: rollback-$stamp"
for s in $services; do
    docker tag "$(docker inspect -f '{{.Image}}' "$(field "$s" 3)")" "$(field "$s" 2):rollback-$stamp"
done

echo "3/5 Use the pulled images"
for s in $services; do
    docker tag "$registry/$(field "$s" 1):$tag" "$(field "$s" 2):latest"
done

echo "4/5 Start"
# Only the changed services; certbot and backup keep running. The backend runs migrations on start;
# while redis restarts, the backend lets transcriptions through (ADR 0006) and its data stays on the volume.
apps=$(echo "$changed" | tr ' ' '\n' | grep -vx nginx | grep . | tr '\n' ' ' || true)
if [ -n "$apps" ]; then
    # shellcheck disable=SC2086  # one word per service
    docker compose up -d --no-build --no-deps --force-recreate $apps
fi
healthy=no
i=0
while [ "$i" -lt 60 ]; do
    b=$(docker inspect -f '{{.State.Health.Status}}' umless-backend)
    f=$(docker inspect -f '{{.State.Health.Status}}' umless-frontend)
    if [ "$b" = healthy ] && [ "$f" = healthy ]; then healthy=yes; break; fi
    i=$((i + 1)); sleep 2
done
# nginx resolves the upstreams when it starts, so it restarts whenever anything changed.
docker compose up -d --no-build --no-deps --force-recreate nginx

echo "5/5 Check"
sleep 3
if [ "$healthy" = yes ] \
    && curl -fsS -o /dev/null "https://${SERVER_NAME}/" \
    && curl -fsS "https://${SERVER_NAME}/api/health" | grep -q '"ok"'; then
    echo "Done: $tag is live on https://${SERVER_NAME}. Roll back with: sh deploy/rollback.sh $stamp"
    exit 0
fi

echo "The new version failed its check (backend/frontend healthy: $healthy). Rolling back." >&2
docker logs --tail 30 umless-backend >&2 || true
sh ./rollback.sh "$stamp"
back
exit 1
