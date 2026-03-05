from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.entities import AuditEvent
from app.repositories.deps import get_store
from app.repositories.store import InMemoryStore
from app.schemas.common import FeedbackRequest, FeedbackResponse

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
def submit_feedback(payload: FeedbackRequest, store: InMemoryStore = Depends(get_store)) -> FeedbackResponse:
    variant = store.get_variant(payload.variant_id)
    if variant is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    event = store.create_audit_event(
        AuditEvent(
            site_id=variant.site_id,
            variant_id=variant.id,
            event_type="variant_feedback",
            event_payload={"feedback": payload.feedback, "message": payload.message},
        )
    )
    return FeedbackResponse(recorded=True, event_id=event.id)
