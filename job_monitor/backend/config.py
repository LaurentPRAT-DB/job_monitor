"""Configuration settings for Job Monitor backend."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    databricks_host: str = ""
    warehouse_id: str = ""
    app_version: str = "0.1.0"

    # SLA and team attribution tag keys
    sla_tag_key: str = "sla_minutes"
    team_tag_key: str = "team"
    owner_tag_key: str = "owner"

    # DBU rate for cost calculations (0 means disabled, user configures)
    dbu_rate: float = 0.0

    # Budget tag key for monthly DBU budget per job
    budget_tag_key: str = "budget_monthly_dbus"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()


def get_settings() -> Settings:
    """Return settings instance (for dependency injection or testing)."""
    return settings
