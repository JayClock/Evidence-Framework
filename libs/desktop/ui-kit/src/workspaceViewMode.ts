/** Business journey is primary; topology is an explicit technical fallback. */
export type WorkspaceViewMode = 'journey' | 'topology' | 'table' | 'split';

export const WORKSPACE_VIEW_MODES: readonly WorkspaceViewMode[] = [
  'journey',
  'topology',
  'table',
  'split',
];
