# Contributing

Patches, bug reports and questions are welcome. Open an issue first for
anything substantial; small fixes need no ceremony.

## Sending a change

New accounts on git.coffeylabs.org can file issues but can't push or fork.
Until you have repository access, open an
[issue](https://git.coffeylabs.org/inbuxa/inbuxa-admin/issues) for the change, or say hello
on [community.coffeylabs.org](https://community.coffeylabs.org), and attach the
change to the issue as a patch:

```sh
git format-patch origin/main --stdout > my-change.patch
```

Repository access goes to volunteers we have worked with; a few good issues or
patches is the usual way in. After that you push a branch here and open a pull
request. The GitHub copy is a read-only mirror, so pull requests opened
there are not merged.

## What this is

A fork of Stalwart's web interface, taken under the AGPL-3.0-only half of its
dual licence, talking to INBUXA over JMAP and OAuth. Upstream's copyright
headers stay where they are, and a file this fork has changed says so beneath
them. New files carry Coffey Labs' own header and `AGPL-3.0-only`.

Changes to files that came from upstream are kept small, so the next import
merges cleanly and a reader can tell fork from base.

## Before you push

```
npm ci
npm run typecheck && npm run lint && npm test && npm run build
```

CI runs exactly that. Nothing here talks to a live server, so a failing test
is a real failure rather than a missing container.

## Commit messages

Say what changed and why, in prose. The why is the part that is hard to
recover later. No tool trailers.
