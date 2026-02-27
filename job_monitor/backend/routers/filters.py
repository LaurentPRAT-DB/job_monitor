"""Filter presets API - persisted to Delta table."""

import logging
import time
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_ws_prefer_user, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/filters", tags=["filters"])

# Simple in-memory cache for filter presets (they rarely change)
_presets_cache: dict = {"data": None, "timestamp": 0}
PRESETS_CACHE_TTL = 60  # 60 seconds cache for presets

# Table name for filter presets
PRESETS_TABLE = f"{settings.cache_catalog}.{settings.cache_schema}.filter_presets"


class FilterPresetCreate(BaseModel):
    """Request model for creating a filter preset."""
    name: str
    team: str | None = None
    job_id: str | None = None
    job_name_patterns: list[str] = []  # Wildcard patterns like "ETL-*", "*-daily"
    time_range: Literal['7d', '30d', '90d', 'custom'] = '7d'
    start_date: str | None = None
    end_date: str | None = None


class FilterPreset(BaseModel):
    """Saved filter combination for quick access."""
    id: str
    name: str
    team: str | None = None
    job_id: str | None = None
    job_name_patterns: list[str] = []  # Wildcard patterns like "ETL-*", "*-daily"
    time_range: Literal['7d', '30d', '90d', 'custom'] = '7d'
    start_date: str | None = None
    end_date: str | None = None
    created_at: datetime
    created_by: str
    is_shared: bool = True


async def ensure_presets_table(ws) -> bool:
    """Create the filter_presets table if it doesn't exist, and add new columns if needed."""
    try:
        # First, ensure the schema exists
        create_schema_sql = f"CREATE SCHEMA IF NOT EXISTS {settings.cache_catalog}.{settings.cache_schema}"
        schema_result = ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=create_schema_sql,
            wait_timeout="30s",
        )
        if schema_result.status.state.value not in ("SUCCEEDED", "CLOSED"):
            error_msg = schema_result.status.error.message if schema_result.status.error else "Unknown error"
            logger.warning(f"CREATE SCHEMA failed: {error_msg}")
            # Continue anyway - schema might already exist

        create_sql = f"""
        CREATE TABLE IF NOT EXISTS {PRESETS_TABLE} (
            id STRING,
            name STRING,
            team STRING,
            job_id STRING,
            job_name_patterns STRING,
            time_range STRING,
            start_date STRING,
            end_date STRING,
            created_at TIMESTAMP,
            created_by STRING,
            is_shared BOOLEAN
        ) USING DELTA
        """
        result = ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=create_sql,
            wait_timeout="30s",
        )

        # Log the result status
        if result.status.state.value not in ("SUCCEEDED", "CLOSED"):
            error_msg = result.status.error.message if result.status.error else "Unknown error"
            logger.error(f"CREATE TABLE failed with state {result.status.state.value}: {error_msg}")
            return False

        logger.info(f"Ensured {PRESETS_TABLE} exists (state: {result.status.state.value})")

        # Try to add job_name_patterns column if it doesn't exist (for migration)
        try:
            ws.statement_execution.execute_statement(
                warehouse_id=settings.warehouse_id,
                statement=f"ALTER TABLE {PRESETS_TABLE} ADD COLUMN job_name_patterns STRING",
                wait_timeout="30s",
            )
            logger.info("Added job_name_patterns column to presets table")
        except Exception:
            pass  # Column already exists

        return True
    except Exception as e:
        logger.warning(f"Could not create presets table: {e}")
        return False


@router.get("/presets", response_model=list[FilterPreset])
async def get_filter_presets(
    ws=Depends(get_ws_prefer_user),
) -> list[FilterPreset]:
    """Get all saved filter presets."""
    global _presets_cache

    # Check cache first
    now = time.time()
    if _presets_cache["data"] is not None and (now - _presets_cache["timestamp"]) < PRESETS_CACHE_TTL:
        logger.debug("Returning cached filter presets")
        return _presets_cache["data"]

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

        # Log query result status
        logger.debug(f"GET presets query state: {result.status.state.value}")
        if result.status.state.value not in ("SUCCEEDED", "CLOSED"):
            error_msg = result.status.error.message if result.status.error else "Unknown error"
            logger.error(f"SELECT failed with state {result.status.state.value}: {error_msg}")
            return []

        if not result.result or not result.result.data_array:
            logger.debug("No presets found in database")
            return []

        # Map columns to FilterPreset
        columns = [col.name for col in result.manifest.schema.columns]
        presets = []
        for row in result.result.data_array:
            row_dict = dict(zip(columns, row))
            # Parse job_name_patterns from comma-separated string
            patterns_str = row_dict.get("job_name_patterns") or ""
            job_name_patterns = [p.strip() for p in patterns_str.split(",") if p.strip()] if patterns_str else []
            presets.append(FilterPreset(
                id=row_dict["id"],
                name=row_dict["name"],
                team=row_dict["team"],
                job_id=row_dict["job_id"],
                job_name_patterns=job_name_patterns,
                time_range=row_dict["time_range"] or "7d",
                start_date=row_dict["start_date"],
                end_date=row_dict["end_date"],
                created_at=datetime.fromisoformat(row_dict["created_at"].replace("Z", "+00:00")) if row_dict["created_at"] else datetime.now(),
                created_by=row_dict["created_by"] or "unknown",
                is_shared=row_dict["is_shared"] if row_dict["is_shared"] is not None else True,
            ))

        # Update cache
        _presets_cache["data"] = presets
        _presets_cache["timestamp"] = time.time()
        logger.debug(f"Cached {len(presets)} filter presets")

        return presets

    except Exception as e:
        logger.error(f"Error fetching filter presets: {e}")
        return []


