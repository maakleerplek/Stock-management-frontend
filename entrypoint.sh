#!/bin/sh
set -e

export HOST_IP=${HOST_IP:-127.0.0.1}
export INVENTREE_BACKEND_URL=${INVENTREE_BACKEND_URL:-http://127.0.0.1:8000}

# Secrets are runtime settings of this container, never part of the web bundle.
# The VITE_ names are accepted so an existing .env keeps working.
export INVENTREE_TOKEN=${INVENTREE_TOKEN:-$VITE_INVENTREE_TOKEN}
VOLUNTEER_PASSWORD=${VOLUNTEER_PASSWORD:-$VITE_VOLUNTEER_PASSWORD}

if [ -z "$INVENTREE_TOKEN" ]; then
    echo "WARNING: INVENTREE_TOKEN is not set - every API call will fail." >&2
fi

if [ -n "$VOLUNTEER_PASSWORD" ]; then
    VOLUNTEER_KEY=$(printf '%s' "$VOLUNTEER_PASSWORD" | sha256sum | cut -d' ' -f1)
else
    echo "WARNING: VOLUNTEER_PASSWORD is not set - volunteer login is disabled." >&2
    # A random key nobody can send, so the map never matches.
    VOLUNTEER_KEY=$(head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1)
fi
export VOLUNTEER_KEY
unset VOLUNTEER_PASSWORD VITE_VOLUNTEER_PASSWORD

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

envsubst '${INVENTREE_BACKEND_URL} ${INVENTREE_TOKEN} ${VOLUNTEER_KEY}' \
    < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"
