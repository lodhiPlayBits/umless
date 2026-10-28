#!/bin/sh
# certbot renews certificates in place; nginx only reads them on (re)load.
(
    while :; do
        sleep 12h
        nginx -s reload
    done
) &
