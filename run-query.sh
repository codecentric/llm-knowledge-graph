#!/usr/bin/env bash
# =============================================================================
# run-query.sh  –  SPARQL-Abfragen gegen den Knowledge Graph ausführen
#
# Verwendung:
#   ./run-query.sh              → interaktives Menü
#   ./run-query.sh <nummer>     → Query direkt starten (z. B. ./run-query.sh 3)
#   ./run-query.sh --list       → nur Übersicht ausgeben, nichts ausführen
#   ./run-query.sh --help       → diese Hilfe
#
# Voraussetzung: einmalig `cd .agents/skills/sparql-query && npm install`
# =============================================================================

set -euo pipefail

WORKSPACE="$(cd "$(dirname "$0")" && pwd)"
SKILL="$WORKSPACE/.agents/skills/sparql-query"
RUNNER="$SKILL/scripts/query.js"
GRAPH="$WORKSPACE/graph"
QUERIES="$WORKSPACE/queries"

# Farben (deaktivieren falls kein TTY)
if [ -t 1 ]; then
  BOLD="\033[1m"
  DIM="\033[2m"
  CYAN="\033[1;36m"
  GREEN="\033[1;32m"
  YELLOW="\033[1;33m"
  MAGENTA="\033[1;35m"
  RESET="\033[0m"
else
  BOLD="" DIM="" CYAN="" GREEN="" YELLOW="" MAGENTA="" RESET=""
fi

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------

die() { echo -e "${BOLD}Fehler:${RESET} $*" >&2; exit 1; }

check_deps() {
  command -v node >/dev/null 2>&1 || die "Node.js ist nicht installiert."
  [ -f "$RUNNER" ] || die "Skill-Skript nicht gefunden: $RUNNER"
  if ! node -e "require('@comunica/query-sparql-file')" 2>/dev/null; then
    echo -e "${YELLOW}Abhängigkeiten fehlen – werden jetzt installiert …${RESET}"
    cd "$SKILL" && npm install --silent
    cd "$WORKSPACE"
  fi
}

# Erste Kommentarzeile (Beschreibung) aus einer .rq-Datei lesen
query_title() {
  grep -m1 '^#' "$1" | sed 's/^#[[:space:]]*//'
}

# ---------------------------------------------------------------------------
# Query-Katalog  (QUERY_FILES + QUERY_LABELS + QUERY_FILES_EXTRA)
#
# Format je Eintrag:
#   QUERY_FILES[i]  = Pfad zur .rq-Datei
#   QUERY_LABELS[i] = Anzeigename im Menü
#   QUERY_TTL[i]    = Leerzeichen-getrennte TTL-Dateien (mehrere erlaubt)
# ---------------------------------------------------------------------------

QUERY_FILES=()
QUERY_LABELS=()
QUERY_TTL=()

add_query() {
  # add_query <rq-datei> <ttl-dateien…>
  local rq="$1"; shift
  local ttl_files="$*"
  QUERY_FILES+=("$rq")
  QUERY_LABELS+=("$(query_title "$rq")")
  QUERY_TTL+=("$ttl_files")
}

# ── Glossar ──────────────────────────────────────────────────────────────────
add_query "$QUERIES/glossary/alle-konzepte.rq"  "$GRAPH/glossary.ttl"
add_query "$QUERIES/glossary/top-konzepte.rq"   "$GRAPH/glossary.ttl"
add_query "$QUERIES/glossary/hierarchie.rq"      "$GRAPH/glossary.ttl"

# ── Versand ──────────────────────────────────────────────────────────────────
add_query "$QUERIES/versand/alle-versandpartner.rq"              "$GRAPH/versand.ttl"
add_query "$QUERIES/versand/lieferlaender-pro-partner.rq"        "$GRAPH/versand.ttl"
add_query "$QUERIES/versand/kostenlos-versand-schwellenwerte.rq" "$GRAPH/versand.ttl"
add_query "$QUERIES/versand/laendersperren.rq"                   "$GRAPH/versand.ttl"
add_query "$QUERIES/versand/offene-punkte.rq"                    "$GRAPH/versand.ttl"

# ── Personen ─────────────────────────────────────────────────────────────────
PERSONEN_TTL="$GRAPH/personen/thomas.ttl $GRAPH/personen/sarah.ttl $GRAPH/personen/julia.ttl $GRAPH/personen/lena.ttl $GRAPH/personen/marco.ttl"

