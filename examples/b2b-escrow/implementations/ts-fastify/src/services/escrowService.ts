import { z } from 'zod';
import { BusinessError, requireFact } from '../domain/errors.js';
import {
  agreementInput,
  id,
  positive,
  lateDays,
  price,
  settle,
  type Terms,
} from '../domain/money.js';
import {
  MemoryLedger,
  type Data,
  type Fact,
} from '../repositories/memoryLedger.js';

export const contracts = {
  procurement: {
    name: 'agreement',
    roles: ['role.procurement-buyer', 'role.procurement-seller'],
  },
  escrow: {
    name: 'escrow',
    roles: ['role.escrow-buyer', 'role.escrow-escrow'],
  },
  fulfillment: {
    name: 'fulfillment',
    roles: ['role.fulfillment-buyer', 'role.fulfillment-seller'],
  },
  settlement: {
    name: 'settlement',
    roles: ['role.settlement-seller', 'role.settlement-escrow'],
  },
} as const;
export type Lane = keyof typeof contracts;
export const actions: Record<Lane, Record<string, [string, string]>> = {
  procurement: { order: ['buyer', 'seller'], commitment: ['seller', 'buyer'] },
  escrow: {
    'deposit-lock': ['buyer', 'escrow'],
    'custody-statement': ['escrow', 'buyer'],
  },
  fulfillment: {
    delivery: ['buyer', 'seller'],
    acceptance: ['seller', 'buyer'],
    'first-milestone': ['buyer', 'seller'],
    'final-milestone': ['buyer', 'seller'],
    'milestone-acceptance': ['seller', 'buyer'],
  },
  settlement: {
    release: ['seller', 'escrow'],
    'settlement-receipt': ['escrow', 'seller'],
    'milestone-release': ['seller', 'escrow'],
    'milestone-statement': ['escrow', 'seller'],
  },
};

const linkage = z.strictObject({ id, order_confirmation_id: id });
const funded = linkage.extend({ deposit_confirmation_id: id });
const accepted = funded.extend({ acceptance_confirmation_id: id });
const bodyId = z.strictObject({ id });
const deliveries = ['delivery', 'first-milestone', 'final-milestone'];
const acceptances = ['acceptance', 'milestone-acceptance'];
const releases = ['release', 'milestone-release'];
const acknowledgments = [
  'commitment',
  'custody-statement',
  'settlement-receipt',
  'milestone-statement',
];

export class EscrowService {
  constructor(readonly ledger = new MemoryLedger()) {}

  private previous(contractId: string, kind: string): Fact {
    const fact = this.ledger.find(contractId, kind);
    requireFact(fact, `Missing prerequisite ${kind}`);
    return fact;
  }

  private order(contract: Fact): Fact {
    return this.ledger.get(
      String(contract.data.order_confirmation_id),
      'confirmation.order',
    );
  }

  sign(lane: Lane, input: unknown, now: Date): Fact {
    const data = (
      lane === 'procurement'
        ? agreementInput
        : lane === 'escrow'
          ? linkage
          : lane === 'fulfillment'
            ? funded
            : accepted
    ).parse(input) as Data;
    const contractId = String(data.id);
    let orderId = contractId;
    if (lane !== 'procurement') {
      const order = this.ledger.get(
        String(data.order_confirmation_id),
        'confirmation.order',
      );
      orderId = order.id;
      this.chronology(order, now);
      this.chronology(
        this.previous(order.contractId, 'confirmation.commitment'),
        now,
      );
      if (lane !== 'escrow') {
        const deposit = this.ledger.get(
          String(data.deposit_confirmation_id),
          'confirmation.deposit-lock',
        );
        requireFact(
          deposit.orderId === order.id,
          'Deposit belongs to a different order',
        );
        this.chronology(deposit, now);
        this.chronology(
          this.previous(deposit.contractId, 'confirmation.custody-statement'),
          now,
        );
        requireFact(
          deposit.data.locked_amount_minor === order.data.gross_amount_minor,
          'Deposit is not fully funded',
        );
      }
      if (lane === 'settlement') {
        const acceptance = this.ledger.get(
          String(data.acceptance_confirmation_id),
        );
        requireFact(
          [
            'confirmation.acceptance',
            'confirmation.milestone-acceptance',
          ].includes(acceptance.kind),
          'Invalid acceptance evidence',
        );
        requireFact(
          acceptance.orderId === order.id && acceptance.data.accepted === true,
          'Acceptance belongs to a different order or is rejected',
        );
        this.chronology(acceptance, now);
        const fulfillment = this.ledger.get(
          acceptance.contractId,
          'contract.fulfillment',
        );
        requireFact(
          fulfillment.data.deposit_confirmation_id ===
            data.deposit_confirmation_id,
          'Acceptance uses a different deposit',
        );
      }
    } else {
      price(data as Terms); // Fail overflow before committing the agreement.
    }
    return this.ledger.commit({
      id: contractId,
      kind: `contract.${contracts[lane].name}`,
      contractId,
      orderId,
      data: { ...data, signed_at: this.stamp(now) },
      href: `/${lane}/${contracts[lane].name}/${encodeURIComponent(contractId)}`,
    });
  }

