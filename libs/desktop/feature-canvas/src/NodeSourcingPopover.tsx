import React, { useState } from 'react';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import { Button } from '@evidence-poc/desktop-ui-kit';

export interface NodeSourcingPopoverProps {
  readonly entity: EntityAST;
  readonly position: { x: number; y: number };
  readonly onClose: () => void;
  readonly onSplitToPair: (params: {
    confirmationId: string;
    requestLabel: string;
    responsiblePartyRef?: string;
    claimantPartyRef?: string;
  }) => Promise<void>;
  readonly onBindSource: (params: {
    entityId: string;
    attributeName: string;
    sourceType: string;
    sourceRef?: string;
  }) => Promise<void>;
}

export const NodeSourcingPopover: React.FC<NodeSourcingPopoverProps> = ({
  entity,
  position,
  onClose,
  onSplitToPair,
  onBindSource,
}) => {
  const attributes = entity.attributes ?? [];
  const isTimeAttr = (a: {
    timeRole?: string;
    valueType?: string;
    name: string;
  }) =>
    a.timeRole !== undefined ||
    a.valueType === 'timestamp' ||
    a.name.endsWith('_at');

  const keyDataAttrs = attributes.filter((a) => a.keyData && !isTimeAttr(a));
  const [selectedAttr, setSelectedAttr] = useState(
    keyDataAttrs[0]?.name ?? attributes[0]?.name ?? '',
  );

  const activeAttr = attributes.find((a) => a.name === selectedAttr);

  return (
    <div
      className="absolute z-50 w-80 rounded-xl border border-[#e2e8f0] bg-white p-4 shadow-xl ring-1 ring-black/5"
      style={{
        left: position.x + 270,
        top: position.y - 10,
      }}
    >
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#f1f5f9]">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold text-[#0f172a]">
            数据溯源问询
          </span>
          <span className="text-[10px] text-[#64748b] font-mono">
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

      <div className="mb-3">
        <label className="block text-[11px] font-medium text-[#475569] mb-1">
          聚焦关键数据项:
        </label>
        <div className="flex flex-wrap gap-1">
          {(keyDataAttrs.length > 0 ? keyDataAttrs : attributes).map((attr) => (
            <button
              key={attr.name}
              onClick={() => setSelectedAttr(attr.name)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                selectedAttr === attr.name
                  ? 'bg-[#ffe4e6] text-[#be123c] font-bold border border-[#fecdd3]'
                  : 'bg-[#f8fafc] text-[#64748b] border border-[#e2e8f0]'
              }`}
            >
              {attr.label}
            </button>
          ))}
        </div>
      </div>

      {activeAttr && (
        <div className="rounded-lg bg-[#f8fafc] border border-[#f1f5f9] p-2.5 mb-1">
          <p className="text-[12px] text-[#334155] leading-relaxed mb-2">
            💡 凭证中的数据{' '}
            <span className="font-bold text-[#be123c]">
              【{activeAttr.label}】
            </span>{' '}
            是由哪一方输入，还是依据约定计算出来的？
          </p>

          <div className="grid grid-cols-1 gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="justify-start text-[11px] h-8 bg-white hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300"
              onClick={async () => {
                await onSplitToPair({
                  confirmationId: entity.id,
                  requestLabel: `${entity.label}申请`,
                });
                await onBindSource({
                  entityId: entity.id,
                  attributeName: activeAttr.name,
                  sourceType: 'request_input',
                });
              }}
            >
              🟣 申请方主动申报（裂变前置 Request）
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="justify-start text-[11px] h-8 bg-white hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
              onClick={async () => {
                await onBindSource({
                  entityId: entity.id,
                  attributeName: activeAttr.name,
                  sourceType: 'contract_term',
                });
              }}
            >
              🔵 签约时约定的固定条款
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="justify-start text-[11px] h-8 bg-white hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
              onClick={async () => {
                await onBindSource({
                  entityId: entity.id,
                  attributeName: activeAttr.name,
                  sourceType: 'preceding_evidence',
                });
              }}
            >
              🟢 前序单据/交付动作传递
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="justify-start text-[11px] h-8 bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300"
              onClick={async () => {
                await onBindSource({
                  entityId: entity.id,
                  attributeName: activeAttr.name,
                  sourceType: 'derived_rule',
                });
              }}
            >
              🟠 按计算公式/阶梯规则派生 (CEL)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
