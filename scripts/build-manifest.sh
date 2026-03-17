#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

python3 - "$ROOT_DIR" <<'PYTHON'
import sys, json, os, glob

root = sys.argv[1]
team_path = os.path.join(root, 'team.json')
out_path = os.path.join(root, 'prototypes.json')
protos_dir = os.path.join(root, 'prototypes')

team = []
if os.path.exists(team_path):
    with open(team_path) as f:
        team = json.load(f)

prototypes = []

for meta_path in sorted(glob.glob(os.path.join(protos_dir, '*/meta.json'))):
    proto_dir = os.path.dirname(meta_path)
    proto_id = os.path.basename(proto_dir)

    if proto_id.startswith('_'):
        continue

    with open(meta_path) as f:
        meta = json.load(f)

    variant_name_overrides = meta.get('variantNames', {})
    variant_desc_overrides = meta.get('variantDescriptions', {})
    variants = []

    # Single-variant: index.html at prototype root
    root_index = os.path.join(proto_dir, 'index.html')
    if os.path.isfile(root_index):
        display = variant_name_overrides.get('default', 'Default')
        desc = variant_desc_overrides.get('default', '')
        v = {'id': 'default', 'name': display, 'path': f'prototypes/{proto_id}/'}
        if desc:
            v['description'] = desc
        variants.append(v)
    else:
        # Multi-variant: subdirectories containing index.html
        for entry in sorted(os.listdir(proto_dir)):
            sub = os.path.join(proto_dir, entry)
            if os.path.isdir(sub) and os.path.isfile(os.path.join(sub, 'index.html')):
                display = variant_name_overrides.get(entry, entry.replace('-', ' ').replace('_', ' ').title())
                desc = variant_desc_overrides.get(entry, '')
                v = {'id': entry, 'name': display, 'path': f'prototypes/{proto_id}/{entry}/'}
                if desc:
                    v['description'] = desc
                variants.append(v)

    if not variants:
        print(f'  Warning: {proto_id}/ has meta.json but no index.html found — skipping')
        continue

    prototypes.append({
        'id': proto_id,
        'name': meta.get('name', proto_id),
        'description': meta.get('description', ''),
        'createdBy': meta.get('createdBy', ''),
        'variants': variants,
        'createdAt': meta.get('createdAt', '')
    })

manifest = {'team': team, 'prototypes': prototypes}

with open(out_path, 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')

print(f'Built prototypes.json — {len(prototypes)} prototype(s), {len(team)} team member(s)')
PYTHON
