"""Filter presets API for saved filter combinations."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Literal
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/filters", tags=["filters"])

# In-memory storage for MVP (can migrate to Delta table later)
_presets: dict[str, "FilterPreset"] = {}


class FilterPresetCreate(BaseModel):
    """Request model for creating a filter preset."""
    name: str
    team: str | None = None
    job_id: str | None = None
    time_range: Literal['7d', '30d', '90d', 'custom'] = '7d'
    start_date: str | None = None
    end_date: str | None = None


class FilterPreset(BaseModel):
    """Saved filter combination for quick access."""
    id: str
    name: str
    team: str | None = None
    job_id: str | None = None
    time_range: Literal['7d', '30d', '90d', 'custom'] = '7d'
    start_date: str | None = None
    end_date: str | None = None
    created_at: datetime
    is_shared: bool = True  # Visible to all team members


@router.get("/presets", response_model=list[FilterPreset])
async def get_filter_presets() -> list[FilterPreset]:
    """Get all saved filter presets."""
    return list(_presets.values())


@router.post("/presets", response_model=FilterPreset)
async def create_filter_preset(preset_data: FilterPresetCreate) -> FilterPreset:
    """Create a new filter preset."""
    preset_id = str(uuid.uuid4())[:8]
    preset = FilterPreset(
        id=preset_id,
        name=preset_data.name,
        team=preset_data.team,
        job_id=preset_data.job_id,
        time_range=preset_data.time_range,
        start_date=preset_data.start_date,
        end_date=preset_data.end_date,
        created_at=datetime.now(),
        is_shared=True,
    )
    _presets[preset_id] = preset
    return preset


@router.delete("/presets/{preset_id}")
async def delete_filter_preset(preset_id: str) -> dict:
    """Delete a filter preset."""
    if preset_id in _presets:
        del _presets[preset_id]
        return {"deleted": True}
    return {"deleted": False}
