import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Toaster, notify } from './Toaster';

describe('Toaster', () => {
  it('reports a finished operation where the modeler is looking', async () => {
    render(<Toaster />);

    notify.success('离线审查页已导出');

    expect(await screen.findByText('离线审查页已导出')).toBeInTheDocument();
  });
});
