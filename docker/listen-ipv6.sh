#!/bin/sh
# Listen on IPv6 as well, when the host has it.
#
# nginx's own 10-listen-on-ipv6-by-default.sh does this only for the
# default.conf it shipped, which ours replaces, so it skips it. The test is the
# same one it uses: a kernel without IPv6 has no /proc/net/if_inet6, and nginx
# refuses to start at all if asked to listen on an address family it cannot
# open.
set -eu

# Both paths can be moved for docker/listen-ipv6.test.sh.
conf=${NGINX_CONF:-/etc/nginx/conf.d/default.conf}
if_inet6=${IF_INET6:-/proc/net/if_inet6}

[ -f "$if_inet6" ] || { echo "no IPv6 on this host, listening on IPv4 only"; exit 0; }
# A restarted container keeps the file as the last start left it, so the
# listener may be there already: nginx refuses a duplicate listen and the
# container would restart in a loop. The line below is written with several
# spaces after "listen", so match any number.
grep -q 'listen  *\[::\]:8080;' "$conf" && exit 0

# Written back through the file, as 40-api-base-url.sh does with index.html:
# conf.d belongs to root, the file to the nginx user.
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
sed 's|^\( *\)listen  *8080;|&\n\1listen       [::]:8080;|' "$conf" > "$tmp"
cat "$tmp" > "$conf"

echo "listening on IPv6 as well"
