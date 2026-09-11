.PHONY: dev down lint test build ci

dev:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build --no-cache

lint:
	cd backend && ruff check . && ruff format --check . && mypy . --exclude tests --exclude alembic

test:
	cd backend && OLF_DB_PATH=/tmp/test_olf.db pytest tests/ -v --cov=. --cov-report=term-missing --cov-fail-under=80

sast:
	pip install -e . --quiet
	bandit -r backend/ --exclude backend/tests -lll -iii

ci: lint test sast

logs:
	docker compose logs -f
