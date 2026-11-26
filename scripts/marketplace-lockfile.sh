#!/bin/sh
set -eu
# Run only in marketplace development checkout with approved registry access.
# Exact version must be supplied after checking official SDK release and advisories.
: "${MCP_SDK_VERSION:?Set reviewed exact SDK version}"
case "$MCP_SDK_VERSION" in *[!0-9.]*|'') exit 1;; esac
npm install --package-lock-only --ignore-scripts --no-audit --no-fund --save-exact "@modelcontextprotocol/sdk@$MCP_SDK_VERSION"
npm ci --ignore-scripts --no-audit --no-fund
npm test
