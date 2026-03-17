#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Usage: publish.sh <prototype-id> --hub-repo <path-to-hub-repo>"
    echo ""
    echo "Publishes a prototype from your personal workspace to the shared hub."
    echo ""
    echo "Arguments:"
    echo "  <prototype-id>     The prototype ID to publish (must exist in prototypes.json)"
    echo "  --hub-repo <path>  Path to your local clone of the arena-hub repo"
    exit 1
}

if [ $# -lt 3 ]; then
    usage
fi

PROTO_ID="$1"
shift

HUB_REPO=""
while [ $# -gt 0 ]; do
    case "$1" in
        --hub-repo) HUB_REPO="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; usage ;;
    esac
done

HUB_REPO="${HUB_REPO/#\~/$HOME}"

if [ -z "$HUB_REPO" ]; then
    echo "Error: --hub-repo is required"
    usage
fi

if [ ! -d "$HUB_REPO" ]; then
    echo "Error: Hub repo not found at $HUB_REPO"
    echo "Clone the arena-hub repo first, then try again."
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo "Error: jq is required. Install with: brew install jq"
    exit 1
fi

WS_MANIFEST="$WORKSPACE_ROOT/prototypes.json"
HUB_MANIFEST="$HUB_REPO/prototypes.json"

if [ ! -f "$WS_MANIFEST" ]; then
    echo "Error: prototypes.json not found in workspace at $WORKSPACE_ROOT"
    exit 1
fi

PROTO_JSON=$(jq -e --arg id "$PROTO_ID" '.prototypes[] | select(.id == $id)' "$WS_MANIFEST" 2>/dev/null)
if [ -z "$PROTO_JSON" ]; then
    echo "Error: Prototype '$PROTO_ID' not found in workspace prototypes.json"
    exit 1
fi

PROTO_NAME=$(echo "$PROTO_JSON" | jq -r '.name')
echo "Publishing \"$PROTO_NAME\" ($PROTO_ID) to hub..."

PROTO_DIR="$WORKSPACE_ROOT/prototypes/$PROTO_ID"
if [ ! -d "$PROTO_DIR" ]; then
    echo "Error: Prototype directory not found at prototypes/$PROTO_ID/"
    exit 1
fi

echo "  Copying prototype files..."
mkdir -p "$HUB_REPO/prototypes"
rm -rf "$HUB_REPO/prototypes/$PROTO_ID"
cp -R "$PROTO_DIR" "$HUB_REPO/prototypes/$PROTO_ID"

echo "  Updating hub manifest..."
if [ ! -f "$HUB_MANIFEST" ]; then
    echo '{"team":[],"prototypes":[]}' > "$HUB_MANIFEST"
fi

TEAM_JSON=$(jq '.team' "$WS_MANIFEST")
EXISTING=$(jq -e --arg id "$PROTO_ID" '.prototypes[] | select(.id == $id)' "$HUB_MANIFEST" 2>/dev/null || true)

if [ -n "$EXISTING" ]; then
    jq --arg id "$PROTO_ID" --argjson proto "$PROTO_JSON" \
        '.prototypes = [.prototypes[] | if .id == $id then $proto else . end]' \
        "$HUB_MANIFEST" > "$HUB_MANIFEST.tmp" && mv "$HUB_MANIFEST.tmp" "$HUB_MANIFEST"
    echo "  Updated existing prototype entry in hub manifest."
else
    jq --argjson proto "$PROTO_JSON" \
        '.prototypes += [$proto]' \
        "$HUB_MANIFEST" > "$HUB_MANIFEST.tmp" && mv "$HUB_MANIFEST.tmp" "$HUB_MANIFEST"
    echo "  Added new prototype entry to hub manifest."
fi

CREATOR_ID=$(echo "$PROTO_JSON" | jq -r '.createdBy')
CREATOR_EXISTS=$(jq -e --arg id "$CREATOR_ID" '.team[] | select(.id == $id)' "$HUB_MANIFEST" 2>/dev/null || true)
if [ -z "$CREATOR_EXISTS" ]; then
    CREATOR_JSON=$(jq -e --arg id "$CREATOR_ID" '.team[] | select(.id == $id)' "$WS_MANIFEST" 2>/dev/null || true)
    if [ -n "$CREATOR_JSON" ]; then
        jq --argjson member "$CREATOR_JSON" '.team += [$member]' \
            "$HUB_MANIFEST" > "$HUB_MANIFEST.tmp" && mv "$HUB_MANIFEST.tmp" "$HUB_MANIFEST"
        echo "  Added team member to hub manifest."
    fi
fi

echo "  Committing..."
cd "$HUB_REPO"
git add .
git commit -m "Publish: $PROTO_NAME"

if git remote get-url origin &>/dev/null; then
    echo "  Pushing to remote..."
    git push --set-upstream origin main
    echo ""
    echo "Done! \"$PROTO_NAME\" is now live on the public hub."
else
    echo ""
    echo "Done! \"$PROTO_NAME\" has been committed to the local hub repo."
    echo "To push to remote, add a remote first:"
    echo "  cd \"$HUB_REPO\" && git remote add origin <repo-url> && git push -u origin main"
fi
