import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  keymap,
  placeholder as placeholderExtension,
} from '@codemirror/view';
import { type Diagnostic, lintGutter, linter } from '@codemirror/lint';

import {
  analyzeCelExpression,
  type CelCandidate,
  type CelDiagnostic,
} from '@evidence-poc/evidence-model-core';

import { computeCelCompletions } from './celCompletion';
import { celHighlighting, celLanguage } from './celLanguage';

export interface CelCodeMirrorEditorProps {
  /** Current expression text. */
  value: string;
  candidates: readonly CelCandidate[];
  ariaLabel: string;
  /** Called when the draft should become the modeled expression. */
  onCommit: (expression: string) => void;
  /** Called with the aliases the expression reads, for bindings. */
  onCommitAliases?: (aliases: readonly string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Visible height before the editor starts scrolling. */
  minHeight?: string;
  maxHeight?: string;
}

/** How long the modeler types before the linter fires, in milliseconds. */
const LINT_DELAY_MS = 200;

const COMPLETION_TYPES: Record<'alias' | 'attribute' | 'macro', string> = {
  alias: 'variable',
  attribute: 'property',
  macro: 'function',
};

const editorTheme = (minHeight: string, maxHeight: string): Extension =>
  EditorView.theme({
    '&': {
      fontSize: '11px',
      backgroundColor: '#fbfbfc',
      border: '1px solid #e5e7eb',
      borderRadius: '4px',
    },
    '&.cm-focused': {
      outline: 'none',
      borderColor: '#2f5d8f',
      backgroundColor: '#ffffff',
    },
    '.cm-scroller': {
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      lineHeight: '1.5',
      minHeight,
      maxHeight,
      overflow: 'auto',
    },
    '.cm-content': {
      padding: '4px 6px',
    },
    '.cm-placeholder': {
      color: '#9aa1ac',
    },
    '.cm-lint-marker-error': {
      content: '""',
    },
  });

/**
 * The CEL editor: syntax colour, model-aware completion and a live pre-check.
 *
 * The pre-check is a guard, not the authority: the sensor engine still decides
 * whether the saved model holds. What it buys is immediate feedback while the
 * modeler types, so a broken rule never reaches the file system unnoticed.
 *
 * It commits on blur and on Mod+Enter, once, and never on a draft that already
 * matches the prop — so a click elsewhere in the rail is not a second edit.
 */
export const CelCodeMirrorEditor = ({
  value,
  candidates,
  ariaLabel,
  onCommit,
  onCommitAliases,
  placeholder,
  autoFocus = false,
  minHeight = '48px',
  maxHeight = '240px',
}: CelCodeMirrorEditorProps) => {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const candidatesRef = useRef(candidates);
  const onCommitRef = useRef(onCommit);
  const onCommitAliasesRef = useRef(onCommitAliases);
  const [diagnostics, setDiagnostics] = useState<readonly CelDiagnostic[]>(
    () => analyzeCelExpression({ expression: value, candidates }).diagnostics,
  );

  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);

  useEffect(() => {
    onCommitRef.current = onCommit;
    onCommitAliasesRef.current = onCommitAliases;
  }, [onCommit, onCommitAliases]);

  const commit = useCallback(() => {
    const current = view.current;

    if (current === null) {
      return;
    }

    const expression = current.state.doc.toString();

    if (expression === valueRef.current) {
      return;
    }

    // Recorded before the callback so a second blur cannot commit it twice.
    valueRef.current = expression;
    onCommitRef.current(expression);
    onCommitAliasesRef.current?.(
      analyzeCelExpression({
        expression,
        candidates: candidatesRef.current,
      }).identifiers,
    );
  }, []);

  const extensions = useMemo<readonly Extension[]>(() => {
    const completionSource = (
      context: CompletionContext,
    ): CompletionResult | null => {
      const result = computeCelCompletions({
        expression: context.state.doc.toString(),
        caret: context.pos,
        candidates: candidatesRef.current,
        explicit: context.explicit,
      });

      if (result.options.length === 0) {
        return null;
      }

      return {
        from: result.from,
        options: result.options.map((option) => ({
          label: option.label,
          detail: option.detail,
          type: COMPLETION_TYPES[option.kind],
          apply: option.insert,
        })),
      };
    };

    const diagnosticsSource = (editor: EditorView): readonly Diagnostic[] => {
      const expression = editor.state.doc.toString();

      if (expression.trim() === '') {
        return [];
      }

      return analyzeCelExpression({
        expression,
        candidates: candidatesRef.current,
      }).diagnostics.map(
        (diagnostic): Diagnostic => ({
          from: Math.min(diagnostic.offset, expression.length),
          to: Math.min(
            diagnostic.offset + diagnostic.length,
            expression.length,
          ),
          severity: 'error',
          message: diagnostic.message,
        }),
      );
    };

    return [
      celLanguage,
      celHighlighting,
      history(),
      lintGutter(),
      linter(diagnosticsSource, { delay: LINT_DELAY_MS }),
      autocompletion({ override: [completionSource] }),
      placeholderExtension(placeholder ?? ''),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': ariaLabel,
        'aria-multiline': 'false',
      }),
      editorTheme(minHeight, maxHeight),
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) {
          return;
        }

        setDiagnostics(
          analyzeCelExpression({
            expression: update.state.doc.toString(),
            candidates: candidatesRef.current,
          }).diagnostics,
        );
      }),
      keymap.of([
        {
          key: 'Mod-Enter',
          run: (editor) => {
            commit();
            editor.contentDOM.blur();

            return true;
          },
        },
        ...historyKeymap,
        ...defaultKeymap,
      ]),
      EditorView.domEventHandlers({
        blur: () => {
          commit();

          return false;
        },
      }),
    ];
  }, [ariaLabel, commit, maxHeight, minHeight, placeholder]);

  useEffect(() => {
    const parent = host.current;

    if (parent === null) {
      return undefined;
    }

    const instance = new EditorView({
      state: EditorState.create({ doc: valueRef.current, extensions }),
      parent,
    });

    view.current = instance;

    if (autoFocus) {
      instance.focus();
    }

    return () => {
      instance.destroy();
      view.current = null;
    };
  }, [autoFocus, extensions]);

  // External edits (undo, selection change, an agent patch) replace the draft;
  // an unchanged prop leaves whatever the modeler is typing alone.
  useEffect(() => {
    valueRef.current = value;
    const current = view.current;
    const doc = current?.state.doc.toString();

    if (current === null || doc === undefined || doc === value) {
      return;
    }

    current.dispatch({
      changes: { from: 0, to: current.state.doc.length, insert: value },
      selection: { anchor: value.length },
    });
    setDiagnostics(
      analyzeCelExpression({ expression: value, candidates }).diagnostics,
    );
  }, [value, candidates]);

  return (
    <div className="relative">
      <div ref={host} className="w-full overflow-hidden" />
      {diagnostics.length > 0 ? (
        <ul
          data-cel-diagnostics=""
          className="mt-0.5 space-y-0.5 text-[9px] text-evidence-evidence"
        >
          {diagnostics.slice(0, 3).map((diagnostic) => (
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
