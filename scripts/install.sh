#!/usr/bin/env sh
set -eu
PRESET="full"
NO_OPEN=0
while [ "$#" -gt 0 ]; do case "$1" in --preset) PRESET="$2"; shift 2;; --no-open) NO_OPEN=1; shift;; *) echo "Unknown option: $1" >&2; exit 2;; esac; done
case "$PRESET" in minimal|default|full) ;; *) echo "Invalid preset: $PRESET" >&2; exit 2;; esac
command -v node >/dev/null 2>&1 || { echo "Node.js 22+ is required" >&2; exit 1; }
MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$MAJOR" -ge 22 ] || { echo "Node.js 22+ is required" >&2; exit 1; }
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
PREVIOUS_VERSION=$(npm list -g corvus --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).dependencies?.corvus?.version||"")}catch{}})' || true)
CORVUS_DATA=${CORVUS_HOME:-"$HOME/.corvus"}
if [ -d "$CORVUS_DATA" ]; then
  BACKUP="$CORVUS_DATA/backups/pre-install-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  for name in config.json corvus.db; do [ ! -f "$CORVUS_DATA/$name" ] || cp "$CORVUS_DATA/$name" "$BACKUP/$name"; done
  echo "Backup created: $BACKUP"
fi
rollback() { if [ -n "${PREVIOUS_VERSION:-}" ]; then echo "Restoring corvus@$PREVIOUS_VERSION" >&2; npm install -g "corvus@$PREVIOUS_VERSION" >/dev/null 2>&1 || true; fi; if [ -n "${BACKUP:-}" ]; then echo "Installation failed; restoring $BACKUP" >&2; for name in config.json corvus.db; do [ ! -f "$BACKUP/$name" ] || cp "$BACKUP/$name" "$CORVUS_DATA/$name"; done; fi; }
trap rollback INT TERM HUP EXIT
npm run build
npm run release:manifest
if [ -f dist/release-manifest.sig ] && [ -f security/release-public-key.pem ]; then node -e 'const fs=require("fs"),c=require("crypto");if(!c.verify(null,fs.readFileSync("dist/release-manifest.json"),c.createPublicKey(fs.readFileSync("security/release-public-key.pem")),Buffer.from(fs.readFileSync("dist/release-manifest.sig","utf8").trim(),"base64")))process.exit(1)'; fi
node -e 'const fs=require("fs"),c=require("crypto"),p=require("path"),m=JSON.parse(fs.readFileSync("dist/release-manifest.json"));for(const f of m.files){const h=c.createHash("sha256").update(fs.readFileSync(p.join("dist",f.path))).digest("hex");if(h!==f.sha256)throw new Error("Checksum mismatch: "+f.path)}'
npm install -g .
corvus bundle apply "$PRESET"
corvus doctor --json
trap - INT TERM HUP EXIT
if [ "$NO_OPEN" -eq 0 ]; then corvus --web-only >/tmp/corvus-web.log 2>&1 & echo "Corvus WebUI starting; see /tmp/corvus-web.log"; fi
