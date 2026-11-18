from datetime import timedelta
from functools import wraps
from urllib.parse import quote

from .domain import (
    Acceptance,
    Accepted,
    Acknowledgment,
    Body,
    Delivered,
    Funded,
    Linked,
    Terms,
    late_days,
    parse_time,
    price,
    settle,
    stamp,
)
from .ledger import BusinessError, Fact, Ledger, require

CONTRACTS = {
    "procurement": ("agreement", ("buyer", "seller")),
    "escrow": ("escrow", ("buyer", "escrow")),
    "fulfillment": ("fulfillment", ("buyer", "seller")),
    "settlement": ("settlement", ("seller", "escrow")),
}
ACTIONS = {
    "procurement": {"order": ("buyer", "seller"), "commitment": ("seller", "buyer")},
    "escrow": {
        "deposit-lock": ("buyer", "escrow"),
        "custody-statement": ("escrow", "buyer"),
    },
    "fulfillment": {
        "delivery": ("buyer", "seller"),
        "acceptance": ("seller", "buyer"),
        "first-milestone": ("buyer", "seller"),
        "final-milestone": ("buyer", "seller"),
        "milestone-acceptance": ("seller", "buyer"),
    },
    "settlement": {
        "release": ("seller", "escrow"),
        "settlement-receipt": ("escrow", "seller"),
        "milestone-release": ("seller", "escrow"),
        "milestone-statement": ("escrow", "seller"),
    },
}
COLLECTION_NAMES = {
    "agreement": "agreements",
    "escrow": "escrows",
    "fulfillment": "fulfillments",
    "settlement": "settlements",
    "order": "orders",
    "commitment": "commitments",
    "deposit-lock": "deposit-locks",
    "custody-statement": "custody-statements",
    "delivery": "deliveries",
    "acceptance": "acceptances",
    "first-milestone": "first-milestones",
    "final-milestone": "final-milestones",
    "milestone-acceptance": "milestone-acceptances",
    "release": "releases",
    "settlement-receipt": "settlement-receipts",
    "milestone-release": "milestone-releases",
    "milestone-statement": "milestone-statements",
}
DELIVERIES = {"delivery", "first-milestone", "final-milestone"}
ACCEPTANCES = {"acceptance", "milestone-acceptance"}
RELEASES = {"release", "milestone-release"}
ACKS = {"commitment", "custody-statement", "settlement-receipt", "milestone-statement"}


def atomic(fn):
    @wraps(fn)
    def run(self, *args, **kwargs):
        with self.ledger.transaction:
            return fn(self, *args, **kwargs)

    return run


def chronology(fact, now):
    formed = next(
        fact.data[k]
        for k in ("confirmed_at", "started_at", "signed_at")
        if k in fact.data
    )
    require(parse_time(formed) <= now, "Evidence cannot precede prerequisite")


