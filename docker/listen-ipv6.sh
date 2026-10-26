#!/bin/sh
# Listen on IPv6 as well, when the host has it.
#
# nginx's own 10-listen-on-ipv6-by-default.sh does this only for the
# default.conf it shipped, which ours replaces, so it skips it. The test is the
# same one it uses: a kernel without IPv6 has no /proc/net/if_inet6, and nginx
# refuses to start at all if asked to listen on an address family it cannot
# open.
set -eu

conf=/etc/nginx/conf.d/default.conf

[ -f /proc/net/if_inet6 ] || { echo "no IPv6 on this host, listening on IPv4 only"; exit 0; }
grep -q 'listen \[::\]:8080' "$conf" && exit 0

# Written back through the file, as 40-api-base-url.sh does with index.html:
# conf.d belongs to root, the file to the nginx user.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
sed 's|^\( *\)listen  *8080;|&\n\1listen       [::]:8080;|' "$conf" > "$tmp"
cat "$tmp" > "$conf"

echo "listening on IPv6 as well"
