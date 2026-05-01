#!/bin/bash
# beta-test/stop-all.sh
# 全サーバーを PID ファイルから停止する。
# Stops all servers using their PID files.

echo "========================================================"
echo "  rewrite-wrapper β テスト 停止"
echo "  Beta Test Shutdown"
echo "========================================================"
echo ""

# PIDファイルからプロセスを停止するユーティリティ関数
# Utility to stop process from PID file
stop_by_pid() {
  local name="$1"
  local pid_file="$2"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid"
      echo "  [$name] 停止 (PID=$pid)"
    else
      echo "  [$name] 既に停止済み (PID=$pid)"
    fi
    rm -f "$pid_file"
  else
    echo "  [$name] PIDファイルなし ($pid_file)"
  fi
}

stop_by_pid "Wrapper (port 3000)"       /tmp/wrapper.pid
stop_by_pid "4B llama.cpp (port 8081)"  /tmp/llamacpp-4b.pid
stop_by_pid "0.8B llama.cpp (port 8082)" /tmp/llamacpp-0.8b.pid

echo ""
echo "  停止完了 / Shutdown complete"
echo ""
