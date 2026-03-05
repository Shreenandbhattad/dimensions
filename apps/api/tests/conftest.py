from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.deps import get_store


@pytest.fixture(autouse=True)
def reset_store() -> Generator[None, None, None]:
    store = get_store()
    store.clear()
    yield
    store.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
