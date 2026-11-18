import type { ProjectTemplateMeta } from '@evidence-poc/desktop-contracts/projects';
import { Card } from '@evidence-poc/desktop-ui-kit';

interface StarterTemplateCardProps {
  template: ProjectTemplateMeta;
  onSelect: () => void;
}

export const StarterTemplateCard = ({
  template,
  onSelect,
}: StarterTemplateCardProps) => (
  <Card asChild>
    <button
      className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-start transition-colors hover:border-evidence-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-evidence-accent"
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-baseline gap-1.5 text-[13px] font-bold text-evidence-ink">
        <span aria-hidden="true">{template.id === 'blank' ? '🏛' : '📦'}</span>
        {template.name}
      </span>
      <span className="text-[11px] text-workbench-muted">
        {template.description}
      </span>
    </button>
  </Card>
);
