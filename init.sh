#!/usr/bin/env bash
# Lock the modeling environment: interpreter, dependencies, skill packages.
#
# Idempotent. Safe to run before every modeling session; it only installs when
# the pinned environment is missing or has drifted.
#
#   ./init.sh                 set up (installs a project-local 3.12 if needed)
#   ./init.sh --bootstrap     also fetch the uv helper when no 3.10+ exists
#   ./init.sh --check         verify only, never install; exit 1 on drift
#   ./init.sh --refresh-lock  re-pin requirements.lock from the installed set
set -euo pipefail

ROOT=$(cd "$(dirname "$0")" && pwd)
CACHE="$ROOT/node_modules/.cache"
VENV=${EVIDENCE_VENV:-"$CACHE/evidence-fm-runtime"}
UV_VERSION=0.13.7
UV_PYTHON_DIR="$CACHE/python"
UV_BIN_DIR="$CACHE/tools"
CHECK_SCRIPT="$ROOT/scripts/check_env.py"

CHECK_ONLY=0
BOOTSTRAP=0
REFRESH_LOCK=0
for argument in "$@"; do
  case "$argument" in
    --check) CHECK_ONLY=1 ;;
    --bootstrap) BOOTSTRAP=1 ;;
    --refresh-lock) REFRESH_LOCK=1 ;;
    -h | --help)
      sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      printf 'init.sh: unknown argument: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

[ -f "$CHECK_SCRIPT" ] || {
  printf 'init.sh: missing %s\n' "${CHECK_SCRIPT#"$ROOT"/}" >&2
  exit 1
}

# Diagnostics go to stderr so command substitutions stay clean.
log() { printf '%s\n' "$*" >&2; }
fail() {
  printf 'init.sh: %s\n' "$*" >&2
  exit 1
}

PIN=$(tr -d '[:space:]' <"$ROOT/.python-version")
[ -n "$PIN" ] || fail ".python-version is empty"

version_ok() {
  "$1" -c 'import sys; print(sys.version_info[:2] == tuple(int(p) for p in sys.argv[1].split(".")))' "$PIN" 2>/dev/null |
    grep -qx True
}

uv_find_python() {
  UV_PYTHON_INSTALL_DIR="$UV_PYTHON_DIR" "$1" python find "$PIN" 2>/dev/null || true
}

# Print an interpreter matching the pin, or return 1.
find_python() {
  if [ -n "${EVIDENCE_PYTHON:-}" ]; then
    candidate=$(command -v "$EVIDENCE_PYTHON" || true)
    [ -n "$candidate" ] || fail "EVIDENCE_PYTHON=$EVIDENCE_PYTHON not found"
    printf '%s\n' "$candidate"
    return 0
  fi
  for name in "python$PIN" python3.13 python3.12 python3.11 python3.10; do
    candidate=$(command -v "$name" || true)
    if [ -n "$candidate" ] && version_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  for uv_binary in "$UV_BIN_DIR/uv" "$UV_BIN_DIR"/uv-*/uv "$(command -v uv || true)"; do
    [ -x "$uv_binary" ] || continue
    candidate=$(uv_find_python "$uv_binary")
    if [ -n "$candidate" ] && version_ok "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

sha256_check() {
  if command -v shasum >/dev/null 2>&1; then
    (cd "$1" && shasum -a 256 -c "$2")
  else
    (cd "$1" && sha256sum -c "$2")
  fi
}

bootstrap_uv() {
  [ "$BOOTSTRAP" -eq 1 ] || return 1
  case "$(uname -s)" in
    Darwin) os=apple-darwin ;;
    Linux) os=unknown-linux-gnu ;;
    *) return 1 ;;
  esac
  case "$(uname -m)" in
    arm64 | aarch64) arch=aarch64 ;;
    x86_64 | amd64) arch=x86_64 ;;
    *) return 1 ;;
  esac
  name="uv-$arch-$os"
  url="https://github.com/astral-sh/uv/releases/download/$UV_VERSION/$name.tar.gz"
  mkdir -p "$UV_BIN_DIR"
  if [ ! -x "$UV_BIN_DIR/$name/uv" ]; then
    log "fetching uv $UV_VERSION into ${UV_BIN_DIR#"$ROOT"/}"
    curl -fsSL "$url" -o "$UV_BIN_DIR/$name.tar.gz"
    curl -fsSL "$url.sha256" -o "$UV_BIN_DIR/$name.tar.gz.sha256"
    sha256_check "$UV_BIN_DIR" "$name.tar.gz.sha256" >/dev/null
    tar -xzf "$UV_BIN_DIR/$name.tar.gz" -C "$UV_BIN_DIR"
    rm -f "$UV_BIN_DIR/$name.tar.gz" "$UV_BIN_DIR/$name.tar.gz.sha256"
  fi
  printf '%s\n' "$UV_BIN_DIR/$name/uv"
}

