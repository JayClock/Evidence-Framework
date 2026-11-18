import type { EvidenceProjectSummary } from '@evidence-poc/desktop-contracts/projects';
import { Badge, Button, Card, cn } from '@evidence-poc/desktop-ui-kit';

interface RecentProjectCardProps {
  project: EvidenceProjectSummary;
  isMostRecent: boolean;
  disabled: boolean;
  opening: boolean;
  onOpen: () => void;
}

export const RecentProjectCard = ({
  project,
  isMostRecent,
  disabled,
  opening,
  onOpen,
}: RecentProjectCardProps) => (
  <Card
    className={cn(
      'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4',
      isMostRecent && 'border-[1.5px] border-evidence-accent shadow-xs',
    )}
  >
    <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-sm font-bold wrap-anywhere text-evidence-ink">
          {project.name}
        </h3>
        {isMostRecent ? (
          <Badge className="rounded border-transparent bg-workbench-subtle text-evidence-ink">
            最近打开
          </Badge>
        ) : null}
      </div>
      <p
        className="truncate text-[11px] text-workbench-muted"
        title={project.rootPath}
      >
        {project.rootPath}
      </p>
      <p className="text-[11px] text-workbench-muted">
        {project.entityCount} 个实体 · {project.ruleCount} 条 CEL 规则
      </p>
    </div>
    <Button
      aria-label={(opening ? '正在打开：' : '打开工作台：') + project.name}
      className={cn(
        'rounded-md px-3.5 text-xs font-medium',
        !isMostRecent &&
          'border-workbench-border text-evidence-accent hover:bg-workbench-background',
      )}
      disabled={disabled}
      loading={opening}
      onClick={onOpen}
      size="md"
      type="button"
      variant={isMostRecent ? 'default' : 'outline'}
    >
      {opening ? (
        '正在打开…'
      ) : (
        <>
          打开工作台 <span aria-hidden="true">→</span>
        </>
      )}
    </Button>
  </Card>
);
