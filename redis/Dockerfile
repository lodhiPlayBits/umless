# Redis for the transcription limits (ADR 0006): the official image, Alpine's security fixes
# (CI's Trivy gate fails on fixable CRITICALs), and redis.conf baked in, so config changes go
# through CI and the deploy. The password is never in the image: it comes from redis/.env at start.
FROM redis:7.4-alpine
RUN apk upgrade --no-cache
COPY redis.conf /usr/local/etc/redis/redis.conf
