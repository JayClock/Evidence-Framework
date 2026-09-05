import { render } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

import App from './app';

function renderApp() {
  return render(
    <BrowserRouter
      future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
    >
      <App />
    </BrowserRouter>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('should render successfully', () => {
    const { baseElement } = renderApp();

    expect(baseElement).toBeTruthy();
  });

  it('should describe the monorepo stack', () => {
    const { getByRole } = renderApp();

    expect(
      getByRole('heading', { name: 'React + Java Monorepo' }),
    ).toBeTruthy();
  });
});