add_query "$QUERIES/personen/alle-stakeholder.rq"          $PERSONEN_TTL
add_query "$QUERIES/personen/entscheidungen-pro-person.rq" $PERSONEN_TTL
add_query "$QUERIES/personen/offene-fragen.rq"             $PERSONEN_TTL

TOTAL=${#QUERY_FILES[@]}

# ---------------------------------------------------------------------------
# Menü ausgeben
# ---------------------------------------------------------------------------

print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${CYAN}${BOLD}║     Knowledge Graph – SPARQL Query Runner                    ║${RESET}"
  echo -e "${CYAN}${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

print_menu() {
  local section=""
  for i in "${!QUERY_FILES[@]}"; do
    local num=$((i + 1))
    local rq="${QUERY_FILES[$i]}"
    local label="${QUERY_LABELS[$i]}"

    # Abschnitts-Überschrift aus Verzeichnisname ableiten
    local dir
    dir=$(basename "$(dirname "$rq")")
    if [ "$dir" != "$section" ]; then
      section="$dir"
      case "$dir" in
        glossary) echo -e "  ${MAGENTA}${BOLD}── Glossar ──────────────────────────────────────${RESET}" ;;
        versand)  echo -e "  ${YELLOW}${BOLD}── Versand ──────────────────────────────────────${RESET}" ;;
        personen) echo -e "  ${GREEN}${BOLD}── Personen / Stakeholder ───────────────────────${RESET}" ;;
        *)        echo -e "  ${BOLD}── $dir ──${RESET}" ;;
      esac
    fi

    printf "  ${BOLD}%2d)${RESET}  %s\n" "$num" "$label"
  done
  echo ""
  echo -e "   ${DIM}0)  Beenden${RESET}"
  echo ""
}

# ---------------------------------------------------------------------------
# Query ausführen
# ---------------------------------------------------------------------------

run_query() {
  local idx=$1   # 0-basiert
  local rq="${QUERY_FILES[$idx]}"
  local ttl="${QUERY_TTL[$idx]}"
  local label="${QUERY_LABELS[$idx]}"

  echo ""
  echo -e "${CYAN}${BOLD}▶  $label${RESET}"
  echo -e "${DIM}   Query:  ${rq#"$WORKSPACE/"}${RESET}"
  echo -e "${DIM}   Graph:  ${ttl//$WORKSPACE\//}${RESET}"
  echo ""

  # --file-Argumente aus Leerzeichen-getrennter Liste bauen
  local file_args=()
  for f in $ttl; do
    file_args+=("--file" "$f")
  done

  node "$RUNNER" "${file_args[@]}" --query "$rq"
  echo ""
}

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

case "${1:-}" in
  --help|-h)
    echo "Verwendung: $0 [<nummer> | --list | --help]"
    echo ""
    echo "  Ohne Argument:   interaktives Menü"
    echo "  <nummer>:        Query direkt ausführen (1–$TOTAL)"
    echo "  --list:          Übersicht aller Queries ausgeben"
    echo "  --help:          diese Hilfe"
    exit 0
    ;;

  --list|-l)
    print_header
    print_menu
    exit 0
    ;;

  ''|*)
    # Direktaufruf mit Nummer?
    if [[ "${1:-}" =~ ^[0-9]+$ ]]; then
      num="${1}"
      check_deps
      (( num >= 1 && num <= TOTAL )) || die "Ungültige Nummer: $num (1–$TOTAL erlaubt)."
      run_query $((num - 1))
      exit 0
    fi

    # Interaktives Menü
    check_deps
    print_header

    while true; do
      print_menu
      printf "  Bitte Nummer eingeben (1–%d, 0 = Beenden): " "$TOTAL"
      read -r choice

      # Leerzeichen tolerieren
      choice="${choice// /}"

      if [[ "$choice" == "0" ]] || [[ -z "$choice" ]]; then
        echo -e "\n${DIM}Tschüss!${RESET}\n"
        exit 0
      fi

      if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > TOTAL )); then
        echo -e "${YELLOW}  Ungültige Eingabe – bitte eine Zahl zwischen 1 und $TOTAL eingeben.${RESET}"
        continue
      fi

      run_query $((choice - 1))

      printf "  ${DIM}[Enter] zurück zum Menü …${RESET} "
      read -r
    done
    ;;
esac
