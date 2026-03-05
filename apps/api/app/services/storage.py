from __future__ import annotations

import json
from pathlib import Path
from typing import Any, cast

import boto3
from botocore.client import BaseClient
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings

settings = get_settings()


class ArtifactStorage:
    def __init__(self) -> None:
        self.local_dir = Path(settings.local_artifact_dir).resolve()
        self.local_dir.mkdir(parents=True, exist_ok=True)
        self._client: BaseClient | None = None
        if settings.s3_access_key_id and settings.s3_secret_access_key:
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url or None,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key_id,
                aws_secret_access_key=settings.s3_secret_access_key,
            )

    def put_json(self, key: str, payload: dict[str, Any]) -> str:
        return self.put_bytes(key, json.dumps(payload).encode("utf-8"), content_type="application/json")

    def put_bytes(self, key: str, body: bytes, content_type: str = "application/octet-stream") -> str:
        if self._client is not None:
            try:
                self._client.put_object(
                    Bucket=settings.s3_bucket,
                    Key=key,
                    Body=body,
                    ContentType=content_type,
                )
                return key
            except (BotoCoreError, ClientError):
                pass

        local_path = self.local_dir / key
        local_path.parent.mkdir(parents=True, exist_ok=True)
        local_path.write_bytes(body)
        return key

    def get_presigned_url(self, key: str | None) -> str | None:
        if not key:
            return None
        if self._client is not None:
            try:
                return cast(
                    str,
                    self._client.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": settings.s3_bucket, "Key": key},
                        ExpiresIn=settings.s3_presign_ttl_seconds,
                    ),
                )
            except (BotoCoreError, ClientError):
                pass
        return cast(str, str((self.local_dir / key).resolve()))


storage = ArtifactStorage()
