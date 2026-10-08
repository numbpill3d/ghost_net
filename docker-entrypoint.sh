#!/bin/sh
# A mounted volume arrives owned by root. Hand it to the node user, then
# drop privileges before the node starts.
set -e
if [ "$(id -u)" = "0" ]; then
  chown node:node "$DATA_DIR"
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec "$@"
