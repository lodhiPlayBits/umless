FROM nginx:1.27-alpine

# openssl: the entrypoint makes a self-signed cert until Let's Encrypt has issued one.
RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY snippets/ /etc/nginx/snippets/
# The image runs envsubst on templates/*.template into conf.d/ at startup (SERVER_NAME).
COPY templates/ /etc/nginx/templates/
COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh
