import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Las pruebas de integración van contra UNA base compartida: crean y publican cortes de
     * prueba. Ejecutarlas en paralelo entre sí hace que se pisen y produce fallos
     * intermitentes que no son bugs del código. Un solo proceso, en serie.
     */
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    /** PostGIS puede tardar en la primera consulta espacial de una conexión nueva. */
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
