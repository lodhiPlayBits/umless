# Build the Vite app, then serve the static files with a small nginx.
# The public gateway (deploy/nginx) handles TLS, headers and /api.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# CI builds pass the Clerk key (public) as a build argument; a build on the server reads it from
# frontend/.env instead. Only set it when given: an empty variable would override the .env file.
ARG CLERK_PUBLISHABLE_KEY=""
RUN if [ -n "$CLERK_PUBLISHABLE_KEY" ]; then export VITE_CLERK_PUBLISHABLE_KEY="$CLERK_PUBLISHABLE_KEY"; fi && npm run build

FROM nginx:1.27-alpine
# Alpine's security fixes newer than the base image (CI's Trivy gate fails on fixable CRITICALs).
RUN apk upgrade --no-cache
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
