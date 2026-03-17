import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
    server: {
      deps: {
        // Allow vitest to resolve deep imports from rekordbox-connect
        // that aren't in the package's exports map
        inline: ['rekordbox-connect'],
      },
    },
  },
});
