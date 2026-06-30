#!/usr/bin/env bash
#
# ensure-hax.sh — SessionStart hook for the HAX Claude Code plugin.
#
# Makes sure the HAX CLI (`hax`, shipped by @haxtheweb/create) is available.
#   - If `hax` is already on PATH, reports its version and exits.
#   - If it is missing, installs @haxtheweb/create globally with npm.
#
# Opt out of auto-install:  export HAX_PLUGIN_NO_AUTOINSTALL=1
#
# This hook never blocks the session: it always exits 0. Anything it prints on
# stdout is surfaced to Claude as session context so the assistant knows whether
# the CLI is ready.

set -uo pipefail

MANUAL_INSTALL="npm install --global @haxtheweb/create"

# --- Already installed? Report and bail. ------------------------------------
if command -v hax >/dev/null 2>&1; then
  ver="$(hax --version 2>/dev/null | head -n1 | tr -d '\r')"
  echo "HAX CLI is available (hax ${ver:-installed}). Use \`hax help\` or the /hax:* slash commands."
  exit 0
fi

# --- Respect opt-out. -------------------------------------------------------
if [ "${HAX_PLUGIN_NO_AUTOINSTALL:-0}" = "1" ]; then
  echo "HAX CLI not found; auto-install disabled (HAX_PLUGIN_NO_AUTOINSTALL=1). Install with: ${MANUAL_INSTALL}"
  exit 0
fi

# --- Need npm to install. ---------------------------------------------------
if ! command -v npm >/dev/null 2>&1; then
  echo "HAX CLI not found and npm is unavailable. Install Node.js (>=18.20.3), then run: ${MANUAL_INSTALL}"
  exit 0
fi

# --- Install globally (one-time). -------------------------------------------
# Human-facing progress goes to stderr; the result line goes to stdout/context.
echo "HAX CLI not found — installing @haxtheweb/create globally (one-time setup)…" 1>&2
if npm install --global @haxtheweb/create >/dev/null 2>&1; then
  ver="$(hax --version 2>/dev/null | head -n1 | tr -d '\r')"
  echo "Installed HAX CLI (hax ${ver:-latest}). Use \`hax help\` or the /hax:* slash commands."
else
  echo "Could not auto-install the HAX CLI (global npm install failed — it may need elevated permissions). Install manually: ${MANUAL_INSTALL}"
fi

exit 0
