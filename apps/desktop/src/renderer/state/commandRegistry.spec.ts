import { describe, expect, it, vi } from 'vitest';

import {
  CHORDS,
  COMMAND_GROUPS,
  buildCommands,
  groupCommands,
  type CommandCapabilities,
  type CommandHandlers,
} from './commandRegistry';

const capabilities = (
  overrides: Partial<CommandCapabilities> = {},
): CommandCapabilities => ({
  canUndo: true,
  canRedo: false,
  dirty: false,
  busy: false,
  viewMode: 'graph',
  ...overrides,
});

const handlers = (): CommandHandlers => ({
  save: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  setViewMode: vi.fn(),
  focusSearch: vi.fn(),
  openReview: vi.fn(),
  exportReview: vi.fn(),
  exportDiff: vi.fn(),
  openDelivery: vi.fn(),
  openSandbox: vi.fn(),
  rerunSensors: vi.fn(),
  askAgent: vi.fn(),
  openRail: vi.fn(),
  toggleProblems: vi.fn(),
});

const find = (id: string, overrides: Partial<CommandCapabilities> = {}) =>
  buildCommands(capabilities(overrides), handlers()).find(
    (command) => command.id === id,
  );

describe('buildCommands', () => {
  it('covers every group it declares', () => {
    const commands = buildCommands(capabilities(), handlers());
    const groups = new Set(commands.map((command) => command.category));

    expect([...groups].sort()).toEqual(
      COMMAND_GROUPS.map((group) => group.id).sort(),
    );
  });

  it('prints the chord the shortcut map actually binds', () => {
    expect(find('model.save')?.shortcut).toBe(CHORDS.save);
    expect(find('view.table')?.shortcut).toBe(CHORDS.table);
    expect(find('view.rail-topology')?.shortcut).toBe(CHORDS.railTopology);
    expect(find('delivery.export-review')?.shortcut).toBe(CHORDS.exportReview);
  });

  it('opens a rail drawer without touching the document', () => {
    const onRail = vi.fn();
    const commands = buildCommands(capabilities(), {
      ...handlers(),
      openRail: onRail,
    });

    commands.find((command) => command.id === 'view.rail-copilot')?.perform();

    expect(onRail).toHaveBeenCalledWith('copilot');
  });

  it('refuses to export an unsaved model and says why', () => {
    const stale = find('delivery.export-review', { dirty: true });

    expect(stale?.disabled).toBe(true);
    expect(stale?.subtitle).toContain('先保存');
    expect(find('delivery.export-review')?.disabled).toBe(false);
  });

  it('reports an export already in flight before blaming the save', () => {
    expect(find('delivery.export-diff', { busy: true })?.subtitle).toContain(
      '正在导出',
    );
  });

  it('greys out history and view rows that would not change anything', () => {
    expect(find('model.redo')?.disabled).toBe(true);
    expect(find('model.undo')?.disabled).toBe(false);
    expect(find('view.graph')?.disabled).toBe(true);
    expect(find('view.split')?.disabled).toBe(false);
  });

  it('runs the handler rather than reimplementing the action', () => {
    const spy = handlers();
    const save = buildCommands(capabilities(), spy).find(
      (command) => command.id === 'model.save',
    );

    save?.perform();

    expect(spy.save).toHaveBeenCalledTimes(1);
  });

  it('keeps disabled rows in the list so the feature reads as present', () => {
    const commands = buildCommands(capabilities({ dirty: true }), handlers());

    expect(commands.some((command) => command.id === 'model.save')).toBe(true);
  });
});

describe('groupCommands', () => {
  it('orders buckets as declared and drops the empty ones', () => {
    const buckets = groupCommands(
      buildCommands(capabilities(), handlers()).filter(
        (command) =>
          command.category === 'agent' || command.category === 'model',
      ),
    );

    expect(buckets.map((bucket) => bucket.group.id)).toEqual([
      'model',
      'agent',
    ]);
  });
});
