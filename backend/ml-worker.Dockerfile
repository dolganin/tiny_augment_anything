FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.ml.txt /tmp/requirements.ml.txt
COPY scripts_for_gen/requirements.generate.txt /tmp/requirements.generate.txt

RUN pip install --no-cache-dir -r /tmp/requirements.ml.txt \
    && pip install --no-cache-dir torch torchvision \
    && pip install --no-cache-dir -r /tmp/requirements.generate.txt

COPY backend ./backend
COPY config ./config
COPY scripts_for_gen ./scripts_for_gen

CMD ["python", "-m", "backend.ml_worker"]
