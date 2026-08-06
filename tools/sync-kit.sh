#!/bin/sh
# Vendort die benoetigten obsidian-kit-Module. Nach Kit-Updates erneut ausfuehren.
# Der Header entsteht erst beim Vendoring — ein blankes `cp` verliert ihn still.
set -e

KIT=../obsidian-kit
VER=$(node -p "require('$KIT/package.json').version")
SHA=$(git -C "$KIT" rev-parse --short HEAD)

mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit

stamp() { # stamp <vendored-file> <kit-relative-path>
  header="// vendored from obsidian-kit@$VER, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

for m in i18n; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts -> src/vendor/kit/$m.ts"
done

# obsidian-gekoppelte Kit-Module liegen im Kit unter src/obsidian/, nicht src/pure/ —
# eigener Kopierblock je Modul, wie beim Test-Mock unten. Ziel ist hier trotzdem
# src/vendor/: vendorter Code gehoert unter vendor/, sonst liest er sich wie eigener
# und faellt aus jedem Werkzeug heraus, das vendor/ gesondert behandelt.
cp "$KIT/src/obsidian/folder-suggest.ts" src/vendor/kit-obsidian/folder-suggest.ts
stamp src/vendor/kit-obsidian/folder-suggest.ts "src/obsidian/folder-suggest.ts"
echo "vendored obsidian-kit@$VER/obsidian/folder-suggest.ts -> src/vendor/kit-obsidian/"

# Der Test-Mock gehoert in denselben Sync: ein per Hand kopierter Snapshot bekommt
# keinen Header und wird von Kit-Updates nicht erfasst — er driftet still. Ziel ist
# tests/vendor/, NICHT src/vendor/: der Community-Store-Scanner (Developer Dashboard)
# haelt sich nicht an eslint.config.mjs' ignores und durchsucht jede .ts-Datei unter
# src/ — ein permissiver Test-Mock dort erzeugt Dutzende no-unsafe-*-Warnings und eine
# schlechtere Store-Bewertung, obwohl `npm run lint` lokal sauber bleibt (gemessen
# 2026-08-06, Developer-Dashboard-Scan von 0.1.0).
cp "$KIT/src/testing/obsidian-mock.ts" tests/vendor/kit/obsidian-mock.ts
stamp tests/vendor/kit/obsidian-mock.ts "src/testing/obsidian-mock.ts"
echo "vendored obsidian-kit@$VER/testing/obsidian-mock.ts -> tests/vendor/kit/"

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "i18n.ts, ../kit-obsidian/folder-suggest.ts, ../../tests/vendor/kit/obsidian-mock.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. endpoint_config bewusst NICHT vendored: sein authHeaders() erzeugt 'Bearer', paperless braucht 'Token'."
}
JSON
echo "VENDOR.json -> $VER ($SHA)"
