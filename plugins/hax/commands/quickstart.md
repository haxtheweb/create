---
description: Guided HAX quickstart for new users — scaffold a HAXsite and open it live in the browser (hax site → hax serve).
argument-hint: "[site-name]  (optional; defaults to my-hax-site)"
allowed-tools: Bash(hax:*), Bash(cd:*)
---

Walk a brand-new user along the HAX golden path: from nothing to a **live HAXsite
in the browser** in a single pass. Keep it fast and encouraging, and remove
decisions rather than adding them.

User input: `$ARGUMENTS`

Run these steps in order:

1. **Confirm the CLI is ready.** Run `hax --version`. If `hax` is missing, the
   plugin's SessionStart hook normally installs it automatically; if it still is
   not available, tell the user to install Node.js `>=18.20.3` and run
   `npm install --global @haxtheweb/create`, then stop here.

2. **Pick a site name.** Use the name from the input if one was given; otherwise
   default to `my-hax-site`. Do not make the user decide. Mention they can rename
   it or spin up more sites later.

3. **Scaffold the site.** From the current directory (or a directory the user
   names), run:
   `hax site <name> --y --no-i`
   This creates a HAXsite with sensible defaults.

4. **Serve it.** `cd` into the new site folder and start the dev server in the
   **background** (it is long-running and will not return):
   `cd <name> && hax serve`
   Read the startup output for the local URL (usually http://localhost, sometimes
   a different port).

5. **Hand it off.** Tell the user, briefly and warmly:
   - the URL their site is now running at,
   - that this is a real, portable HAXcms site they can edit and publish,
   - one concrete next move — add a page with
     `hax site node:add --title "..." --content "<p>...</p>" --y` (or via
     `/hax:site`), or open the URL and edit content in the HAX authoring UI.

Do not run `hax start` (the interactive Clack menu); this quickstart is the
non-interactive path. The goal is the user seeing their own site live on the first
try, so keep the wrap-up short and celebratory and point clearly at the next edit.
