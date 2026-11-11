#!/usr/bin/env bash
# JTDDiagrammar installer for Linux and macOS (URS-NF-010).
#   curl -fsSL https://github.com/jtddigital/JTDDiagrammar/releases/latest/download/install.sh | bash
#   bash install.sh v1.2.3          # a specific release
# Private repository: set GITHUB_TOKEN, or log in with `gh auth login`.
# Overrides: JTD_HOME (install dir), JTD_BIN (launcher dir), JTD_REPO, JTD_API.
set -euo pipefail

REPO="${JTD_REPO:-jtddigital/JTDDiagrammar}"
API="${JTD_API:-https://api.github.com}"
JTD_HOME="${JTD_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/jtddiagrammar}"
JTD_BIN="${JTD_BIN:-$HOME/.local/bin}"
WANT="${1:-latest}"
ASSET=jtddiagrammar.tar.gz

say() { printf 'jtddiagrammar: %s\n' "$*" >&2; }
die() { say "$*"; exit 1; }

command -v node >/dev/null || die "Node.js 22.18 or later is required: https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)' ||
  die "Node.js 22.18 or later is required (found $(node --version))"
for c in curl tar; do command -v "$c" >/dev/null || die "$c is required"; done

TOKEN="${GITHUB_TOKEN:-${GH_TOKEN:-}}"
if [ -z "$TOKEN" ] && command -v gh >/dev/null; then TOKEN="$(gh auth token 2>/dev/null || true)"; fi

# get URL ACCEPT FILE: the token goes to the API host only; curl drops it on the redirect to storage.
get() {
  local args=(-fsSL --retry 3 -H "Accept: $2" -H "X-GitHub-Api-Version: 2022-11-28")
  if [ -n "$TOKEN" ]; then args+=(-H "Authorization: Bearer $TOKEN"); fi
  curl "${args[@]}" -o "$3" "$1"
}

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
if [ "$WANT" = latest ]; then path=releases/latest; else path="releases/tags/$WANT"; fi
get "$API/repos/$REPO/$path" application/vnd.github+json "$TMP/release.json" ||
  die "cannot read release '$WANT' of $REPO (private repository? set GITHUB_TOKEN)"

# Tag and asset API URLs (they work for public and private repositories alike).
read -r TAG TAR_URL SUM_URL < <(node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const url = (n) => (r.assets || []).find((a) => a.name === n)?.url;
  const [t, s] = [url(process.argv[2]), url(process.argv[2] + ".sha256")];
  if (!/^v[\w.+-]+$/.test(r.tag_name || "")) process.exit(1);
  console.log(r.tag_name, t || "-", s || "-");
' "$TMP/release.json" "$ASSET") || die "release '$WANT' has an unexpected tag"
if [ "$TAR_URL" = - ] || [ "$SUM_URL" = - ]; then
  die "release $TAG has no $ASSET attached (GitHub's 'Source code' archive is not the app). The Release workflow attaches it: check its run under Actions, or start it with 'Run workflow' for tag $TAG."
fi

say "downloading $TAG"
get "$TAR_URL" application/octet-stream "$TMP/$ASSET"
get "$SUM_URL" application/octet-stream "$TMP/$ASSET.sha256"
node -e '
  const fs = require("fs");
  const got = require("crypto").createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex");
  process.exit(fs.readFileSync(process.argv[2], "utf8").split(/\s/)[0] === got ? 0 : 1);
' "$TMP/$ASSET" "$TMP/$ASSET.sha256" || die "checksum mismatch; download aborted"

DEST="$JTD_HOME/versions/$TAG"
mkdir -p "$JTD_HOME/versions" "$JTD_BIN"
rm -rf "$DEST.new"
mkdir "$DEST.new"
tar -xzf "$TMP/$ASSET" -C "$DEST.new" --strip-components=1

say "installing dependencies"
pnpm_() {
  if command -v corepack >/dev/null; then COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm "$@"
  elif command -v pnpm >/dev/null; then pnpm "$@"
  else npx --yes pnpm@10.28.0 "$@"; fi
}
(cd "$DEST.new" && pnpm_ install --prod --frozen-lockfile --filter "@jtd/api..." --reporter=silent) ||
  die "dependency install failed (is the npm registry reachable?)"

PREV="$(readlink "$JTD_HOME/current" 2>/dev/null || true)"
rm -rf "$DEST"
mv "$DEST.new" "$DEST"
ln -sfn "versions/$TAG" "$JTD_HOME/current"
# Keep the new version and the one it replaced.
for d in "$JTD_HOME"/versions/*; do
  case "$d" in "$DEST" | "$JTD_HOME/$PREV") ;; *) rm -rf "$d" ;; esac
done

# User settings (API key, port…) live outside the version directories and survive updates.
if [ ! -f "$JTD_HOME/config.env" ]; then
  cp "$DEST/.env.example" "$JTD_HOME/config.env"
  chmod 600 "$JTD_HOME/config.env"
fi

cat > "$JTD_BIN/jtddiagrammar" <<WRAP
#!/usr/bin/env bash
export JTD_HOME="$JTD_HOME" JTD_BIN="$JTD_BIN" JTD_REPO="$REPO" JTD_API="$API"
exec "\$JTD_HOME/current/bin/jtddiagrammar" "\$@"
WRAP
chmod +x "$JTD_BIN/jtddiagrammar" "$DEST/bin/jtddiagrammar" "$DEST/bin/install.sh"

if [ "$(uname)" = Linux ]; then
  apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$apps"
  printf '[Desktop Entry]\nType=Application\nName=JTDDiagrammar\nComment=Diagrams from structured text\nExec=%s start\nTerminal=true\nCategories=Development;Graphics;\n' \
    "$JTD_BIN/jtddiagrammar" > "$apps/jtddiagrammar.desktop"
fi

say "installed $TAG in $JTD_HOME"
say "settings: $JTD_HOME/config.env (set ANTHROPIC_API_KEY there to enable AI generation)"
case ":$PATH:" in *":$JTD_BIN:"*) say "run: jtddiagrammar" ;; *) say "run: $JTD_BIN/jtddiagrammar   (add $JTD_BIN to PATH to type just 'jtddiagrammar')" ;; esac
