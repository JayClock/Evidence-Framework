import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .context import RequestContextMiddleware, business_context
from .domain import wire
from .ledger import BusinessError
from .service import ACTIONS, CONTRACTS, EscrowService


def create_app(test_mode=False, mode="v2", clock=None):
    if mode not in {"v1", "v2"}:
        raise ValueError("Invalid mode")
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(RequestContextMiddleware, test_mode=test_mode, clock=clock)
    service = EscrowService()

    @app.exception_handler(BusinessError)
    async def business_error(request, exc):
        return JSONResponse({"error": exc.code, "detail": exc.detail}, exc.status)

    @app.exception_handler(ValueError)
    @app.exception_handler(ValidationError)
    async def invalid_input(request, exc):
        return JSONResponse({"error": "INVALID_INPUT", "detail": str(exc)}, 422)

    async def read(request):
        # Enforce a bound while streaming, not after allocating an unbounded body.
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > 65536:
                raise BusinessError(413, "INVALID_INPUT", "Body too large")
        try:
            data = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            raise BusinessError(422, "INVALID_INPUT", "Expected JSON object") from None
        if not isinstance(data, dict):
            raise BusinessError(422, "INVALID_INPUT", "Expected JSON object")
        return data

    def authorize(lane, roles):
        now, role = business_context.get()
        if role not in {f"role.{lane}-{r}" for r in roles}:
            raise BusinessError(403, "FORBIDDEN", "Role cannot perform operation")
        return now

    def response(fact, status=201):
        return JSONResponse(
            wire({**fact.data, "_links": {"self": {"href": fact.href}}}),
            status,
            headers={"Location": fact.href} if status == 201 else None,
            media_type="application/hal+json",
        )

    def sign_handler(lane, roles):
        async def sign(request: Request):
            now = authorize(lane, roles)
            return response(service.sign(lane, await read(request), now))

        return sign

    def get_handler(lane, roles):
        async def get(contractId: str):
            authorize(lane, roles)
            with service.ledger.transaction:
                return response(
                    service.ledger.get(contractId, f"contract.{CONTRACTS[lane][0]}"),
                    200,
                )

        return get

    def request_handler(lane, action, role):
        async def make_request(contractId: str, request: Request):
            now = authorize(lane, [role])
            return response(
                service.request(lane, action, contractId, await read(request), now)
            )

        return make_request

    def confirm_handler(lane, action, role):
        async def confirm(contractId: str, requestId: str, request: Request):
            now = authorize(lane, [role])
            return response(
                service.confirm(
                    lane, action, contractId, requestId, await read(request), now
                )
            )

        return confirm

    def ledger_handler(lane, action, role):
        async def get_request(contractId: str):
            authorize(lane, [role])
            with service.ledger.transaction:
                service.ledger.get(contractId, f"contract.{CONTRACTS[lane][0]}")
                fact = service.ledger.find(contractId, f"request.{action}")
                if fact is None:
                    raise BusinessError(404, "NOT_FOUND", "Request has not been formed")
                return response(fact, 200)

        return get_request

    for lane, (name, roles) in CONTRACTS.items():
        root = f"/{lane}/{name}"
        app.add_api_route(root, sign_handler(lane, roles), methods=["POST"])
        app.add_api_route(
            root + "/{contractId}", get_handler(lane, roles), methods=["GET"]
        )
        for action, (request_role, confirm_role) in ACTIONS[lane].items():
            if mode == "v1" and "milestone" in action:
                continue
            base = root + "/{contractId}/" + action
            app.add_api_route(
                base, ledger_handler(lane, action, request_role), methods=["GET"]
            )
            app.add_api_route(
                base + "/request",
                request_handler(lane, action, request_role),
                methods=["POST"],
            )
            app.add_api_route(
                base + "/request/{requestId}/confirmation",
                confirm_handler(lane, action, confirm_role),
                methods=["POST"],
            )
    return app
