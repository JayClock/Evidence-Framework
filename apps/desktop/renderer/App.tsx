import { DashboardScreen } from './screens/DashboardScreen';
import { EditorScreen } from './screens/EditorScreen';

export type AppRoute =
  | { name: 'dashboard' }
  | { name: 'editor'; rootPath: string };

/** Hash routing keeps the Electron `file://` build working without a server. */
export const parseRoute = (hash: string): AppRoute => {
  const [pathname, search = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(search);

  if (pathname === '/editor') {
    return { name: 'editor', rootPath: params.get('rootPath') ?? '' };
  }

  return { name: 'dashboard' };
};

export const App = () => {
  const route = parseRoute(window.location.hash);

  return route.name === 'editor' ? (
    <EditorScreen rootPath={route.rootPath} />
  ) : (
    <DashboardScreen />
  );
};
