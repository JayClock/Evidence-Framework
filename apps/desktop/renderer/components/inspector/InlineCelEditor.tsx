import { useEffect, useMemo, useRef, useState } from 'react';

import {
  analyzeCelExpression,
  type CelCandidate,
} from '@evidence-poc/evidence-model-core/browser';

import { computeCelSuggestions, type CelSuggestion } from './useCelCompletion';

export interface InlineCelEditorProps {
  /** Current expression text. */
  value: string;
  candidates: readonly CelCandidate[];
  ariaLabel: string;
  /** Called when the draft should become the modeled expression. */
  onCommit: (expression: string) => void;
  /** Called with the aliases the expression reads, for bindings. */
  onCommitAliases?: (aliases: readonly string[]) => void;
  rows?: number;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

/**
 * Inline CEL editor with AST-aware completion and a fast pre-check.
 *
 * The pre-check is a guard, not the authority: the pinned Python checker still
 * decides whether the saved model holds. What it buys is immediate feedback while
 * the modeler types, so a broken rule never reaches the file system unnoticed.
 */
export const InlineCelEditor = ({
  value,
  candidates,
  ariaLabel,
  onCommit,
  onCommitAliases,
  rows = 2,
  placeholder,
}: InlineCelEditorProps) => {
  const [draft, setDraft] = useState(value);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [settled, setSettled] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(value);
    setSettled(value);
  }, [value]);

  // Debounced so analysis never runs on every keystroke of a long expression.
  useEffect(() => {
    const timer = setTimeout(() => setSettled(draft), DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [draft]);

  const analysis = useMemo(
    () => analyzeCelExpression({ expression: settled, candidates }),
    [settled, candidates],
  );
  const suggestions = useMemo(
    () =>
      computeCelSuggestions({
        expression: draft,
        caret,
        candidates,
      }),
    [draft, caret, candidates],
  );
  const open = suggestions.items.length > 0;
  const active = Math.min(activeIndex, Math.max(0, suggestions.items.length - 1));

  const insert = (suggestion: CelSuggestion) => {
    const next = `${draft.slice(0, suggestions.replaceFrom)}${suggestion.insert}${draft.slice(caret)}`;

    setDraft(next);
    setCaret(suggestions.replaceFrom + suggestion.insert.length);
    setActiveIndex(0);
    // Restoring focus keeps the caret where the insertion happened.
    requestAnimationFrame(() => {
      const element = textareaRef.current;

      if (element !== null) {
        element.focus();
        element.setSelectionRange(
          suggestions.replaceFrom + suggestion.insert.length,
          suggestions.replaceFrom + suggestion.insert.length,
        );
      }
    });
  };

  const commit = () => {
    if (draft !== value) {
      onCommit(draft);
      onCommitAliases?.(analysis.identifiers);
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        onChange={(event) => {
          setDraft(event.target.value);
          setCaret(event.target.selectionStart ?? event.target.value.length);
          setActiveIndex(0);
        }}
        onClick={(event) =>
          setCaret(event.currentTarget.selectionStart ?? draft.length)
        }
        onBlur={commit}
        onKeyDown={(event) => {
          if (open && event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % suggestions.items.length);
            return;
          }

          if (open && event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex(
              (index) =>
                (index - 1 + suggestions.items.length) %
                suggestions.items.length,
            );
            return;
          }

          if (open && (event.key === 'Tab' || (event.key === 'Enter' && !event.metaKey && !event.ctrlKey))) {
            const suggestion = suggestions.items[active];

            if (suggestion !== undefined) {
              event.preventDefault();
              insert(suggestion);
              return;
            }
          }

          if (event.key === 'Escape') {
            setCaret(-1);
            return;
          }

          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
        rows={rows}
        spellCheck={false}
        className={[
          'w-full resize-y rounded border bg-[#fbfbfc] px-1.5 py-1 font-mono text-[9px]',
          analysis.ok
            ? 'border-evidence-line'
            : 'border-evidence-evidence/60 bg-[#fff7f8]',
        ].join(' ')}
      />

      {open ? (
        <ul
          role="listbox"
          aria-label={`${ariaLabel} 补全`}
          className="absolute z-10 mt-0.5 max-h-32 w-full overflow-y-auto rounded border border-evidence-line bg-white shadow-sm"
        >
          {suggestions.items.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}-${suggestion.insert}`}
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => {
                // Keep focus in the textarea so `onBlur` does not fire first.
                event.preventDefault();
                insert(suggestion);
              }}
              className={[
                'flex cursor-pointer items-baseline justify-between gap-2 px-1.5 py-0.5 text-[9px]',
                index === active ? 'bg-[#eef2f7]' : '',
              ].join(' ')}
            >
              <span className="font-mono text-evidence-ink">
                {suggestion.label}
              </span>
              <span className="truncate text-[8px] text-evidence-muted">
                {suggestion.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {analysis.diagnostics.length > 0 ? (
        <ul
          data-cel-diagnostics=""
          className="mt-0.5 space-y-0.5 text-[8px] text-evidence-evidence"
        >
          {analysis.diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.code}-${diagnostic.offset}`}>
              {diagnostic.message}
            </li>
          ))}
        </ul>
      ) : null}

      {candidates.length > 0 ? (
        <p className="mt-0.5 text-[8px] text-[#9aa1ac]">
          可用来源：{candidates.map((candidate) => candidate.alias).join('、')}
        </p>
      ) : null}
    </div>
  );
};
