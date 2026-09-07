#!/bin/sh
# Vendort die benoetigten obsidian-kit-Module. Nach Kit-Updates erneut ausfuehren.
# Der Header entsteht erst beim Vendoring — ein blankes `cp` verliert ihn still.
set -e

KIT=../obsidian-kit
# Zweite Quelle seit obsidian-kit 2ab1bb5 ("domaenenfreie pure-Teilmenge zieht nach
# code-kit"): i18n, settings, error_body und viele weitere liegen nicht mehr unter
# obsidian-kit/src/pure/, sondern im Repo code-kit. Bis 2026-09-02 kopierte dieses Skript
# sie weiter von der alten Stelle und starb an `cp: No such file` — mit einem Schaden, der
# groesser ist als der Abbruch: `set -e` beendet den Lauf NACH der ersten Erfolgsmeldung,
# also laufen die obsidian-gekoppelten Module und der Test-Mock nicht mehr mit, und
# VENDOR.json wird gar nicht erst geschrieben. Die eine Datei, in der man den Stand
# nachschlaegt, behauptet danach den alten — leise.
CODE_KIT=../../code-kit
# Gelesen wird aus einer festen Ref, nicht aus dem Arbeitsstand des Nachbar-Repos
# (CORE-META-22). Umgestellt 2026-09-07; vorher las dieses Skript per `cp` aus $KIT/
# und stempelte mit `rev-parse HEAD` — also einen Stand, den kein Release traegt.
KIT_REF=${KIT_REF:-0.30.0}
CODE_KIT_REF=${CODE_KIT_REF:-0.5.0}

