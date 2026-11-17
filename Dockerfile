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
#
# Nothing in the image is written at start: the scripts below write what they
# make (index.html with the server's address, the Content-Security-Policy that
# names it, the IPv6 listener) to /tmp/inbuxa-admin, and nginx keeps its pid
# and temp files in /tmp. So the container can run locked down:
#   docker run --read-only --tmpfs /tmp --cap-drop ALL \
#     --security-opt no-new-privileges -p 8080:8080 \
#     -e API_BASE_URL=https://mail.example.com <image>
# or in compose: read_only: true, tmpfs: [/tmp], cap_drop: [ALL],
# security_opt: [no-new-privileges:true].
EXPOSE 8080
# Owned by root, so the server that serves these files cannot change them.
COPY --from=build /build/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf docker/playground-csp.conf /etc/nginx/inbuxa/
COPY --chmod=0755 docker/listen-ipv6.sh /docker-entrypoint.d/11-listen-ipv6.sh
COPY --chmod=0755 docker/entrypoint.sh /docker-entrypoint.d/40-api-base-url.sh
# The base image's user already; said here so the image never runs as root
# if that changes.
USER 101
