import path from 'node:path';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { readModelDirectory } from '@evidence-poc/evidence-model-io';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { EditorScreen } from './EditorScreen';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';

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
    await waitFor(() =>
      expect(container.querySelectorAll('[data-context-id]')).toHaveLength(
        contextCount(),
      ),
    );
    expect(container.querySelectorAll('[data-node-id]')).toHaveLength(
      document.entities.length - contextCount(),
    );
    expect(screen.getByText('静态检查通过')).toBeInTheDocument();
    expect(screen.getByText(/履约连线/)).toBeInTheDocument();
  });

  it('opens the real model with compound Contexts and ELK pair routes', async () => {
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

    await waitFor(() =>
      expect(container.querySelectorAll('[data-context-id]')).toHaveLength(
        contextCount(),
      ),
    );
    expect(container.querySelectorAll('[data-swimlane-stage]')).toHaveLength(0);
    expect(
      container.querySelectorAll('.react-flow__node[data-id]'),
    ).toHaveLength(document.entities.length);
    // A request states a window; a confirmation states an instant.
    for (const node of container.querySelectorAll(
      '[data-category="evidence"][data-node-shape="interval"]',
    )) {
      expect(node.querySelector('[data-node-shape="interval"]')).not.toBeNull();
    }
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

    await waitFor(() =>
      expect(
        container.querySelector(
          '[data-node-id="contract.product-procurement"]',
        ),
      ).not.toBeNull(),
    );
    const contract = container.querySelector(
      '[data-node-id="contract.product-procurement"]',
    ) as HTMLElement;

    fireEvent.click(contract);

    expect(
      screen.getAllByText('contract.product-procurement').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('责任锚定')).toBeInTheDocument();
  });
});
