#!/bin/sh
# Listen on IPv6 as well, when the host has it.
#
# nginx's own 10-listen-on-ipv6-by-default.sh does this only for the
# default.conf it shipped, which ours replaces, so it skips it. The test is the
# same one it uses: a kernel without IPv6 has no /proc/net/if_inet6, and nginx
# refuses to start at all if asked to listen on an address family it cannot
# open.
#
# nginx.conf includes /tmp/inbuxa-admin/listen.conf, which this writes afresh
# at every start (empty without IPv6), so a restarted container never gets the
# listener twice and the image's own files are never changed: the container
# can run with a read-only root filesystem.
set -eu

# Both paths can be moved for docker/listen-ipv6.test.sh.
dir=${RUNTIME_DIR:-/tmp/inbuxa-admin}
if_inet6=${IF_INET6:-/proc/net/if_inet6}

mkdir -p "$dir"
if [ -f "$if_inet6" ]; then
    echo 'listen [::]:8080;' > "$dir/listen.conf"
    echo "listening on IPv6 as well"
else
    : > "$dir/listen.conf"
    echo "no IPv6 on this host, listening on IPv4 only"
fi
