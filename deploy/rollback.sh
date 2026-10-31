#!/bin/sh
# Put back the images deploy.sh tagged before a deploy (docs/runbooks/deploys.md):
#   sg docker -c 'sh ~/umless/umless/deploy/rollback.sh 20261031-184131'
# List the available ones with: docker images --format '{{.Tag}}' umless-backend | grep rollback
#
# Images only: database migrations are not undone, which is why migrations must only add
# (new tables, nullable columns), so the previous code still runs on the new schema.
set -eu
cd "$(dirname "$0")"

stamp=${1:-}
[ -n "$stamp" ] || { echo "usage: rollback.sh <stamp>"; docker images --format '{{.Tag}}' umless-backend | grep '^rollback-' | sed 's/^rollback-//'; exit 2; }
. ./.env

for image in umless-backend umless-frontend umless-gateway umless-redis; do
    if docker image inspect "$image:rollback-$stamp" >/dev/null 2>&1; then
        docker tag "$image:rollback-$stamp" "$image:latest"
    else
        echo "No $image:rollback-$stamp; leaving $image as it is." >&2
    fi
done
docker compose up -d --no-build --no-deps --force-recreate redis backend frontend
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' umless-backend)" = healthy ]; do
    i=$((i + 1)); [ "$i" -lt 60 ] || { echo "The backend isn't healthy after the rollback either: check docker logs umless-backend" >&2; exit 1; }
    sleep 2
done
docker compose up -d --no-build --no-deps --force-recreate nginx
docker compose restart nginx
sleep 3
curl -fsS "https://${SERVER_NAME}/api/health" | grep -q '"ok"' && echo "Rolled back to rollback-$stamp; https://${SERVER_NAME} answers."
