import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Las pruebas levantan la aplicación entera contra la base real y registran cuentas de
     * prueba. En paralelo se pisarían entre sí y agotarían el pool de conexiones.
     */
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
