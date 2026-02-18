"""FastAPI application entry point for Job Monitor."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from job_monitor.backend.config import settings
from job_monitor.backend.routers import auth, health


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler for startup and shutdown."""
    # Initialize WorkspaceClient on startup if host is configured
    if settings.databricks_host:
        try:
            from databricks.sdk import WorkspaceClient

            app.state.workspace_client = WorkspaceClient(
                host=settings.databricks_host
            )
        except Exception:
            # WorkspaceClient will be None if initialization fails
            app.state.workspace_client = None
    else:
        app.state.workspace_client = None

    yield

    # Cleanup on shutdown (if needed)


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

# Include routers
app.include_router(health.router)
app.include_router(auth.router)
