from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import create_app
from app.domain import (
    Acceptance,
    Acknowledgment,
    Terms,
    integer,
    late_days,
    parse_time,
    price,
    round_bps,
    settle,
    wire,
)

WHEN = "2026-06-01T00:00:00Z"


def terms(id):
    return dict(
        id=id,
        quantity=2,
        tier_threshold=1000,
        tier1_unit_price_minor="10000000000000001",
        tier2_unit_price_minor=1199,
        tax_bps=1300,
        retention_bps=500,
        daily_penalty_bps=100,
        delivery_deadline=WHEN,
    )


def call(client, method, path, body=None, role="role.procurement-buyer", clock=WHEN):
    headers = {}
    if role:
        headers["x-evidence-role"] = role
    if clock:
        headers["x-evidence-asof"] = clock
    return client.request(method, path, json=body, headers=headers)


def post(client, path, body, role="role.procurement-buyer"):
    result = call(client, "POST", path, body, role)
    assert result.status_code == 201, (path, result.text)
    assert result.headers["content-type"] == "application/hal+json"
    assert result.headers["location"] == result.json()["_links"]["self"]["href"]
    return result.json()


def order(client, id):
    post(client, "/procurement/agreement", terms(id))
    root = f"/procurement/agreement/{id}"
    post(client, root + "/order/request", {"id": id + "-request"})
    post(
        client,
        root + f"/order/request/{id}-request/confirmation",
        {"id": id + "-order"},
        "role.procurement-seller",
    )
    post(
        client,
        root + "/commitment/request",
        {"id": id + "-commit"},
        "role.procurement-seller",
    )
    post(
        client,
        root + f"/commitment/request/{id}-commit/confirmation",
        {"id": id + "-committed", "acknowledged": True},
    )


def deposit(client, id):
    post(
        client,
        "/escrow/escrow",
        {"id": id + "-escrow", "order_confirmation_id": id + "-order"},
        "role.escrow-buyer",
    )
    root = f"/escrow/escrow/{id}-escrow"
    post(
        client,
        root + "/deposit-lock/request",
        {"id": id + "-lock"},
        "role.escrow-buyer",
    )
    post(
        client,
        root + f"/deposit-lock/request/{id}-lock/confirmation",
        {"id": id + "-deposit"},
        "role.escrow-escrow",
    )
    post(
        client,
        root + "/custody-statement/request",
        {"id": id + "-statement"},
        "role.escrow-escrow",
    )
    post(
        client,
        root + f"/custody-statement/request/{id}-statement/confirmation",
        {"id": id + "-custody", "acknowledged": True},
        "role.escrow-buyer",
    )


@pytest.mark.parametrize("value", [True, 1.5, 2**53, "9223372036854775808", "01", "-0"])
def test_invalid_integer(value):
    with pytest.raises(ValueError):
        integer(value)


@pytest.mark.parametrize("value", [1, 1.0, "true", False])
def test_boolean_is_not_coerced(value):
    for schema, field in [(Acceptance, "accepted"), (Acknowledgment, "acknowledged")]:
        with pytest.raises(ValidationError):
            schema.model_validate({"id": "x", field: value})


def test_exact_arithmetic():
    assert integer("9223372036854775807") == 2**63 - 1
    assert round_bps(1354870, 500) == 67744
    assert settle(22600000000000002, 500, 100, 1)["payout_minor"] == 21244000000000002
    capped = settle(1356225, 500, 100, 1000000)
    assert capped["payout_minor"] == 0
    assert (
        capped["retention_minor"] + capped["late_penalty_minor"]
        == capped["gross_amount_minor"]
    )
    assert wire({"zero": 0, "large": 2**53 + 1, "flag": True}) == {
        "zero": 0,
        "large": "9007199254740993",
        "flag": True,
    }
    for now, expected in [
        (WHEN, 0),
        ("2026-06-01T00:00:01Z", 1),
        ("2026-06-16T00:00:00Z", 15),
    ]:
        assert late_days(parse_time(now), WHEN) == expected
    with pytest.raises(ValueError):
        round_bps(2**63 - 1, 20000)
    invalid = terms("overflow") | {
        "quantity": 2,
        "tier1_unit_price_minor": str(2**63 - 1),
    }
    with pytest.raises(ValueError):
        price(Terms.model_validate(invalid).model_dump())
    with pytest.raises(ValidationError):
        Terms.model_validate(terms("bad") | {"tax_bps": 10001})


