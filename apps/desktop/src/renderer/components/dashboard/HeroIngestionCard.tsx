import { Button, Card } from '@evidence-poc/desktop-ui-kit';

export const HeroIngestionCard = ({ onOpen }: { onOpen: () => void }) => (
  <Card className="flex flex-col items-start gap-3 border-workbench-border-strong p-5">
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-md bg-evidence-accent text-white"
      >
        ✨
      </span>
      <div>
        <h3 className="text-[13px] font-bold text-evidence-ink">
          从业务文档生成模型
        </h3>
        <p className="text-[11px] text-workbench-muted">
          支持业务需求、合同原文或服务蓝图
        </p>
      </div>
    </div>
    <p className="text-xs leading-relaxed text-workbench-body">
      选择或拖入本地文件，也可粘贴业务原文。提取履约凭证与权责关系后，先校对草稿再生成模型。
    </p>
    <Button
      className="rounded-md px-3.5 text-xs font-medium"
      onClick={onOpen}
      size="md"
      type="button"
      variant="default"
    >
      开始智能提取向导
    </Button>
  </Card>
);
