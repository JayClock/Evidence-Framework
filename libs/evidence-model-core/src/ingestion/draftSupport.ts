import type {
  DraftAttribute,
  EvidenceKind,
} from '@evidence-poc/evidence-schema';

/** Latin slug a schema id can be built from; empty when the label is not ASCII. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');

/**
 * Allocates a schema id nobody claimed yet.
 *
 * Two blueprint rows can read "支付确认" and both deserve an id; the second one
 * becomes `confirmation.payment-2` rather than overwriting the first, because a
 * silent overwrite would drop a fulfilment item from the model.
 */
export const uniqueId = (
  prefix: string,
  label: string,
  taken: Set<string>,
  /** Stable token for a label no slug can describe, e.g. a row number. */
  fallback?: string,
): string => {
  const slug = slugify(label);
  const base =
    slug.length === 0
      ? `${prefix}.${fallback ?? `n${taken.size + 1}`}`
      : `${prefix}.${/^[a-z]/.test(slug) ? slug : `n-${slug}`}`;

  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  const id = `${base}-${suffix}`;
  taken.add(id);
  return id;
};

/**
 * Id prefix a draft evidence gets.
 *
 * The prefix has to survive the schema id pattern, so `other_evidence` becomes
 * `evidence` here rather than leaking the underscore into an id no reader
 * accepts.
 */
export const evidenceIdPrefix = (kind: EvidenceKind): string => {
  switch (kind) {
    case 'rfp':
      return 'rfp';
    case 'proposal':
      return 'proposal';
    case 'contract':
      return 'contract';
    case 'fulfillment_request':
      return 'request';
    case 'fulfillment_confirmation':
      return 'confirmation';
    case 'other_evidence':
      return 'evidence';
  }
};

const timeAttribute = (
  name: string,
  label: string,
  meaning: string,
): DraftAttribute => ({
  name,
  label,
  meaning,
  valueType: 'timestamp',
  required: true,
  keyData: true,
});

/**
 * The business time every evidence kind must carry.
 *
 * A time span needs a start and a deadline, an instant needs the moment it
 * happened; the model refuses to store an evidence without them, so a reader
 * has to supply them rather than leave the field for later.
 */
export const mandatoryTimeAttributes = (
  kind: EvidenceKind,
): readonly DraftAttribute[] => {
  switch (kind) {
    case 'rfp':
      return [
        timeAttribute('started_at', '索取开始时间', '权利方发起索取的业务时间'),
        timeAttribute('expired_at', '索取截止时间', '本次索取失效的业务时间'),
      ];
    case 'proposal':
      return [
        timeAttribute('started_at', '提案开始时间', '义务方形成提案的业务时间'),
        timeAttribute('expired_at', '提案有效期截止时间', '本次提案失效的业务时间'),
      ];
    case 'contract':
      return [timeAttribute('signed_at', '签署时间', '双方形成合约关系的业务时间')];
    case 'fulfillment_request':
      return [
        timeAttribute('started_at', '履约请求时间', '权利方提出履约请求的业务时间'),
        timeAttribute('expired_at', '履约截止时间', '义务方完成履约的业务截止时间'),
      ];
    case 'fulfillment_confirmation':
      return [
        timeAttribute('confirmed_at', '履约确认时间', '义务方形成履约结果的业务时间'),
      ];
    case 'other_evidence':
      return [
        timeAttribute('created_at', '凭证形成时间', '该凭证被开具或登记的业务时间'),
      ];
  }
};
