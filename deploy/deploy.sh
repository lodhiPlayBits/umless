#!/bin/sh
# Deploy a release tag to this server (docs/runbooks/deploys.md):
#   sg docker -c 'sh ~/umless/umless/deploy/deploy.sh v1.2.0'
#
# Refuses if the checkout has local changes: what runs is always a pushed, tagged commit.
# Backs up the database, tags the running images for rollback, builds and starts the new
# ones, then checks the site. If the check fails it rolls back by itself.
set -eu
cd "$(dirname "$0")/.."

tag=${1:-}
[ -n "$tag" ] || { echo "usage: deploy.sh <tag>   (e.g. v1.2.0)"; exit 2; }
if [ -n "$(git status --porcelain)" ]; then
    echo "The checkout has uncommitted changes; commit and push them, tag a release, then deploy." >&2
    git status --short >&2
    exit 1
fi
git fetch --quiet --tags origin
git rev-parse -q --verify "refs/tags/$tag^{commit}" >/dev/null || { echo "No tag $tag on origin." >&2; exit 1; }
previous=$(git describe --tags --always)
git checkout --quiet "$tag"
echo "Deploying $tag (was $previous)."

cd deploy
. ./.env
stamp=$(date -u +%Y%m%d-%H%M%S)

echo "1/5 Backup"
docker exec umless-backup python3 backup.py once

echo "2/5 Rollback tags: rollback-$stamp"
# container name:image name, for every service built from this repo.
for pair in umless-backend:umless-backend umless-frontend:umless-frontend umless-nginx:umless-gateway umless-backup:umless-backup; do
    container=${pair%%:*}; image=${pair#*:}
    docker tag "$(docker inspect -f '{{.Image}}' "$container")" "$image:rollback-$stamp"
done

echo "3/5 Build"
docker compose build backend frontend nginx backup

echo "4/5 Start"
# Only the built services: certbot and redis keep running. The backend runs migrations on start.
docker compose up -d --no-build --no-deps backend frontend backup
healthy=no
i=0
while [ "$i" -lt 60 ]; do
    b=$(docker inspect -f '{{.State.Health.Status}}' umless-backend)
    f=$(docker inspect -f '{{.State.Health.Status}}' umless-frontend)
    if [ "$b" = healthy ] && [ "$f" = healthy ]; then healthy=yes; break; fi
    i=$((i + 1)); sleep 2
done
docker compose up -d --no-build --no-deps nginx
docker compose restart nginx

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
cd ..
git checkout --quiet "$previous" || true
exit 1
