#!/bin/sh
# SPDX-FileCopyrightText: 2026 Coffey Labs LLC
# SPDX-License-Identifier: AGPL-3.0-only
# Tests for listen-ipv6.sh: sh docker/listen-ipv6.test.sh
set -u
here=$(dirname "$0"); fail=0
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
cp "$here/nginx.conf" "$dir/default.conf"; : > "$dir/if_inet6"
run() { NGINX_CONF="$dir/default.conf" IF_INET6="$1" sh "$here/listen-ipv6.sh" >/dev/null; }
listeners() { grep -c 'listen  *\[::\]:8080;' "$dir/default.conf"; }

run "$dir/none"
[ "$(listeners)" = 0 ] || { echo "FAIL: added an IPv6 listener without IPv6"; fail=1; }
run "$dir/if_inet6"
[ "$(listeners)" = 1 ] || { echo "FAIL: first start -> $(listeners) IPv6 listeners, want 1"; fail=1; }
# A restart of the same container runs the script again on the file it left.
run "$dir/if_inet6"; run "$dir/if_inet6"
[ "$(listeners)" = 1 ] || { echo "FAIL: after restarts -> $(listeners) IPv6 listeners, want 1"; fail=1; }
[ "$(grep -c 'listen  *8080;' "$dir/default.conf")" = 1 ] || { echo "FAIL: the IPv4 listener changed"; fail=1; }
[ $fail = 0 ] && echo "listen-ipv6: ok"
exit $fail
