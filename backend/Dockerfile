FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
COPY backend ./backend

RUN uv sync --frozen

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "backend.app.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
