# ============================================================================
# Stage 1: Builder — Compile wheels and dependencies in an isolated layer
# ============================================================================
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ============================================================================
# Stage 2: Production Runtime — Minimal slim image with non-root user
# ============================================================================
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Install runtime shared libraries only (libpq5, libgeos-c1v5, curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    libgeos-c1v5 \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 ushajua \
    && useradd -u 10001 -g ushajua -m -s /sbin/nologin ushajua

COPY --from=builder /install /usr/local
COPY --chown=ushajua:ushajua . .

RUN mkdir -p /app/uploads && chown -R ushajua:ushajua /app

USER ushajua

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/healthz || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--proxy-headers"]
