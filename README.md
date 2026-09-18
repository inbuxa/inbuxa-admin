<p align="center">
  <img src="./img/brand/inbuxa-lockup-light.svg" alt="inbuxa" height="120">
</p>

<h3 align="center">INBUXA Admin</h3>

The administration interface for the INBUXA mail server: every server setting,
first-boot setup, and recovery, in the browser.

It is a fork of [Stalwart WebUI](https://github.com/stalwartlabs/webui). Like
upstream it is schema-driven. After signing in it fetches the server's schema
and builds every form, list and menu from it, so it covers every setting the
server has without hardcoding any of them.

> **Status: in development, not released.**

## What's different from upstream

- **One edition.** Nothing is hidden or marked as Enterprise-only. INBUXA
  ships every feature to everybody. See the INBUXA server's `docs/spec/`.
- **Runs anywhere, not on the mail server.** Upstream is installed onto the
  mail server itself. INBUXA Admin is its own deployment, pointed at the server
  either at build time (`VITE_API_BASE_URL`) or at deploy time:
  `<meta name="api-base-url" content="https://mail.example.com">` in
  `index.html`.
- **INBUXA's look:** the logo and ihasmail's palette.
- **Two-factor setup** names INBUXA as the issuer, and no longer makes
  authenticator apps fetch a logo from a third-party site.

## Developing

```bash
npm ci
npm run dev          # http://localhost:5173, against VITE_API_BASE_URL in .env.development
npm run typecheck && npx eslint src/ && npx vitest run
npm run build
```

## Keeping up with upstream

Upstream's history contains no Enterprise-only code, so this is an ordinary
git fork. `upstream` is a fetch-only remote:

```bash
git fetch upstream --tags
git merge v1.0.12        # the next release tag
```

## Versions

INBUXA Admin has its own dated version (`inbuxa-version.json`), shown with the
WebUI release it's based on: `INBUXA Admin 2026.9.18 (WebUI 1.0.11)`.
`package.json` keeps upstream's version, so upstream's bumps merge cleanly.

## License and credits

Free software under the [GNU Affero General Public License, version 3](./LICENSES/AGPL-3.0-only.txt).
A fork of Stalwart WebUI, copyright © Stalwart Labs LLC. Upstream's files are
dual-licensed AGPL-3.0-only or Stalwart's Enterprise License, and INBUXA takes
them under the AGPL-3.0 only. Upstream's copyright notices are kept on every
file. INBUXA isn't affiliated with or endorsed by Stalwart Labs.
