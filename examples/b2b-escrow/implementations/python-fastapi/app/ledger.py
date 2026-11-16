from copy import deepcopy
from dataclasses import dataclass
from threading import RLock


class BusinessError(Exception):
    def __init__(self, status, code, detail):
        super().__init__(detail)
        self.status, self.code, self.detail = status, code, detail


def require(condition, detail):
    if not condition:
        raise BusinessError(422, "PRECONDITION_FAILED", detail)


@dataclass(frozen=True)
class Fact:
    id: str
    kind: str
    contract_id: str
    order_id: str
    data: dict
    href: str
    request_id: str | None = None


class Ledger:
    """Memory adapter. Caller holds transaction lock across checks and commit.

    A persistent adapter must replace this with DB transactions and unique keys.
    """

    def __init__(self):
        self.transaction = RLock()
        self._facts = {}

    def get(self, id, kind=None):
        fact = self._facts.get(id)
        if fact is None or kind is not None and fact.kind != kind:
            raise BusinessError(404, "NOT_FOUND", "Evidence does not exist")
        return deepcopy(fact)

    def find(self, contract_id, kind):
        return next(
            (
                deepcopy(f)
                for f in self._facts.values()
                if f.contract_id == contract_id and f.kind == kind
            ),
            None,
        )

    def previous(self, contract_id, kind):
        fact = self.find(contract_id, kind)
        require(fact is not None, f"Missing prerequisite {kind}")
        return fact

    def released(self, order_id):
        return any(
            f.order_id == order_id
            and f.kind in ("confirmation.release", "confirmation.milestone-release")
            for f in self._facts.values()
        )

    def commit(self, fact):
        if fact.id in self._facts:
            raise BusinessError(409, "CONFLICT", "Evidence ID already exists")
        if fact.request_id and any(
            f.request_id == fact.request_id for f in self._facts.values()
        ):
            raise BusinessError(409, "CONFLICT", "Request already confirmed")
        self._facts[fact.id] = deepcopy(fact)
        return deepcopy(fact)
