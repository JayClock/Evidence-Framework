"""Pure ASGI middleware: FastAPI/Starlette, no extra framework dependency."""
from contextvars import ContextVar
from datetime import datetime, timezone

_request_clock: ContextVar[datetime | None] = ContextVar("evidence_clock", default=None)


def get_now() -> datetime:
    return _request_clock.get() or datetime.now(timezone.utc)


class EvidenceClockMiddleware:
    def __init__(self, app, enabled: bool = False):
        self.app = app
        self.enabled = enabled  # trusted test-environment configuration ONLY

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        now = None
        headers = dict(scope.get("headers", []))
        header = headers.get(b"x-evidence-asof", b"").decode("ascii", errors="replace")
        if self.enabled and header.endswith("Z"):
            try:
                now = datetime.fromisoformat(header[:-1] + "+00:00")
            except ValueError:
                pass
        token = _request_clock.set(now)
        try:
            await self.app(scope, receive, send)
        finally:
            _request_clock.reset(token)
