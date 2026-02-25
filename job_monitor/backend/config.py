"""Configuration settings for Job Monitor backend.

Loads configuration from:
1. job_monitor/config.yaml (base configuration)
2. Environment variables (overrides)

Environment variables use uppercase names with underscores, e.g.:
- CACHE_CATALOG, CACHE_SCHEMA, CACHE_REFRESH_CRON
- WAREHOUSE_ID, DBU_RATE
"""

from pathlib import Path

import yaml
from pydantic_settings import BaseSettings


def _load_yaml_config() -> dict:
    """Load configuration from config.yaml file."""
    config_paths = [
        Path(__file__).parent.parent / "config.yaml",  # job_monitor/config.yaml
        Path(__file__).parent.parent.parent / "config.yaml",  # project root
    ]

    for config_path in config_paths:
        if config_path.exists():
            with open(config_path) as f:
                return yaml.safe_load(f) or {}

    return {}


# Load YAML config once at module import
_yaml_config = _load_yaml_config()


class Settings(BaseSettings):
    """Application settings loaded from config.yaml and environment variables."""

    databricks_host: str = ""
    warehouse_id: str = _yaml_config.get("warehouse_id", "")
    app_version: str = "0.1.0"

    # SLA and team attribution tag keys (from config.yaml tags section)
    sla_tag_key: str = _yaml_config.get("tags", {}).get("sla", "sla_minutes")
    team_tag_key: str = _yaml_config.get("tags", {}).get("team", "team")
    owner_tag_key: str = _yaml_config.get("tags", {}).get("owner", "owner")
    budget_tag_key: str = _yaml_config.get("tags", {}).get("budget", "budget_monthly_dbus")

    # DBU rate for cost calculations (0 means disabled, user configures)
    dbu_rate: float = _yaml_config.get("dbu_rate", 0.0)

    # Cache settings for pre-aggregated metrics (from config.yaml cache section)
    cache_catalog: str = _yaml_config.get("cache", {}).get("catalog", "job_monitor")
    cache_schema: str = _yaml_config.get("cache", {}).get("schema", "cache")
    cache_refresh_cron: str = _yaml_config.get("cache", {}).get("refresh_cron", "0 */15 * * * ?")
    use_cache: bool = _yaml_config.get("cache", {}).get("enabled", True)

    # Mock data settings (for development/demos)
    # Override enabled with USE_MOCK_DATA=true environment variable
    use_mock_data: bool = _yaml_config.get("mock_data", {}).get("enabled", False)
    mock_auto_fallback: bool = _yaml_config.get("mock_data", {}).get("auto_fallback", True)

    # SMTP email configuration
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    email_from: str = "noreply@databricks-monitor.local"

    # Report distribution lists (comma-separated)
    daily_report_recipients: str = ""
    weekly_report_recipients: str = ""
    monthly_report_recipients: str = ""

    # App URL for report links
    app_url: str = "http://localhost:3000"

    @property
    def cache_table_prefix(self) -> str:
        """Get the fully qualified prefix for cache tables."""
        return f"{self.cache_catalog}.{self.cache_schema}"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def get_settings() -> Settings:
    """Return settings instance (for dependency injection or testing)."""
    return settings


def get_yaml_config() -> dict:
    """Return raw YAML config (for job script access)."""
    return _yaml_config
