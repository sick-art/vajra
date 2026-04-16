FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock* ./
COPY alembic.ini ./
COPY alembic/ alembic/
COPY src/ src/

RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "vectorhouse.main:app", "--host", "0.0.0.0", "--port", "8000"]
