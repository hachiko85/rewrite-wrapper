#!/bin/bash
# beta-test/start-all.sh
# 4B・0.8B の llama.cpp サーバーとラッパーサーバーを順番に起動する。
# Starts 4B, 0.8B llama.cpp servers and the wrapper server in order.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

echo "========================================================"
echo "  rewrite-wrapper β テスト 起動シーケンス"
echo "  Beta Test Startup Sequence"
echo "========================================================"
echo ""

echo "[1/3] Qwen3.5-4B (port 8081)"
bash "$SCRIPT_DIR/servers/start-4b.sh"

echo ""
echo "[2/3] Qwen3.5-0.8B (port 8082)"
bash "$SCRIPT_DIR/servers/start-0.8b.sh"

echo ""
echo "[3/3] Wrapper Server (port 3000)"
bash "$SCRIPT_DIR/servers/start-wrapper.sh"

echo ""
echo "========================================================"
echo "  全サーバー起動完了 / All servers ready"
echo "========================================================"
echo ""
echo "  ブラウザ UI : http://localhost:3000/beta-test"
echo "  ヘルス確認  : curl http://localhost:3000/health"
echo "  バックエンド: curl http://localhost:3000/backends"
echo ""
echo "  APIキー発行 : bash $SCRIPT_DIR/curl/00-setup.sh"
echo "  テスト実行  : bash $SCRIPT_DIR/curl/run-all.sh"
echo ""
echo "  停止        : bash $SCRIPT_DIR/stop-all.sh"
echo ""
