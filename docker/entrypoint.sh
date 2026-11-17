#!/bin/sh
# Point this deployment at its mail server, at container start.
#
# INBUXA Admin reads `<meta name="api-base-url">` from index.html when it was
# not given VITE_API_BASE_URL at build time, which is what lets one image serve
# any installation. This writes that tag from API_BASE_URL, and the console's
# Content-Security-Policy, which has to let the browser reach that server.
#
# nginx runs the files in /docker-entrypoint.d before starting, so this happens
# once per container start. Everything goes to /tmp/inbuxa-admin, never into
# the image's own files, so the container can run with a read-only root
# filesystem (and /tmp on a tmpfs). nginx serves index.html from there and
# includes csp.conf from there; it does not start without them.
set -eu

# All three can be moved for docker/nginx.test.ts.
html=${INDEX_HTML:-/usr/share/nginx/html/index.html}
dir=${RUNTIME_DIR:-/tmp/inbuxa-admin}
api=${API_BASE_URL:-}

fail() { echo "API_BASE_URL: $*" >&2; exit 1; }

# The origin goes into the policy and the whole URL into index.html, so both
# are checked rather than escaped: an address that is not a plain http(s) URL
# stops the container instead of being written into either.
origin=
if [ -n "$api" ]; then
    case "$api" in
        *[[:space:]\"\'\<\>\\\;\$\`]*) fail "'$api' has a character no server address has" ;;
    esac
    origin=$(printf '%s' "$api" | sed -nE 's|^([A-Za-z][A-Za-z0-9+.-]*://[^/?#]*).*$|\1|p')
    printf '%s' "$origin" | grep -Eqi '^https?://([a-z0-9.-]+|\[[0-9a-f:.]+\])(:[0-9]{1,5})?$' \
        || fail "'$api' is not an http:// or https:// address"
fi

mkdir -p "$dir"

# Escaped for sed's replacement, where & and the delimiter are special.
if [ -n "$api" ]; then
    esc=$(printf '%s' "$api" | sed 's/[&|]/\\&/g')
    tag="<meta name=\"api-base-url\" content=\"$esc\">"
    if grep -q '<meta name="api-base-url"' "$html"; then
        sed "s|<meta name=\"api-base-url\"[^>]*>|$tag|" "$html" > "$dir/index.html"
    else
        sed "s|<head>|<head>$tag|" "$html" > "$dir/index.html"
    fi
    echo "api-base-url set to $api"
else
    # No address: the console talks to the origin it is served from.
    cp "$html" "$dir/index.html"
fi

# The built console has no inline script and loads nothing from other sites
# but the mail server, its logo (an https URL an admin may set) and the DNS
# check's resolver. Styles allow 'unsafe-inline': the dialog and menu
# components add <style> elements at run time.
policy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
policy="$policy; img-src 'self' data: blob: https: $origin; font-src 'self' data:"
policy="$policy; connect-src 'self' $origin https://cloudflare-dns.com"
policy="$policy; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
# Without an address, the gap where it would be.
policy=$(printf '%s' "$policy" | sed 's/  */ /g; s/ ;/;/g')

printf 'add_header Content-Security-Policy "%s" always;\n' "$policy" > "$dir/csp.conf"
