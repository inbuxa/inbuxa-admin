# Security policy

## Supported versions

Security fixes go into the newest release and into every older line still
inside its security window. When a new series ships, the one before it gets
three more months of security fixes. The full policy is on
[Versions and upgrades](https://docs.inbuxa.org/versions/).

| Version | Supported |
| --- | --- |
| `main` and the newest release | :white_check_mark: |
| The previous series, for three months after a new one ships | Security fixes only |
| 2026.x, until three months after 27.1 ships | Security fixes only |
| Release candidates | Replaced by the next candidate |
| Anything older | :x: |

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** An issue is
visible to everyone, including whoever would use it, before there is a fix.

Report it privately by email to:

**securityATcoffeylabsDOTorg**

Include as much as you can of: what it lets someone do, how to reproduce it,
the version or commit affected, and whether it needs an authenticated session
or a particular role.

This is an administrative interface, so a few things are worth calling out as
in scope even though they are not bugs in the usual sense: anything that lets
a session act beyond the permissions its account holds, anything that leaks
another tenant's data, and anything that exposes a token or a secret to a
place it should not reach — the URL, the page, or storage that outlives the
session.

You'll get an acknowledgement within a few days. A report that turns out to
affect the mail server rather than this interface will be moved to
[inbuxa-server](https://git.coffeylabs.org/inbuxa/inbuxa-server), and one that affects
upstream Stalwart's web interface will be passed to Stalwart Labs with credit
to you.
