# ──────────────────────────────────────────────────────────────────────────────
# rewrite-wrapper Dockerfile
# llama.cpp (CUDA対応) + Bun + Hono ラッパーサーバー
# llama.cpp (CUDA-enabled) + Bun + Hono wrapper server
#
# ビルド方法 / Build:
#   docker compose -f docker/docker-compose.yml build
#
# NOTE: nvidia/cuda:devel イメージを使用するため最終イメージは大きい (~8-10GB)。
#       実運用では llama-server バイナリのみ抽出した runtime ステージに最適化可能。
# NOTE: Uses nvidia/cuda:devel base, final image is large (~8-10GB).
#       Can be optimized by extracting only llama-server binary to a runtime stage.
# ──────────────────────────────────────────────────────────────────────────────

# ────────────────────────────────────────────────────────────────
# Stage 1: llama.cpp ビルドステージ / Build llama.cpp
# ────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04 AS llama-builder

ENV DEBIAN_FRONTEND=noninteractive

# ビルド依存パッケージ / Build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    build-essential \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# llama.cpp クローン / Clone llama.cpp
# ARG で特定コミット/タグを指定可能 (例: --build-arg LLAMA_CPP_REF=b5456)
# Specify commit/tag via ARG (e.g. --build-arg LLAMA_CPP_REF=b5456)
ARG LLAMA_CPP_REF=master
RUN git clone --depth 1 https://github.com/ggml-org/llama.cpp /opt/llama.cpp

# CUDA対応でビルド (llama-server のみ) / Build with CUDA (llama-server only)
RUN cd /opt/llama.cpp && \
    cmake -B build \
        -DCMAKE_BUILD_TYPE=Release \
        -DGGML_CUDA=ON \
        -DLLAMA_BUILD_TESTS=OFF \
        -DLLAMA_BUILD_EXAMPLES=OFF && \
    cmake --build build --config Release -j$(nproc) --target llama-server


# ────────────────────────────────────────────────────────────────
# Stage 2: ランタイムステージ / Runtime stage
# ────────────────────────────────────────────────────────────────
FROM nvidia/cuda:12.4.1-devel-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    APP_DIR=/app \
    LLAMA_SERVER=/opt/llama.cpp/build/bin/llama-server \
    PATH="/root/.bun/bin:$PATH"

# ランタイム依存パッケージ / Runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    unzip \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# llama-server バイナリをコピー / Copy llama-server binary from builder
COPY --from=llama-builder /opt/llama.cpp/build/bin/llama-server /opt/llama.cpp/build/bin/llama-server

# Bun インストール / Install Bun (unzip available in container)
RUN curl -fsSL https://bun.sh/install | bash && \
    ln -sf /root/.bun/bin/bun /usr/local/bin/bun

# アプリケーション作業ディレクトリ / Application working directory
WORKDIR $APP_DIR

# 依存関係インストール (キャッシュ最適化のため package.json を先にコピー)
# Install dependencies (copy package.json first for layer cache optimization)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ソースコードをコピー / Copy application source
COPY . .

# マウントポイント・ログディレクトリ作成 / Create mount points and log directory
RUN mkdir -p /models /app/logs

# スクリプトに実行権限を付与 / Make scripts executable
RUN chmod +x /app/docker/scripts/*.sh && \
    chmod +x /app/beta-test/docker/scripts/*.sh

# モデルファイルはホストからマウント / Model files are mounted from host
VOLUME ["/models"]

# デフォルトはインタラクティブシェル
# Default: interactive shell (production uses docker-compose.yml command override)
CMD ["/bin/bash"]
