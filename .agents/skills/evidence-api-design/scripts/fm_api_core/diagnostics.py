from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal


@dataclass(frozen=True)
class Diagnostic:
    code: str
    severity: Literal["error", "gap", "warning"]
    message: str
    targetRef: str | None = None
    location: str | None = None
    relatedRefs: tuple[str, ...] = ()
    gapKey: str | None = None
    category: Literal["business", "design", "expression", "coverage"] | None = None

    def to_dict(self) -> dict:
        result = asdict(self)
        result["relatedRefs"] = list(self.relatedRefs)
        if self.gapKey is None:
            result.pop("gapKey")
        if self.category is None:
            result.pop("category")
        return result


def error(
    code: str,
    message: str,
    target: str | None = None,
    location: str | None = None,
    related: tuple[str, ...] = (),
) -> Diagnostic:
    return Diagnostic(code, "error", message, target, location, related)


def gap(
    code: str,
    key: str,
    category: Literal["business", "design", "expression", "coverage"],
    message: str,
    target: str | None = None,
    related: tuple[str, ...] = (),
) -> Diagnostic:
    return Diagnostic(code, "gap", message, target, None, related, key, category)
