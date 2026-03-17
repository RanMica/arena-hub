#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    cat <<EOF
Usage: $0 --name "Name" --description "Description" --creator "creator-id"
EOF
    exit 1
}

[[ $# -lt 2 ]] && usage

python3 - "$ROOT_DIR" "$@" <<'PYTHON'
import sys, json, os, re, shutil

root_dir = sys.argv[1]
args = sys.argv[2:]

opts = {}
i = 0
while i < len(args):
    a = args[i]
    if a.startswith('--') and i + 1 < len(args):
        opts[a[2:]] = args[i + 1]
        i += 1
    i += 1

name = opts.get('name', '')
description = opts.get('description', '')
creator = opts.get('creator', '')

if not name:
    print("Error: --name is required")
    sys.exit(1)
if not creator:
    print("Error: --creator is required")
    sys.exit(1)

team_path = os.path.join(root_dir, 'team.json')
if os.path.exists(team_path):
    with open(team_path) as f:
        team = json.load(f)
    if not any(m['id'] == creator for m in team):
        print(f"Warning: creator '{creator}' not found in team.json")

slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

proto_dir = os.path.join(root_dir, 'prototypes', slug)
template_dir = os.path.join(root_dir, 'prototypes', '_base-template')

if os.path.isdir(proto_dir) and os.path.exists(os.path.join(proto_dir, 'meta.json')):
    print(f"Error: prototype '{slug}' already exists")
    sys.exit(1)

if os.path.exists(template_dir):
    shutil.copytree(template_dir, proto_dir)
    print(f"Created from base template: prototypes/{slug}/")
else:
    os.makedirs(proto_dir, exist_ok=True)
    index_path = os.path.join(proto_dir, 'index.html')
    with open(index_path, 'w') as f:
        f.write(f'<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>{name}</title>\n</head>\n<body>\n    <h1>{name}</h1>\n    <p>{description}</p>\n</body>\n</html>\n')
    print(f"Created directory: prototypes/{slug}/")

today = __import__('datetime').date.today().isoformat()
meta = {
    'name': name,
    'description': description,
    'createdBy': creator,
    'createdAt': today
}

meta_path = os.path.join(proto_dir, 'meta.json')
with open(meta_path, 'w') as f:
    json.dump(meta, f, indent=2)
    f.write('\n')

# Rebuild the manifest so the hub picks up the new prototype immediately
build_script = os.path.join(root_dir, 'scripts', 'build-manifest.sh')
if os.path.exists(build_script):
    os.system(f'bash "{build_script}"')

print(f'\nPrototype "{name}" created successfully.')
print(f'  Directory: prototypes/{slug}/')
print(f'  Creator:   {creator}')
print(f'\nNext steps:')
print(f'  1. Build your prototype in prototypes/{slug}/')
print(f'  2. Reload the hub to see it on the dashboard')
PYTHON
