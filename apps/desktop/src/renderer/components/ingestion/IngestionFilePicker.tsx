import { useId, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@evidence-poc/desktop-ui-kit';
import { ingestionFileAccept } from './readIngestionFile';

export const IngestionFilePicker = ({
  disabled,
  onFiles,
}: {
  disabled: boolean;
  onFiles: (files: readonly File[]) => void;
}) => {
  const id = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="mb-3"
      onDragEnter={(event) => {
        if (!disabled && event.dataTransfer.types.includes('Files'))
          setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setDragging(false);
        }
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length && !event.dataTransfer.types.includes('Files'))
          return;
        event.preventDefault();
        setDragging(false);
        if (!disabled) onFiles(files);
      }}
    >
      <input
        ref={picker}
        type="file"
        accept={ingestionFileAccept}
        aria-label="选择业务文档"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const input = event.currentTarget;
          const files = Array.from(input.files ?? []);
          input.value = '';
          if (!disabled && files.length) onFiles(files);
        }}
      />
      <Button
        type="button"
        variant="outline"
        data-dialog-autofocus=""
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-help`}
        data-drag-active={dragging && !disabled ? 'true' : undefined}
        className="h-auto min-h-[110px] w-full flex-col gap-1.5 rounded-md border-[1.5px] border-dashed border-workbench-border-strong bg-workbench-background p-3 text-center text-xs font-medium whitespace-normal hover:bg-workbench-subtle data-[drag-active=true]:border-evidence-accent data-[drag-active=true]:bg-evidence-active"
        onClick={() => picker.current?.click()}
      >
        <span id={`${id}-label`} className="inline-flex items-center gap-1.5">
          <FileText aria-hidden="true" className="size-3.5" />
          选择文件或拖放到这里
        </span>
        <span
          id={`${id}-help`}
          className="text-[11px] font-normal text-workbench-muted"
        >
          Markdown、TXT、CSV、OpenAPI JSON/YAML 或 DDL SQL · UTF-8 · 最大 20 MB
        </span>
      </Button>
    </div>
  );
};
