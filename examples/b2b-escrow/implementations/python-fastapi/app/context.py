from contextvars import ContextVar
from datetime import datetime, timezone

from .domain import parse_time

business_context: ContextVar[tuple[datetime, str]] = ContextVar("business_context")


class RequestContextMiddleware:
    """Pure ASGI middleware: context is reset even on failed/async requests."""

    def __init__(self, app, test_mode=False, clock=None, ignore_clock=False):
        self.app, self.test_mode = app, test_mode
        self.ignore_clock = ignore_clock
        self.clock = clock or (
            lambda: datetime.now(timezone.utc).replace(microsecond=0)
        )

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        from starlette.responses import JSONResponse

        headers = scope["headers"]
        clocks = [v.decode() for k, v in headers if k == b"x-evidence-asof"]
        roles = [v.decode() for k, v in headers if k == b"x-evidence-role"]
        if not self.test_mode:
            return await JSONResponse({"error": "TEST_MODE_REQUIRED"}, 503)(
                scope, receive, send
            )
        try:
            if len(clocks) > 1:
                raise ValueError("Duplicate clock")
            now = parse_time(clocks[0]) if clocks else self.clock()
        except ValueError:
            return await JSONResponse({"error": "INVALID_CLOCK"}, 400)(
                scope, receive, send
            )
        if len(roles) != 1 or not roles[0]:
            return await JSONResponse({"error": "UNAUTHENTICATED"}, 401)(
                scope, receive, send
            )
        if self.ignore_clock:
            now = self.clock()  # Test-only bug: discard a valid injected clock.
        token = business_context.set((now, roles[0]))
        try:
            await self.app(scope, receive, send)
        finally:
            business_context.reset(token)
