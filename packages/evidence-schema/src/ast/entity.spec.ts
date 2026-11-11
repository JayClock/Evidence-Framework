import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_TIME_ATTRIBUTE_NAMES,
  REQUIRED_EVIDENCE_TIME_ATTRIBUTES,
  createEmptyDomainModel,
  entitySignature,
  findAttribute,
  isContextEntity,
  isContractContext,
  isContractEntity,
  isEvidenceEntity,
  isEvidenceMoment,
  isFulfillmentConfirmation,
  isFulfillmentRequest,
  isParticipantEntity,
  isPartyRole,
  isRoleEntity,
  type ContextEntityAST,
  type EvidenceEntityAST,
  type ParticipantEntityAST,
  type RoleEntityAST,
} from '../index.js';

const contractContext: ContextEntityAST = {
  type: 'entity',
  id: 'context.procurement',
  category: 'context',
  kind: 'contract',
  label: '采购合同上下文',
  rootRefs: ['contract.procurement'],
};

const contract: EvidenceEntityAST = {
  type: 'entity',
  id: 'contract.procurement',
  category: 'evidence',
  kind: 'contract',
  label: '采购合同',
  contextRef: contractContext.id,
  roleRefs: ['role.buyer', 'role.seller'],
  attributes: [{ name: 'signed_at', label: '签署时间', meaning: '双方签署的业务时间' }],
};

const paymentRequest: EvidenceEntityAST = {
  type: 'entity',
  id: 'request.payment',
  category: 'evidence',
  kind: 'fulfillment_request',
  label: '付款请求',
  contextRef: contractContext.id,
  responsibleRoleRef: 'role.seller',
};

const buyerRole: RoleEntityAST = {
  type: 'entity',
  id: 'role.buyer',
  category: 'role',
  kind: 'party',
  label: '买方',
  contextRef: contractContext.id,
};

const buyerAgent: ParticipantEntityAST = {
  type: 'entity',
  id: 'party.buyer-agent',
  category: 'participant',
  kind: 'party',
  label: '买方采购员',
};

describe('entity signatures', () => {
  it('builds category.kind signatures', () => {
    expect(entitySignature(contractContext)).toBe('context.contract');
    expect(entitySignature(contract)).toBe('evidence.contract');
    expect(entitySignature(paymentRequest)).toBe('evidence.fulfillment_request');
    expect(entitySignature(buyerRole)).toBe('role.party');
  });

  it('recognises every category guard', () => {
    expect(isContextEntity(contractContext)).toBe(true);
    expect(isContractContext(contractContext)).toBe(true);
    expect(isContractContext({ ...contractContext, kind: 'domain' })).toBe(false);
    expect(isEvidenceEntity(contract)).toBe(true);
    expect(isContractEntity(contract)).toBe(true);
    expect(isContractEntity(paymentRequest)).toBe(false);
    expect(isFulfillmentRequest(paymentRequest)).toBe(true);
    expect(isFulfillmentConfirmation(paymentRequest)).toBe(false);
    expect(isEvidenceMoment({ ...paymentRequest, kind: 'other_evidence' })).toBe(true);
    expect(isEvidenceMoment(paymentRequest)).toBe(false);
    expect(isRoleEntity(buyerRole)).toBe(true);
    expect(isPartyRole(buyerRole)).toBe(true);
    expect(isPartyRole({ ...buyerRole, kind: 'domain' })).toBe(false);
    expect(isParticipantEntity(buyerAgent)).toBe(true);
  });

  it('returns false for undefined entities', () => {
    expect(isEvidenceEntity(undefined)).toBe(false);
    expect(isContextEntity(undefined)).toBe(false);
    expect(isRoleEntity(undefined)).toBe(false);
    expect(isParticipantEntity(undefined)).toBe(false);
    expect(isPartyRole(undefined)).toBe(false);
  });
});

describe('attribute helpers', () => {
  it('finds attributes by exact source name', () => {
    expect(findAttribute(contract, 'signed_at')?.label).toBe('签署时间');
    expect(findAttribute(contract, 'Signed_At')).toBeUndefined();
    expect(findAttribute(undefined, 'signed_at')).toBeUndefined();
  });
});

describe('required evidence time attributes', () => {
  it('names a mandatory business time for every evidence kind', () => {
    expect(REQUIRED_EVIDENCE_TIME_ATTRIBUTES).toEqual({
      rfp: ['started_at', 'expired_at'],
      proposal: ['started_at', 'expired_at'],
      contract: ['signed_at'],
      fulfillment_request: ['started_at', 'expired_at'],
      fulfillment_confirmation: ['confirmed_at'],
      other_evidence: ['created_at'],
    });
  });

  it('keeps the recognised time attribute names in sync', () => {
    const declared = new Set(
      Object.values(REQUIRED_EVIDENCE_TIME_ATTRIBUTES).flat(),
    );

    for (const name of declared) {
      expect(EVIDENCE_TIME_ATTRIBUTE_NAMES).toContain(name);
    }
  });
});

describe('empty document factory', () => {
  it('does not share collections between documents', () => {
    const first = createEmptyDomainModel();
    const second = createEmptyDomainModel();

    first.entities.push(contract);

    expect(second.entities).toEqual([]);
    expect(first.manifest.schemaVersion).toBe('5.0');
  });

  it('accepts manifest overrides', () => {
    const document = createEmptyDomainModel({
      id: 'procurement',
      name: '采购模型',
      entryContextRefs: [contractContext.id],
    });

    expect(document.manifest.id).toBe('procurement');
    expect(document.manifest.entryContextRefs).toEqual([contractContext.id]);
  });
});
