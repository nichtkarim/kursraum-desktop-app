#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd -- "$project_dir"
if [[ "$(uname -s)" != Linux ]]; then
  echo 'Dieses Skript benötigt Linux.' >&2
  exit 1
fi
command -v node >/dev/null || { echo 'Bitte Node.js ab Version 20 installieren.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'Bitte npm installieren.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || { echo 'Node.js ab Version 20 erforderlich.' >&2; exit 1; }
echo 'Installiere die festgelegten Abhängigkeiten …'
npm ci --no-audit --no-fund
echo 'Prüfe und baue Kursraum …'
npm test
npm run dist:deb
package_version="$(node -p 'require("./package.json").version')"
package_file="$project_dir/release/kursraum-local_${package_version}_amd64.deb"
test -s "$package_file"
dpkg-deb --info "$package_file"
printf '\nFertig: %s\n' "$package_file"
