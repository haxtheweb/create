---
description: Publish a HAXsite (surge / Netlify / Vercel) or set up CI deploy with the HAX CLI.
argument-hint: "[surge|netlify|vercel|github-actions|gitlab-ci] [--domain <name>] [--y]"
allowed-tools: Bash(hax:*), Bash(cd:*), Read
---

Publish or set up deployment for a HAXsite with the HAX CLI. Run from the site root (or pass
`--root ./<site>`).

User input: `$ARGUMENTS`

Targets:
- surge.sh: `hax site site:surge` (or `--domain my-site.surge.sh`)
- Netlify: `hax site site:netlify --y` (or `--domain <site-id>`)
- Vercel: `hax site site:vercel --y` (or `--domain <project-name>`)
- GitHub Actions (deploy on push): `hax site setup:github-actions`
- GitLab CI (deploy on push): `hax site setup:gitlab-ci`
- Sync the site's git remote: `hax site site:sync`

Guidance:
- Pick the target from the input; if it's ambiguous, ask which host.
- Publishing to a third-party host is **outward-facing** — confirm the target and domain
  with the user before deploying, unless they already specified it and asked you to proceed.
- Add `--y` for automated deploys once the target is confirmed.

Run the appropriate command and report the resulting URL or next steps.
