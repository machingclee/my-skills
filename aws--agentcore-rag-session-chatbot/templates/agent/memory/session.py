import os
from typing import Optional

from strands.session import S3SessionManager

S3_SESSION_BUCKET = os.getenv(
    "S3_SESSION_BUCKET", "{{S3_SESSION_BUCKET}}")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def get_s3_session_manager(
    session_id: Optional[str], actor_id: str
) -> Optional[S3SessionManager]:
    """Return an S3-backed session manager for conversation history."""
    return S3SessionManager(
        session_id=session_id or "default",
        bucket=S3_SESSION_BUCKET,
        prefix=f"sessions/{session_id or 'default'}",
        region_name=AWS_REGION,
    )
