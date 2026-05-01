#!/bin/bash
# beta-test/curl/run-all.sh
# 全 curl テストを順番に実行する。
# Runs all curl tests in sequence.

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TOTAL_PASS=0; TOTAL_FAIL=0

echo "========================================================"
echo "  rewrite-wrapper β テスト — 全テスト実行"
echo "  Running all curl tests"
echo "========================================================"
echo ""

# ── 0: APIキー発行 / Issue API key ──
bash "$SCRIPT_DIR/00-setup.sh"
echo ""
echo "────────────────────────────────────────────────────────"

# ── 1: 4B ストリーム ──
echo ""
bash "$SCRIPT_DIR/01-test-4b.sh"
echo ""
echo "────────────────────────────────────────────────────────"

# ── 2: 0.8B ストリーム ──
echo ""
bash "$SCRIPT_DIR/02-test-0.8b.sh"
echo ""
echo "────────────────────────────────────────────────────────"

# ── 3: ノンストリーム ──
echo ""
bash "$SCRIPT_DIR/03-test-nostream.sh"
echo ""
echo "────────────────────────────────────────────────────────"

# ── 4: エラーテスト ──
echo ""
bash "$SCRIPT_DIR/04-test-errors.sh"
echo ""

echo "========================================================"
echo "  全テスト完了 / All tests done"
echo "========================================================"
