import {
  CONTEXT_KINDS,
  CONTEXT_KIND_LABELS,
  EVIDENCE_KINDS,
  EVIDENCE_KIND_LABELS,
  PARTICIPANT_KINDS,
  PARTICIPANT_KIND_LABELS,
  ROLE_KINDS,
  ROLE_KIND_LABELS,
  type EntityCategory,
} from '../ast/entity.js';
import { RULE_KINDS, RULE_KIND_LABELS } from '../ast/rule.js';
import { VALUE_TYPES } from '../ast/values.js';
import { INSPECTOR_GROUP_LABELS, type InspectorGroupId } from './groups.js';

/** Editor widget the renderer should mount for a property. */
export type InspectorEditorKind =
  | 'readonly-id'
  | 'text'
  | 'select'
  | 'boolean'
  | 'attribute-table'
  | 'cel-editor'
  | 'key-data-provenance'
  | 'reference-picker'
  | 'reference-list';

export interface InspectorOption {
  label: string;
  value: string;
}

/** Which business objects a reference picker may offer. */
export interface InspectorReferenceConstraint {
  categories: EntityCategory[];
  kinds?: string[];
  /** `sameContext` keeps the candidate inside the edited object's context. */
  sameContext?: boolean;
}

export interface InspectorPropertyDefinition {
  field: string;
  label: string;
  editor: InspectorEditorKind;
  options?: readonly InspectorOption[];
  reference?: InspectorReferenceConstraint;
  /** Business hint shown under the field; never a validation rule itself. */
  helper?: string;
}

export interface InspectorGroupDefinition {
  id: InspectorGroupId;
  label: string;
  properties: readonly InspectorPropertyDefinition[];
}

export interface InspectorGroupDefinitionWithCategory
  extends InspectorGroupDefinition {
  category: EntityCategory;
}

/**
 * Select options for a closed vocabulary.
 *
 * The value is the id written to disk; the label is the business name the
 * vocabulary declares beside it. A vocabulary without labels of its own (the CEL
 * value types) falls back to the id.
 */
const toOptions = <Id extends string>(
  values: readonly Id[],
  labels?: Readonly<Record<Id, string>>,
): readonly InspectorOption[] =>
  values.map((value) => ({ label: labels?.[value] ?? value, value }));

const ID_PROPERTY: InspectorPropertyDefinition = {
  field: 'id',
  label: '稳定 ID',
  editor: 'readonly-id',
  helper: '业务对象 ID 一经保存不可更改；引用与派生规则按该 ID 定位。',
};

const LABEL_PROPERTY: InspectorPropertyDefinition = {
  field: 'label',
  label: '业务名称',
  editor: 'text',
  helper: '使用统一语言规范名称，例如 付款请求（Payment Request）。',
};

const NOTES_PROPERTY: InspectorPropertyDefinition = {
  field: 'notes',
  label: '备注',
  editor: 'text',
};

const contextPicker = (
  helper: string,
  constraint: InspectorReferenceConstraint = { categories: ['context'] },
): InspectorPropertyDefinition => ({
  field: 'contextRef',
  label: '所属上下文',
  editor: 'reference-picker',
  reference: constraint,
  helper,
});

const ATTRIBUTES_PROPERTY: InspectorPropertyDefinition = {
  field: 'attributes',
  label: '属性清单',
  editor: 'attribute-table',
  helper: '金额、期限、数量与时间差标记为关键数据，必须给出提供方或派生规则。',
};

const GROUPS: Record<EntityCategory, InspectorGroupDefinition[]> = {
  evidence: [
    {
      id: 'general',
      label: INSPECTOR_GROUP_LABELS.general,
      properties: [
        ID_PROPERTY,
        LABEL_PROPERTY,
        {
          field: 'kind',
          label: '凭证类型',
          editor: 'select',
          options: toOptions(EVIDENCE_KINDS, EVIDENCE_KIND_LABELS),
        },
      ],
    },
    {
      id: 'responsibility',
      label: INSPECTOR_GROUP_LABELS.responsibility,
      properties: [
        contextPicker(
          '履约请求与确认必须归属合同上下文；违约判断只读取同一上下文内的凭证。',
        ),
        {
          field: 'responsibleRoleRef',
          label: '签署/经办角色',
          editor: 'reference-picker',
          reference: {
            categories: ['role'],
            kinds: ['party'],
            sameContext: true,
          },
          helper:
            '责任角色必须由所属根合同绑定，主体、经办人与证明提供方保持分明。',
        },
        {
          field: 'roleRefs',
          label: '合同双方角色',
          editor: 'reference-list',
          reference: {
            categories: ['role'],
            kinds: ['party'],
            sameContext: true,
          },
          helper: '合同必须与恰好两个上下文角色共同保存。',
        },
      ],
    },
    {
      id: 'attributes',
      label: INSPECTOR_GROUP_LABELS.attributes,
      properties: [ATTRIBUTES_PROPERTY, NOTES_PROPERTY],
    },
  ],
  participant: [
    {
      id: 'general',
      label: INSPECTOR_GROUP_LABELS.general,
      properties: [
        ID_PROPERTY,
        LABEL_PROPERTY,
        {
          field: 'kind',
          label: '参与者类型',
          editor: 'select',
          options: toOptions(PARTICIPANT_KINDS, PARTICIPANT_KIND_LABELS),
        },
        contextPicker(
          '业务对象（thing）必须属于领域上下文；参与者（party）保持跨上下文。',
        ),
      ],
    },
    {
      id: 'attributes',
      label: INSPECTOR_GROUP_LABELS.attributes,
      properties: [ATTRIBUTES_PROPERTY, NOTES_PROPERTY],
    },
  ],
  role: [
    {
      id: 'general',
      label: INSPECTOR_GROUP_LABELS.general,
      properties: [
        ID_PROPERTY,
        LABEL_PROPERTY,
        {
          field: 'kind',
          label: '角色类型',
          editor: 'select',
          options: toOptions(ROLE_KINDS, ROLE_KIND_LABELS),
        },
        contextPicker('角色始终属于某个上下文；合同角色由根合同绑定。'),
      ],
    },
    {
      id: 'attributes',
      label: INSPECTOR_GROUP_LABELS.attributes,
      properties: [ATTRIBUTES_PROPERTY, NOTES_PROPERTY],
    },
  ],
  context: [
    {
      id: 'general',
      label: INSPECTOR_GROUP_LABELS.general,
      properties: [
        ID_PROPERTY,
        LABEL_PROPERTY,
        {
          field: 'kind',
          label: '上下文类型',
          editor: 'select',
          options: toOptions(CONTEXT_KINDS, CONTEXT_KIND_LABELS),
        },
        {
          field: 'parentContextRef',
          label: '父上下文',
          editor: 'reference-picker',
          reference: { categories: ['context'] },
        },
      ],
    },
    {
      id: 'responsibility',
      label: INSPECTOR_GROUP_LABELS.responsibility,
      properties: [
        {
          field: 'rootRefs',
          label: '上下文根对象',
          editor: 'reference-list',
          reference: { categories: ['evidence', 'participant', 'role'] },
          helper:
            '上下文必须与真实业务内容共同保存；合同上下文恰好一个根合同。',
        },
      ],
    },
    {
      id: 'attributes',
      label: INSPECTOR_GROUP_LABELS.attributes,
      properties: [ATTRIBUTES_PROPERTY, NOTES_PROPERTY],
    },
  ],
};

