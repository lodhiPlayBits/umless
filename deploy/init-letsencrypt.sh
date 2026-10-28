#!/bin/sh
# Swap the self-signed cert for a Let's Encrypt one. Run once, from deploy/, after:
#   1. the domain's DNS A record points at this server,
#   2. SERVER_NAME and CERTBOT_EMAIL in deploy/.env are set to that domain and your email,
#   3. the stack is up (docker compose up -d), so nginx answers the HTTP challenge on port 80.
set -e
cd "$(dirname "$0")"
. ./.env

case "${SERVER_NAME}" in
    *[!0-9.]*) ;;
    *) echo "SERVER_NAME is an IP address; Let's Encrypt needs a domain name." >&2; exit 1 ;;
esac

# Recreate nginx so it serves the new SERVER_NAME before the challenge.
docker compose up -d --build nginx

docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d ${SERVER_NAME} --email ${CERTBOT_EMAIL} --agree-tos --no-eff-email" certbot

# The entrypoint switches the active cert to the new one on start.
docker compose restart nginx
echo "Done: https://${SERVER_NAME}"
