FROM python:3.13-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DATA_DIR=/data PYTHONUNBUFFERED=1
VOLUME /data

# 5000: HTTP + Socket.IO (only nginx talks to it). 5005/udp: the ESP32.
EXPOSE 5000 5005/udp

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/laser/api/health')"

CMD ["python", "app.py"]
