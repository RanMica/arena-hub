#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TEAM_FILE="$ROOT_DIR/team.json"

usage() {
    cat <<EOF
Usage:
  $0 add   --name "Name" --email "email" --role "Role" [--admin]
  $0 remove --email "email"
  $0 edit   --email "email" [--name "Name"] [--role "Role"] [--admin | --no-admin]
EOF
    exit 1
}

[[ $# -lt 1 ]] && usage
ACTION="$1"; shift

python3 - "$TEAM_FILE" "$ACTION" "$ROOT_DIR" "$@" <<'PYTHON'
import sys, json, re, os

team_path = sys.argv[1]
action = sys.argv[2]
root_dir = sys.argv[3]
args = sys.argv[4:]

def parse_args(args):
    d = {}
    i = 0
    while i < len(args):
        a = args[i]
        if a == '--admin':
            d['admin'] = True
        elif a == '--no-admin':
            d['admin'] = False
        elif a.startswith('--') and i + 1 < len(args):
            d[a[2:]] = args[i + 1]
            i += 1
        i += 1
    return d

opts = parse_args(args)

with open(team_path, 'r') as f:
    team = json.load(f)

if action == 'add':
    name = opts.get('name', '')
    email = opts.get('email', '')
    role = opts.get('role', '')
    is_admin = opts.get('admin', False)

    if not name or not email:
        print("Error: --name and --email are required for 'add'")
        sys.exit(1)

    if any(m['email'] == email for m in team):
        print(f"Error: a team member with email '{email}' already exists")
        sys.exit(1)

    slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    entry = {'id': slug, 'name': name, 'role': role, 'email': email}
    if is_admin:
        entry['admin'] = True

    team.append(entry)
    print(f'Added "{name}" ({email}) to the team.')

elif action == 'remove':
    email = opts.get('email', '')
    if not email:
        print("Error: --email is required for 'remove'")
        sys.exit(1)

    member = next((m for m in team if m['email'] == email), None)
    if not member:
        print(f"Error: no team member with email '{email}'")
        sys.exit(1)

    if member.get('admin'):
        admin_count = sum(1 for m in team if m.get('admin'))
        if admin_count <= 1:
            print("Error: cannot remove the last admin. Grant admin to another member first.")
            sys.exit(1)

    team = [m for m in team if m['email'] != email]
    print(f'Removed "{member["name"]}" ({email}) from the team.')

elif action == 'edit':
    email = opts.get('email', '')
    if not email:
        print("Error: --email is required for 'edit'")
        sys.exit(1)

    member = next((m for m in team if m['email'] == email), None)
    if not member:
        print(f"Error: no team member with email '{email}'")
        sys.exit(1)

    if 'name' in opts:
        member['name'] = opts['name']
        member['id'] = re.sub(r'[^a-z0-9]+', '-', opts['name'].lower()).strip('-')
    if 'role' in opts:
        member['role'] = opts['role']
    if 'admin' in opts:
        if opts['admin'] is False and member.get('admin'):
            admin_count = sum(1 for m in team if m.get('admin'))
            if admin_count <= 1:
                print("Error: cannot revoke admin from the last admin.")
                sys.exit(1)
        if opts['admin']:
            member['admin'] = True
        else:
            member.pop('admin', None)

    print(f'Updated "{member["name"]}" ({email}).')
else:
    print(f"Error: unknown action '{action}'. Use add, remove, or edit.")
    sys.exit(1)

with open(team_path, 'w') as f:
    json.dump(team, f, indent=2)
    f.write('\n')

# Rebuild manifest
build_script = os.path.join(root_dir, 'scripts', 'build-manifest.sh')
if os.path.exists(build_script):
    os.system(f'bash "{build_script}"')

print('Done. Reload the hub to see changes.')
PYTHON
