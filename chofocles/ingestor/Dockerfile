# =============================================
# CHOFOCLES — Ingestor IMAP (sidecar Python)
# =============================================
# Polling de buzones de chofer + extracción + persistencia.

FROM python:3.12-alpine

RUN addgroup -g 1001 -S ingestor && \
    adduser -S ingestor -u 1001

WORKDIR /app

# poppler-utils provee pdftotext, base de la extracción de PDFs nativos.
# tesseract NO se instala todavía (OCR pendiente de autorización).
RUN apk add --no-cache \
    poppler-utils \
    libpq \
    ca-certificates \
    && apk add --no-cache --virtual .build-deps gcc musl-dev libffi-dev openssl-dev libpq-dev python3-dev

COPY ingestor/requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt && \
    apk del .build-deps

COPY --chown=ingestor:ingestor ingestor/src/ ./src/
COPY --chown=ingestor:ingestor ingestor/plantillas/ ./plantillas/

RUN mkdir -p /var/chofocles/documentos && \
    chown -R ingestor:ingestor /var/chofocles

USER ingestor

CMD ["python", "-u", "src/main.py"]