venv_python() {
  for candidate in "$VENV/bin/python" "$VENV/Scripts/python.exe"; do
    if [ -x "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

if [ "$CHECK_ONLY" -eq 1 ]; then
  python=$(venv_python || find_python || printf '%s\n' "$(command -v python3 || true)")
  [ -n "$python" ] || fail "no python3 available to run the check"
  exec "$python" "$CHECK_SCRIPT"
fi

if python=$(find_python); then
  :
else
  uv_binary=$(bootstrap_uv || true)
  if [ -z "$uv_binary" ]; then
    uv_binary=$(command -v uv || true)
  fi
  [ -n "$uv_binary" ] || fail "no python $PIN found and no uv to install one with. Either:
  brew install python@$PIN      # or
  uv python install $PIN        # or
  pyenv install $PIN
then rerun ./init.sh, or run ./init.sh --bootstrap to fetch uv into the project cache."

  log "installing python $PIN into ${UV_PYTHON_DIR#"$ROOT"/}"
  UV_PYTHON_INSTALL_DIR="$UV_PYTHON_DIR" "$uv_binary" python install --no-bin "$PIN" >/dev/null
  python=$(uv_find_python "$uv_binary")
  [ -n "$python" ] || fail "uv could not provide python $PIN"
fi
log "host interpreter $python"

if existing=$(venv_python); then
  if ! version_ok "$existing"; then
    log "rebuilding ${VENV#"$ROOT"/}: interpreter no longer matches $PIN"
    rm -rf "$VENV"
  fi
fi
if ! venv_python >/dev/null; then
  log "creating ${VENV#"$ROOT"/}"
  "$python" -m venv "$VENV"
fi
python=$(venv_python)

if "$python" "$CHECK_SCRIPT" --quiet >/dev/null 2>&1; then
  log "dependencies already match requirements.lock"
else
  log "installing requirements.lock"
  "$python" -m pip install --quiet --disable-pip-version-check --no-input \
    --require-virtualenv -r "$ROOT/requirements.lock"
fi

if [ "$REFRESH_LOCK" -eq 1 ]; then
  log "re-pinning requirements.lock from the installed set"
  {
    printf '%s\n' "# Pinned execution environment for the .agents/skills/evidence-* packages."
    printf '%s\n' "# Each .agents/skills/*/requirements.txt keeps the declared interface range;"
    printf '%s\n' "# this file fixes the exact versions actually executed. Regenerate with:"
    printf '%s\n' "#   ./init.sh --refresh-lock"
    "$python" -m pip freeze --exclude-editable
  } >"$ROOT/requirements.lock.tmp"
  mv "$ROOT/requirements.lock.tmp" "$ROOT/requirements.lock"
fi

for directory in fm traces checks; do
  mkdir -p "$ROOT/.evidence/$directory"
done

if ! "$python" "$CHECK_SCRIPT" --quiet; then
  fail "environment still does not match the pin; see the errors above"
fi

cat <<EOF
environment locked
  PYTHON=$python
  model root  .evidence/fm
  trace log   .evidence/traces/interview-trace.json
Run model checks with that PYTHON; review changes to requirements.lock.
EOF
