from __future__ import annotations

from functools import lru_cache

from app.repositories.store import InMemoryStore


@lru_cache(maxsize=1)
def get_store() -> InMemoryStore:
    return InMemoryStore()
