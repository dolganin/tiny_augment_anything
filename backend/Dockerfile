FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.runtime.txt /tmp/requirements.runtime.txt

RUN pip install --no-cache-dir -r /tmp/requirements.runtime.txt

COPY backend ./backend
COPY config ./config

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.app.asgi:app", "--host", "0.0.0.0", "--port", "8000"]
