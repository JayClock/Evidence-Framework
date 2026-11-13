import { vocabularyIds, vocabularyLabels } from '../vocabulary.js';

/**
 * Inspector sections rendered by the desktop right-hand panel.
 *
 * The id and the heading the panel prints live together, so a section cannot be
 * declared without the text that names it.
 */
export const INSPECTOR_GROUP_DEFINITIONS = {
  general: { label: '基础信息' },
  responsibility: { label: '责任锚定' },
  attributes: { label: '业务属性与关键数据' },
  fulfillment: { label: '履约结构' },
  rules: { label: '规则与计算' },
} as const satisfies Record<string, { readonly label: string }>;

export type InspectorGroupId = keyof typeof INSPECTOR_GROUP_DEFINITIONS;

export const INSPECTOR_GROUP_IDS = vocabularyIds(INSPECTOR_GROUP_DEFINITIONS);

export const INSPECTOR_GROUP_LABELS = vocabularyLabels(
  INSPECTOR_GROUP_DEFINITIONS,
);