for paar in "$KIT|$KIT_REF" "$CODE_KIT|$CODE_KIT_REF"; do
  repo=${paar%%|*}; ref=${paar##*|}
  git -C "$repo" rev-parse --verify --quiet "$ref^{commit}" >/dev/null \
    || { echo "FEHLER: Ref '$ref' existiert nicht in $repo (KIT_REF/CODE_KIT_REF setzen)." >&2; exit 1; }
done

# ^{commit} ist Pflicht: bei einem annotierten Tag liefert rev-parse sonst das
# Tag-OBJEKT, und in der VENDOR.json steht eine SHA, die im `git log` der Quelle
# gar nicht vorkommt (gemessen an code-kit 0.5.0, 2026-09-02).
VER=$(git -C "$KIT" describe --tags --abbrev=0 "$KIT_REF")
SHA=$(git -C "$KIT" rev-parse --short "$KIT_REF^{commit}")
CODE_VER=$(git -C "$CODE_KIT" describe --tags --abbrev=0 "$CODE_KIT_REF" 2>/dev/null || echo "?")

# Ein pures Modul kann in drei Schichten liegen. Statt fester Zuordnung wird gesucht —
# die naechste Umschichtung im Kit soll dieses Skript nicht wieder toeten, sondern nur
# einen anderen Fundort ergeben. Ausgabe: <pfad>|<quelle>|<quell-relativer-pfad>|<version>
# Gesucht wird in der REF, nicht auf der Platte: `[ -f ]` findet, was im
# Arbeitsverzeichnis des Kits gerade liegt — auch eine Datei, die es im gepinnten
# Stand nie gab. Ausgabe: <repo>|<quelle>|<quell-relativer-pfad>|<version>|<ref>
quelle_fuer() {
  for kandidat in \
    "$KIT|obsidian-kit|src/pure/$1.ts|$VER|$KIT_REF" \
    "$CODE_KIT|code-kit|src/ts/pure/$1.ts|$CODE_VER|$CODE_KIT_REF" \
    "$CODE_KIT|code-kit|src/ts/web/$1.ts|$CODE_VER|$CODE_KIT_REF"; do
    k_repo=$(printf '%s' "$kandidat" | cut -d'|' -f1)
    k_pfad=$(printf '%s' "$kandidat" | cut -d'|' -f3)
    k_ref=$(printf '%s' "$kandidat" | cut -d'|' -f5)
    if git -C "$k_repo" cat-file -e "$k_ref:$k_pfad" 2>/dev/null; then
      printf '%s\n' "$kandidat"; return 0
    fi
  done
  return 1
}

# vendor_aus_ref <ziel> <repo> <ref> <quell-pfad>
# Schreibt ERST nach .tmp: `git show ... > ziel` legt die Datei an, BEVOR git show
# laeuft — fehlt die Quelle, bleibt ein Stummel liegen, der wie ein Vendoring aussieht.
vendor_aus_ref() {
  git -C "$2" show "$3:$4" > "$1.tmp" || {
    rm -f "$1.tmp"
    echo "FEHLER: $4 fehlt in $2@$3 — nichts geschrieben." >&2
    exit 1
  }
  mv "$1.tmp" "$1"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian tests/vendor/kit

stamp() { # stamp <vendored-file> <quell-relativer-pfad> [<quelle> <version>]
  quelle=${3:-obsidian-kit}
  version=${4:-$VER}
  header="// vendored from $quelle@$version, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Erst ALLE Quellen aufloesen, dann kopieren: ein fehlendes Modul ist ein Aufbaufehler
# und wird als solcher gemeldet, statt den Lauf auf halber Strecke abzubrechen.
PURE_MODULE="i18n error_body settings"
for m in $PURE_MODULE; do
  quelle_fuer "$m" >/dev/null || {
    echo "FEHLER: $m.ts liegt weder in obsidian-kit@$KIT_REF:src/pure/ noch in code-kit@$CODE_KIT_REF:src/ts/{pure,web}/." >&2
    echo "  Beide Repos muessen neben diesem liegen; seit obsidian-kit 2ab1bb5 ist code-kit" >&2
    echo "  die Quelle der domaenenfreien Module." >&2
    exit 2
  }
done

for m in $PURE_MODULE; do
  fund=$(quelle_fuer "$m")
  q_repo=$(printf '%s' "$fund" | cut -d'|' -f1)
  quelle=$(printf '%s' "$fund" | cut -d'|' -f2)
  rel=$(printf '%s' "$fund" | cut -d'|' -f3)
  ver=$(printf '%s' "$fund" | cut -d'|' -f4)
  q_ref=$(printf '%s' "$fund" | cut -d'|' -f5)
  vendor_aus_ref "src/vendor/kit/$m.ts" "$q_repo" "$q_ref" "$rel"
  stamp "src/vendor/kit/$m.ts" "$rel" "$quelle" "$ver"
  echo "vendored $quelle@$ver/$rel -> src/vendor/kit/$m.ts"
done

# obsidian-gekoppelte Kit-Module liegen im Kit unter src/obsidian/, nicht src/pure/ —
# eigener Kopierblock je Modul, wie beim Test-Mock unten. Ziel ist hier trotzdem
# src/vendor/: vendorter Code gehoert unter vendor/, sonst liest er sich wie eigener
# und faellt aus jedem Werkzeug heraus, das vendor/ gesondert behandelt.
vendor_aus_ref src/vendor/kit-obsidian/folder-suggest.ts "$KIT" "$KIT_REF" src/obsidian/folder-suggest.ts
stamp src/vendor/kit-obsidian/folder-suggest.ts "src/obsidian/folder-suggest.ts"
echo "vendored obsidian-kit@$VER/obsidian/folder-suggest.ts -> src/vendor/kit-obsidian/"

# settings_walker fehlte hier bis 2026-08-20, obwohl die Datei seit d17ba46 vendored
# und in VENDOR.json von Hand nachgetragen war: ein Lauf haette sie aus der Deklaration
# still entfernt und den Stand auf 0.25.0 einfrieren lassen. Wer ein Modul vendort,
# traegt es hier ein — sonst ist die VENDOR.json eine Behauptung, kein Pin.
vendor_aus_ref src/vendor/kit-obsidian/settings_walker.ts "$KIT" "$KIT_REF" src/obsidian/settings_walker.ts
stamp src/vendor/kit-obsidian/settings_walker.ts "src/obsidian/settings_walker.ts"
echo "vendored obsidian-kit@$VER/obsidian/settings_walker.ts -> src/vendor/kit-obsidian/"

# Der Test-Mock gehoert in denselben Sync: ein per Hand kopierter Snapshot bekommt
# keinen Header und wird von Kit-Updates nicht erfasst — er driftet still. Ziel ist
# tests/vendor/, NICHT src/vendor/: der Community-Store-Scanner (Developer Dashboard)
# haelt sich nicht an eslint.config.mjs' ignores und durchsucht jede .ts-Datei unter
# src/ — ein permissiver Test-Mock dort erzeugt Dutzende no-unsafe-*-Warnings und eine
# schlechtere Store-Bewertung, obwohl `npm run lint` lokal sauber bleibt (gemessen
# 2026-08-06, Developer-Dashboard-Scan von 0.1.0).
vendor_aus_ref tests/vendor/kit/obsidian-mock.ts "$KIT" "$KIT_REF" src/testing/obsidian-mock.ts
stamp tests/vendor/kit/obsidian-mock.ts "src/testing/obsidian-mock.ts"
echo "vendored obsidian-kit@$VER/testing/obsidian-mock.ts -> tests/vendor/kit/"

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "code_kit_version": "$CODE_VER",
  "vendored": "i18n.ts, error_body.ts, settings.ts (aus code-kit, siehe Dateikopf), ../kit-obsidian/folder-suggest.ts, ../kit-obsidian/settings_walker.ts, ../../tests/vendor/kit/obsidian-mock.ts",
  "note": "Verbatim snapshot aus ZWEI Quellen. Never hand-edit. Re-vendor via tools/sync-kit.sh. Seit obsidian-kit 2ab1bb5 liegt die domaenenfreie pure-Teilmenge in code-kit; welche Datei woher stammt, sagt ihr eigener Kopf. endpoint_config bewusst NICHT vendored: sein authHeaders() erzeugt 'Bearer', paperless braucht 'Token'."
}
JSON
echo "VENDOR.json -> $VER ($SHA)"
