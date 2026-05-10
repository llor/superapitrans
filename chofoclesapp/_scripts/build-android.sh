#!/usr/bin/env bash
set -euo pipefail

# build-android.sh — bumpea patch en package.json, vite build, cap sync,
# gradle assembleDebug y opcionalmente adb install -r.
#
# Uso:
#   _scripts/build-android.sh           # bump + build + APK
#   _scripts/build-android.sh install   # idem + adb install -r en el dispositivo conectado

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

log()  { printf '[build-android] %s\n' "$*"; }
fail() { printf '[build-android][ERROR] %s\n' "$*" >&2; exit 1; }

# 1) Bump patch en package.json (0.2.1 -> 0.2.2 -> ...)
node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json','utf8')); const [M,m,x]=p.version.split('.').map(Number); p.version=\`\${M}.\${m}.\${x+1}\`; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n'); console.log(p.version);" > .new-version
NEW=$(cat .new-version); rm .new-version
log "Versión nueva: $NEW"

# 2) Vite build
log "vite build"
npm run build > /dev/null

# 3) Cap sync
log "cap sync android"
npx cap sync android > /dev/null

# 4) Gradle assembleDebug
log "gradle assembleDebug"
( cd android && ./gradlew assembleDebug -q )

APK="$ROOT_DIR/android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || fail "No se generó $APK"
log "APK lista: $APK"

# 5) Instalación opcional
if [ "${1:-}" = "install" ]; then
    log "adb install -r"
    adb install -r "$APK"
    log "OK. Versión instalada: $NEW"
fi
