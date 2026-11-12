import {
  createEmptyIngestionDraft,
  type DraftContext,
  type DraftEvidence,
  type DraftFulfillmentPair,
  type DraftParticipant,
  type DraftRole,
  type DraftThing,
  type EvidenceKind,
  type IngestionDraft,
  type IngestionSourceKind,
  type ProvenanceSnippet,
} from '@evidence-poc/evidence-schema';

import {
  evidenceIdPrefix,
  mandatoryTimeAttributes,
  uniqueId,
} from './draftSupport.js';

/** One business step, as every reader has to describe it before assembly. */
export interface DraftRow {
  /** 1-based line the step came from, used for the issue and the snippet. */
  line: number;
  stage: string;
  activity: string;
  /** Business name of the document the step leaves behind. */
  evidence: string;
  /** Explicit kind, or omitted to infer it from the document name. */
  kind?: EvidenceKind;
  parties: string[];
  thing?: string;
}

export interface AssembleOptions {
  modelName: string;
  source: IngestionSourceKind;
  description?: string;
  contractContextLabel?: string;
  preContractContextLabel?: string;
  domainContextLabel?: string;
}

export interface AssembleResult {
  draft: IngestionDraft;
  issues: string[];
}

/** Keywords that mark a row as a breach repair rather than a main fulfilment. */
const BREACH_KEYWORDS = ['违约', '退款', '退货', '补偿', '赔付', '罚息'];

/** Job words a party name carries but the side of the contract does not. */
const ROLE_WORDS =
  /代表|专员|经理|主管|财务|采购员|销售|库管|顾问|负责人|人员|员|岗|部门/g;

/** Bits of a party name that reveal which side of the contract it is on. */
const FIRST_SIDE = /甲方|买方|采购|需求|客户|读者|发包|委托|订阅方/;
const SECOND_SIDE = /乙方|卖方|供应|销售|平台|承运|承包|受托|服务方/;

const stripRoleWord = (label: string): string =>
  label.replaceAll(ROLE_WORDS, '').trim();

/** Reads the evidence kind out of the document's own name when no type is given. */
export const inferEvidenceKind = (label: string): EvidenceKind => {
  const text = label.toLowerCase();

  if (/询价|征集|索取|招标|rfp|inquiry/.test(text)) return 'rfp';
  if (/报价|提案|方案|套餐|投标|proposal|quotation/.test(text)) return 'proposal';
  if (/合同|协议|签约|contract|agreement/.test(text)) return 'contract';
  if (/申请|请求|通知|要求|request/.test(text)) return 'fulfillment_request';
  if (/确认|到账|签收|验收|完成|确认函|confirmation/.test(text)) {
    return 'fulfillment_confirmation';
  }

  return 'other_evidence';
};

/**
 * Decides which side of the contract a party is on.
 *
 * A contract has exactly two roles and everyone else plays one of them, so a
 * job title like 甲方财务 has to resolve to a side rather than become a third
 * role the contract cannot bind. `undefined` means the text did not say; the
 * caller reports that instead of quietly choosing a side.
 */
export const inferContractSide = (
  partyLabel: string,
  sideLabels: readonly string[],
): number | undefined => {
  const stripped = stripRoleWord(partyLabel);

  const byName = sideLabels.findIndex((sideLabel) => {
    const side = stripRoleWord(sideLabel);

    if (side.length === 0) {
      return false;
    }

    return (
      (stripped.length > 0 && stripped.includes(side)) ||
      (stripped.length > 0 && side.includes(stripped)) ||
      partyLabel.includes(side)
    );
  });

  if (byName >= 0) {
    return byName;
  }

  if (FIRST_SIDE.test(partyLabel)) {
    return 0;
  }

  if (SECOND_SIDE.test(partyLabel)) {
    return 1;
  }

  return undefined;
};

const isBreachRow = (row: DraftRow): boolean =>
  BREACH_KEYWORDS.some(
    (keyword) =>
      row.evidence.includes(keyword) || row.activity.includes(keyword),
  );

const snippetOf = (
  row: DraftRow,
  source: IngestionSourceKind,
  locator: string,
): ProvenanceSnippet => ({
  text:
    [row.stage, row.activity, row.evidence]
      .filter((part) => part.length > 0)
      .join(' / ') || row.evidence,
  locator,
  source,
});

/**
 * Turns business steps into a draft, and is the one place the method's three
 * structural readings are made.
 *
 * - the contract row splits the pre-contract context from the contract context;
 * - a confirmation is paired with the request it answers, in order;
 * - the contract keeps exactly two Party Roles, and every other party plays one
 *   of them. That last reading is what lets 甲方财务 and 乙方财务 sign different
 *   documents without inventing roles the contract cannot bind.
 *
 * A gap is reported, never repaired: an unpaired confirmation, an unconfirmed
 * request and a party whose side is unclear all become issues for the review
 * panel.
 */
