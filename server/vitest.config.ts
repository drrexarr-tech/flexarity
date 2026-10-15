import { defineConfig } from 'vitest/config';

/**
 * Only the pure parts of the server are covered here - the reminder wording and
 * the date maths. Anything that touches Prisma is exercised by the live suite
 * against production instead, where a real database can be wrong in ways a mock
 * would hide.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});