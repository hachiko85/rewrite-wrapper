# Phase 3 スロット確認テスト / Slot Check Tests

## 前提条件 / Prerequisites

- Phase 2 が完了していること
- 有効なAPIキーが発行済み

## テスト手順 / Test Steps

### 1. llama.cpp 停止状態でのテスト (502確認)

llama.cpp が起動していない状態でリクエストを送信:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}]}'
# 期待レスポンス (502):
# {"error":"Upstream unavailable"}
```

### 2. llama.cpp 起動状態でのテスト

llama.cpp を起動する:

```bash
bash /home/aceyutori/hachi-intelligence-project/rewrite-wrapper/llama-cpp-run-4b.sh
```

スロットが空いている状態でリクエスト:

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"hi"}],"stream":true}'
# 期待: 200 + SSEストリーム
```

### 3. スロット満杯シミュレーション (503確認)

llama.cpp の /slots エンドポイントを直接確認:

```bash
curl http://localhost:8080/slots?fail_on_no_slot=1
# スロット空き: HTTP 200
# スロット満杯: HTTP 503
```

スロットが満杯の場合、ラッパー経由でも 503 が返ることを確認:

```bash
# 複数のリクエストを並列で送信してスロットを埋める
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"count to 100"}],"stream":true}' &

curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer <YOUR_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"count to 200"}],"stream":true}'
# 2番目のリクエスト: 503 {"error":"No available slots"}
```

## 期待される動作 / Expected Behavior

| 状態 | 期待レスポンス |
|------|------|
| llama.cpp 停止 | 502 `{"error":"Upstream unavailable"}` |
| スロット空きあり | 200 + SSEストリーム |
| スロット満杯 | 503 `{"error":"No available slots"}` |
