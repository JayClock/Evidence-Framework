import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { readModelDirectory } from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { EditorScreen } from './EditorScreen';
import { installDesktopApi, projectSummary } from '../test-support/desktopApi';

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  // src/renderer/screens → workspace root
  '../../../../../libs/evidence-schema/tests/fixtures/product-procurement',
);

let document: DomainModelDocument;

beforeAll(async () => {
  const parsed = await readModelDirectory(FIXTURE_ROOT);

  document = parsed.document;
});

const contextCount = () =>
  document.entities.filter((entity) => entity.category === 'context').length;

describe('EditorScreen with product-procurement', () => {
  it('renders every modeled object and context of the fixture', async () => {
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: document.manifest.name }),
        document,
        issues: [],
      },
    });

    const { container } = render(
      <EditorScreen rootPath="/models/product-procurement" />,
    );

    expect(await screen.findByText(document.manifest.name)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-context-id]')).toHaveLength(
      contextCount(),
    );
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(
      document.entities.length - contextCount(),
    );
    expect(screen.getByText('静态检查通过')).toBeInTheDocument();
    expect(screen.getByText('履约对 5')).toBeInTheDocument();
  });

  it('opens the inspector for a canvas node', async () => {
    installDesktopApi({
      openResult: {
        success: true,
        project: projectSummary({ name: document.manifest.name }),
        document,
        issues: [],
      },
    });

    const { container } = render(
      <EditorScreen rootPath="/models/product-procurement" />,
    );

    await screen.findByText(document.manifest.name);

    const contract = container.querySelector(
      '[data-node-id="contract.product-procurement"]',
    ) as HTMLElement;

    fireEvent.click(contract);

    expect(
      screen.getByText('contract.product-procurement'),
    ).toBeInTheDocument();
    expect(screen.getByText('责任锚定')).toBeInTheDocument();
  });
});
