import React from 'react';
import type { EntityAST } from '@evidence-poc/evidence-schema';
import { Button } from '@evidence-poc/desktop-ui-kit';

export interface EvidenceNodeCardProps {
  readonly entity: EntityAST;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onOpenSourcing: (id: string) => void;
  readonly onTriggerWhatIf: (id: string) => void;
}

export const EvidenceNodeCard: React.FC<EvidenceNodeCardProps> = ({
  entity,
  selected,
  onSelect,
  onOpenSourcing,
  onTriggerWhatIf,
}) => {
  const isRequest = entity.kind === 'fulfillment_request';
  const isFulfillment =
    entity.kind === 'fulfillment_confirmation' ||
    entity.kind === 'fulfillment_request' ||
    entity.category === 'evidence';

  const attributes = entity.attributes ?? [];
  const isTimeAttr = (a: {
    timeRole?: string;
    valueType?: string;
    name: string;
  }) =>
    a.timeRole !== undefined ||
    a.valueType === 'timestamp' ||
    a.name.endsWith('_at');

  const timestampAttrs = attributes.filter(isTimeAttr);
  const primaryTime =
    timestampAttrs.find((a) => a.timeRole === 'occurrence') ??
    timestampAttrs.find((a) => a.name.endsWith('_at')) ??
    timestampAttrs[0];
  const startTime =
    timestampAttrs.find((a) => a.timeRole === 'start') ??
    timestampAttrs.find((a) => a.name === 'started_at');
  const deadlineTime =
    timestampAttrs.find((a) => a.timeRole === 'deadline') ??
    timestampAttrs.find((a) => a.name === 'expired_at');

  return (
    <div
      onClick={() => onSelect(entity.id)}
      className={`relative w-64 rounded-xl border bg-white/95 p-3.5 shadow-sm transition-all cursor-pointer backdrop-blur-sm ${
        selected
          ? 'border-[#e11d48] ring-4 ring-[#ffe4e6] shadow-md -translate-y-0.5'
          : 'border-[#fda4af] hover:border-[#fb7185] hover:shadow'
      }`}
      style={{
        borderLeftWidth: '6px',
        borderLeftColor: isRequest ? '#8b5cf6' : '#f43f5e',
      }}
    >
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-[10px] font-bold tracking-wider uppercase text-[#be123c] bg-[#fff1f2] px-1.5 py-0.5 rounded border border-[#fecdd3]">
          {entity.kind}
        </span>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px] font-semibold text-[#be123c] hover:bg-[#ffe4e6]"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSourcing(entity.id);
            }}
          >
            ⚡ 溯源
          </Button>

          {isFulfillment && (
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[10px] font-semibold text-[#d97706] hover:bg-[#fef3c7]"
              onClick={(e) => {
                e.stopPropagation();
                onTriggerWhatIf(entity.id);
              }}
            >
              🔥 What-If
            </Button>
          )}
        </div>
      </div>

      <h4 className="text-[13px] font-bold text-[#1e293b] leading-tight mb-2">
        {entity.label}
      </h4>

      <div className="mb-2.5">
        {isRequest ? (
          <div className="flex items-center gap-1.5 bg-[#f5f3ff] border border-[#ddd6fe] rounded-md px-2 py-1 text-[10px] text-[#6d28d9]">
            <span className="font-mono font-bold">时段:</span>
            <span>{startTime?.name ?? 'started_at'}</span>
            <span>~</span>
            <span className="font-semibold text-[#b91c1c]">
              {deadlineTime?.name ?? 'expired_at'}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 bg-[#fff1f2] border border-[#fecdd3] rounded-md px-2 py-0.5 text-[10px] text-[#e11d48]">
            <span className="font-mono font-bold">发生于:</span>
            <span className="font-semibold">
              {primaryTime?.name ?? 'created_at'}
            </span>
          </div>
        )}
      </div>

      {attributes.filter((a) => a.keyData && !isTimeAttr(a)).length > 0 && (
        <div className="space-y-1 pt-2 border-t border-[#f1f5f9]">
          {attributes
            .filter((a) => a.keyData && !isTimeAttr(a))
            .slice(0, 3)
            .map((attr) => {
              const sourceType =
                attr.source?.kind ??
                ('sourceType' in attr ? (attr as any).sourceType : undefined) ??
                'undecided';

              return (
                <div
                  key={attr.name}
                  className="flex items-center justify-between text-[11px] text-[#475569]"
                >
                  <span className="truncate max-w-[120px]">{attr.label}</span>
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded font-mono ${
                      sourceType === 'request-input' ||
                      sourceType === 'request_input'
                        ? 'bg-purple-100 text-purple-700'
                        : sourceType === 'contract-term' ||
                            sourceType === 'contract_term'
                          ? 'bg-blue-100 text-blue-700'
                          : sourceType === 'preceding_evidence' ||
                              sourceType === 'result-fact'
                            ? 'bg-emerald-100 text-emerald-700'
                            : sourceType === 'derived' ||
                                sourceType === 'derived_rule'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-100 text-slate-500 border border-dashed border-slate-300'
                    }`}
                  >
                    {String(sourceType)}
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
};
