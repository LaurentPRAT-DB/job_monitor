"""FastAPI application entry point for Job Monitor."""

import asyncio
import json
import logging
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from job_monitor.backend.config import settings
from job_monitor.backend.routers import alerts, auth, billing, cluster_metrics, cost, filters, health, health_metrics, historical, job_tags, jobs, jobs_api, pipeline, reports
from job_monitor.backend.scheduler import scheduler, setup_scheduler

# Configure logging based on LOG_LEVEL environment variable
log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

logger = logging.getLogger(__name__)
logger.info(f"Starting Job Monitor with log level: {log_level}")


class APILoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests and responses for debugging."""

    async def dispatch(self, request: Request, call_next):
        # Only log API requests
        if not request.url.path.startswith("/api"):
            return await call_next(request)

        # Log request
        start_time = time.time()
        logger.info(f">>> API REQUEST: {request.method} {request.url.path}")
        logger.info(f"    Query params: {dict(request.query_params)}")

        # Log ALL headers to debug OBO token forwarding
        logger.info("    === REQUEST HEADERS ===")
        for header_name, header_value in request.headers.items():
            # Mask sensitive values but show their presence
            if "token" in header_name.lower() or "auth" in header_name.lower():
                masked_value = f"{header_value[:20]}...({len(header_value)} chars)" if len(header_value) > 20 else header_value
                logger.info(f"    {header_name}: {masked_value}")
            else:
                logger.info(f"    {header_name}: {header_value}")
        logger.info("    === END HEADERS ===")

        try:
            response = await call_next(request)
            duration = time.time() - start_time

            # Log response
            logger.info(f"<<< API RESPONSE: {request.url.path} - Status: {response.status_code} - Duration: {duration:.3f}s")

            # For error responses, try to capture body
            if response.status_code >= 400:
                # Read response body for error logging
                body = b""
                async for chunk in response.body_iterator:
                    body += chunk

                try:
                    error_detail = json.loads(body.decode())
                    logger.error(f"    Error detail: {json.dumps(error_detail, indent=2)}")
                except Exception:
                    logger.error(f"    Error body: {body.decode()[:500]}")

                # Return new response with the body we consumed
                return JSONResponse(
                    status_code=response.status_code,
                    content=json.loads(body.decode()) if body else {},
                    headers=dict(response.headers),
                )

            return response

        except Exception as e:
            duration = time.time() - start_time
            logger.error(f"!!! API ERROR: {request.url.path} - Exception: {str(e)} - Duration: {duration:.3f}s")
            logger.error(f"    Traceback: {traceback.format_exc()}")
            raise


async def warm_up_caches(app: FastAPI) -> None:
    """Pre-warm frequently accessed caches on startup.

    This runs in the background after the app starts to reduce
    cold-start latency for the first users.
    """
    logger.info("Starting cache warm-up task...")

    # Wait a few seconds for the app to fully initialize
    await asyncio.sleep(3)

    try:
        ws = app.state.workspace_client
        if not ws:
            logger.warning("No workspace client available for cache warm-up")
            return

        # Warm up filter presets cache (frequently accessed, ~3s without cache)
        try:
            from job_monitor.backend.routers.filters import get_filter_presets
            # Call with the workspace client directly
            presets = await get_filter_presets(ws=ws)
            logger.info(f"Warmed up filter presets cache: {len(presets)} presets")
        except Exception as e:
            logger.warning(f"Failed to warm up filter presets: {e}")

        logger.info("Cache warm-up complete")

    except Exception as e:
        logger.error(f"Cache warm-up failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup and shutdown."""
    logger.info(f"DATABRICKS_HOST: {settings.databricks_host}")
    logger.info(f"WAREHOUSE_ID: {settings.warehouse_id}")

    # Initialize WorkspaceClient on startup if host is configured
    if settings.databricks_host:
        try:
            from databricks.sdk import WorkspaceClient

            # In Databricks Apps, use default credentials (OAuth from service principal)
            # Don't pass host explicitly to avoid auth conflicts
            # The SDK will auto-detect from DATABRICKS_HOST env var
            try:
                # First try: let SDK auto-detect everything
                app.state.workspace_client = WorkspaceClient()
                logger.info("WorkspaceClient initialized with auto-detected credentials")
            except ValueError as ve:
                # If there are conflicting auth methods, try with explicit host only
                if "more than one authorization method" in str(ve):
                    logger.warning(f"Auth conflict detected: {ve}")
                    # Clear any conflicting token and retry with host-only
                    import os
                    os.environ.pop("DATABRICKS_TOKEN", None)
                    app.state.workspace_client = WorkspaceClient()
                    logger.info("WorkspaceClient initialized after clearing DATABRICKS_TOKEN")
                else:
                    raise
        except Exception as e:
            logger.error(f"Failed to initialize WorkspaceClient: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            app.state.workspace_client = None
    else:
        logger.warning("DATABRICKS_HOST not configured, WorkspaceClient will be None")
        app.state.workspace_client = None

    # Setup and start scheduler for email reports
    setup_scheduler()
    scheduler.start()
    logger.info("Scheduler started with scheduled report jobs")

    # Start cache warm-up task in background (doesn't block startup)
    asyncio.create_task(warm_up_caches(app))

    yield

    # Cleanup on shutdown
    scheduler.shutdown()
    logger.info("Scheduler shutdown")


app = FastAPI(
    title="Job Monitor",
    description="Databricks Job Monitoring Framework",
    version=settings.app_version,
    lifespan=lifespan,
)

# CORS middleware for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression for responses > 500 bytes (reduces bandwidth for large JSON responses)
app.add_middleware(GZipMiddleware, minimum_size=500)

# API logging middleware for debugging
app.add_middleware(APILoggingMiddleware)

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(jobs_api.router)
app.include_router(billing.router)
app.include_router(health_metrics.router)
app.include_router(job_tags.router)
app.include_router(cost.router)
app.include_router(cluster_metrics.router)
app.include_router(pipeline.router)
app.include_router(alerts.router)
app.include_router(filters.router)
app.include_router(historical.router)
app.include_router(reports.router)

# Serve frontend static files
# Path to the built frontend (relative to this file's location)
FRONTEND_DIR = Path(__file__).parent.parent / "ui" / "dist"

if FRONTEND_DIR.exists():
    # Mount static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    logger.info(f"Serving frontend assets from {FRONTEND_DIR / 'assets'}")

    # Catch-all route for SPA - serve index.html for all non-API routes
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve the SPA index.html for all non-API routes."""
        # If it's an API route, this won't be reached (API routers have higher priority)
        index_file = FRONTEND_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return {"error": "Frontend not found"}
else:
    logger.warning(f"Frontend directory not found at {FRONTEND_DIR}")
