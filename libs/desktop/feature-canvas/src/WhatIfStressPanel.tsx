import React from 'react';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import { Button } from '@evidence-poc/desktop-ui-kit';

export interface WhatIfStressPanelProps {
  readonly entity: EntityAST;
  readonly position: { x: number; y: number };
  readonly onClose: () => void;
  readonly onGrowCompensation: (params: {
    violatedConfirmationId: string;
    breachScenario: 'timeout' | 'rejection' | 'disruption';
    compensationLabel: string;
    responsiblePartyRef?: string;
    penaltyAttributeName?: string;
  }) => Promise<void>;
}

export const WhatIfStressPanel: React.FC<WhatIfStressPanelProps> = ({
  entity,
  position,
  onClose,
  onGrowCompensation,
}) => {
  return (
    <div
      className="absolute z-50 w-80 rounded-xl border border-[#fed7aa] bg-white p-4 shadow-xl ring-1 ring-amber-500/10"
      style={{
        left: position.x + 270,
        top: position.y + 40,
      }}
    >
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#ffedd5]">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-[#9a3412]">
            ⚡ What-If 异常履约推演
          </span>
          <span className="text-[10px] text-[#c2410c] font-mono">
            ({entity.label})
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[#94a3b8] hover:text-[#475569] text-xs font-bold"
        >
          ✕
        </button>
      </div>

      <p className="text-[12px] text-[#7c2d12] mb-3 leading-relaxed">
        若该履约项在现实中遭遇意外，业务约定了怎样的追责或补偿路径？
      </p>

      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start text-[11px] h-8 border-[#fed7aa] bg-[#fffaf5] hover:bg-[#ffedd5] text-[#9a3412]"
          onClick={async () => {
            await onGrowCompensation({
              violatedConfirmationId: entity.id,
              breachScenario: 'timeout',
              compensationLabel: `${entity.label}逾期补偿金`,
              penaltyAttributeName: 'penalty_amount',
            });
            onClose();
          }}
        >
          ⏱️ 超时未达成：触发逾期违约金索赔
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start text-[11px] h-8 border-[#fed7aa] bg-[#fffaf5] hover:bg-[#ffedd5] text-[#9a3412]"
          onClick={async () => {
            await onGrowCompensation({
              violatedConfirmationId: entity.id,
              breachScenario: 'rejection',
              compensationLabel: `${entity.label}重做验收`,
            });
            onClose();
          }}
        >
          ❌ 交付物遭拒绝：触发限期重做/返工流程
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start text-[11px] h-8 border-[#fed7aa] bg-[#fffaf5] hover:bg-[#ffedd5] text-[#9a3412]"
          onClick={async () => {
            await onGrowCompensation({
              violatedConfirmationId: entity.id,
              breachScenario: 'disruption',
              compensationLabel: `${entity.label}断供赔付`,
              penaltyAttributeName: 'indemnity_amount',
            });
            onClose();
          }}
        >
          🚫 单方彻底断供：触发合同违约终止与清算
        </Button>
      </div>
    </div>
  );
};
