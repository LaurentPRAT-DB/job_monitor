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

    # Cache settings for pre-aggregated metrics
    cache_catalog: str = "job_monitor"
    cache_schema: str = "cache"
    use_cache: bool = True  # Set to False to bypass cache and query system tables directly

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
