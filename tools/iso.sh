#!/bin/sh
# A throwaway copy of Kiln for risky tests (saving, deleting, renaming, generating): the code without library/,
# build/ or .git, with its own empty asset folder, on port 8521. The user's folder is never touched, and the paid
# cloud budget is 0 here (only the free daily quota or the local generators can run).
#   tools/iso.sh [dir]        start (default dir /tmp/kiln_iso; pass your own tmp dir in a shared machine)
#   tools/iso.sh stop [dir]   stop it and delete the copy
set -e
if [ "$1" = stop ]; then
  DIR=${2:-/tmp/kiln_iso}
  PID=$(ss -ltnp | grep ':8521 ' | grep -o 'pid=[0-9]*' | cut -d= -f2 | head -1)
  [ -n "$PID" ] && kill "$PID"
  rm -rf "$DIR"; echo "stopped, $DIR removed"; exit 0
fi
DIR=${1:-/tmp/kiln_iso}
SRC=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$DIR/library/games/iso"
rsync -a --delete --exclude library --exclude build --exclude fast --exclude .git --exclude .venv-test "$SRC/" "$DIR/"
[ -f "$DIR/library/settings.json" ] || printf '{"root": "%s/library/games/iso", "cloud_spent": 0, "bookmarks": []}\n' "$DIR" > "$DIR/library/settings.json"
cd "$DIR" && KILN_PORT=8521 KILN_CLOUD_CAP=0 nohup python3 server.py > server.log 2>&1 &
sleep 2
curl -sf http://127.0.0.1:8521/api/status > /dev/null && echo "isolated Kiln on http://127.0.0.1:8521 ($DIR)" || { echo "did not start, see $DIR/server.log"; exit 1; }
