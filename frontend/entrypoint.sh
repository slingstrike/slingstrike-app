#!/bin/sh
set -eu

# Runtime-only files: never bake the certificate or private key into the image.
umask 077
tls_dir=/tmp/slingstrike-tls
export SLINGSTRIKE_TLS=internal

if [ -n "${SLINGSTRIKE_TLS_CERT_PEM:-}" ] || [ -n "${SLINGSTRIKE_TLS_KEY_PEM:-}" ]; then
    if [ -z "${SLINGSTRIKE_TLS_CERT_PEM:-}" ] || [ -z "${SLINGSTRIKE_TLS_KEY_PEM:-}" ]; then
        echo 'Set both SLINGSTRIKE_TLS_CERT_PEM and SLINGSTRIKE_TLS_KEY_PEM, or leave both empty.' >&2
        exit 1
    fi
    mkdir -p "$tls_dir"
    printf '%s\n' "$SLINGSTRIKE_TLS_CERT_PEM" > "$tls_dir/fullchain.pem"
    printf '%s\n' "$SLINGSTRIKE_TLS_KEY_PEM" > "$tls_dir/privkey.pem"
    export SLINGSTRIKE_TLS="$tls_dir/fullchain.pem $tls_dir/privkey.pem"
else
    rm -f "$tls_dir/fullchain.pem" "$tls_dir/privkey.pem"
fi

unset SLINGSTRIKE_TLS_CERT_PEM SLINGSTRIKE_TLS_KEY_PEM
# Caddy checks PEM parsing and the certificate/key match before serving HTTPS.
exec "$@"
