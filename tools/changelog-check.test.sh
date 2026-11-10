#!/bin/sh
# SPDX-FileCopyrightText: 2026 Coffey Labs LLC
# SPDX-License-Identifier: AGPL-3.0-only
#
# Tests for changelog-check.sh: sh tools/changelog-check.test.sh
set -eu

here=$(dirname "$0")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

case_() { # name, version, changelog text, expected exit
  printf '{\n  "version": "%s"\n}\n' "$2" >"$tmp/inbuxa-version.json"
  printf '%b' "$3" >"$tmp/CHANGELOG.md"
  set +e; sh "$here/changelog-check.sh" "$tmp" >/dev/null 2>&1; got=$?; set -e
  [ "$got" = "$4" ] || { echo "FAIL $1: exit $got, want $4"; fail=1; }
}

case_ "entry present" 27.1-rc.2 '# Changelog\n\n## [27.1-rc.2] - 2026-10-28\n' 0
case_ "dated entry" 2026.10.26.5 '## [2026.10.26.5] - 2026-11-06\n' 0
case_ "no entry" 27.1-rc.3 '## [27.1-rc.2] - 2026-10-28\n' 1
case_ "only mentioned" 27.1-rc.3 '## [27.1-rc.4]\nSee [27.1-rc.3] too.\n' 1
case_ "dots are literal" 27.1-rc.3 '## [27x1-rc.3] - 2026-10-29\n' 1

# The tree's own changelog has the tree's version.
sh "$here/changelog-check.sh" >/dev/null || { echo "FAIL this tree"; fail=1; }

[ $fail = 0 ] && echo "changelog-check: all cases pass"
exit $fail
