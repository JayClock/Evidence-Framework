import pytest
from fastapi.testclient import TestClient
from test_app import WHEN, call, terms

from app.api import FAULTS, create_app
from app.domain import parse_time


@pytest.mark.parametrize("fault", FAULTS)
def test_faults_are_explicit_and_test_only(fault):
    with TestClient(create_app(fault=fault)) as client:
        assert (
            call(client, "POST", "/procurement/agreement", terms("closed")).status_code
            == 503
        )
    with TestClient(
        create_app(
            test_mode=True,
            fault=fault,
            clock=lambda: parse_time("2026-07-09T00:00:00Z"),
        )
    ) as client:
        response = call(client, "POST", "/procurement/agreement", terms("fault"))
        assert response.status_code == 201
        data = response.json()
        assert (data.get("unmodeled") is True) == (fault == "extra-field")
        assert (data["signed_at"] != WHEN) == (fault == "clock")
        assert data["tier1_unit_price_minor"] == (
            "10000000000000000" if fault == "precision" else "10000000000000001"
        )
        assert (
            call(
                client,
                "POST",
                "/procurement/agreement",
                terms("forbidden"),
                role="role.procurement-escrow",
            ).status_code
            == 403
        )
        assert (
            call(
                client, "POST", "/procurement/agreement", terms("bad"), clock="bad"
            ).status_code
            == 400
        )
        response = call(
            client,
            "POST",
            "/settlement/settlement/absent/release/request/absent/confirmation",
            {"id": "tamper", "payout_minor": 999999},
            role="role.settlement-escrow",
        )
        assert response.status_code == (201 if fault == "accept-derived" else 422)


def test_unknown_fault_fails_closed():
    with pytest.raises(ValueError, match="Invalid fault"):
        create_app(test_mode=True, fault="unknown")
