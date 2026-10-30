#!/bin/sh
# Point /etc/nginx/ssl/active at the Let's Encrypt cert for SERVER_NAME when certbot has
# issued one, otherwise at a self-signed cert made here. The self-signed cert lives outside
# live/ so certbot can later create live/<domain> itself.
set -e

SSL_DIR=/etc/nginx/ssl
LIVE="live/${SERVER_NAME}"
SELF="self-signed/${SERVER_NAME}"

if [ -f "${SSL_DIR}/${LIVE}/fullchain.pem" ] && [ -f "${SSL_DIR}/${LIVE}/privkey.pem" ]; then
    target="${LIVE}"
    echo "[certificate] Using the Let's Encrypt cert for ${SERVER_NAME}"
else
    target="${SELF}"
    if [ ! -f "${SSL_DIR}/${SELF}/fullchain.pem" ]; then
        echo "[certificate] No Let's Encrypt cert for ${SERVER_NAME}; generating a self-signed one"
        mkdir -p "${SSL_DIR}/${SELF}"
        # An IP address needs an IP SAN; a name needs a DNS SAN.
        case "${SERVER_NAME}" in
            *[!0-9.]*) san="DNS:${SERVER_NAME},DNS:www.${SERVER_NAME}" ;;
            *)         san="IP:${SERVER_NAME}" ;;
        esac
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${SSL_DIR}/${SELF}/privkey.pem" \
            -out    "${SSL_DIR}/${SELF}/fullchain.pem" \
            -subj   "/CN=${SERVER_NAME}" \
            -addext "subjectAltName=${san}" 2>/dev/null
    else
        echo "[certificate] Using the existing self-signed cert for ${SERVER_NAME}"
    fi
fi

# Relative link, so it resolves the same in the certbot container's mount.
ln -sfn "${target}" "${SSL_DIR}/active"
