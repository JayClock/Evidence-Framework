import type {
  FormalizationAssessment,
  ContextAssessment,
} from '../../modeling/discovery/assessment-schema.ts';

export function contextAssessment(): FormalizationAssessment {
  return {
    version: 1,
    applicability: {
      applicable: true,
      rationale:
        '合成领域包含对象身份与结构规则，需要统一 FM；这里仅验证测试协议，不是生产业务事实，也不代表专家批准。',
      sourceRefs: ['INPUT'],
    },
    contexts: [
      contextSlice('C-001', 'domain', ['identity', 'structure', 'rule']),
    ],
    questions: [],
  };
}

export function glueAssessment(): FormalizationAssessment {
  return {
    version: 1,
    applicability: {
      applicable: false,
      rationale:
        '合成测试仅有简单胶水集成，没有独立对象身份、领域规则、渠道协商或合同履约语义；仍使用同一更新与收敛协议。',
      sourceRefs: ['INPUT'],
    },
    contexts: [],
    questions: [],
  };
}

export function contextSlice(
  contextRef: string,
  kind: ContextAssessment['kind'],
  dimensions: ContextAssessment['facts'][number]['dimension'][],
): ContextAssessment {
  return {
    contextRef,
    kind,
    responsibility: '本批次只表达输入已经明确的对象结构及相关业务判断。',
    sourceRefs: ['INPUT'],
    candidateRefs: [contextRef],
    remainingScope: '其他未展开知识保留为缺口，不声称整个领域或责任链完整。',
    facts: dimensions.map((dimension) => ({
      key: dimension,
      candidateRef: contextRef,
      dimension,
      statement: `合成输入已明确的 ${dimension} 业务事实。`,
      status: 'known',
      sourceRefs: ['INPUT'],
    })),
    requiredFactRefs: dimensions.map(
      (dimension) => `${contextRef}.${dimension}`,
    ),
    dependencies: [] as Array<{
      consumerFactRef: string;
      providerFactRef: string;
      kind: 'structure' | 'provenance' | 'decision';
      purpose: string;
      sourceRefs: string[];
    }>,
    caseRefs: ['CASE-001', 'CASE-002', 'CASE-003'],
  };
}
