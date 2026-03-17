#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Usage: $0 <prototype-id> <variant-id>"
    echo ""
    echo "  prototype-id  ID of the prototype (e.g. booking-agent)"
    echo "  variant-id    ID of the variant to delete (e.g. option-b)"
    exit 1
}

[[ $# -lt 2 ]] && usage

PROTO_ID="$1"
VARIANT_ID="$2"

python3 - "$ROOT_DIR" "$PROTO_ID" "$VARIANT_ID" <<'PYTHON'
import sys, json, os, shutil

root_dir   = sys.argv[1]
proto_id   = sys.argv[2]
variant_id = sys.argv[3]

proto_dir = os.path.join(root_dir, 'prototypes', proto_id)
meta_path = os.path.join(proto_dir, 'meta.json')

if not os.path.isfile(meta_path):
    print(f"Error: prototype '{proto_id}' not found (no meta.json)")
    sys.exit(1)

variant_dir = os.path.join(proto_dir, variant_id)
if not os.path.isdir(variant_dir):
    print(f"Error: variant directory '{variant_id}' not found in '{proto_id}'")
    sys.exit(1)

# Count existing variant subdirectories
subdirs = [d for d in os.listdir(proto_dir)
           if os.path.isdir(os.path.join(proto_dir, d))
           and os.path.isfile(os.path.join(proto_dir, d, 'index.html'))]

if len(subdirs) <= 1:
    print(f"Error: cannot delete the last variant of '{proto_id}'.")
    sys.exit(1)

shutil.rmtree(variant_dir)
print(f"Removed directory: prototypes/{proto_id}/{variant_id}/")

# Clean up variantNames in meta.json
with open(meta_path) as f:
    meta = json.load(f)

variant_names = meta.get('variantNames', {})
variant_name = variant_names.pop(variant_id, variant_id)
meta['variantNames'] = variant_names

with open(meta_path, 'w') as f:
    json.dump(meta, f, indent=2)
    f.write('\n')

# Rebuild manifest
build_script = os.path.join(root_dir, 'scripts', 'build-manifest.sh')
if os.path.exists(build_script):
    os.system(f'bash "{build_script}"')

print(f'\nVariant "{variant_name}" deleted from \'{proto_id}\'.')
PYTHON

echo ""
echo "Done. Reload the hub to see the updated variant list."
