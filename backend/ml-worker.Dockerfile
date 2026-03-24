FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_DEFAULT_TIMEOUT=180
ENV PIP_RETRIES=10
ENV CC=/usr/bin/gcc
ENV CXX=/usr/bin/g++
ENV UV_PROJECT_ENVIRONMENT=/app/.venv
ENV UV_CACHE_DIR=/model-cache/uv

WORKDIR /app

COPY pyproject.toml /app/pyproject.toml
COPY uv.lock /app/uv.lock
COPY README.md /app/README.md
COPY src /app/src
COPY backend/requirements.ml.txt /tmp/requirements.ml.txt
COPY scripts_for_gen/requirements.generate.txt /tmp/requirements.generate.txt

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r /tmp/requirements.ml.txt \
    && pip install --no-cache-dir uv \
    && pip install --no-cache-dir torch torchvision

RUN uv sync --frozen --no-dev \
    && /app/.venv/bin/python -c "import tiny_augment"

RUN pip install --no-cache-dir -r /tmp/requirements.generate.txt

# Keep late add-ons isolated so rebuilds don't reinstall the full generate stack.
RUN pip install --no-cache-dir peft

COPY backend ./backend
COPY config ./config
COPY scripts_for_gen ./scripts_for_gen

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc g++ \
    && rm -rf /var/lib/apt/lists/*

CMD ["python", "-m", "backend.ml_worker"]
