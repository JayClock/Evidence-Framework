import {
  createEmptyDomainModel,
  createEmptyIngestionDraft,
  draftEvidenceIsMoment,
  isIngestionDraftShape,
  normalizeDraftEvidenceKind,
  strictValidateDomainModel,
} from '../index.js';

describe('ingestion draft', () => {
  it('accepts the short names a reader writes and the schema names', () => {
    expect(normalizeDraftEvidenceKind('request')).toBe('fulfillment_request');
    expect(normalizeDraftEvidenceKind('Confirmation')).toBe(
      'fulfillment_confirmation',
    );
    expect(normalizeDraftEvidenceKind('Fulfillment Request')).toBe(
      'fulfillment_request',
    );
    expect(normalizeDraftEvidenceKind('evidence')).toBe('other_evidence');
    expect(normalizeDraftEvidenceKind('rfp')).toBe('rfp');
  });

  it('refuses to guess a kind it does not know', () => {
    // Promoting an unknown kind to `other_evidence` would hide the mistake in a
    // model that still validates, so the reader has to decide.
    expect(normalizeDraftEvidenceKind('收据')).toBeUndefined();
    expect(normalizeDraftEvidenceKind(42)).toBeUndefined();
  });

  it('calls a contract, a confirmation and a proof an instant', () => {
    expect(draftEvidenceIsMoment('contract')).toBe(true);
    expect(draftEvidenceIsMoment('fulfillment_confirmation')).toBe(true);
    expect(draftEvidenceIsMoment('other_evidence')).toBe(true);
    expect(draftEvidenceIsMoment('rfp')).toBe(false);
    expect(draftEvidenceIsMoment('proposal')).toBe(false);
    expect(draftEvidenceIsMoment('fulfillment_request')).toBe(false);
  });

  it('starts empty but already shaped', () => {
    const draft = createEmptyIngestionDraft({ modelName: '采购履约' });

    expect(draft.modelName).toBe('采购履约');
    expect(draft.source).toBe('unknown');
    expect(isIngestionDraftShape(draft)).toBe(true);
  });

  it('guards the containers and ids a compiler dereferences', () => {
    const draft = createEmptyIngestionDraft();

    expect(isIngestionDraftShape({ ...draft, evidences: undefined })).toBe(
      false,
    );
    expect(isIngestionDraftShape({ ...draft, evidences: [{ id: '' }] })).toBe(
      false,
    );
    expect(isIngestionDraftShape({ ...draft, modelName: '   ' })).toBe(false);
    expect(isIngestionDraftShape(null)).toBe(false);
  });
});

describe('entity provenance', () => {
  it('survives strict validation, so an ingested model loads like any other', () => {
    const document = createEmptyDomainModel({
      id: 'traced',
      entryContextRefs: ['context.procurement'],
    });

    document.entities.push(
      {
        type: 'entity',
        id: 'context.procurement',
        category: 'context',
        kind: 'contract',
        label: '采购协议上下文',
        rootRefs: ['contract.procurement'],
      },
      {
        type: 'entity',
        id: 'contract.procurement',
        category: 'evidence',
        kind: 'contract',
        label: '采购协议',
        contextRef: 'context.procurement',
        roleRefs: ['role.buyer', 'role.seller'],
        attributes: [
          {
            name: 'signed_at',
            label: '签署时间',
            meaning: '双方签署协议的业务时间',
            valueType: 'timestamp',
            required: true,
            keyData: true,
          },
        ],
        sourceSnippet: {
          text: '甲乙双方签订《企业级云服务采购协议》',
          locator: '第 1 句',
          source: 'contract',
        },
      },
      {
        type: 'entity',
        id: 'role.buyer',
        category: 'role',
        kind: 'party',
        label: '买方',
        contextRef: 'context.procurement',
      },
      {
        type: 'entity',
        id: 'role.seller',
        category: 'role',
        kind: 'party',
        label: '卖方',
        contextRef: 'context.procurement',
      },
    );

    const result = strictValidateDomainModel(document);

    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
