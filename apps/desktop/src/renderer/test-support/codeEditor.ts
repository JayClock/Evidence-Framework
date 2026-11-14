import { EditorView } from '@codemirror/view';
import { act, fireEvent, screen } from '@testing-library/react';

/**
 * Test handle on a mounted CEL editor.
 *
 * CodeMirror owns its content DOM, so a test drives it the way a program would:
 * through the view's transaction API, and through the same blur/Mod+Enter
 * handlers a modeler triggers. Typing character by character would test the
 * browser's contenteditable, not this application.
 */
export const editorViewFor = (ariaLabel: string): EditorView => {
  const content = screen.getByLabelText(ariaLabel);
  const view = EditorView.findFromDOM(content);

  if (view === null) {
    throw new Error(`没有找到「${ariaLabel}」的代码编辑器。`);
  }

  return view;
};

export const readExpression = (ariaLabel: string): string =>
  editorViewFor(ariaLabel).state.doc.toString();

export const typeExpression = (ariaLabel: string, expression: string): void => {
  const view = editorViewFor(ariaLabel);

  act(() => {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: expression },
      selection: { anchor: expression.length },
    });
  });
};

/** Blurs the editor, which is how a draft becomes the modeled expression. */
export const blurEditor = (ariaLabel: string): void => {
  fireEvent.blur(editorViewFor(ariaLabel).contentDOM);
};

export const commitExpression = (ariaLabel: string): void => {
  const view = editorViewFor(ariaLabel);
  // CodeMirror's `Mod` resolves from the platform, and jsdom does not claim to
  // be any particular one, so the helper presses whichever one `Mod` means here.
  const mac = /Mac/.test(navigator.platform);

  fireEvent.keyDown(view.contentDOM, {
    key: 'Enter',
    metaKey: mac,
    ctrlKey: !mac,
  });
};
