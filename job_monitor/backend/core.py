"""Core dependencies for Job Monitor backend."""

import logging
from typing import Annotated

from fastapi import Header, Request

logger = logging.getLogger(__name__)


def get_ws(request: Request):
    """Get the Service Principal WorkspaceClient from app state.

    This client is initialized at app startup and uses the Service Principal
    credentials configured in the Databricks App environment.
    """
    return request.app.state.workspace_client


def get_user_ws(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
):
    """Create a WorkspaceClient from the user's OBO token.

    This creates a client that acts on behalf of the authenticated user,
    using the OAuth token forwarded by the Databricks App platform.

    Returns None if no token is available.
    """
    if not token:
        logger.debug("No X-Forwarded-Access-Token header found")
        return None

    from databricks.sdk import WorkspaceClient
    from job_monitor.backend.config import settings

    logger.info(f"Creating user OBO WorkspaceClient (token length: {len(token)})")
    return WorkspaceClient(
        host=settings.databricks_host,
        token=token,
    )


def get_ws_prefer_user(
    request: Request,
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
):
    """Get WorkspaceClient, preferring user OBO token over service principal.

    This is the recommended dependency for system table queries, as the user
    likely has more permissions than the app's service principal.

    Priority:
    1. User OBO token (if available via X-Forwarded-Access-Token)
    2. Service Principal (fallback)

    Returns None if neither is available.
    """
    # Try user OBO first
    if token:
        from databricks.sdk import WorkspaceClient
        from job_monitor.backend.config import settings

        logger.info("Using user OBO token for WorkspaceClient")
        return WorkspaceClient(
            host=settings.databricks_host,
            token=token,
        )

    # Fall back to service principal
    ws = request.app.state.workspace_client
    if ws:
        logger.info("Using service principal WorkspaceClient (no user token available)")
    else:
        logger.warning("No WorkspaceClient available (no user token, no SP)")
    return ws


def get_current_user(
    token: Annotated[str | None, Header(alias="X-Forwarded-Access-Token")] = None,
) -> str:
    """Extract the current user's email from the OBO token.

    In production (Databricks App), the X-Forwarded-Access-Token header
    contains a JWT with the user's identity. For local development,
    returns a placeholder.
    """
    if token:
        # In production, decode JWT to get user email
        # The token is a JWT issued by Databricks OAuth
        try:
            import base64
            import json

            # JWT structure: header.payload.signature
            parts = token.split(".")
            if len(parts) >= 2:
                # Decode the payload (add padding if needed)
                payload = parts[1]
                padding = 4 - len(payload) % 4
                if padding != 4:
                    payload += "=" * padding
                decoded = base64.urlsafe_b64decode(payload)
                claims = json.loads(decoded)

                # Extract email from standard claims
                email = claims.get("email") or claims.get("sub") or claims.get("preferred_username")
                if email:
                    return email
        except Exception:
            # If decoding fails, fall back to placeholder
            pass
        return "authenticated-user@databricks.com"

    return "local-dev-user"
