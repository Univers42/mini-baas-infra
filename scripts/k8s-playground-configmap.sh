#!/usr/bin/env bash
# scripts/k8s-playground-configmap.sh
# Pack playground static files into a Kubernetes ConfigMap YAML.
# Usage: bash scripts/k8s-playground-configmap.sh > /tmp/playground-cm.yaml
set -euo pipefail

PLAYGROUND_DIR="${1:-playground}"
NAMESPACE="${2:-mini-baas}"
CM_NAME="${3:-mini-baas-playground-files}"

if [ ! -f "$PLAYGROUND_DIR/index.html" ]; then
  echo "ERROR: $PLAYGROUND_DIR/index.html not found" >&2
  exit 1
fi

cat <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: $CM_NAME
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/part-of: mini-baas
data:
EOF

for f in index.html app.js styles.css libcss.min.css; do
  filepath="$PLAYGROUND_DIR/$f"
  if [ -f "$filepath" ] && [ -s "$filepath" ]; then
    echo "  $f: |"
    sed 's/^/    /' "$filepath"
  elif [ "$f" = "libcss.min.css" ]; then
    echo "  $f: |"
    echo "    /* libcss placeholder */"
  fi
done
