import { fieldFor } from '@evidence-poc/evidence-api';
import type { AttributeAST } from '@evidence-poc/evidence-schema';
import type { DomainGraph } from '@evidence-poc/evidence-model-core';

export const ApiFieldBadge = ({
  attribute,
  entityRef,
  graph,
}: {
  attribute: AttributeAST;
  entityRef: string;
  graph: DomainGraph;
}) => {
  const field = fieldFor(attribute, graph, entityRef);
  const label =
    field.reason === 'derived'
      ? 'CEL Derived'
      : field.reason === 'service-time'
        ? 'Service Timestamp'
        : 'Input';
  const title =
    field.reason === 'derived'
      ? `${field.ruleRef ?? '未解析规则'}：${field.ruleExpression ?? '规则尚未解析，需检查；不可作为入参。'}`
      : field.reason === 'service-time'
        ? '由服务端记录，调用者不能传入；运行时仍须实现校验。'
        : '模型字段允许作为输入；实际调用仍受路由、角色与规则限制。';
  return (
    <span
      aria-label={`${attribute.name} API 字段：${label}`}
      title={title}
      className={`rounded px-1 text-[8px] ${field.reason === 'derived' ? 'bg-purple-50 text-purple-700' : field.reason === 'service-time' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}
    >
      {field.reason === 'derived'
        ? '🔒 '
        : field.reason === 'service-time'
          ? '◷ '
          : ''}
      {label}
    </span>
  );
};
