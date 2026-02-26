"""Filter presets API - persisted to Delta table."""

import logging
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/filters", tags=["filters"])

# Table name for filter presets
PRESETS_TABLE = f"{settings.cache_catalog}.{settings.cache_schema}.filter_presets"


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
    created_by: str
    is_shared: bool = True


async def ensure_presets_table(ws) -> bool:
    """Create the filter_presets table if it doesn't exist."""
    try:
        create_sql = f"""
        CREATE TABLE IF NOT EXISTS {PRESETS_TABLE} (
            id STRING,
            name STRING,
            team STRING,
            job_id STRING,
            time_range STRING,
            start_date STRING,
            end_date STRING,
            created_at TIMESTAMP,
            created_by STRING,
            is_shared BOOLEAN
        ) USING DELTA
        """
        ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=create_sql,
            wait_timeout="30s",
        )
        logger.info(f"Ensured {PRESETS_TABLE} exists")
        return True
    except Exception as e:
        logger.warning(f"Could not create presets table: {e}")
        return False


@router.get("/presets", response_model=list[FilterPreset])
async def get_filter_presets(
    ws=Depends(get_ws_prefer_user),
) -> list[FilterPreset]:
    """Get all saved filter presets."""
    if not ws:
        logger.warning("No workspace client available for filter presets")
        return []

    try:
        # Ensure table exists
        await ensure_presets_table(ws)

        # Query presets
        result = ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=f"SELECT * FROM {PRESETS_TABLE} WHERE is_shared = true ORDER BY created_at DESC",
            wait_timeout="30s",
        )

        if not result.result or not result.result.data_array:
            return []

        # Map columns to FilterPreset
        columns = [col.name for col in result.manifest.schema.columns]
        presets = []
        for row in result.result.data_array:
            row_dict = dict(zip(columns, row))
            presets.append(FilterPreset(
                id=row_dict["id"],
                name=row_dict["name"],
                team=row_dict["team"],
                job_id=row_dict["job_id"],
                time_range=row_dict["time_range"] or "7d",
                start_date=row_dict["start_date"],
                end_date=row_dict["end_date"],
                created_at=datetime.fromisoformat(row_dict["created_at"].replace("Z", "+00:00")) if row_dict["created_at"] else datetime.now(),
                created_by=row_dict["created_by"] or "unknown",
                is_shared=row_dict["is_shared"] if row_dict["is_shared"] is not None else True,
            ))
        return presets

    except Exception as e:
        logger.error(f"Error fetching filter presets: {e}")
        return []


@router.post("/presets", response_model=FilterPreset)
async def create_filter_preset(
    preset_data: FilterPresetCreate,
    ws=Depends(get_ws_prefer_user),
    current_user: str = Depends(get_current_user),
) -> FilterPreset:
    """Create a new filter preset."""
    if not ws:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Ensure table exists
        await ensure_presets_table(ws)

        # Generate ID and timestamp
        import uuid
        preset_id = str(uuid.uuid4())[:8]
        created_at = datetime.now()

        # Insert preset
        insert_sql = f"""
        INSERT INTO {PRESETS_TABLE}
        (id, name, team, job_id, time_range, start_date, end_date, created_at, created_by, is_shared)
        VALUES (
            '{preset_id}',
            '{preset_data.name.replace("'", "''")}',
            {f"'{preset_data.team}'" if preset_data.team else 'NULL'},
            {f"'{preset_data.job_id}'" if preset_data.job_id else 'NULL'},
            '{preset_data.time_range}',
            {f"'{preset_data.start_date}'" if preset_data.start_date else 'NULL'},
            {f"'{preset_data.end_date}'" if preset_data.end_date else 'NULL'},
            '{created_at.isoformat()}',
            '{current_user}',
            true
        )
        """

        ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=insert_sql,
            wait_timeout="30s",
        )

        return FilterPreset(
            id=preset_id,
            name=preset_data.name,
            team=preset_data.team,
            job_id=preset_data.job_id,
            time_range=preset_data.time_range,
            start_date=preset_data.start_date,
            end_date=preset_data.end_date,
            created_at=created_at,
            created_by=current_user,
            is_shared=True,
        )

    except Exception as e:
        logger.error(f"Error creating filter preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save preset: {str(e)}")


@router.delete("/presets/{preset_id}")
async def delete_filter_preset(
    preset_id: str,
    ws=Depends(get_ws_prefer_user),
) -> dict:
    """Delete a filter preset."""
    if not ws:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=f"DELETE FROM {PRESETS_TABLE} WHERE id = '{preset_id}'",
            wait_timeout="30s",
        )
        return {"deleted": True}
    except Exception as e:
        logger.error(f"Error deleting filter preset: {e}")
        return {"deleted": False, "error": str(e)}
