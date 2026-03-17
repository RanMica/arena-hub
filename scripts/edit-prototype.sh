#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat <<EOF
Usage: $0 <prototype-id> [--name "New Name"] [--description "New Description"]
EOF
    exit 1
}

[[ $# -lt 2 ]] && usage

python3 - "$ROOT_DIR" "$@" <<'PYTHON'
import sys, json, os

root_dir = sys.argv[1]
proto_id = sys.argv[2]
args = sys.argv[3:]

opts = {}
i = 0
while i < len(args):
    a = args[i]
    if a.startswith('--') and i + 1 < len(args):
        opts[a[2:]] = args[i + 1]
        i += 1
    i += 1

new_name = opts.get('name')
new_desc = opts.get('description')

if not new_name and new_desc is None:
    print("Error: provide at least --name or --description")
    sys.exit(1)

meta_path = os.path.join(root_dir, 'prototypes', proto_id, 'meta.json')
if not os.path.exists(meta_path):
    print(f"Error: prototype '{proto_id}' not found")
    sys.exit(1)

with open(meta_path) as f:
    meta = json.load(f)

if new_name:
    meta['name'] = new_name
if new_desc is not None:
    meta['description'] = new_desc

with open(meta_path, 'w') as f:
    json.dump(meta, f, indent=2)
    f.write('\n')

build_script = os.path.join(root_dir, 'scripts', 'build-manifest.sh')
if os.path.exists(build_script):
    os.system(f'bash "{build_script}"')

print(f'Prototype "{proto_id}" updated successfully.')
PYTHON
