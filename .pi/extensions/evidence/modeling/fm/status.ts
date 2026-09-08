export function modelingStatusMarkdown(options: {
  applicable: boolean;
  rationale: string;
  machineValidated: boolean;
  simulationPassed: boolean | null;
  files: string[];
}): string {
  const simulation =
    options.simulationPassed === null
      ? '未运行（未提交验证场景）'
      : options.simulationPassed
        ? '通过'
        : '失败';
  return `# 统一 FM 模型状态

## 适用性

- 结论：${options.applicable ? '适用' : '不适用'}
- 理由：${options.rationale.trim()}

## 机器校验

- machineValidated：${options.machineValidated}
- 说明：${options.applicable ? '模型结构、引用、CEL 与属性追溯由扩展执行确定性校验；架构中的 DDD 映射是设计投影，不是第二份业务事实源。' : '当前范围无独立业务或领域语义，不需生成 FM 定义。'}

## 场景模拟

- simulationPassed：${options.simulationPassed ?? 'not-run'}
- 结果：${simulation}

## 业务确认

- modelStatus / stakeholderReview：${options.applicable ? '以 model.yaml 为准；默认 draft / pending，本状态页不复制或提升人工评审状态。' : '不适用，未生成模型。'}
- 说明：机器校验、单据模拟与 Modeling Gate 不能替代具名业务／领域专家确认；纯领域未执行实例或状态机模拟。

## 模型文件

${options.files.length > 0 ? options.files.map((path) => `- \`${path}\``).join('\n') : '- 无'}
`;
}
