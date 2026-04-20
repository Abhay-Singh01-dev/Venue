"""
Central configuration management for FlowState AI backend.
All settings are loaded from environment variables via pydantic-settings.
"""

from typing import Any
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    gemini_api_key: str
    firebase_credentials_path: str = "./firebase-credentials.json"
    firebase_credentials_base64: str | None = None
    firebase_project_id: str
    simulation_speed: float = 5.0
    bq_enabled: bool = True
    bq_dataset: str = "flowstate_ai"
    bq_table: str = "pipeline_metrics"
    gcs_enabled: bool = True
    gcs_bucket: str = "flowstate-ai-evidence"
    pubsub_enabled: bool = True
    pubsub_topic: str = "pipeline-run-completed"
    trigger_min_interval_seconds: int = 15
    max_request_bytes: int = 1_000_000
    cors_origins: Any = ["http://localhost:5173"]
    log_level: str = "INFO"
    port: int = 8080

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        if isinstance(v, list):
            return [str(origin).strip() for origin in v if str(origin).strip()]
        return v


# Module-level singleton initialized immediately
# Python-dotenv implicitly handles loading the .env file configured above.
settings = Settings()
