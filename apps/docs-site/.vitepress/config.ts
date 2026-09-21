import { defineConfig } from 'vitepress';

/**
 * Documentación pública de la GeoAPI de TerraColombia (`/geo/v1`).
 *
 * Todo el sitio está en español de Colombia: es el idioma del producto (regla 9 de
 * `CLAUDE.md`). La búsqueda es local, sin servicio externo, para que la documentación no
 * dependa de terceros ni mande consultas de los desarrolladores a ningún índice ajeno.
 */

const PUBLIC_API_URL = process.env['PUBLIC_API_URL'] ?? 'https://api.terracolombia.co';

export default defineConfig({
  lang: 'es-CO',
  title: 'GeoAPI TerraColombia',
  description:
    'Documentación de la GeoAPI de TerraColombia: predios, contexto territorial, suelos, amenazas, población e indicadores de Colombia, con procedencia y licencia en cada respuesta.',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  head: [
    ['meta', { name: 'theme-color', content: '#184f95' }],
    ['meta', { property: 'og:locale', content: 'es_CO' }],
    ['meta', { property: 'og:site_name', content: 'GeoAPI TerraColombia' }],
    // La URL de la API se inyecta en el navegador para el playground.
    ['script', {}, `window.__TC_API_URL__ = ${JSON.stringify(PUBLIC_API_URL)};`],
  ],

  themeConfig: {
    siteTitle: 'GeoAPI TerraColombia',

    nav: [
      { text: 'Inicio rápido', link: '/guia/inicio-rapido' },
      { text: 'Guía', link: '/guia/autenticacion' },
      { text: 'Referencia', link: '/referencia/' },
      { text: 'Playground', link: '/playground' },
      { text: 'Glosario', link: '/guia/glosario' },
    ],

    sidebar: [
      {
        text: 'Empezar',
        collapsed: false,
        items: [
          { text: 'Inicio rápido (5 minutos)', link: '/guia/inicio-rapido' },
          { text: 'Autenticación', link: '/guia/autenticacion' },
          { text: 'Cuotas y planes', link: '/guia/cuotas-y-planes' },
          { text: 'Paginación, caché y bbox', link: '/guia/paginacion-y-cache' },
          { text: 'Errores', link: '/guia/errores' },
        ],
      },
      {
        text: 'Datos y licencias',
        collapsed: false,
        items: [
          { text: 'Licencias y atribución', link: '/guia/licencias-y-atribucion' },
          { text: 'Glosario', link: '/guia/glosario' },
        ],
      },
      {
        text: 'Referencia de la API',
        collapsed: false,
        items: [
          { text: 'Convenciones', link: '/referencia/' },
          { text: 'GET /search', link: '/referencia/search' },
          { text: 'GET /municipalities/:code', link: '/referencia/municipios' },
          { text: 'GET /parcels/:npn', link: '/referencia/predios' },
          { text: 'GET /parcels/:npn/context', link: '/referencia/predios-contexto' },
          { text: 'GET /parcels/:npn/history', link: '/referencia/predios-historial' },
          { text: 'POST /parcels/query', link: '/referencia/predios-consulta' },
          { text: 'GET /nearby', link: '/referencia/cercanos' },
          { text: 'POST /areas/analyze', link: '/referencia/areas-analizar' },
          { text: 'POST /suitability', link: '/referencia/aptitud' },
          { text: 'POST /location-intel', link: '/referencia/localizacion' },
          { text: 'POST /changes/compare', link: '/referencia/cambios' },
          { text: 'GET /indicators/:muniCode', link: '/referencia/indicadores' },
          { text: 'Informes y exportación', link: '/referencia/informes' },
          { text: 'Asistente', link: '/referencia/asistente' },
          { text: 'GET /layers', link: '/referencia/capas' },
          { text: 'GET /tiles/…', link: '/referencia/teselas' },
        ],
      },
      {
        text: 'Herramientas',
        collapsed: false,
        items: [
          { text: 'SDK de JavaScript', link: '/guia/sdk-js' },
          { text: 'Playground', link: '/playground' },
        ],
      },
    ],

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar en la documentación' },
          modal: {
            displayDetails: 'Ver detalles',
            resetButtonTitle: 'Borrar la búsqueda',
            backButtonTitle: 'Cerrar',
            noResultsText: 'No encontramos resultados para',
            footer: {
              selectText: 'para seleccionar',
              navigateText: 'para navegar',
              closeText: 'para cerrar',
            },
          },
        },
      },
    },

    outline: { level: [2, 3], label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    lastUpdatedText: 'Última actualización',
    darkModeSwitchLabel: 'Tema',
    lightModeSwitchTitle: 'Cambiar a tema claro',
    darkModeSwitchTitle: 'Cambiar a tema oscuro',
    sidebarMenuLabel: 'Contenido',
    returnToTopLabel: 'Volver arriba',
    externalLinkIcon: true,

    footer: {
      message:
        'Datos catastrales: IGAC, Base Catastral, CC BY-SA 4.0. Vías y puntos de interés: © colaboradores de OpenStreetMap, ODbL 1.0. Población: DANE. La atribución es obligatoria al reutilizar estos datos.',
      copyright: 'TerraColombia · motor de inteligencia territorial de Colombia',
    },
  },

  markdown: {
    lineNumbers: false,
    container: {
      tipLabel: 'Consejo',
      warningLabel: 'Atención',
      dangerLabel: 'Cuidado',
      infoLabel: 'Información',
      detailsLabel: 'Detalles',
    },
  },
});
