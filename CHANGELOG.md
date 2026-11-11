# Changelog

All notable changes to inbuxa Admin, the console for inbuxa-server.

Versions follow the inbuxa suite: a series (`27.1`), its patches (`27.1.3`),
and release candidates before a series ships (`27.1-rc.1`). The tag is the
version with a `v`. Releases before 27.1 are dated (`2026.10.26.5`). The 2026
series is kept on the `release/2026` branch and holds `:latest` until 27.1
ships. Its releases are listed here too, by date.

Each release's page has its container image and files:
https://git.coffeylabs.org/inbuxa/inbuxa-admin/releases.

Every version PR adds that version's entry here. CI refuses a version this
file has no entry for (`tools/changelog-check.sh`).

## [27.1-rc.14] - 2026-11-11

Pairs with inbuxa-server 27.1-rc.21.

### Changed
- Sign-in asks the server's sign-in page for the console's light or dark
  look, so the page no longer switches to the device's setting in between.
  Servers before 27.1-rc.21 ignore it. (#194, inbuxa-server #375)

### Fixed
- Search (Ctrl+K) finds the console's own pages, such as Deleted Accounts,
  Legal Holds and Store Check. It shows a page exactly when the sidebar does,
  with the same permission checks. (#193, fixes #192)

## [27.1-rc.13] - 2026-11-10

Pairs with inbuxa-server 27.1-rc.19.

### Added
- Encrypted senders, under Settings › Mail flow › Sending: addresses and
  domains whose outgoing mail is only ever delivered encrypted. Each entry is
  a condition at the top of the delivery strategy's TLS rule, pointing at a
  `sender-tls` strategy that requires STARTTLS. Other conditions are left as
  they are. The page warns, with a fix, if its conditions are moved down or
  the strategy stops requiring STARTTLS, and has a switch for whether the
  other server's certificate must be valid. (#190, fixes #187)

## [27.1-rc.12] - 2026-11-10

Pairs with inbuxa-server 27.1-rc.19.

### Added
- Clean up the old store. Once a blob store change is copied, **Clean up the
  old store** on the Blob store changes page deletes from the old store each
  blob whose copy in the current store checks out. **Preview** first counts
  what it would delete and the space that frees, and deletes nothing.
  **Delete from the old store** asks you to confirm that backups from before
  the change have aged out, since they need the old store to restore in full.
  The change shows the latest cleanup, what it kept and why, and a running
  cleanup can be stopped. Needs inbuxa-server 27.1-rc.19. (#185)

## [27.1-rc.11] - 2026-11-10

Pairs with inbuxa-server 27.1-rc.18.

### Added
- The store's own tools, under Settings › Storage. (#181, #182)
  - **Store check** looks for messages and files whose content is missing or
    damaged, quick or full, with limits.
  - **Snapshots** takes a consistent copy of the store for a backup without
    stopping the server.
  - **Blob store changes** shows where the blob store moved from and to,
    copies what the old store still holds, and lists what couldn't be copied.
  - While a change isn't settled, a banner on every page says so, and the
    blob store settings say that changing them moves nothing. Each page needs
    inbuxa-server 27.1-rc.16 or 2026.11.9.1, and says so on an older server.
- Plan a blob store change ahead. **Plan a change** takes the new store's
  settings, with the same fields as the blob store setting. **Copy ahead**
  copies into it while the current store stays the blob store, and **Make it
  the blob store** writes the setting once that copy ends. Needs
  inbuxa-server 27.1-rc.18. (#183)

### Fixed
- The ⓘ beside an option opens on a tap on phones and tablets; it used to
  open only on hover. (#179, #180)

## [27.1-rc.10] - 2026-11-08

Pairs with inbuxa-server 27.1-rc.15.

### Added
- A relay can use one of this server's certificates. In a relay's settings,
  Certificate › Use lists this server's certificates that name the relay's
  public name, the latest of each. Pick one, a wildcard say, and the relay
  gets a copy of it and of each renewal, and nothing is ordered for it. Older
  servers don't offer it. (#177)

### Fixed
- Relay upgrades say why an upload failed. When the release binary, about
  8 MB, never reaches the server, the Upgrade dialog says so and points at
  the upload limit of a proxy in front of it (nginx: `client_max_body_size`),
  instead of only "NetworkError". (#174, #175)

## [27.1-rc.9] - 2026-11-08

Pairs with inbuxa-server 27.1-rc.14.

### Added
- Deleted Accounts, under Management › Directory. With account retention
  set, a deleted account is kept for that time, and its name and addresses
  stay taken. The page lists kept accounts, soonest to be destroyed first.
  Restore one, with a new password for a person and none for a group, or
  destroy it now to free its name, after typing the name to confirm. If the
  server refuses, for example because of a legal hold, its reason is shown.
  (#172, #173)

## [27.1-rc.8] - 2026-11-07

Pairs with inbuxa-server 27.1-rc.12.

### Added
- Order a certificate with the names you choose. A new guide under
  Certificates takes the names, finds the domain they belong to or adds one
  only for certificates (no DKIM keys, nothing published), checks the names
  and orders the certificate. Once it's issued, you can make it the default
  certificate. (#167, #170)
- See why an order failed, and order it again. Above the certificate list,
  each certificate the server orders shows the domain that renews it, the
  next renewal, and the reason the last order failed. **Order again** tells
  the queued renewal to run now. (#167, #170)

### Fixed
- "Certificates, automatically" can add a Let's Encrypt account. The guide
  sent a description the server sets itself, so the server refused it, and
  the guide only worked when a matching account already existed. (#170)

## [27.1-rc.7] - 2026-11-06

Pairs with inbuxa-server 27.1-rc.11.

### Changed
- The DNS wizard can connect a domain with no records to publish, for a
  domain that only needs its DNS host to answer DNS-01 certificate
  challenges: turn every record type off at the Records step. The review and
  last step then say nothing is written. An older server refuses an empty
  list, so use this with inbuxa-server 27.1-rc.11 or later. (#168)

## [27.1-rc.6] - 2026-11-06

Pairs with inbuxa-server 27.1-rc.10.

### Fixed
- The certificates guide keeps a domain's own Certificate Hostnames.
  Switching a domain that already had its own list used to clear it without
  warning. The guide keeps the list, and checks and shows the names it
  orders. A domain without a list gets the defaults, as before. Also in
  2026.10.26.5. (#160, #164)

## [2026.10.26.5] - 2026-11-06

A fix to the certificates guide for the 2026 series, the same as in
27.1-rc.6.

### Fixed
- Certificates guide: switching a domain that already had its own certificate
  hostnames no longer clears them. The guide keeps the list, and checks and
  shows the names it orders. A domain with no list gets the defaults, as
  before. (#165)

## [27.1-rc.5] - 2026-11-06

Pairs with inbuxa-server 27.1-rc.9.

### Changed
- The DNS guide leaves CAA off by default. A CAA record covers every name
  under the domain and ties it to this server's ACME account, so another ACME
  client there is refused at its next renewal; the switch now carries that
  warning. A domain that already publishes CAA still loads with it on. (#162)
- DNS providers show their Description in the list, so two providers of the
  same type can be told apart without opening each one. (#161)
- The manual names console pages by the menu path you see. (#159)

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

## [27.1-rc.4] - 2026-10-31

Pairs with inbuxa-server 27.1-rc.5. Both new pages need it; an older server
doesn't show them.

### Added
- Relays, under Settings › Mail flow › Sending › Relays, for inbuxa Relay.
  Add a relay and copy its join command; see each relay's links, version and
  queues; change its settings, MX preference and certificate; upgrade it with
  a signed release; choose who may link; replace the link CA without a new
  join. The page says when the relay keys are wrapped under a key file.
  (#147 to #153)
- Migrations, under Management › Directory › Migrations. Move a domain in
  from IMAP, JMAP, Microsoft 365 or Google Workspace: preview, move, final
  pass, and the new accounts' passwords once. It needs the Run migrations
  permission. (#154)

## [27.1-rc.3] - 2026-10-29

Pairs with inbuxa-server 27.1-rc.3.

### Added
- `/.well-known/source` is written into the build: the console's name,
  version and license, its public repository, and the commit it was built
  from. (#141)
- The Security page flags OpenID Connect directories with no audience set,
  because those accept tokens issued to any other app at the same provider.
  (#143)

### Changed
- Setting up an OpenID Connect directory asks for the client ID the provider
  issues tokens to, and sends it as the expected audience. Server 27.1-rc.3
  refuses tokens issued to other clients when the audience is set. (#143)

## [27.1-rc.2] - 2026-10-28

### Fixed
- In 27.1-rc.1 and 2026.10.26.2, a console container that was restarted
  rather than recreated failed to start and restarted in a loop, with nginx
  stopping on `duplicate listen [::]:8080`. The IPv6 listener is added only
  once. (#139)

## [27.1-rc.1] - 2026-10-28

The first release candidate of the 27.1 series, with the rest of the inbuxa
suite. The console is the same as 2026.10.26.2.

### Changed
- The console shows its version as `27.1-rc.1`, and releases follow the
  suite's series (`27.1`, then `27.1.N`) instead of dates. Release candidates
  are images `:27.1-rc.N` and `:27.1-rc`, never `:latest`. (#137, #138)

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