/** Attribute table columns shared by every entity category. */
export const INSPECTOR_ATTRIBUTE_FIELDS: readonly InspectorPropertyDefinition[] =
  [
    {
      field: 'name',
      label: '属性名',
      editor: 'text',
      helper: 'lower snake_case，例如 total_minor_units。',
    },
    { field: 'label', label: '业务名称', editor: 'text' },
    {
      field: 'valueType',
      label: '数据类型',
      editor: 'select',
      options: toOptions(VALUE_TYPES),
    },
    { field: 'required', label: '必填', editor: 'boolean' },
    {
      field: 'keyData',
      label: '关键数据',
      editor: 'boolean',
      helper: '金额、期限、数量、时间差必须标记为关键数据。',
    },
    { field: 'meaning', label: '业务含义', editor: 'text' },
    {
      field: 'derivedByRuleRef',
      label: '派生规则',
      editor: 'cel-editor',
      helper: '派生值只读取已建模属性，规则必须指向该字段本身。',
    },
  ];

/**
 * Virtual attribute column: the provider behind one key data item.
 *
 * Nothing is persisted for it — the ledger derives the provider from the
 * modeled facts (derivation rule, contract term, result fact), so the same
 * source of truth stays in the FM files.
 */
export const INSPECTOR_KEY_DATA_PROVENANCE_PROPERTY: InspectorPropertyDefinition =
  {
    field: 'provenance',
    label: '提供方',
    editor: 'key-data-provenance',
    helper:
      '金额、期限、数量与时间差必须落到合同参数、前序凭证属性、派生规则或结果事实上。',
  };

/** Rule inspection fields used by the rule panel in Phase 4. */
export const INSPECTOR_RULE_FIELDS: readonly InspectorPropertyDefinition[] = [
  { field: 'id', label: '稳定 ID', editor: 'readonly-id' },
  { field: 'label', label: '规则名称', editor: 'text' },
  {
    field: 'kind',
    label: '规则类型',
    editor: 'select',
    options: toOptions(RULE_KINDS, RULE_KIND_LABELS),
  },
  {
    field: 'description',
    label: '业务解释',
    editor: 'text',
    helper: '先用业务语言说明判断依据，公式其次。',
  },
  {
    field: 'contextRef',
    label: '所属上下文',
    editor: 'reference-picker',
    reference: { categories: ['context'] },
  },
  { field: 'bindings', label: '输入绑定', editor: 'reference-list' },
  { field: 'expression', label: 'CEL 表达式', editor: 'cel-editor' },
];

export function getInspectorGroups(
  category: EntityCategory,
): readonly InspectorGroupDefinitionWithCategory[] {
  return GROUPS[category].map((group) => ({ ...group, category }));
}

export function getInspectorGroup(
  category: EntityCategory,
  groupId: InspectorGroupId,
): InspectorGroupDefinitionWithCategory | undefined {
  return getInspectorGroups(category).find((group) => group.id === groupId);
}

/** Resolves the picker constraint of a reference property, when declared. */
export function getReferenceConstraint(
  category: EntityCategory,
  field: string,
): InspectorReferenceConstraint | undefined {
  for (const group of GROUPS[category]) {
    const property = group.properties.find((item) => item.field === field);

    if (property !== undefined) {
      return property.reference;
    }
  }

  return undefined;
}

export {
  INSPECTOR_GROUP_IDS,
  INSPECTOR_GROUP_LABELS,
  type InspectorGroupId,
} from './groups.js';