class EscrowService:
    def __init__(self):
        self.ledger = Ledger()

    def order(self, contract):
        return self.ledger.get(
            contract.data["order_confirmation_id"], "confirmation.order"
        )

    @atomic
    def sign(self, lane, body, now):
        schema = {
            "procurement": Terms,
            "escrow": Linked,
            "fulfillment": Funded,
            "settlement": Accepted,
        }[lane]
        data = schema.model_validate(body).model_dump()
        id, order_id = data["id"], data["id"]
        if lane == "procurement":
            price(data)  # Overflow fails before committing anything.
        else:
            order = self.ledger.get(data["order_confirmation_id"], "confirmation.order")
            order_id = order.id
            chronology(order, now)
            chronology(
                self.ledger.previous(order.contract_id, "confirmation.commitment"), now
            )
            if lane != "escrow":
                deposit = self.ledger.get(
                    data["deposit_confirmation_id"], "confirmation.deposit-lock"
                )
                require(
                    deposit.order_id == order.id, "Deposit belongs to another order"
                )
                chronology(deposit, now)
                chronology(
                    self.ledger.previous(
                        deposit.contract_id, "confirmation.custody-statement"
                    ),
                    now,
                )
                require(
                    deposit.data["locked_amount_minor"]
                    == order.data["gross_amount_minor"],
                    "Deposit is not fully funded",
                )
            if lane == "settlement":
                acceptance = self.ledger.get(data["acceptance_confirmation_id"])
                require(
                    acceptance.kind
                    in {"confirmation.acceptance", "confirmation.milestone-acceptance"}
                    and acceptance.order_id == order.id
                    and acceptance.data.get("accepted") is True,
                    "Invalid acceptance evidence",
                )
                chronology(acceptance, now)
                fulfillment = self.ledger.get(
                    acceptance.contract_id, "contract.fulfillment"
                )
                require(
                    fulfillment.data["deposit_confirmation_id"]
                    == data["deposit_confirmation_id"],
                    "Acceptance uses another deposit",
                )
        data["signed_at"] = stamp(now)
        return self.ledger.commit(
            Fact(
                id,
                f"contract.{CONTRACTS[lane][0]}",
                id,
                order_id,
                data,
                f"/{COLLECTION_NAMES[CONTRACTS[lane][0]]}/{quote(id, safe='')}",
            )
        )

    @atomic
    def request(self, lane, action, contract_id, body, now):
        data = Body.model_validate(body).model_dump()
        contract = self.ledger.get(contract_id, f"contract.{CONTRACTS[lane][0]}")
        chronology(contract, now)
        require(
            self.ledger.find(contract_id, f"request.{action}") is None,
            "Obligation already requested",
        )
        prerequisites = {
            "commitment": "order",
            "custody-statement": "deposit-lock",
            "acceptance": "delivery",
            "final-milestone": "first-milestone",
            "milestone-acceptance": "final-milestone",
            "settlement-receipt": "release",
            "milestone-statement": "milestone-release",
        }
        if action in prerequisites:
            chronology(
                self.ledger.previous(
                    contract_id, f"confirmation.{prerequisites[action]}"
                ),
                now,
            )
        if action in RELEASES:
            acceptance = self.ledger.get(contract.data["acceptance_confirmation_id"])
            require(
                acceptance.kind
                == f"confirmation.{'acceptance' if action == 'release' else 'milestone-acceptance'}",
                "Release does not match acceptance",
            )
            require(
                not self.ledger.released(contract.order_id), "Order already released"
            )
        if action in DELIVERIES:
            other = "first-milestone" if action == "delivery" else "delivery"
            require(
                self.ledger.find(contract_id, f"request.{other}") is None,
                "Cannot mix delivery modes",
            )
        data.update(started_at=stamp(now), expired_at=stamp(now + timedelta(hours=48)))
        return self.ledger.commit(
            Fact(
                data["id"],
                f"request.{action}",
                contract_id,
                contract.order_id,
                data,
                f"{contract.href}/{COLLECTION_NAMES[action]}/{quote(data['id'], safe='')}",
            )
        )

    @atomic
    def confirm(self, lane, action, contract_id, request_id, body, now):
        schema = (
            Delivered
            if action in DELIVERIES
            else Acceptance
            if action in ACCEPTANCES
            else Acknowledgment
            if action in ACKS
            else Body
        )
        data = schema.model_validate(body).model_dump()
        contract = self.ledger.get(contract_id, f"contract.{CONTRACTS[lane][0]}")
        request = self.ledger.get(request_id, f"request.{action}")
        require(
            request.contract_id == contract_id, "Request belongs to another contract"
        )
        chronology(request, now)
        require(now <= parse_time(request.data["expired_at"]), "Request expired")
        if action == "order":
            data.update(price(contract.data))
            data.update(
                {
                    k: contract.data[k]
                    for k in (
                        "quantity",
                        "retention_bps",
                        "daily_penalty_bps",
                        "delivery_deadline",
                    )
                }
            )
        elif action == "deposit-lock":
            data["locked_amount_minor"] = self.order(contract).data[
                "gross_amount_minor"
            ]
        elif action in DELIVERIES:
            quantity, ordered = (
                data["delivered_quantity"],
                self.order(contract).data["quantity"],
            )
            if action == "delivery":
                require(quantity == ordered, "Incomplete delivery")
            elif action == "first-milestone":
                require(quantity < ordered, "First milestone must leave remainder")
            else:
                require(
                    quantity
                    + self.ledger.previous(
                        contract_id, "confirmation.first-milestone"
                    ).data["delivered_quantity"]
                    == ordered,
                    "Invalid milestone total",
                )
        elif action in ACCEPTANCES:
            order = self.order(contract)
            kind = "delivery" if action == "acceptance" else "first-milestone"
            quantity = self.ledger.previous(contract_id, f"confirmation.{kind}").data[
                "delivered_quantity"
            ]
            if action == "milestone-acceptance":
                quantity += self.ledger.previous(
                    contract_id, "confirmation.final-milestone"
                ).data["delivered_quantity"]
            require(quantity == order.data["quantity"], "Incomplete delivery")
            data.update(
                accepted_quantity=quantity,
                late_days=late_days(now, order.data["delivery_deadline"]),
            )
        elif action in RELEASES:
            if self.ledger.released(contract.order_id):
                raise BusinessError(409, "ALREADY_CONFIRMED", "Order already released")
            order = self.order(contract)
            acceptance = self.ledger.get(contract.data["acceptance_confirmation_id"])
            data.update(
                settle(
                    order.data["gross_amount_minor"],
                    order.data["retention_bps"],
                    order.data["daily_penalty_bps"],
                    acceptance.data["late_days"],
                )
            )
        data["confirmed_at"] = stamp(now)
        return self.ledger.commit(
            Fact(
                data["id"],
                f"confirmation.{action}",
                contract_id,
                data["id"] if action == "order" else contract.order_id,
                data,
                f"/{action}-confirmations/{quote(data['id'], safe='')}",
                request_id,
            )
        )
