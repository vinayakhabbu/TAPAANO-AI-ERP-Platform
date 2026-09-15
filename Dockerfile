FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps
COPY . .

# These are public browser configuration values. Never pass a service-role key.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG RAILWAY_GIT_COMMIT_SHA
ARG VITE_RELEASE_SHA
RUN VITE_RELEASE_SHA="${VITE_RELEASE_SHA:-$RAILWAY_GIT_COMMIT_SHA}" npm run build:release \
    && node scripts/write-railway-config.mjs /app/Caddyfile

FROM caddy:2.11.4-alpine AS runtime
COPY --from=build /app/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
# Railway uses an unprivileged port. Drop the official image's file capability
# so the executable also works when the host removes all process capabilities.
RUN setcap -r /usr/bin/caddy && caddy fmt --overwrite /etc/caddy/Caddyfile
ENV PORT=8080
ENV XDG_DATA_HOME=/tmp/caddy-data XDG_CONFIG_HOME=/tmp/caddy-config
USER 10001:10001
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