def test_security_strict_fields_get_expiry_and_v1():
    with TestClient(create_app(test_mode=True, mode="v1")) as client:
        assert (
            call(
                client, "POST", "/procurement/agreement", terms("a"), role=""
            ).status_code
            == 401
        )
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement",
                terms("a"),
                clock="2026-02-30T00:00:00Z",
            ).status_code
            == 400
        )
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement",
                terms("a"),
                role="role.escrow-buyer",
            ).status_code
            == 403
        )
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement",
                terms("a") | {"signed_at": WHEN},
            ).status_code
            == 422
        )
        post(client, "/procurement/agreement", terms("a"))
        assert call(client, "GET", "/procurement/agreement/a").status_code == 200
        assert (
            call(client, "POST", "/procurement/agreement", terms("a")).status_code
            == 409
        )
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement/a/order/request",
                {"id": "early"},
                clock="2026-05-31T00:00:00Z",
            ).status_code
            == 422
        )
        post(client, "/procurement/agreement/a/order/request", {"id": "req"})
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement/a/order/request/req/confirmation",
                {"id": "expired"},
                "role.procurement-seller",
                "2026-06-03T00:00:01Z",
            ).status_code
            == 422
        )
        assert (
            call(
                client,
                "POST",
                "/fulfillment/fulfillment/x/first-milestone/request",
                {"id": "x"},
                "role.fulfillment-buyer",
            ).status_code
            == 404
        )
    with TestClient(create_app()) as client:
        assert (
            call(client, "POST", "/procurement/agreement", terms("a")).status_code
            == 503
        )


def test_request_clock_isolation():
    with TestClient(create_app(test_mode=True)) as client:

        def sign(i):
            clock = f"2026-06-01T00:00:{i:02d}Z"
            result = call(
                client, "POST", "/procurement/agreement", terms(str(i)), clock=clock
            )
            assert result.status_code == 201
            assert result.json()["signed_at"] == clock

        with ThreadPoolExecutor(8) as pool:
            list(pool.map(sign, range(20)))


def test_full_journey_cross_order_and_atomic_release():
    with TestClient(create_app(test_mode=True)) as client:
        for id in ["a", "b"]:
            order(client, id)
            deposit(client, id)
        linked = {
            "id": "fulfillment",
            "order_confirmation_id": "a-order",
            "deposit_confirmation_id": "b-deposit",
        }
        assert (
            call(
                client,
                "POST",
                "/fulfillment/fulfillment",
                linked,
                "role.fulfillment-buyer",
            ).status_code
            == 422
        )
        linked["deposit_confirmation_id"] = "a-deposit"
        post(client, "/fulfillment/fulfillment", linked, "role.fulfillment-buyer")
        root = "/fulfillment/fulfillment/fulfillment"
        post(
            client,
            root + "/delivery/request",
            {"id": "delivery"},
            "role.fulfillment-buyer",
        )
        post(
            client,
            root + "/delivery/request/delivery/confirmation",
            {"id": "delivered", "delivered_quantity": 2},
            "role.fulfillment-seller",
        )
        post(
            client,
            root + "/acceptance/request",
            {"id": "accept"},
            "role.fulfillment-seller",
        )
        post(
            client,
            root + "/acceptance/request/accept/confirmation",
            {"id": "accepted", "accepted": True},
            "role.fulfillment-buyer",
        )
        post(
            client,
            "/settlement/settlement",
            {
                "id": "settlement",
                "order_confirmation_id": "a-order",
                "deposit_confirmation_id": "a-deposit",
                "acceptance_confirmation_id": "accepted",
            },
            "role.settlement-seller",
        )
        path = "/settlement/settlement/settlement/release/request"
        post(client, path, {"id": "release"}, "role.settlement-seller")
        assert (
            call(
                client,
                "POST",
                path + "/release/confirmation",
                {"id": "tamper", "payout_minor": 1},
                "role.settlement-escrow",
            ).status_code
            == 422
        )
        with ThreadPoolExecutor(2) as pool:
            results = list(
                pool.map(
                    lambda i: call(
                        client,
                        "POST",
                        path + "/release/confirmation",
                        {"id": f"released{i}"},
                        "role.settlement-escrow",
                    ),
                    range(2),
                )
            )
        assert sorted(r.status_code for r in results) == [201, 409]
        success = next(r.json() for r in results if r.status_code == 201)
        assert success["payout_minor"] == "21470000000000002"
