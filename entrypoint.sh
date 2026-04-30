#!/bin/sh
set -e

# Set default HOST_IP if not provided
export HOST_IP=${HOST_IP:-127.0.0.1}

# Create SSL directory
mkdir -p /etc/nginx/ssl

# Generate self-signed SSL certificate based on HOST_IP
echo "Generating self-signed certificate for ${HOST_IP}..."
openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/server.key -out /etc/nginx/ssl/server.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=${HOST_IP}" \
    -addext "subjectAltName=IP:${HOST_IP},IP:127.0.0.1,DNS:localhost"

# Replace environment variables in nginx template
echo "Substituting variables from nginx.conf.template -> default.conf"
envsubst '${INVENTREE_BACKEND_URL}' < /etc/nginx/templates/nginx.conf.template > /etc/nginx/conf.d/default.conf

# Execute passed command (default is nginx -g daemon off)
exec "$@"
