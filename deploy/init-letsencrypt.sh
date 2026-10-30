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

# www.<domain> goes on the same certificate when its DNS exists (nginx redirects it to the
# bare domain). Run again after adding the www record to add it.
domains="-d ${SERVER_NAME}"
if getent hosts "www.${SERVER_NAME}" >/dev/null; then
    domains="${domains} -d www.${SERVER_NAME}"
fi

# Recreate nginx so it serves the new SERVER_NAME before the challenge. Only nginx:
# compose's build/up --build of nginx also rebuilds the backend and frontend images (its
# dependencies), so the image is built directly.
docker build -t umless-gateway ./nginx
docker compose up -d --no-build --no-deps nginx

# --cert-name keeps the files at live/${SERVER_NAME}/ (what nginx reads); --expand adds
# names to an existing certificate instead of making a second one. Renewals keep both names.
docker compose run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  --cert-name ${SERVER_NAME} --expand ${domains} \
  --email ${CERTBOT_EMAIL} --agree-tos --no-eff-email --non-interactive" certbot

# The entrypoint switches the active cert to the new one on start.
docker compose restart nginx
echo "Done: https://${SERVER_NAME}"
