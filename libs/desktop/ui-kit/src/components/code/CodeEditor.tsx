import { useCallback, useEffect, useMemo, useRef } from 'react';

import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';

import { celLanguage } from './celLanguage';
import { cn } from '../../utils';

/** What can be shown in a read-only or editable code surface. */
export type CodeLanguage = 'yaml' | 'json' | 'cel' | 'text';

export interface CodeEditorProps {
  value: string;
  /** Picks the highlighter; `text` is the honest fallback for anything else. */
  language?: CodeLanguage;
  readOnly?: boolean;
  /** Accessible name for the editor surface. */
  label: string;
  onChange?: (value: string) => void;
  /** Light chrome for the studio, dark for a contract rail read at night. */
  theme?: 'light' | 'dark';
  /** A 1-based line to select and scroll to; the token replays a request. */
  revealLine?: { line: number; token: number } | null;
  /**
   * Reports the 1-based line a reader pressed on.
   *
   * A contract rail is also a navigation surface: the line under the pointer
   * names the object the rest of the workspace should show.
   */
  onLineActivate?: (line: number) => void;
  className?: string;
}

/**
 * Line density and colours, kept as one theme so the split pane and a sheet
 * cannot drift apart.
 *
 * The sizes follow the desktop ladder: 11px type, 18px lines, because this
 * surface shares a column with a ledger row rather than owning a window.
 */
const metrics = {
  '&': { fontSize: '11px', height: '100%' },
  '.cm-scroller': {
    fontFamily:
      "'SF Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: '1.65',
  },
  '.cm-gutters': { fontSize: '10px' },
  '.cm-content': { padding: '4px 0' },
  '&.cm-focused': { outline: 'none' },
} as const;

const lightTheme = EditorView.theme(
  {
    ...metrics,
    '&': { ...metrics['&'], color: '#1f2329', backgroundColor: '#ffffff' },
    '.cm-gutters': {
      ...metrics['.cm-gutters'],
      backgroundColor: '#fafbfc',
      color: '#98a2b3',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#f5f8fc' },
    '.cm-activeLineGutter': { backgroundColor: '#eef3f9' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#dbe7f5' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: '#cfe0f4' },
  },
  { dark: false },
);

const darkTheme = EditorView.theme(
  {
    ...metrics,
    '&': { ...metrics['&'], color: '#e6edf3', backgroundColor: '#0f1b2a' },
    '.cm-gutters': {
      ...metrics['.cm-gutters'],
      backgroundColor: '#0b1622',
      color: '#5c7186',
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: '#16273a' },
    '.cm-activeLineGutter': { backgroundColor: '#1b3047' },
    '.cm-selectionBackground, ::selection': { backgroundColor: '#274b71' },
  },
  { dark: true },
);

const languageExtension = (language: CodeLanguage) => {
  switch (language) {
    case 'yaml':
      return yaml();
    case 'json':
      return json();
    case 'cel':
      return celLanguage;
    default:
      return [];
  }
};

/**
 * One code surface for contracts, CEL rules and exported JSON.
 *
 * CodeMirror 6 is chosen over Monaco for weight, not for features: a split pane
 * mounts and unmounts this editor every time the modeler flips tabs, and a
 * 300ms instance bootstrap would read as a broken tab. The wrapper stays thin so
 * the app never imports `@codemirror/*` itself — the language and the reveal
 * gesture are the only things it asks for.
 */
export const CodeEditor = ({
  value,
  language = 'text',
  readOnly = true,
  label,
  onChange,
  theme = 'light',
  revealLine = null,
  onLineActivate,
  className,
}: CodeEditorProps) => {
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(() => {
    const base = [languageExtension(language), EditorView.lineWrapping];

    if (onLineActivate === undefined) return base;

    return [
      ...base,
      EditorView.domEventHandlers({
        mousedown(event, view) {
          const position = view.posAtCoords({
            x: event.clientX,
            y: event.clientY,
          });

          // jsdom has no layout, and a click on the gutter has no position
          // either; both simply report nothing.
          if (position === null) return false;

          onLineActivate(view.state.doc.lineAt(position).number);
          return false;
        },
      }),
    ];
  }, [language, onLineActivate]);
  const themeExtension = theme === 'dark' ? darkTheme : lightTheme;

  const onCreateEditor = useCallback((view: EditorView) => {
    viewRef.current = view;
  }, []);

  // A split pane that located an object must land on its line, not at byte 0.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null || revealLine === null) return;

    const line = Math.min(Math.max(1, revealLine.line), view.state.doc.lines);
    const from = view.state.doc.line(line).from;

    view.dispatch({
      selection: { anchor: from },
      effects: EditorView.scrollIntoView(from, { y: 'center' }),
    });
  }, [revealLine, value]);

  return (
    <div
      data-region="code-editor"
      data-language={language}
      className={cn('h-full min-h-0 w-full overflow-hidden', className)}
    >
      <CodeMirror
        value={value}
        height="100%"
        theme={themeExtension}
        extensions={extensions}
        readOnly={readOnly}
        editable={!readOnly}
        onChange={onChange}
        onCreateEditor={onCreateEditor}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: !readOnly,
          highlightActiveLineGutter: !readOnly,
          searchKeymap: true,
          tabSize: 2,
        }}
        aria-label={label}
      />
    </div>
  );
};
