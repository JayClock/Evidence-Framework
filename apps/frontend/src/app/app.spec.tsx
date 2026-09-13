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
  it('should render successfully', () => {
    const { baseElement } = renderApp();

    expect(baseElement).toBeTruthy();
  });

  it('should expose the user API entry', () => {
    const { getByRole } = renderApp();

    expect(getByRole('heading', { name: '用户资料' })).toBeTruthy();
    expect(getByRole('link', { name: '查看用户 API' })).toHaveProperty(
      'href',
      new URL('/api/users', window.location.href).href,
    );
  });
});
