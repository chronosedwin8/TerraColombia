/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- firma genérica estándar de los SFC de Vue
  const component: DefineComponent<Record<string, any>, Record<string, any>, any>;
  export default component;
}

interface ImportMetaEnv {
  /** Base del API interno. Por omisión `/api/v1` (proxy de Vite en desarrollo). */
  readonly VITE_API_BASE_URL?: string;
  /** Estilo MapLibre propio (Protomaps / teselas vectoriales propias). */
  readonly VITE_BASEMAP_STYLE_URL?: string;
  /** Plantilla de teselas vectoriales del mapa base, si no hay un style.json propio. */
  readonly VITE_BASEMAP_TILES_URL?: string;
  /** Plantilla de URL de teselas de predios/H3 servidas por el API. */
  readonly VITE_TILES_BASE_URL?: string;
  /** URL pública de la documentación OpenAPI. */
  readonly VITE_DOCS_URL?: string;
  /** Muestra u oculta el banner de datos de demostración aunque la API no lo marque. */
  readonly VITE_FORCE_DEMO_BANNER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
