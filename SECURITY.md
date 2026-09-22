# Security policy

## Supported versions

INBUXA Admin is developed on `main`, and security fixes are applied there and
in the latest release. Older tags are not backported.

| Version | Supported |
| --- | --- |
| `main` and the latest release | :white_check_mark: |
| Older releases | :x: |

## Reporting a vulnerability

**Please don't open a public issue for a security problem.** An issue is
visible to everyone, including whoever would use it, before there is a fix.

Report it privately by email to:

**johnellisATlinuxDOTcom**

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
