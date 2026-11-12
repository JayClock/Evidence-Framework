import { describe, expect, it } from 'vitest';

import {
  EVIDENCE_INSTRUCTIONS,
  EVIDENCE_SYSTEM_PROMPT,
  GOVERNANCE_INSTRUCTIONS,
  GOVERNANCE_PROMPT,
  GOVERNANCE_SYSTEM_PROMPT,
  MODELING_PROMPT,
  OPERATOR_PROMPT,
  ROLE_PROMPT,
  WORKFLOW_PROMPT,
} from './index.js';

describe('the built-in instructions', () => {
  it('cover the four things a turn needs: role, red lines, operators, loop', () => {
    expect(EVIDENCE_INSTRUCTIONS).toEqual([
      ROLE_PROMPT,
      MODELING_PROMPT,
      OPERATOR_PROMPT,
      WORKFLOW_PROMPT,
    ]);
    expect(EVIDENCE_SYSTEM_PROMPT).toBe(EVIDENCE_INSTRUCTIONS.join('\n\n'));
  });

  it('name the tools the desktop registers, and nothing that has to be found', () => {
    for (const tool of [
      'apply_model_patch',
      'run_sensors',
      'get_canvas_selection',
      'introduce_fulfillment_pair',
      'add_breach_compensation',
      'roleify_and_invert_dependency',
      'annotate_contract_clauses',
      'read_service_blueprint',
      'isolate_domain_calculator',
    ]) {
      expect(EVIDENCE_SYSTEM_PROMPT).toContain(tool);
    }

    // A skill tree, a reference directory or a CLI command would send the model
    // looking for something the install does not ship.
    for (const relic of ['SKILL.md', '.agents', 'references/', 'npx ', '$']) {
      expect(EVIDENCE_SYSTEM_PROMPT).not.toContain(relic);
    }
  });

  it('walks the seven workshop steps in the order the board shows them', () => {
    const anchors = [
      '锚定合约与双方',
      '成对挖掘履约项',
      '补上标的物与领域组件',
      '反转易变依赖',
      '给违约一条补偿路径',
      '让每个数字有来源',
      '串起业务宏流程',
    ];
    const positions = anchors.map((anchor) => WORKFLOW_PROMPT.indexOf(anchor));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((left, right) => left - right)).toEqual(positions);
  });

  it('reads a contract before it writes one', () => {
    // A facilitator who starts from an empty canvas invents the business; the
    // reading tool is what keeps the first turn grounded in the text.
    const reading = OPERATOR_PROMPT.indexOf('annotate_contract_clauses');
    const writing = OPERATOR_PROMPT.indexOf('introduce_fulfillment_pair');

    expect(reading).toBeGreaterThanOrEqual(0);
    expect(reading).toBeLessThan(writing);
  });

  it('never turns the workshop into an interrogation', () => {
    expect(ROLE_PROMPT).toContain('主持，不是审讯');
    expect(ROLE_PROMPT).toContain('允许粗糙');
    expect(ROLE_PROMPT).not.toContain('审讯员');
  });
});

describe('the governance instructions', () => {
  it('keep the red lines and the operators a repair also needs', () => {
    expect(GOVERNANCE_INSTRUCTIONS).toEqual([
      ROLE_PROMPT,
      MODELING_PROMPT,
      OPERATOR_PROMPT,
      GOVERNANCE_PROMPT,
    ]);
    expect(GOVERNANCE_SYSTEM_PROMPT).toBe(GOVERNANCE_INSTRUCTIONS.join('\n\n'));
  });

  it('start from the trace instead of the workshop board', () => {
    for (const tool of ['audit_production_drift', 'run_scenario_replay']) {
      expect(GOVERNANCE_PROMPT).toContain(tool);
    }

    // A governance turn that walks the workshop steps would ask a business
    // again for facts the trace already holds.
    expect(GOVERNANCE_PROMPT).not.toContain('锚定合约与双方');
    expect(GOVERNANCE_SYSTEM_PROMPT).not.toContain('锚定合约与双方');
  });

  it('never lets an audit rewrite the model to match a leaking service', () => {
    expect(GOVERNANCE_PROMPT).toContain('生产越权');
    expect(GOVERNANCE_PROMPT).toContain('不许改模型迁就');
    expect(GOVERNANCE_PROMPT).toContain('没有回放结果就等于没有结论');
  });
});
