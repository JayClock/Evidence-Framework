import type {
  AcceptanceCatalog,
  ProcedureCatalog,
  TestPlan,
} from '../../testing-schema.ts';

export const acceptanceCatalog: AcceptanceCatalog = {
  kind: 'acceptance-catalog',
  version: 1,
  stories: [{ id: 'US-001', scenarioIds: ['AC-001-01', 'AC-001-02'] }],
};
export const procedureCatalog: ProcedureCatalog = {
  kind: 'test-procedures',
  version: 1,
  procedures: [
    { id: 'TP-DOMAIN', quadrant: 'Q1' },
    { id: 'TP-ACCEPTANCE', quadrant: 'Q2' },
  ],
};
export const testingPlan: TestPlan = {
  kind: 'test-plan',
  version: 1,
  stories: [
    {
      id: 'US-001',
      scenarioIds: ['AC-001-01', 'AC-001-02'],
      tasks: [
        {
          id: 'TASK-001-01',
          procedureId: 'TP-DOMAIN',
          scenarioIds: ['AC-001-01', 'AC-001-02'],
          mode: 'tdd',
          dependsOn: [],
          checks: [
            {
              id: 'CHECK-001-01',
              command: 'npm test -- feature.spec.ts',
              testFiles: ['src/feature.spec.ts'],
            },
          ],
        },
        {
          id: 'TASK-001-02',
          procedureId: 'TP-ACCEPTANCE',
          scenarioIds: ['AC-001-01', 'AC-001-02'],
          mode: 'verify',
          reason: '验证完整业务场景，复用已实现的组件而不人为制造 Red。',
          dependsOn: ['TASK-001-01'],
          checks: [
            {
              id: 'CHECK-001-02',
              command: 'npm test -- acceptance.spec.ts',
              testFiles: ['src/acceptance.spec.ts'],
            },
          ],
        },
      ],
    },
  ],
};
export function manifest(value: unknown): string {
  return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
}
