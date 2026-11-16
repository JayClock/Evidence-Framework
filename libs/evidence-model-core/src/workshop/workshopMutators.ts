import type {
  AttributeAST,
  DomainModelDocument,
} from '@evidence-poc/evidence-schema';
import {
  createEntityMutator,
  createContractMutator,
} from '../mutations/entityMutations.js';
import { createFulfillmentPairMutator } from '../mutations/fulfillmentMutations.js';

const text = (value: string, label: string): string => {
  if (!value.trim()) throw new Error(`请填写${label}。`);
  return value.trim();
};
const nextId = (model: DomainModelDocument, prefix: string): string => {
  const ids = new Set(
    [...model.entities, ...model.rules, ...model.relationships].map(
      (e) => e.id,
    ),
  );
  let i = 1;
  while (ids.has(`${prefix}.${i}`)) i++;
  return `${prefix}.${i}`;
};
const time = (name: string, label: string, meaning = label): AttributeAST => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

/** Invoke inside session.mutate: Context, two roles and root are one undo unit. */
export const anchorWorkshopContract = (
  draft: DomainModelDocument,
  input: { label: string; partyA: string; partyB: string },
) => {
  const label = text(input.label, '合约名称');
  const partyA = text(input.partyA, '一方角色');
  const partyB = text(input.partyB, '另一方角色');
  if (partyA === partyB) throw new Error('请区分合约双方的角色名称。');
  const contextRef = nextId(draft, 'context.workshop');
  createEntityMutator(draft, {
    type: 'entity',
    category: 'context',
    kind: 'contract',
    id: contextRef,
    label: `${label}上下文`,
  });
  const roleRefs = [partyA, partyB].map((roleLabel) => {
    const id = nextId(draft, 'role.workshop');
    createEntityMutator(draft, {
      type: 'entity',
      category: 'role',
      kind: 'party',
      id,
      label: roleLabel,
      contextRef,
    });
    return id;
  });
  const id = nextId(draft, 'contract.workshop');
  createContractMutator(draft, {
    type: 'entity',
    category: 'evidence',
    kind: 'contract',
    id,
    label,
    contextRef,
    roleRefs,
    attributes: [time('signed_at', '签署时间')],
  });
  draft.manifest.entryContextRefs.push(contextRef);
  return { contextRef, contractRef: id };
};

/** Does not fabricate deadline values or legal remedies. Their basis stays explicit. */
export const addWorkshopFulfillment = (
  draft: DomainModelDocument,
  input: {
    contextRef: string;
    claimantRef: string;
    obligorRef: string;
    label: string;
    confirmationLabel: string;
    deadlineBasis: string;
  },
) => {
  if (input.claimantRef === input.obligorRef)
    throw new Error('权利方与义务方不能相同。');
  const label = text(input.label, '履约要求');
  const confirmationLabel = text(input.confirmationLabel, '完成凭证');
  const deadlineBasis = text(input.deadlineBasis, '截止依据');
  const requestId = nextId(draft, 'request.workshop');
  const confirmationId = nextId(draft, 'confirmation.workshop');
  return createFulfillmentPairMutator(draft, {
    contextRef: input.contextRef,
    request: {
      id: requestId,
      label,
      responsibleRoleRef: input.claimantRef,
      attributes: [
        time('started_at', '请求提出时间'),
        time('expired_at', '截止时间', deadlineBasis),
      ],
      notes: `截止依据：${deadlineBasis}；如可由已建模输入计算，请继续绑定派生规则。`,
    },
    confirmation: {
      id: confirmationId,
      label: confirmationLabel,
      responsibleRoleRef: input.obligorRef,
      attributes: [time('confirmed_at', '履约确认时间')],
    },
    contractReferenceId: nextId(draft, 'relation.workshop-contract'),
  });
};
