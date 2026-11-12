import type {
  IngestionDraft,
  IngestionSourceKind,
} from '@evidence-poc/evidence-schema';

import { annotateContractClauses, domainNounOf } from './contractAnnotator.js';
import { uniqueId } from './draftSupport.js';
import {
  draftFromBusinessText,
  type TextExtractionOptions,
} from './textExtractor.js';

export interface ContractDraftResult {
  draft: IngestionDraft;
  issues: readonly string[];
}

/** Label a domain component is given, so two clauses cannot collide on one. */
const componentLabel = (noun: {
  label: string;
  role: 'calculator' | 'checker';
}): string => `${noun.label}${noun.role === 'calculator' ? '计算器' : '检查器'}`;

/**
 * Reads an agreement into a draft, after splitting it three ways.
 *
 * The split is what makes this reader different from the plain prose one: the
 * business clauses are handed to the same row reader the rest of the pipeline
 * uses, while the computing clauses become Domain components instead of
 * contract parameters. A percentage that stays in the contract is a number
 * somebody typed in; the same percentage as a calculator is a rule the model can
 * check.
 *
 * What the reading cannot name it reports: a clause that computes something but
 * never says what is left for the workshop to name, because an invented
 * calculator is worse than a visible gap.
 */
export const draftFromContract = (
  text: string,
  options: TextExtractionOptions = {},
): ContractDraftResult => {
  const { clauses, issues: annotationIssues } = annotateContractClauses(text);
  const business = clauses.filter((clause) => clause.category === 'business');
  const computing = clauses.filter((clause) => clause.computesValue);
  const boilerplate = clauses.filter((clause) => clause.category === 'boilerplate');

  if (business.length === 0) {
    const empty = draftFromBusinessText('', {
      ...options,
      source: 'contract',
    });

    return {
      draft: empty.draft,
      issues: [
        ...annotationIssues,
        '整份合约没有读到业务条款：先确认文本里哪一句约定了谁向谁交付什么。',
      ],
    };
  }

  const read = draftFromBusinessText(
    business.map((clause) => `${clause.text}。`).join(''),
    {
      ...options,
      source: 'contract',
      ...(options.modelName === undefined ? {} : { modelName: options.modelName }),
    },
  );
  const draft = read.draft;
  const issues: string[] = [...annotationIssues, ...read.issues];

  const domainContextId = 'context.domain';
  const takenThingIds = new Set(draft.things.map((thing) => thing.id));
  const added: string[] = [];

  for (const clause of computing) {
    const noun = domainNounOf(clause.text);

    if (noun === undefined) {
      issues.push(
        `第 ${clause.index} 句描述了需要计算的取值，但没能读出它算的是什么：「${clause.text.slice(0, 30)}…」。请在领域上下文中为它命名一个计算器。`,
      );
      continue;
    }

    const label = componentLabel(noun);

    if (draft.things.some((thing) => thing.label === label)) {
      continue;
    }

    draft.things.push({
      id: uniqueId('thing', label, takenThingIds, `clause-${clause.index}`),
      label,
      meaning: `${clause.text}（由合约条款抽出的领域规则）`,
      contextRef: domainContextId,
      domainRole: noun.role,
      provenance: {
        text: clause.text,
        locator: `第 ${clause.index} 句`,
        source: 'contract' satisfies IngestionSourceKind,
      },
    });
    added.push(label);
  }

  // A component has to live somewhere. The row assembler only writes the Domain
  // Context when a row named a thing, so a contract whose only domain content is
  // a formula needs the context added here, with the components as its roots.
  if (draft.things.length > 0) {
    const domainContext = {
      id: domainContextId,
      label: options.domainContextLabel ?? '领域上下文',
      kind: 'domain' as const,
      rootRefs: draft.things.map((thing) => thing.id),
    };
    const existing = draft.contexts.findIndex(
      (context) => context.id === domainContextId,
    );

    if (existing >= 0) {
      draft.contexts[existing] = { ...draft.contexts[existing], ...domainContext };
    } else {
      draft.contexts.push(domainContext);
    }
  }

  draft.description =
    '由合同条款导入：条款先分成业务 / 领域 / 法务三类，业务条款落成成对履约，领域条款抽成领域计算器与检查器。';

  if (added.length > 0) {
    issues.push(`已抽成领域组件：${added.join('、')}。请为它们补齐派生规则与输入来源。`);
  }

  if (boilerplate.length > 0) {
    issues.push(
      `已过滤 ${boilerplate.length} 句纯法务条款（管辖、免责、送达等），它们不进入业务模型。`,
    );
  }

  return { draft, issues };
};
