"""Authentication router for Job Monitor."""

import re
from typing import Annotated

from fastapi import APIRouter, Depends

from job_monitor.backend.config import settings
from job_monitor.backend.core import get_current_user
from job_monitor.backend.models import UserInfo

router = APIRouter(tags=["auth"])


def _extract_workspace_name(host: str) -> str:
    """Extract a friendly workspace name from the host URL.

    Examples:
    - https://e2-demo-field-eng.cloud.databricks.com -> E2 Demo Field Eng
    - https://e2-demo-west.cloud.databricks.com -> E2 Demo West
    - https://adb-1234567890123456.7.azuredatabricks.net -> Azure Workspace
    """
    if not host:
        return "Local"

    # Remove protocol and trailing slashes
    host = re.sub(r"^https?://", "", host).rstrip("/")

    # Extract the subdomain (workspace identifier)
    # AWS: {workspace}.cloud.databricks.com
    # Azure: adb-{id}.{region}.azuredatabricks.net
    # GCP: {workspace}.gcp.databricks.com

    if ".cloud.databricks.com" in host:
        workspace = host.replace(".cloud.databricks.com", "")
        # Convert e2-demo-field-eng to "E2 Demo Field Eng"
        return workspace.replace("-", " ").title()
    elif ".azuredatabricks.net" in host:
        return "Azure Workspace"
    elif ".gcp.databricks.com" in host:
        workspace = host.replace(".gcp.databricks.com", "")
        return workspace.replace("-", " ").title()
    else:
        return host.split(".")[0].replace("-", " ").title()


@router.get("/api/me", response_model=UserInfo)
async def get_me(
    user_email: Annotated[str, Depends(get_current_user)],
) -> UserInfo:
    """Return current user information.

    In production (Databricks App), returns the authenticated user's email.
    In local development, returns 'local-dev-user'.
    """
    workspace_host = settings.databricks_host or None
    workspace_name = _extract_workspace_name(workspace_host) if workspace_host else "Local"

    return UserInfo(
        email=user_email,
        display_name=user_email.split("@")[0] if "@" in user_email else user_email,
        workspace_host=workspace_host,
        workspace_name=workspace_name,
    )