export const assembleDraftFromRows = (
  rows: readonly DraftRow[],
  options: AssembleOptions,
): AssembleResult => {
  const issues: string[] = [];

  const draft = createEmptyIngestionDraft({
    modelName: options.modelName,
    source: options.source,
  });

  if (options.description !== undefined) {
    draft.description = options.description;
  }

  const contractContext: DraftContext = {
    id: 'context.contract',
    label: options.contractContextLabel ?? '合约上下文',
    kind: 'contract',
  };
  const preContractContext: DraftContext = {
    id: 'context.pre-contract',
    label: options.preContractContextLabel ?? '合约前上下文',
    kind: 'pre_contract',
    parentContextRef: contractContext.id,
  };
  const domainContext: DraftContext = {
    id: 'context.domain',
    label: options.domainContextLabel ?? '领域上下文',
    kind: 'domain',
  };

  const contractRowIndex = rows.findIndex(
    (row) => (row.kind ?? inferEvidenceKind(row.evidence)) === 'contract',
  );
  const contractRow = contractRowIndex >= 0 ? rows[contractRowIndex] : undefined;

  const sideLabels: string[] =
    contractRow !== undefined && contractRow.parties.length >= 2
      ? contractRow.parties.slice(0, 2)
      : ['甲方', '乙方'];

  if (contractRow !== undefined && contractRow.parties.length !== 2) {
    issues.push(
      '合同行需要正好两位当事人；已按「甲方 / 乙方」补齐角色，请在审核面板中改成真实双方。',
    );
  }

  const takenEvidenceIds = new Set<string>();
  const takenRoleIds = new Set<string>();
  const takenPartyIds = new Set<string>();
  const takenThingIds = new Set<string>();

  const sides: DraftRole[] = sideLabels.map((sideLabel) => ({
    id: uniqueId('role', sideLabel, takenRoleIds),
    label: sideLabel,
    kind: 'party',
    contextRef: contractContext.id,
  }));
  draft.roles.push(...sides);

  const partyByLabel = new Map<string, DraftParticipant>();
  const thingByLabel = new Map<string, DraftThing>();
  const played = new Set<string>();

  const partyFor = (partyLabel: string): DraftParticipant => {
    const existing = partyByLabel.get(partyLabel);

    if (existing !== undefined) {
      return existing;
    }

    const participant: DraftParticipant = {
      id: uniqueId('party', partyLabel, takenPartyIds),
      label: partyLabel,
      kind: 'party',
    };
    partyByLabel.set(partyLabel, participant);
    draft.participants.push(participant);

    return participant;
  };

  const sideOf = (partyLabel: string, line: number): DraftRole => {
    const index = inferContractSide(partyLabel, sideLabels);
    const role = (index === undefined ? sides[0] : sides[index]) ?? sides[0];

    if (role === undefined) {
      throw new Error('合同缺少角色，无法继续解析。');
    }

    const participant = partyFor(partyLabel);

    if (index === undefined) {
      issues.push(
        `无法判断当事人「${partyLabel}」属于合同哪一方，已暂时归到「${role.label}」。`,
      );
    }

    const relationshipId = `relation.${participant.id}-plays-${role.id}`;

    if (!played.has(relationshipId)) {
      played.add(relationshipId);
      draft.relationships.push({
        id: relationshipId,
        kind: 'plays_role',
        sourceRef: participant.id,
        targetRef: role.id,
        label: `${partyLabel}扮演${role.label}的角色`,
      });
    }

    void line;

    return role;
  };

  const contextFor = (row: DraftRow): DraftContext =>
    contractRowIndex >= 0 && rows.indexOf(row) < contractRowIndex
      ? preContractContext
      : contractContext;

  const evidencesByRow = new Map<DraftRow, DraftEvidence>();

  for (const row of rows) {
    const context = contextFor(row);
    const kind = row.kind ?? inferEvidenceKind(row.evidence);
    const id = uniqueId(evidenceIdPrefix(kind), row.evidence, takenEvidenceIds);
    const rowSides = row.parties.map((partyLabel) => sideOf(partyLabel, row.line));

    const evidence: DraftEvidence = {
      id,
      label: row.evidence,
      kind,
      contextRef: context.id,
      attributes: [...mandatoryTimeAttributes(kind)],
      provenance: snippetOf(row, options.source, `第 ${row.line} 行`),
      ...(kind === 'contract'
        ? {
            roleRefs: sides
              .map((side) => side.id)
              .filter((ref): ref is string => ref !== undefined),
          }
        : rowSides[0] === undefined
          ? {}
          : { responsibleRoleRef: rowSides[0].id }),
    };

    evidencesByRow.set(row, evidence);
    draft.evidences.push(evidence);

    if (row.thing !== undefined && row.thing.length > 0) {
      let thing = thingByLabel.get(row.thing);

      if (thing === undefined) {
        thing = {
          id: uniqueId('thing', row.thing, takenThingIds),
          label: row.thing,
          meaning: `${row.thing}（业务标的物）`,
          contextRef: domainContext.id,
        };
        thingByLabel.set(row.thing, thing);
        draft.things.push(thing);
      }

      draft.relationships.push({
        id: `relation.${id}-references-${thing.id}`,
        kind: 'references',
        sourceRef: id,
        targetRef: thing.id,
        label: `${row.evidence}针对${row.thing}`,
      });
    }
  }

  const pending = new Map<
    string,
    { row: DraftRow; evidence: DraftEvidence }[]
  >();
  const lastConfirmation = new Map<string, DraftEvidence>();
  const pairByRow = new Map<DraftRow, DraftFulfillmentPair>();

  for (const row of rows) {
    const evidence = evidencesByRow.get(row);

    if (evidence === undefined) {
      continue;
    }

    if (evidence.kind === 'fulfillment_request') {
      const queue = pending.get(evidence.contextRef) ?? [];
      queue.push({ row, evidence });
      pending.set(evidence.contextRef, queue);
      continue;
    }

    if (evidence.kind === 'fulfillment_confirmation') {
      const queue = pending.get(evidence.contextRef) ?? [];
      const request = queue.shift()?.evidence;

      if (request === undefined) {
        issues.push(
          `「${row.evidence}」没有对应的履约请求，请在审核面板中补上请求端。`,
        );
        lastConfirmation.set(evidence.contextRef, evidence);
        continue;
      }

      const pair: DraftFulfillmentPair = {
        id: `pair.${request.id}-${evidence.id}`,
        label: `${request.label} → ${evidence.label}`,
        requestRef: request.id,
        confirmationRef: evidence.id,
        description: row.activity,
        provenance: snippetOf(row, options.source, `第 ${row.line} 行`),
      };
      draft.fulfillmentPairs.push(pair);
      pairByRow.set(row, pair);
      lastConfirmation.set(evidence.contextRef, evidence);
      continue;
    }

    if (evidence.kind === 'other_evidence') {
      const confirmation = lastConfirmation.get(evidence.contextRef);
      const pair = [...pairByRow.entries()]
        .reverse()
        .find(
          ([, candidate]) => candidate.confirmationRef === confirmation?.id,
        )?.[1];

      if (pair !== undefined) {
        pair.proofRef = evidence.id;
      }
    }
  }

  for (const [contextRef, queue] of pending) {
    for (const { evidence } of queue) {
      issues.push(
        `「${evidence.label}」在${contextRef === preContractContext.id ? '合约前' : '合约'}上下文中缺少履约确认。`,
      );
    }
  }

  const breachPairs = new Set(
    [...pairByRow.entries()].filter(([row]) => isBreachRow(row)).map(([, pair]) => pair),
  );

  for (const pair of breachPairs) {
    const index = draft.fulfillmentPairs.indexOf(pair);
    const trigger = draft.fulfillmentPairs
      .slice(0, index)
      .reverse()
      .find((candidate) => !breachPairs.has(candidate));

    if (trigger === undefined) {
      continue;
    }

    draft.breachCompensations.push({
      id: `breach.${pair.id}`,
      label: pair.label,
      triggeredByPairRef: trigger.id,
      compensationPairRef: pair.id,
      conditionDescription: pair.description ?? '未按约定完成履约时触发的补偿',
      ...(pair.provenance === undefined ? {} : { provenance: pair.provenance }),
    });
  }

  const evidencesIn = (contextId: string): DraftEvidence[] =>
    draft.evidences.filter((evidence) => evidence.contextRef === contextId);

  const preContractEvidences = evidencesIn(preContractContext.id);
  const contractId = evidencesIn(contractContext.id).find(
    (evidence) => evidence.kind === 'contract',
  )?.id;

  // A context is only readable once it names its roots: the contract it holds,
  // the sourcing documents that led to it, and the things it is about.
  if (contractId !== undefined) {
    contractContext.rootRefs = [contractId];
  }

  if (preContractEvidences.length > 0) {
    preContractContext.rootRefs = preContractEvidences.map((evidence) => evidence.id);
    draft.contexts.push(preContractContext);
  }

  if (draft.things.length > 0) {
    domainContext.rootRefs = draft.things.map((thing) => thing.id);
    draft.contexts.push(domainContext);
  }

  draft.contexts.unshift(contractContext);

  for (const pair of draft.fulfillmentPairs) {
    if (contractId !== undefined) {
      draft.relationships.push({
        id: `relation.${pair.requestRef}-references-${contractId}`,
        kind: 'references',
        sourceRef: pair.requestRef,
        targetRef: contractId,
        label: '履约请求引用合约',
      });
    }

    draft.relationships.push({
      id: `relation.${pair.confirmationRef}-references-${pair.requestRef}`,
      kind: 'references',
      sourceRef: pair.confirmationRef,
      targetRef: pair.requestRef,
      label: '确认引用所属请求',
    });

    if (pair.proofRef !== undefined) {
      draft.relationships.push({
        id: `relation.${pair.proofRef}-references-${pair.confirmationRef}`,
        kind: 'references',
        sourceRef: pair.proofRef,
        targetRef: pair.confirmationRef,
        label: '凭证印证履约确认',
      });
    }
  }

  if (contractId !== undefined) {
    for (const evidence of preContractEvidences) {
      draft.relationships.push({
        id: `relation.${contractId}-references-${evidence.id}`,
        kind: 'references',
        sourceRef: contractId,
        targetRef: evidence.id,
        label: '合约引用合约前的凭证作为签订依据',
      });
    }
  }

  return { draft, issues };
};
