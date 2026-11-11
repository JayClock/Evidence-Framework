import { useState } from 'react';

import type { EvidenceBranchSummary } from '../../shared/branches';

interface BranchSelectorProps {
  branches: readonly EvidenceBranchSummary[];
  activeBranchId: string;
  compareBranchId: string | null;
  busy: boolean;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  onCheckout: (branchId: string) => void;
  onFork: (name: string, description?: string) => void;
  onCompareChange: (branchId: string | null) => void;
  onDismissError: () => void;
}

const statusSuffix = (branch: EvidenceBranchSummary): string =>
  branch.status === 'merged' ? '（已合并）' : '';

/**
 * Branch picker, fork form and comparison switch.
 *
 * Kept in the header because all three answer one question: which assumption is
 * the canvas showing, and what is it being measured against.
 */
export const BranchSelector = ({
  branches,
  activeBranchId,
  compareBranchId,
  busy,
  loading,
  error,
  actionError,
  onCheckout,
  onFork,
  onCompareChange,
  onDismissError,
}: BranchSelectorProps) => {
  const [forkOpen, setForkOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const comparable = branches.filter((branch) => branch.id !== activeBranchId);
  const active = branches.find((branch) => branch.id === activeBranchId);

  const submitFork = () => {
    const trimmed = name.trim();

    if (trimmed === '') {
      return;
    }

    onFork(trimmed, description.trim() === '' ? undefined : description.trim());
    setName('');
    setDescription('');
    setForkOpen(false);
  };

  return (
    <div className="evidence-no-drag flex items-center gap-1.5 text-[11px]">
      <label className="sr-only" htmlFor="branch-select">
        当前分支
      </label>
      <select
        id="branch-select"
        aria-label="当前分支"
        value={activeBranchId}
        disabled={busy || loading || branches.length === 0}
        onChange={(event) => onCheckout(event.target.value)}
        className="max-w-[180px] rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px] text-evidence-ink disabled:opacity-50"
        title={active?.description ?? '切换访谈分支'}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
            {statusSuffix(branch)}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => setForkOpen((open) => !open)}
        disabled={busy}
        className="rounded border border-evidence-line px-2 py-1 text-[11px] text-evidence-muted hover:border-evidence-accent hover:text-evidence-ink disabled:opacity-40"
        title="从当前分支分叉出一个业务假设"
      >
        分叉
      </button>

      <label className="sr-only" htmlFor="branch-compare">
        对比分支
      </label>
      <select
        id="branch-compare"
        aria-label="对比分支"
        value={compareBranchId ?? ''}
        disabled={busy || loading || comparable.length === 0}
        onChange={(event) =>
          onCompareChange(event.target.value === '' ? null : event.target.value)
        }
        className="max-w-[160px] rounded border border-evidence-line bg-white px-1.5 py-1 text-[11px] text-evidence-muted disabled:opacity-50"
        title="与另一个分支对比模型与门禁差异"
      >
        <option value="">不对比</option>
        {comparable.map((branch) => (
          <option key={branch.id} value={branch.id}>
            对比 {branch.name}
          </option>
        ))}
      </select>

      {forkOpen ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitFork();
          }}
          className="flex items-center gap-1 rounded border border-evidence-line bg-white px-1.5 py-1"
        >
          <input
            aria-label="新分支名称"
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            placeholder="分支名称"
            className="w-24 border-0 bg-transparent text-[11px] outline-none"
          />
          <input
            aria-label="新分支说明"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="说明（可选）"
            className="w-28 border-0 bg-transparent text-[11px] outline-none"
          />
          <button
            type="submit"
            disabled={busy || name.trim() === ''}
            className="rounded bg-evidence-accent px-1.5 py-0.5 text-[10px] text-white disabled:opacity-40"
          >
            建立
          </button>
        </form>
      ) : null}

      {error !== null ? (
        <span className="max-w-[160px] truncate text-[10px] text-[#b42318]">
          {error}
        </span>
      ) : null}

      {actionError !== null ? (
        <button
          type="button"
          onClick={onDismissError}
          className="max-w-[200px] cursor-pointer truncate text-[10px] text-[#b42318]"
          title="点击关闭"
        >
          {actionError}
        </button>
      ) : null}
    </div>
  );
};
