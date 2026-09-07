import type { FmModelFile } from './modeling.ts';

export const manifest = {
  type: 'fm_model',
  schemaVersion: '3.0',
  id: 'scope-test',
  name: '范围测试（非生产事实）',
  version: '1.0.0',
  ruleLanguage: 'CEL',
  modelStatus: 'draft',
  stakeholderReview: { status: 'pending' },
  entryContextRefs: ['context.sample'],
};
export const source = (
  path: string,
  document: Record<string, unknown>,
): FmModelFile => ({ path, content: JSON.stringify(document) });
export const entity = (
  id: string,
  category: string,
  kind: string,
  fields: Record<string, unknown> = {},
) =>
  source(`entities/${id.replaceAll('.', '--')}.yaml`, {
    type: 'entity',
    id,
    category,
    kind,
    label: id,
    ...fields,
  });
const attribute = {
  name: 'archived',
  label: '归档状态',
  valueType: 'bool',
  required: true,
  keyData: true,
  meaning: '是否已归档',
};
export const domain = [
  source('model.yaml', manifest),
  entity('context.sample', 'context', 'domain', {
    rootRefs: ['thing.profile'],
  }),
  entity('thing.profile', 'participant', 'thing', {
    contextRef: 'context.sample',
    attributes: [attribute],
  }),
  source('rules/rule--editable.yaml', {
    type: 'rule',
    id: 'rule.editable',
    kind: 'precondition',
    label: '归档不可编辑',
    contextRef: 'context.sample',
    bindings: { profile: { ref: 'thing.profile' } },
    expression: '!profile.archived',
    resultType: 'bool',
  }),
];
// Synthetic channel facts, not runtime defaults or inferred business deadlines.
const channelTimes = ['start_at', 'expired_at'].map((name) => ({
  name,
  label: name,
  valueType: 'timestamp',
  required: true,
  keyData: true,
  meaning: name === 'start_at' ? '凭证发出时间' : '明确约定的有效期截止时间',
}));
export const channel = [
  source('model.yaml', manifest),
  entity('context.sample', 'context', 'channel'),
  entity('role.buyer', 'role', 'party', { contextRef: 'context.sample' }),
  entity('role.seller', 'role', 'party', { contextRef: 'context.sample' }),
  entity('rfp.inquiry', 'evidence', 'rfp', {
    contextRef: 'context.sample',
    responsibleRoleRef: 'role.buyer',
    attributes: channelTimes,
  }),
  entity('proposal.quote', 'evidence', 'proposal', {
    contextRef: 'context.sample',
    responsibleRoleRef: 'role.seller',
    attributes: channelTimes,
  }),
  source('relationships/relation--quote.yaml', {
    type: 'relationship',
    id: 'relation.quote',
    kind: 'precedes',
    label: '询价回应',
    sourceRef: 'rfp.inquiry',
    targetRef: 'proposal.quote',
  }),
];
