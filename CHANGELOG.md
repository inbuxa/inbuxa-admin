# Changelog

All notable changes to inbuxa Admin's 2026 series, the dated releases
(`2026.10.26.5`) kept on this branch. It holds `:latest` until the 27.1
series ships; `main` carries 27.1 and its changelog lists both.

Each release's page has its container image and files:
https://git.coffeylabs.org/inbuxa/inbuxa-admin/releases.

Every version PR adds that version's entry here. CI refuses a version this
file has no entry for (`tools/changelog-check.sh`).

## [2026.10.26.5] - 2026-11-06

A fix to the certificates guide for the 2026 series, the same as in
27.1-rc.6.

### Fixed
- Certificates guide: switching a domain that already had its own certificate
  hostnames no longer clears them. The guide keeps the list, and checks and
  shows the names it orders. A domain with no list gets the defaults, as
  before. (#165)

## [2026.10.26.4] - 2026-11-01

For OpenID Connect directories, the console catches up with the server's
security release 2026.10.29.1 (GHSA-v3gv-4j87-3mg2, GHSA-2p7h-9hv3-4292).
The same changes are in 27.1-rc.3. (#158)

### Changed
- The setup guide asks for the provider's client ID as the audience. The
  server refuses a new OpenID Connect directory without one, and the guide
  had no field for it.
- The Security to-do list flags directories with no required audience, and
  directories that accept any token the provider's user info endpoint answers
  for. Both can let in tokens issued to other applications. If you have an
  OpenID Connect directory, check your Security to-do list after updating.
- Releases from the 2026 series stop moving `:latest` once 27.1 is out. The
  GitHub copy of each release has its files too.

## [2026.10.26.3] - 2026-11-01

### Fixed
- A console container that was restarted rather than recreated (after a
  reboot, `docker restart`, or an installer stopping and starting the stack)
  failed to start and restarted in a loop: each start added another IPv6
  listener, and nginx stopped with `duplicate listen [::]:8080`. If yours is
  stuck, pull this image and recreate the container. The same fix is in
  27.1-rc.2. (#135, #156)

## [2026.10.26.2] - 2026-10-26

### Changed
- The image listens on IPv6 as well. (#136)

## [2026.10.26] - 2026-10-26

### Changed
- The console no longer follows upstream web UI releases. (#134)

## [2026.10.19] - 2026-10-19

Most of the code inherited from the upstream web UI is rewritten as our own:
the base components on shadcn/ui, our own toasts and combobox, the config
files, the app's entry, sign-in and the API wrapper, the JMAP client and
stores, the dashboard, live tracing and the trace pages, the actions page,
the editors, the shell and layout, and search and the command palette.
(#117 to #133)

### Fixed
- Sign-in uses S256 PKCE over plain HTTP too. (#112)
- A network blip no longer signs you out. (#114)
- Each sign-in code is traded once. (#115)
- Security: the relaying checks say what they actually mean. (#111)

## [2026.10.14] - 2026-10-14

### Added
- Directories have a Description column and a Test card on each directory.
  (#110)
- The manual's reference is written for the docs as they are now. (#107)

## [2026.10.12.2] - 2026-10-12

### Added
- Each release attaches the console's files for a host install. (#106)

## [2026.10.12] - 2026-10-12

### Added
- A Sieve playground that ships with the console, running debugged scripts
  under the server's live limits. (#97, #98)
- Reports › Scheduled: scheduled reports and the weekly digest. (#93)
- Received reports: who sends as your domains, and whether they pass. (#88,
  #89)
- Domains › Deliverability: what other mail servers see of this one. (#83)
- Shared mailboxes: a page in Directory for support@, legal@ and the like.
  (#81)
- Who may share: the server's and each tenant's switches. (#82)
- Keyboard and accessibility: shortcuts, high contrast, reduced motion. (#91)
- The command palette runs actions, not just finds pages. (#78)
- Dashboard charts zoom when you drag across one, and the cluster roster
  shows each node's mail and connections over the period. (#79, #80)
- Help: Learn more opens the manual at docs.inbuxa.org. (#85)

### Changed
- Deleting asks no "Are you sure?"; you get Undo instead. (#90)
- People, Directory and Domains show as cards by default, the list one press
  away, with friendly empty states and a first-domain hello. (#92, #94)
- A group's help says its mail lands in a mailbox its members share. (#77)

### Fixed
- The dashboard's live metrics stream honors a deploy-time API base. Thanks
  to porkmagus. (#96)

## [2026.10.5] - 2026-10-05

### Fixed
- Dashboard gauges are read per node. (#76)

## [2026.9.30] - 2026-09-30

### Added
- Settings in nine task-based groups on the top bar, with an Overview page.
  Each Settings page opens with a one-sentence intro and offers Reset to
  default for changed values. (#34, #49, #51, #52, #57)
- Guided setup for how this server sends mail, certificates and a sign-in
  directory. (#36, #39, #41)
- Settings in words: expression fields as choices, limits as sentences with
  presets, retention on one page, reports in a few sentences, alerts from
  templates and every alert as a sentence, and metrics connected to
  Prometheus or an OpenTelemetry service. (#35, #42 to #46, #53)
- Spam filter strength (Relaxed, Balanced, Strict) and sender checks
  (Relaxed, Recommended, Strict) as levels. (#40, #50)
- The standard mail ports as one table, with whether each port is reachable
  from outside. (#47, #55)
- Webhook and tracer events picked by group, and Send test on a saved
  webhook. (#48, #54)
- DLP rules, mail flow rules and held mail pages. (#56, #58)
- The Security to-do list, with critical items on the dashboard. (#59)
- Journal: search, read, export, journals and the chain check. (#62)
- Compliance Overview and Data inventory pages. (#37)
- How long rotated log files are kept, on the Hardening page. (#33)
- The dashboard as a command center, with trend pages to match. (#63)
- Installable as an app. (#72)

### Fixed
- The first-boot wizard shows again. (#75)
- The source link fills in the version. (#74)
- DNS checks read a long TXT record the server splits across lines. (#64)
- Lists page on without a total, and don't keep a stale one. (#61)
- Dashboard histogram totals are diffed per node. (#73)

## [2026.9.28] - 2026-09-28

### Added
- Compliance › Audit log, Locked accounts and Legal holds, with export of
  what a hold keeps. Lock or unlock people from Directory › Accounts and
  beside Delete on a person's page. (#26 to #31)
- IMAP, POP3 and ManageSieve switch on and off one at a time. (#32)
- Explain this: ask the local model about a failure, verdict, log line or
  setting, with a streamed answer that says where it came from. (#18, #20)
- Local AI: a page to set up AI spam filtering. (#13)
- Dashboard: Cluster Health replaces Server Memory in a cluster. (#17)

### Changed
- Saved settings are applied on the server after a save; the console
  reloads only for older servers. (#15, #16)
- The console uses the server's renamed registry capability and web
  interface client. (#12)
- The inbuxa kitten mark, and the name in lowercase where people see it.
  (#11, #23, #25)

## [2026.9.21.2] - 2026-09-21

A rebuild of 2026.9.21 with a release build fix. Nothing in the console
changes.

## [2026.9.21] - 2026-09-21

The first release of inbuxa Admin.

### Added
- Sections across the top, and a choice between two shells.
- Guided wizards, opt-in every time, with automatic DNS first.
- Help on every option and every page, and hover cards for domains and
  people.
- A dashboard where every number leads somewhere, with real counts, charts,
  and a status line only when something needs a look.
- Legacy protocols: a screen to switch them, the impact of each, and a
  per-tenant switch.
- The same themes as inbuxa webmail, stored with the account.
- Sign-in straight at the server's sign-in page, and as `inbuxa-admin` when
  the console is hosted apart from the server.
- Its own dated version, and a link to the exact source of the version
  running.

## Earlier releases

inbuxa Admin started from version 1.0.11 of the upstream web UI. That
project's changelog up to then is in the history: `git show
27c19de^:CHANGELOG.md`.
