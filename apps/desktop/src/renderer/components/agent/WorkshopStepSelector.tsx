import { RefreshCw } from 'lucide-react';

import {
  REVERSE_CONTRACT_MODE,
  WORKSHOP_STEPS,
  workshopStepRank,
  type WorkshopStepId,
} from '@evidence-poc/evidence-schema';

import { cn } from '../ui/utils';

/**
 * The one modeling move the next question is about.
 *
 * A step and the no-contract mode are alternatives, not toggles: a modeler says
 * where the room is, and one prefix travels with the message. Keeping them in
 * one slot means the composer never has to explain which of two prefixes wins.
 */
export type AgentWorkshopSelection =
  | WorkshopStepId
  | typeof REVERSE_CONTRACT_MODE.id
  | null;

export interface WorkshopStepSelectorProps {
  selection: AgentWorkshopSelection;
  onSelect: (selection: AgentWorkshopSelection) => void;
}

/** Seven workshop steps plus the reverse mode, as pills above the composer. */
export const WorkshopStepSelector = ({
  selection,
  onSelect,
}: WorkshopStepSelectorProps) => (
  <>
    <div
      role="group"
      aria-label="工作坊步骤"
      className="flex flex-wrap items-center gap-1"
    >
      {WORKSHOP_STEPS.map((step) => {
        const active = selection === step.id;

        return (
          <button
            key={step.id}
            type="button"
            aria-pressed={active}
            title={step.hint}
            onClick={() => {
              onSelect(active ? null : step.id);
            }}
            className={cn(
              'rounded-full border px-1.5 py-0.5 text-[10px] transition',
              active
                ? 'border-evidence-accent bg-evidence-accent/10 text-evidence-accent'
                : 'border-evidence-line text-evidence-muted hover:border-evidence-accent',
            )}
          >
            {workshopStepRank(step.id)}. {step.label}
          </button>
        );
      })}
    </div>

    <div
      role="group"
      aria-label="访谈方式"
      className="flex flex-wrap items-center gap-1"
    >
      <button
        type="button"
        aria-pressed={selection === REVERSE_CONTRACT_MODE.id}
        title={REVERSE_CONTRACT_MODE.hint}
        onClick={() => {
          onSelect(
            selection === REVERSE_CONTRACT_MODE.id
              ? null
              : REVERSE_CONTRACT_MODE.id,
          );
        }}
        className={cn(
          'flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition',
          selection === REVERSE_CONTRACT_MODE.id
            ? 'border-[#b79b56] bg-[#fff8e8] text-[#8d6200]'
            : 'border-evidence-line text-evidence-muted hover:border-[#b79b56]',
        )}
      >
        <RefreshCw aria-hidden="true" className="h-2.5 w-2.5" />
        {REVERSE_CONTRACT_MODE.label}
      </button>

      {selection === null ? null : (
        <button
          type="button"
          aria-label="清除当前步骤"
          onClick={() => {
            onSelect(null);
          }}
          className="shrink-0 text-[10px] text-evidence-muted hover:text-evidence-ink"
        >
          ×
        </button>
      )}
    </div>
  </>
);
