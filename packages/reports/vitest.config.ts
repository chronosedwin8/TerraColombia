import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Las pruebas de PDF lanzan Chromium de verdad. Cuando Turbo corre varios paquetes en
     * paralelo, ese arranque compite por CPU y con el timeout por omisión de 5 s la prueba
     * falla de forma intermitente aunque el código esté bien. 120 s da margen de sobra y
     * sigue fallando rápido si el navegador no está instalado (ese caso se salta antes).
     */
    testTimeout: 120_000,
    hookTimeout: 120_000,
    /** Un solo hilo: no tiene sentido abrir varios Chromium a la vez en la misma máquina. */
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
