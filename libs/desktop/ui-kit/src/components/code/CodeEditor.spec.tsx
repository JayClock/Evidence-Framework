import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CodeEditor } from './CodeEditor';

describe('CodeEditor', () => {
  it('mounts a code surface that names itself and prints the document', () => {
    render(
      <CodeEditor
        label="OpenAPI 契约"
        language="yaml"
        value={'openapi: 3.1.0\npaths:\n  /purchase: {}\n'}
      />,
    );

    const surface = screen.getByLabelText('OpenAPI 契约');
    expect(surface).toBeInTheDocument();
    expect(surface.closest('[data-language="yaml"]')).not.toBeNull();
    // CodeMirror splits a line into one span per token, so the assertion reads
    // the document rather than one text node.
    expect(document.querySelector('.cm-content')?.textContent).toContain(
      'openapi: 3.1.0',
    );
  });

  it('marks a read-only contract as not editable', () => {
    render(<CodeEditor label="契约" language="json" value={'{"a":1}'} />);

    expect(
      document.querySelector('.cm-content')?.getAttribute('contenteditable'),
    ).toBe('false');
  });

  it('keeps the document when asked to reveal a line past the end', () => {
    render(
      <CodeEditor
        label="契约"
        language="yaml"
        value={'a: 1\nb: 2'}
        revealLine={{ line: 99, token: 1 }}
      />,
    );

    expect(document.querySelector('.cm-content')?.textContent).toContain(
      'a: 1',
    );
  });

  it('reports edits when it is editable', async () => {
    const onChange = vi.fn();
    render(
      <CodeEditor
        label="CEL 表达式"
        language="cel"
        readOnly={false}
        value={'request.quantity * 1'}
        onChange={onChange}
      />,
    );

    expect(document.querySelector('.cm-content')?.textContent).toContain(
      'request.quantity',
    );
    expect(
      document.querySelector('.cm-content')?.getAttribute('contenteditable'),
    ).toBe('true');
  });
});
