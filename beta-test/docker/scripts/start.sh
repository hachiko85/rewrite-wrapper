#!/bin/bash
# beta-test/docker/scripts/start.sh
# 単一コンテナのエントリーポイント。supervisord でマルチプロセスを管理する。
# Single-container entrypoint. Manages multiple processes via supervisord.

set -euo pipefail

# ── ログディレクトリ確保 / Ensure log directory exists ──
mkdir -p /app/logs

# network_mode: host を使用するため localhost はホストマシンを直接指す。
# MONGO_URI のアドレス変換は不要。
# Using network_mode: host, so localhost resolves directly to the host machine.
# No MONGO_URI address rewriting needed.

echo "================================================"
echo " rewrite-wrapper beta — 単一コンテナ起動"
echo " Single container startup"
echo "  Wrapper port : 3000 (external: ${WRAPPER_PORT:-3085})"
echo "  Backends cfg : ${BACKENDS_CONFIG:-/app/backends.yaml}"
echo "  MongoDB      : ${MONGO_URI%%@*}@..."
echo "================================================"

# ── GPU 確認 (省略可) / Check GPU ──
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null \
  && echo "" || echo "[warn] GPU not detected or nvidia-smi unavailable"

# ── supervisord 起動 / Start supervisord ──
exec supervisord -c /app/beta-test/docker/supervisord.conf
