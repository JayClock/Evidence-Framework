import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['.pi/extensions/evidence/**/*.spec.ts'],
  },
});
