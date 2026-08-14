# syntax=docker/dockerfile:1
#
# Container image for the @haxtheweb/create CLI ("hax").
# Build:  docker build -t hax-cli .
# Run:    docker run --rm hax-cli --help
#          docker run --rm -v "$PWD":/work hax-cli site mysite --path /work
#
FROM node:22-slim

WORKDIR /app

# Install dependencies first for better Docker layer caching.
# package-lock.json is the tracked lockfile; npm ci gives reproducible installs.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build (babel src -> dist, produces dist/create.js).
COPY . .
RUN npm run build

# Run as the non-root `node` user (UID 1000, built into node:22-slim).
USER node

# ENTRYPOINT invokes node directly on the built CLI rather than the `hax` bin
# symlink. `npm ci` installs the package's dependencies but does NOT create bin
# symlinks for the package itself (those are only created on `npm install -g` or
# when the package is a dependency of another package). The package.json `bin`
# field maps `hax` -> `./dist/create.js`, so `node /app/dist/create.js` is the
# equivalent invocation without requiring a wasteful global install step.
ENTRYPOINT ["node", "/app/dist/create.js"]
