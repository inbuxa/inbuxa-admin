#!/bin/sh
# SPDX-FileCopyrightText: 2026 Coffey Labs LLC
# SPDX-License-Identifier: AGPL-3.0-only
# Tests for listen-ipv6.sh: sh docker/listen-ipv6.test.sh
set -u
here=$(dirname "$0"); fail=0
dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
: > "$dir/if_inet6"
run() { RUNTIME_DIR="$dir/run" IF_INET6="$1" sh "$here/listen-ipv6.sh" >/dev/null; }
listeners() { grep -c 'listen  *\[::\]:8080;' "$dir/run/listen.conf"; }

run "$dir/none"
[ "$(listeners)" = 0 ] || { echo "FAIL: added an IPv6 listener without IPv6"; fail=1; }
run "$dir/if_inet6"
[ "$(listeners)" = 1 ] || { echo "FAIL: first start -> $(listeners) IPv6 listeners, want 1"; fail=1; }
# A restart of the same container runs the script again on the file it left.
run "$dir/if_inet6"; run "$dir/if_inet6"
[ "$(listeners)" = 1 ] || { echo "FAIL: after restarts -> $(listeners) IPv6 listeners, want 1"; fail=1; }
# The same container started again on a host without IPv6.
run "$dir/none"
[ "$(listeners)" = 0 ] || { echo "FAIL: kept the IPv6 listener without IPv6"; fail=1; }
# nginx.conf takes the listener from that file and has its IPv4 one itself.
grep -q 'include  *'"${RUNTIME_DIR_IN_IMAGE:-/tmp/inbuxa-admin}"'/listen.conf;' "$here/nginx.conf" \
    || { echo "FAIL: nginx.conf does not include listen.conf"; fail=1; }
[ "$(grep -c 'listen  *8080;' "$here/nginx.conf")" = 1 ] || { echo "FAIL: nginx.conf's IPv4 listener"; fail=1; }
[ $fail = 0 ] && echo "listen-ipv6: ok"
exit $fail
