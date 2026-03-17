#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Usage: $0 <prototype-id> <variant-name> [source-variant-id] [--description \"...\"]"
    echo ""
    echo "  prototype-id      ID of the prototype (e.g. booking-agent)"
    echo "  variant-name      Human-readable name for the new variant (e.g. \"Option B\")"
    echo "  source-variant-id ID of the variant to copy from (defaults to first variant)"
    echo "  --description     Optional description for the variant"
    exit 1
}

[[ $# -lt 2 ]] && usage

PROTO_ID="$1"
VARIANT_NAME="$2"
SOURCE_VARIANT=""
VARIANT_DESC=""

shift 2
while [[ $# -gt 0 ]]; do
    case "$1" in
        --description)
            VARIANT_DESC="$2"
            shift 2
            ;;
        *)
            if [[ -z "$SOURCE_VARIANT" ]]; then
                SOURCE_VARIANT="$1"
            fi
            shift
            ;;
    esac
done

python3 - "$ROOT_DIR" "$PROTO_ID" "$VARIANT_NAME" "$SOURCE_VARIANT" "$VARIANT_DESC" <<'PYTHON'
import sys, json, os, shutil, re

root_dir      = sys.argv[1]
proto_id      = sys.argv[2]
variant_name  = sys.argv[3]
source_id     = sys.argv[4] if sys.argv[4] else None
variant_desc  = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else None

proto_dir = os.path.join(root_dir, 'prototypes', proto_id)
meta_path = os.path.join(proto_dir, 'meta.json')

if not os.path.isfile(meta_path):
    print(f"Error: prototype '{proto_id}' not found (no meta.json)")
    sys.exit(1)

with open(meta_path) as f:
    meta = json.load(f)

variant_slug = re.sub(r'[^a-z0-9]+', '-', variant_name.lower()).strip('-')

# Detect current structure
root_index = os.path.join(proto_dir, 'index.html')
is_flat = os.path.isfile(root_index)

if is_flat:
    if not source_id:
        source_id = 'default'

    print(f"Restructuring '{proto_id}' from flat to variant subdirectories...")
    sub_dir = os.path.join(proto_dir, source_id)
    os.makedirs(sub_dir, exist_ok=True)

    for item in os.listdir(proto_dir):
        item_path = os.path.join(proto_dir, item)
        if item == 'meta.json' or item_path == sub_dir:
            continue
        shutil.move(item_path, os.path.join(sub_dir, item))

    print(f"  Moved existing files into prototypes/{proto_id}/{source_id}/")
    source_abs = sub_dir
else:
    # Find source variant directory
    subdirs = sorted(d for d in os.listdir(proto_dir)
                     if os.path.isdir(os.path.join(proto_dir, d))
                     and os.path.isfile(os.path.join(proto_dir, d, 'index.html')))

    if not source_id:
        source_id = subdirs[0] if subdirs else 'default'

    source_abs = os.path.join(proto_dir, source_id)
    if not os.path.isdir(source_abs):
        print(f"Error: source variant '{source_id}' not found in '{proto_id}'")
        sys.exit(1)

if os.path.isdir(os.path.join(proto_dir, variant_slug)):
    print(f"Error: variant '{variant_slug}' already exists in prototype '{proto_id}'")
    sys.exit(1)

new_variant_dir = os.path.join(proto_dir, variant_slug)
print(f"Copying '{source_id}' -> '{variant_slug}'...")
shutil.copytree(source_abs, new_variant_dir)

# Update variantNames in meta.json
variant_names = meta.get('variantNames', {})
variant_names[variant_slug] = variant_name
meta['variantNames'] = variant_names

if variant_desc:
    variant_descs = meta.get('variantDescriptions', {})
    variant_descs[variant_slug] = variant_desc
    meta['variantDescriptions'] = variant_descs

with open(meta_path, 'w') as f:
    json.dump(meta, f, indent=2)
    f.write('\n')

# Rebuild manifest
build_script = os.path.join(root_dir, 'scripts', 'build-manifest.sh')
if os.path.exists(build_script):
    os.system(f'bash "{build_script}"')

new_path = f"prototypes/{proto_id}/{variant_slug}/"
print(f'\nVariant "{variant_name}" created at: {new_path}')
print(f'   To work on this variant in Cursor, edit files under that path.')
PYTHON

echo ""
echo "Done. Reload the hub to see the new variant in the segment control."
