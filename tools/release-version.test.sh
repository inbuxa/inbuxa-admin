#!/bin/sh
# SPDX-FileCopyrightText: 2026 Coffey Labs LLC
# SPDX-License-Identifier: AGPL-3.0-only
# Tests for release-version.sh: sh tools/release-version.test.sh
set -u
here=$(dirname "$0"); s="$here/release-version.sh"; fail=0
check() { # expected, then the arguments
  want=$1; shift
  got=$(sh "$s" "$@" 2>/dev/null | tr '\n' ' ')"rc=$(sh "$s" "$@" >/dev/null 2>&1; echo $?)"
  [ "$got" = "$want" ] || { echo "FAIL: $* -> '$got', want '$want'"; fail=1; }
}
check '27.1-rc.2 27.1-rc rc=0' tags 27.1-rc.2
check '27.1 latest rc=0' tags 27.1
check '27.1.4 27.1 latest rc=0' tags 27.1.4
check 'rc=0' prerelease 27.1-rc.1
check 'rc=1' prerelease 27.1
check 'rc=0' next 27.1-rc.3
check '27.1.1 rc=0' next 27.1
check '27.1.10 rc=0' next 27.1.9
for bad in 2026.10.26.2 2026.10.26 27.1.0 27.1.0-rc.1 27.13 27.1-rc.0 27.01 v27.1 ''; do
  check 'rc=2' tags "$bad"
done
[ $fail = 0 ] && echo "release-version: all passed"
exit $fail