  request(
    lane: Lane,
    action: string,
    contractId: string,
    input: unknown,
    now: Date,
  ): Fact {
    const data = bodyId.parse(input);
    const contract = this.ledger.get(
      contractId,
      `contract.${contracts[lane].name}`,
    );
    this.chronology(contract, now);
    requireFact(
      !this.ledger.find(contractId, `request.${action}`),
      'This obligation is already requested',
    );
    const prerequisites: Record<string, string> = {
      commitment: 'confirmation.order',
      'custody-statement': 'confirmation.deposit-lock',
      acceptance: 'confirmation.delivery',
      'final-milestone': 'confirmation.first-milestone',
      'milestone-acceptance': 'confirmation.final-milestone',
      'settlement-receipt': 'confirmation.release',
      'milestone-statement': 'confirmation.milestone-release',
    };
    const prerequisite = prerequisites[action];
    if (prerequisite)
      this.chronology(this.previous(contractId, prerequisite), now);
    if (releases.includes(action)) {
      const acceptance = this.ledger.get(
        String(contract.data.acceptance_confirmation_id),
      );
      requireFact(
        acceptance.kind ===
          `confirmation.${action === 'release' ? 'acceptance' : 'milestone-acceptance'}`,
        'Release mode does not match accepted delivery',
      );
      requireFact(
        !this.ledger.released(contract.orderId),
        'Order already released',
      );
    }
    if (deliveries.includes(action)) {
      const otherMode = action === 'delivery' ? 'first-milestone' : 'delivery';
      requireFact(
        !this.ledger.find(contractId, `request.${otherMode}`),
        'Cannot mix single and milestone delivery',
      );
    }
    return this.ledger.commit({
      id: data.id,
      kind: `request.${action}`,
      contractId,
      orderId: contract.orderId,
      data: {
        ...data,
        started_at: this.stamp(now),
        expired_at: this.stamp(new Date(now.getTime() + 48 * 3600000)),
      },
      href: `${contract.href}/${action}/request/${encodeURIComponent(data.id)}`,
    });
  }

  confirm(
    lane: Lane,
    action: string,
    contractId: string,
    requestId: string,
    input: unknown,
    now: Date,
  ): Fact {
    const schema = deliveries.includes(action)
      ? bodyId.extend({ delivered_quantity: positive })
      : acceptances.includes(action)
        ? bodyId.extend({ accepted: z.literal(true) })
        : acknowledgments.includes(action)
          ? bodyId.extend({ acknowledged: z.literal(true) })
          : bodyId;
    const data = schema.parse(input) as Data;
    const contract = this.ledger.get(
      contractId,
      `contract.${contracts[lane].name}`,
    );
    const request = this.ledger.get(requestId, `request.${action}`);
    requireFact(
      request.contractId === contractId,
      'Request belongs to a different contract',
    );
    this.chronology(request, now);
    requireFact(
      now.getTime() <= Date.parse(String(request.data.expired_at)),
      'Request has expired',
    );
    let derived: Data = {};
    if (action === 'order') {
      const terms = contract.data as Terms;
      derived = {
        ...price(terms),
        quantity: terms.quantity,
        retention_bps: terms.retention_bps,
        daily_penalty_bps: terms.daily_penalty_bps,
        delivery_deadline: terms.delivery_deadline,
      };
    } else if (action === 'deposit-lock') {
      derived = {
        locked_amount_minor: this.order(contract).data.gross_amount_minor!,
      };
    } else if (deliveries.includes(action)) {
      const quantity = data.delivered_quantity as bigint;
      const ordered = this.order(contract).data.quantity as bigint;
      if (action === 'delivery')
        requireFact(
          quantity === ordered,
          'Single delivery must fulfill the whole order',
        );
      else if (action === 'first-milestone')
        requireFact(
          quantity < ordered,
          'First milestone must leave a positive remainder',
        );
      else
        requireFact(
          quantity +
            (this.previous(contractId, 'confirmation.first-milestone').data
              .delivered_quantity as bigint) ===
            ordered,
          'Milestone quantities do not fulfill the order',
        );
    } else if (acceptances.includes(action)) {
      const order = this.order(contract);
      const quantity =
        action === 'acceptance'
          ? (this.previous(contractId, 'confirmation.delivery').data
              .delivered_quantity as bigint)
          : (this.previous(contractId, 'confirmation.first-milestone').data
              .delivered_quantity as bigint) +
            (this.previous(contractId, 'confirmation.final-milestone').data
              .delivered_quantity as bigint);
      requireFact(quantity === order.data.quantity, 'Incomplete delivery');
      derived = {
        accepted_quantity: quantity,
        late_days: lateDays(now, String(order.data.delivery_deadline)),
      };
    } else if (releases.includes(action)) {
      if (this.ledger.released(contract.orderId))
        throw new BusinessError(
          409,
          'ALREADY_CONFIRMED',
          'Order already released',
        );
      const order = this.order(contract);
      const acceptance = this.ledger.get(
        String(contract.data.acceptance_confirmation_id),
      );
      derived = settle(
        order.data.gross_amount_minor as bigint,
        order.data.retention_bps as bigint,
        order.data.daily_penalty_bps as bigint,
        acceptance.data.late_days as bigint,
      );
    }
    // The validation, release uniqueness check and commit are synchronous/atomic.
    return this.ledger.commit({
      id: String(data.id),
      kind: `confirmation.${action}`,
      contractId,
      orderId: action === 'order' ? String(data.id) : contract.orderId,
      requestId,
      data: { ...data, confirmed_at: this.stamp(now), ...derived },
      href: `${request.href}/confirmation`,
    });
  }

  private stamp(now: Date): string {
    if (!Number.isFinite(now.getTime()))
      throw new BusinessError(422, 'INVALID_INPUT', 'Invalid business time');
    return now.toISOString().replace('.000Z', 'Z');
  }

  private chronology(fact: Fact, now: Date) {
    const time =
      fact.data.confirmed_at ?? fact.data.started_at ?? fact.data.signed_at;
    requireFact(
      Date.parse(String(time)) <= now.getTime(),
      'Evidence cannot precede its prerequisite',
    );
  }
}
