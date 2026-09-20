#!/bin/sh
# Point this deployment at its mail server, at container start.
#
# INBUXA Admin reads `<meta name="api-base-url">` from index.html when it was
# not given VITE_API_BASE_URL at build time, which is what lets one image serve
# any installation. This writes that tag from API_BASE_URL.
#
# nginx runs the files in /docker-entrypoint.d before starting, so this happens
# once per container and the served index.html is already correct.
set -eu

[ -n "${API_BASE_URL:-}" ] || exit 0

html=/usr/share/nginx/html/index.html
[ -f "$html" ] || exit 0

# Escaped for sed's replacement, where & and the delimiter are special. A URL
# containing either is unlikely, but a silently mangled API address is the kind
# of failure that looks like the server being down.
esc=$(printf '%s' "$API_BASE_URL" | sed 's/[&|]/\\&/g')
tag="<meta name=\"api-base-url\" content=\"$esc\">"

# Written back through the existing file rather than with `sed -i`, which
# replaces it and so needs to create a temp file in the directory. That
# directory belongs to root in this image and nginx does not run as root, so
# in-place editing is the one thing that cannot work here. The file itself is
# ours, and truncating it is enough.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

if grep -q '<meta name="api-base-url"' "$html"; then
    sed "s|<meta name=\"api-base-url\"[^>]*>|$tag|" "$html" > "$tmp"
else
    sed "s|<head>|<head>$tag|" "$html" > "$tmp"
fi
cat "$tmp" > "$html"

echo "api-base-url set to $API_BASE_URL"
