#!/bin/sh
# SPDX-FileCopyrightText: 2026 Coffey Labs LLC
# SPDX-License-Identifier: AGPL-3.0-only
#
# Fail when CHANGELOG.md has no entry for the version in inbuxa-version.json.
#
#   changelog-check.sh [ROOT]
#
# An entry is a `## [VERSION]` heading. The version PR that sets a version
# adds its entry, and CI runs this so one without it can't merge.
# POSIX sh, like release-version.sh.
set -eu

root=${1:-$(dirname "$0")/..}
v=$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$root/inbuxa-version.json" | head -n 1)
[ -n "$v" ] || { echo "no version in inbuxa-version.json" >&2; exit 2; }

# The version is digits, dots, "rc" and a dash, so only the dots need escaping.
if grep -Eq "^## \[$(printf '%s' "$v" | sed 's/[.]/\\./g')\]" "$root/CHANGELOG.md"; then
  echo "$v"
else
  echo "CHANGELOG.md has no entry for $v. Add a \`## [$v] - YYYY-MM-DD\`" >&2
  echo "section to the version PR that sets it." >&2
  exit 1
fi
