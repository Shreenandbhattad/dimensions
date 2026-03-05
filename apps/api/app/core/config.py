from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Dimensions API", alias="APP_NAME")
    api_prefix: str = Field(default="/api/v1", alias="API_PREFIX")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/dimensions",
        alias="DATABASE_URL",
    )
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    celery_task_always_eager: bool = Field(default=True, alias="CELERY_TASK_ALWAYS_EAGER")

    overpass_url: str = Field(
        default="https://overpass-api.de/api/interpreter",
        alias="OVERPASS_URL",
    )
    open_elevation_url: str = Field(
        default="https://api.open-elevation.com/api/v1/lookup",
        alias="OPEN_ELEVATION_URL",
    )
    default_city_code: str = Field(default="MUMBAI", alias="DEFAULT_CITY_CODE")
    default_context_radius_m: int = Field(default=200, alias="DEFAULT_CONTEXT_RADIUS_M")

    s3_endpoint_url: str | None = Field(default=None, alias="S3_ENDPOINT_URL")
    s3_region: str = Field(default="ap-south-1", alias="S3_REGION")
    s3_bucket: str = Field(default="dimensions-dev", alias="S3_BUCKET")
    s3_access_key_id: str | None = Field(default=None, alias="S3_ACCESS_KEY_ID")
    s3_secret_access_key: str | None = Field(default=None, alias="S3_SECRET_ACCESS_KEY")
    s3_presign_ttl_seconds: int = Field(default=3600, alias="S3_PRESIGN_TTL_SECONDS")
    local_artifact_dir: Path = Field(default=Path("./artifacts"), alias="LOCAL_ARTIFACT_DIR")

    use_in_memory_store: bool = Field(default=True, alias="USE_IN_MEMORY_STORE")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
