#!/bin/sh
set -e

export HOST_IP=${HOST_IP:-127.0.0.1}
export INVENTREE_BACKEND_URL=${INVENTREE_BACKEND_URL:-http://127.0.0.1:8000}

# Secrets are runtime settings of this container, never part of the web bundle.
# The VITE_ names are accepted so an existing .env keeps working.
export INVENTREE_TOKEN=${INVENTREE_TOKEN:-$VITE_INVENTREE_TOKEN}
# Where the browser goes after signing out here, so Authentik ends its session
# too. Empty means back to the app, where the Authentik session may still be live.
export OIDC_LOGOUT_URL=${OIDC_LOGOUT_URL:-}
# The host port the HTTPS side is published on, for the http -> https redirect.
export PUBLIC_HTTPS_PORT=${PUBLIC_HTTPS_PORT:-443}

if [ -z "$INVENTREE_TOKEN" ]; then
    echo "WARNING: INVENTREE_TOKEN is not set - every API call will fail." >&2
fi

if [ -z "$OIDC_LOGOUT_URL" ]; then
    echo "WARNING: OIDC_LOGOUT_URL is not set - signing out does not end the Authentik session." >&2
fi

mkdir -p /etc/nginx/ssl

if [ ! -f /etc/nginx/ssl/server.crt ] || [ ! -f /etc/nginx/ssl/server.key ]; then
    echo "Generating self-signed certificate for ${HOST_IP}..."
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/nginx/ssl/server.key -out /etc/nginx/ssl/server.crt \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=${HOST_IP}" \
        -addext "subjectAltName=IP:${HOST_IP},IP:127.0.0.1,DNS:localhost"
else
    echo "Reusing existing SSL certificate."
fi

envsubst '${INVENTREE_BACKEND_URL} ${INVENTREE_TOKEN} ${OIDC_LOGOUT_URL} ${PUBLIC_HTTPS_PORT}' \
    < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
