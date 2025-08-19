# apps/services/report-python/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app



COPY requirements.txt ./requirements.txt
RUN python -m venv /opt/venv && . /opt/venv/bin/activate && \
    pip install --upgrade pip && \
    pip install -r requirements.txt

# Copy service code
COPY . .

EXPOSE 3200

CMD ["/bin/sh", "-lc", ". /opt/venv/bin/activate && uvicorn app:app --host 0.0.0.0 --port 3200 --reload"]
