#!/usr/bin/env bash
# Publishes server.json to the official MCP Registry as pro.cribsheet/cribsheet.
# Domain proof: https://cribsheet.pro/.well-known/mcp-registry-auth holds the public half of the
# Ed25519 key kept outside the repo (default ~/.config/cribsheet/mcp-registry.pem).
# Bump "version" in server.json first, then: bash tools/publish-mcp-registry.sh
set -euo pipefail
cd "$(dirname "$0")/.."
KEY="${CRIBSHEET_REGISTRY_KEY:-$HOME/.config/cribsheet/mcp-registry.pem}"
# The Ed25519 seed is the last 32 bytes of the PKCS#8 DER key.
PRIV="$(openssl pkey -in "$KEY" -outform DER | tail -c 32 | xxd -p -c 64)"
mcp-publisher login http --domain cribsheet.pro --private-key "$PRIV"
mcp-publisher publish
