"""Minimal Firestore test doubles for route-level unit tests."""

from __future__ import annotations

from typing import Any


class FakeDocumentSnapshot:
    """Represents a Firestore document snapshot."""

    def __init__(self, data: dict[str, Any] | None, exists: bool) -> None:
        self._data = data
        self.exists = exists

    def to_dict(self) -> dict[str, Any] | None:
        if self._data is None:
            return None
        return dict(self._data)


class FakeDocumentReference:
    """Represents a Firestore document reference."""

    def __init__(self, collection: "FakeCollection", document_id: str) -> None:
        self._collection = collection
        self._document_id = document_id

    def get(self) -> FakeDocumentSnapshot:
        if self._document_id not in self._collection.docs:
            return FakeDocumentSnapshot(None, False)
        payload = self._collection.docs[self._document_id]
        return FakeDocumentSnapshot(payload, True)

    def set(self, payload: dict[str, Any], merge: bool = False) -> None:
        existing = self._collection.docs.get(self._document_id)
        if merge and isinstance(existing, dict):
            merged = dict(existing)
            merged.update(payload)
            self._collection.docs[self._document_id] = merged
            return
        self._collection.docs[self._document_id] = dict(payload)

    def update(self, payload: dict[str, Any]) -> None:
        existing = self._collection.docs.get(self._document_id)
        if not isinstance(existing, dict):
            existing = {}
        existing.update(payload)
        self._collection.docs[self._document_id] = existing

    def collection(self, name: str) -> "FakeCollection":
        key = f"{self._collection.name}/{self._document_id}/{name}"
        return self._collection.db.collection(key)


class FakeCollection:
    """Represents a Firestore collection/query chain."""

    def __init__(
        self,
        db: "FakeFirestore",
        name: str,
        docs: dict[str, dict[str, Any]] | None = None,
        stream_docs: list[dict[str, Any]] | None = None,
    ) -> None:
        self.db = db
        self.name = name
        self.docs: dict[str, dict[str, Any]] = docs or {}
        self.stream_docs = stream_docs or []
        self._stream_limit: int | None = None

    def document(self, document_id: str) -> FakeDocumentReference:
        return FakeDocumentReference(self, document_id)

    def where(self, *_args: Any, **_kwargs: Any) -> "FakeCollection":
        return self

    def order_by(self, *_args: Any, **_kwargs: Any) -> "FakeCollection":
        return self

    def limit(self, value: int) -> "FakeCollection":
        self._stream_limit = value
        return self

    def stream(self) -> list[FakeDocumentSnapshot]:
        payloads = self.stream_docs if self.stream_docs else list(self.docs.values())
        if self._stream_limit is not None:
            payloads = payloads[: self._stream_limit]
        return [FakeDocumentSnapshot(item, True) for item in payloads]


class FakeFirestore:
    """Simple in-memory fake Firestore client."""

    def __init__(self) -> None:
        self._collections: dict[str, FakeCollection] = {}

    def seed_collection(
        self,
        name: str,
        *,
        docs: dict[str, dict[str, Any]] | None = None,
        stream_docs: list[dict[str, Any]] | None = None,
    ) -> FakeCollection:
        collection = FakeCollection(self, name, docs=docs, stream_docs=stream_docs)
        self._collections[name] = collection
        return collection

    def collection(self, name: str) -> FakeCollection:
        if name not in self._collections:
            self._collections[name] = FakeCollection(self, name)
        return self._collections[name]
