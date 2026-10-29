# INBUXA Admin as an image: the built interface and a static server for it.
#
# The interface is static files and nothing else -- it talks to the mail server
# from the browser, never from here -- so this is nginx with a SPA fallback and
# no back end of its own.
#
# It is built here from the source, not copied from a `dist/` built outside.
# `dist/` is not in the repository (.gitignore keeps it out), and an image
# made from a local one would be a build nobody can reproduce from the commit
# it claims.
# Docker Hub images, pulled through Google's mirror: GitHub's shared runners
# hit Docker Hub's anonymous pull limit (429), which the mirror is not subject
# to. Same images, same digests (checked 2026-10-09).
FROM mirror.gcr.io/library/node:26-alpine AS build
WORKDIR /build
# The lockfile alone first, so a commit that changes no dependency reuses this
# layer instead of resolving the tree again.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The commit being built, for /.well-known/source. The release workflow passes
# it; a build without it writes no source document.
ARG INBUXA_REVISION=""
ENV INBUXA_REVISION=${INBUXA_REVISION}
# The version comes from inbuxa-version.json, which the release commits before
# this builds, so there is nothing to pass in here.
RUN npm run build

FROM mirror.gcr.io/nginxinc/nginx-unprivileged:1.29-alpine
# Unprivileged nginx, which runs as uid 101 and cannot bind 80. 8080 is the
# port it listens on and the one to publish.
EXPOSE 8080
# Owned by the nginx user (uid 101 in this image), not root: the entrypoint
# below rewrites index.html, and cannot if the file is root's. The directory
# stays root's, which is why the entrypoint writes through the file rather
# than replacing it.
COPY --from=build --chown=101:101 /build/dist /usr/share/nginx/html
# The nginx user's too, so listen-ipv6.sh can add the IPv6 listener at start.
COPY --chown=101:101 docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 docker/listen-ipv6.sh /docker-entrypoint.d/11-listen-ipv6.sh
COPY --chmod=0755 docker/entrypoint.sh /docker-entrypoint.d/40-api-base-url.sh