def invalidate_presets_cache():
    """Invalidate the presets cache when data changes."""
    global _presets_cache
    _presets_cache["data"] = None
    _presets_cache["timestamp"] = 0
    logger.debug("Filter presets cache invalidated")


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

        # Serialize patterns as comma-separated string
        patterns_str = ",".join(preset_data.job_name_patterns) if preset_data.job_name_patterns else ""

        # Insert preset
        insert_sql = f"""
        INSERT INTO {PRESETS_TABLE}
        (id, name, team, job_id, job_name_patterns, time_range, start_date, end_date, created_at, created_by, is_shared)
        VALUES (
            '{preset_id}',
            '{preset_data.name.replace("'", "''")}',
            {f"'{preset_data.team}'" if preset_data.team else 'NULL'},
            {f"'{preset_data.job_id}'" if preset_data.job_id else 'NULL'},
            {f"'{patterns_str}'" if patterns_str else 'NULL'},
            '{preset_data.time_range}',
            {f"'{preset_data.start_date}'" if preset_data.start_date else 'NULL'},
            {f"'{preset_data.end_date}'" if preset_data.end_date else 'NULL'},
            '{created_at.isoformat()}',
            '{current_user}',
            true
        )
        """

        result = ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=insert_sql,
            wait_timeout="30s",
        )

        # Check if INSERT actually succeeded
        if result.status.state.value not in ("SUCCEEDED", "CLOSED"):
            error_msg = result.status.error.message if result.status.error else "Unknown error"
            logger.error(f"INSERT failed with state {result.status.state.value}: {error_msg}")
            raise HTTPException(status_code=500, detail=f"Failed to save preset: {error_msg}")

        logger.info(f"Created filter preset: {preset_id} for user {current_user}")

        # Invalidate cache so next GET returns fresh data
        invalidate_presets_cache()

        return FilterPreset(
            id=preset_id,
            name=preset_data.name,
            team=preset_data.team,
            job_id=preset_data.job_id,
            job_name_patterns=preset_data.job_name_patterns,
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


@router.put("/presets/{preset_id}", response_model=FilterPreset)
async def update_filter_preset(
    preset_id: str,
    preset_data: FilterPresetCreate,
    ws=Depends(get_ws_prefer_user),
    current_user: str = Depends(get_current_user),
) -> FilterPreset:
    """Update an existing filter preset."""
    if not ws:
        raise HTTPException(status_code=503, detail="Database not available")

    try:
        # Serialize patterns as comma-separated string
        patterns_str = ",".join(preset_data.job_name_patterns) if preset_data.job_name_patterns else ""

        # Update preset
        update_sql = f"""
        UPDATE {PRESETS_TABLE}
        SET
            name = '{preset_data.name.replace("'", "''")}',
            team = {f"'{preset_data.team}'" if preset_data.team else 'NULL'},
            job_id = {f"'{preset_data.job_id}'" if preset_data.job_id else 'NULL'},
            job_name_patterns = {f"'{patterns_str}'" if patterns_str else 'NULL'},
            time_range = '{preset_data.time_range}',
            start_date = {f"'{preset_data.start_date}'" if preset_data.start_date else 'NULL'},
            end_date = {f"'{preset_data.end_date}'" if preset_data.end_date else 'NULL'}
        WHERE id = '{preset_id}'
        """

        ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=update_sql,
            wait_timeout="30s",
        )

        # Fetch the original created_at/created_by
        result = ws.statement_execution.execute_statement(
            warehouse_id=settings.warehouse_id,
            statement=f"SELECT created_at, created_by FROM {PRESETS_TABLE} WHERE id = '{preset_id}'",
            wait_timeout="30s",
        )

        created_at = datetime.now()
        created_by = current_user
        if result.result and result.result.data_array:
            row = result.result.data_array[0]
            if row[0]:
                created_at = datetime.fromisoformat(row[0].replace("Z", "+00:00"))
            if row[1]:
                created_by = row[1]

        # Invalidate cache so next GET returns fresh data
        invalidate_presets_cache()

        return FilterPreset(
            id=preset_id,
            name=preset_data.name,
            team=preset_data.team,
            job_id=preset_data.job_id,
            job_name_patterns=preset_data.job_name_patterns,
            time_range=preset_data.time_range,
            start_date=preset_data.start_date,
            end_date=preset_data.end_date,
            created_at=created_at,
            created_by=created_by,
            is_shared=True,
        )

    except Exception as e:
        logger.error(f"Error updating filter preset: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update preset: {str(e)}")


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
        # Invalidate cache so next GET returns fresh data
        invalidate_presets_cache()
        return {"deleted": True}
    except Exception as e:
        logger.error(f"Error deleting filter preset: {e}")
        return {"deleted": False, "error": str(e)}
