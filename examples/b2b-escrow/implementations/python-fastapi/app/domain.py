"""Strict wire inputs and integer-fen arithmetic; no binary floating point."""

import re
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

MAX_SAFE = 2**53 - 1


def integer(value):
    if type(value) is int:
        if abs(value) > MAX_SAFE:
            raise ValueError("Unsafe JSON number; use exact decimal string")
    elif isinstance(value, str) and re.fullmatch(r"0|-?[1-9][0-9]*", value):
        value = int(value)
    else:
        raise ValueError("Expected integer or exact decimal string")
    return checked(value)


def checked(value):
    if not -(2**63) <= value < 2**63:
        raise ValueError("Integer outside signed int64")
    return value


def parse_time(value: str) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", value
    ):
        raise ValueError("Expected whole-second UTC timestamp")
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def timestamp(value):
    parse_time(value)
    return value


Int64 = Annotated[int, BeforeValidator(integer)]
Positive = Annotated[Int64, Field(gt=0)]
Bps = Annotated[Int64, Field(ge=0, le=10000)]
Id = Annotated[str, Field(min_length=1, max_length=200)]
Time = Annotated[str, BeforeValidator(timestamp)]


class Body(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")
    id: Id


class Terms(Body):
    quantity: Positive
    tier_threshold: Positive
    tier1_unit_price_minor: Positive
    tier2_unit_price_minor: Positive
    tax_bps: Bps
    retention_bps: Bps
    daily_penalty_bps: Bps
    delivery_deadline: Time


class Linked(Body):
    order_confirmation_id: Id


class Funded(Linked):
    deposit_confirmation_id: Id


class Accepted(Funded):
    acceptance_confirmation_id: Id


class Delivered(Body):
    delivered_quantity: Positive


def true_only(value):
    if value is not True:
        raise ValueError("Expected boolean true")
    return value


class Acceptance(Body):
    accepted: Annotated[Literal[True], BeforeValidator(true_only)]


class Acknowledgment(Body):
    acknowledged: Annotated[Literal[True], BeforeValidator(true_only)]


def round_bps(amount, bps):
    return checked((amount * bps + 5000) // 10000)


def price(terms):
    unit = (
        terms["tier2_unit_price_minor"]
        if terms["quantity"] >= terms["tier_threshold"]
        else terms["tier1_unit_price_minor"]
    )
    subtotal = checked(terms["quantity"] * unit)
    return {
        "subtotal_minor": subtotal,
        "gross_amount_minor": round_bps(subtotal, 10000 + terms["tax_bps"]),
    }


def settle(gross, retention_bps, daily_bps, days):
    retention = round_bps(gross, retention_bps)
    penalty = min((gross * days * daily_bps + 5000) // 10000, gross - retention)
    return {
        "gross_amount_minor": gross,
        "retention_minor": retention,
        "late_penalty_minor": penalty,
        "payout_minor": gross - retention - penalty,
    }


def late_days(now, deadline):
    delta = now - parse_time(deadline)
    return max(0, delta.days + (1 if delta.seconds else 0))


def stamp(now):
    return now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def wire(value):
    if type(value) is int and abs(value) > MAX_SAFE:
        return str(value)
    if isinstance(value, dict):
        return {k: wire(v) for k, v in value.items()}
    if isinstance(value, list):
        return [wire(v) for v in value]
    return value
