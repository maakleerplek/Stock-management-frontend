#!/bin/sh
set -e

export HOST_IP=${HOST_IP:-127.0.0.1}
export INVENTREE_BACKEND_URL=${INVENTREE_BACKEND_URL:-http://127.0.0.1:8000}
# Unset means no TV: proxy to a port nobody listens on, so nginx still starts.
export TV_PRESENTATION_URL=${TV_PRESENTATION_URL:-http://127.0.0.1:9}

# Secrets are runtime settings of this container, never part of the web bundle.
# The VITE_ names are accepted so an existing .env keeps working.
export INVENTREE_TOKEN=${INVENTREE_TOKEN:-$VITE_INVENTREE_TOKEN}
# Where the browser goes after signing out here, so Authentik ends its session
# too. Empty means back to the app, where the Authentik session may still be live.
export OIDC_LOGOUT_URL=${OIDC_LOGOUT_URL:-}
# The host port the HTTPS side is published on, for the http -> https redirect.
export PUBLIC_HTTPS_PORT=${PUBLIC_HTTPS_PORT:-443}

# Volunteer sign-in: authentik (oauth2-proxy, the default) or password (one
# shared password, for a server that cannot reach Authentik).
export AUTH_MODE=${AUTH_MODE:-authentik}
case "$AUTH_MODE" in
    authentik) VOLUNTEER_KEY= ;;
    password)
        # Only the test server may use the shared password; everywhere else a
        # volunteer signs in through Authentik. Checked against the host's own
        # name (docker-compose.yml mounts /etc/hostname), not a setting in
        # .env, so a copied .env cannot turn it on elsewhere.
        HOST_NAME=$(cat /host/hostname 2>/dev/null || true)
        if [ "$HOST_NAME" != "htl-tempserver" ]; then
            echo "ERROR: AUTH_MODE=password is only allowed on htl-tempserver, this host is '${HOST_NAME:-unknown}'." >&2
            exit 1
        fi
        VOLUNTEER_PASSWORD=${VOLUNTEER_PASSWORD:-$VITE_VOLUNTEER_PASSWORD}
        if [ -n "$VOLUNTEER_PASSWORD" ]; then
            VOLUNTEER_KEY=$(printf '%s' "$VOLUNTEER_PASSWORD" | sha256sum | cut -d' ' -f1)
        else
            echo "WARNING: AUTH_MODE=password without VOLUNTEER_PASSWORD - volunteer login is disabled." >&2
            VOLUNTEER_KEY=$(head -c 32 /dev/urandom | sha256sum | cut -d' ' -f1)
        fi
        unset VOLUNTEER_PASSWORD VITE_VOLUNTEER_PASSWORD
        ;;
    *) echo "ERROR: AUTH_MODE must be authentik or password, not '$AUTH_MODE'." >&2; exit 1 ;;
esac
export VOLUNTEER_KEY

if [ -z "$INVENTREE_TOKEN" ]; then
    echo "WARNING: INVENTREE_TOKEN is not set - every API call will fail." >&2
fi

if [ "$AUTH_MODE" = authentik ] && [ -z "$OIDC_LOGOUT_URL" ]; then
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

envsubst '${INVENTREE_BACKEND_URL} ${INVENTREE_TOKEN} ${PUBLIC_HTTPS_PORT} ${AUTH_MODE} ${TV_PRESENTATION_URL}' \
    < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf
envsubst '${OIDC_LOGOUT_URL} ${VOLUNTEER_KEY}' \
    < "/etc/nginx/templates/auth-${AUTH_MODE}.conf.template" > /etc/nginx/auth.conf
echo "Volunteer sign-in: ${AUTH_MODE}"

exec "$@"
