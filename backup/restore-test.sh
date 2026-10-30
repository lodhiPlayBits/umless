#!/bin/sh
# Restore the newest backup into a throwaway MySQL and compare row counts with production.
# Never touches the live database except to count rows. Run from anywhere:
#   sg docker -c ~/umless/umless/backup/restore-test.sh
# Counts can be a little higher in production (new rows since the backup); a table that is
# empty in the restore but not in production means the backup is broken.
set -eu
cd "$(dirname "$0")"
# Every service shares the project name "umless", so compose run from here sees the live
# containers as orphans. Silence that: its suggested --remove-orphans would delete them.
export COMPOSE_IGNORE_ORPHANS=True

work=$(mktemp -d)
container=umless-restore-test
cleanup() {
    docker rm -f "$container" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT

echo "Downloading the newest backup..."
docker compose run --rm --no-deps --user "$(id -u)" -v "$work:/out" backup fetch-latest /out/latest.sql.gz

echo "Starting a throwaway MySQL 8.4..."
password=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
docker run -d --name "$container" -e MYSQL_ROOT_PASSWORD="$password" -e MYSQL_DATABASE=restored mysql:8.4 >/dev/null
i=0
until docker logs "$container" 2>&1 | grep -q "ready for connections.*port: 3306"; do
    i=$((i + 1))
    [ "$i" -lt 90 ] || { echo "MySQL didn't start"; exit 1; }
    sleep 2
done

echo "Restoring..."
gunzip -c "$work/latest.sql.gz" | docker exec -i -e MYSQL_PWD="$password" "$container" mysql -uroot restored

restored() { docker exec -e MYSQL_PWD="$password" "$container" mysql -uroot -N -B restored -e "$1"; }
production() {
    docker compose run --rm --no-deps -T --entrypoint sh backup -c \
        'MYSQL_PWD="$DB_PASSWORD" mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -N -B "$DB_NAME" -e "$0"' "$1"
}

tables=$(restored "SHOW TABLES")
[ -n "$tables" ] || { echo "FAIL: the backup restored no tables"; exit 1; }

status=0
printf '%-24s %12s %12s\n' table restored production
for table in $tables; do
    query="SELECT COUNT(*) FROM \`$table\`"
    r=$(restored "$query")
    p=$(production "$query")
    flag=""
    if [ "$r" -eq 0 ] && [ "$p" -gt 0 ]; then flag="  <- FAIL: empty in the backup"; status=1; fi
    if [ "$r" -gt "$p" ]; then flag="  <- more than production (rows deleted since?)"; fi
    printf '%-24s %12s %12s%s\n' "$table" "$r" "$p" "$flag"
done
[ "$status" -eq 0 ] && echo "OK: the backup restores and matches production." || echo "FAIL: see above."
exit "$status"
