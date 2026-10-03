import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Berkas tes berbagi satu database saat TEST_DATABASE_URL dipakai, jadi tidak boleh paralel.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
