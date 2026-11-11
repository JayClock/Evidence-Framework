/** Inspector sections rendered by the desktop right-hand panel. */
export const INSPECTOR_GROUP_IDS = [
  'general',
  'responsibility',
  'attributes',
  'fulfillment',
  'rules',
] as const;

export type InspectorGroupId = (typeof INSPECTOR_GROUP_IDS)[number];

export const INSPECTOR_GROUP_LABELS: Record<InspectorGroupId, string> = {
  general: '基础信息',
  responsibility: '责任锚定',
  attributes: '业务属性与关键数据',
  fulfillment: '履约结构',
  rules: '规则与计算',
};
