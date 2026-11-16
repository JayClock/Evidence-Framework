import { BusinessError, notFound } from '../domain/errors.js';

export type Data = Record<string, string | bigint | boolean>;
export interface Fact {
  id: string;
  kind: string;
  contractId: string;
  orderId: string;
  requestId?: string;
  data: Data;
  href: string;
}

/** Synchronous commits are a single event-loop turn: no awaits between check/write.
 * Memory-only reference adapter; a database adapter must use a real transaction
 * and unique constraints for IDs, request confirmations and order releases.
 */
export class MemoryLedger {
  private readonly facts = new Map<string, Fact>();

  get(id: string, kind?: string): Fact {
    const fact = this.facts.get(id);
    if (!fact || (kind && fact.kind !== kind))
      return notFound('Evidence does not exist');
    return structuredClone(fact);
  }

  find(contractId: string, kind: string): Fact | undefined {
    const fact = [...this.facts.values()].find(
      (f) => f.contractId === contractId && f.kind === kind,
    );
    return fact && structuredClone(fact);
  }

  released(orderId: string): boolean {
    return [...this.facts.values()].some(
      (f) =>
        f.orderId === orderId &&
        ['confirmation.release', 'confirmation.milestone-release'].includes(
          f.kind,
        ),
    );
  }

  commit(fact: Fact): Fact {
    if (this.facts.has(fact.id))
      throw new BusinessError(409, 'CONFLICT', 'Evidence ID already exists');
    if (
      fact.requestId &&
      [...this.facts.values()].some((f) => f.requestId === fact.requestId)
    ) {
      throw new BusinessError(409, 'CONFLICT', 'Request is already confirmed');
    }
    this.facts.set(fact.id, structuredClone(fact));
    return structuredClone(fact);
  }
}
