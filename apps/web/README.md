# @terracolombia/web

SPA de TerraColombia: mapa nacional, ficha de predio, buscador avanzado, analizador de zona,
aptitud de terreno, localización de negocio, cambio territorial, observatorio, proyectos, planes,
llaves de API, portal de desarrolladores y administración.

Stack: **Vue 3** (`<script setup lang="ts">`, Composition API) + **Vite 6** + **TypeScript
estricto** + **Tailwind CSS 3** + **Pinia** + **Vue Router 4** + **MapLibre GL JS 4** +
**terra-draw** + **Turf.js** + **Apache ECharts** (vía `vue-echarts`) + **TanStack Query**.

---

## Cómo correrlo

Desde la raíz del monorepo (las dependencias se instalan una sola vez arriba):

```bash
pnpm install                       # solo en la raíz
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @terracolombia/web dev
```

Queda en `http://localhost:5173`. El proxy de Vite reenvía `/api` a `http://localhost:3001`
(el API de Fastify), así que no hace falta CORS en desarrollo.

Otros comandos:

```bash
pnpm --filter @terracolombia/web typecheck   # vue-tsc en modo estricto
pnpm --filter @terracolombia/web test        # vitest
pnpm --filter @terracolombia/web build       # typecheck + build de producción
pnpm --filter @terracolombia/web lint
```

### Variables de entorno

Solo las que empiezan por `VITE_` llegan al navegador. Ninguna es un secreto.

| Variable | Para qué |
|---|---|
| `VITE_API_BASE_URL` | Base del API interno. Por omisión `/api/v1`. |
| `VITE_BASEMAP_STYLE_URL` | `style.json` propio del mapa base (Protomaps / teselas propias). |
| `VITE_BASEMAP_TILES_URL` | Alternativa: plantilla de teselas vectoriales propias. |
| `VITE_TILES_BASE_URL` | Base de las teselas de datos servidas por el API. |
| `VITE_DOCS_URL` | Documentación pública de la API (`apps/docs-site`). |
| `VITE_FORCE_DEMO_BANNER` | Fuerza la banda «DATOS DE DEMOSTRACIÓN» en entornos de prueba. |

**Mapa base:** si no se define `VITE_BASEMAP_STYLE_URL` ni `VITE_BASEMAP_TILES_URL`, la
aplicación cae al estilo público de demostración de MapLibre
(`https://demotiles.maplibre.org/style.json`) y **lo advierte en pantalla**. Ese respaldo es
solo para desarrollo: no tiene detalle de Colombia y su disponibilidad no está garantizada.
Está prohibido usar teselas de Google (PLAN.md §3).

---

## Estructura

```
apps/web/
├─ index.html                 # enlace de salto, idioma es-CO, sin scripts de terceros
├─ vite.config.ts             # alias @ → src, proxy /api → :3001, chunks de mapa y gráficos
├─ vitest.config.ts           # jsdom + @vue/test-utils
├─ tailwind.config.js         # paleta, colores de semáforo, tokens de z-index
└─ src/
   ├─ main.ts                 # Pinia → Router → TanStack Query
   ├─ App.vue                 # banda de demostración, cabecera, router-view, glosario, avisos
   ├─ style.css               # base Tailwind + foco visible + prefers-reduced-motion
   │
   ├─ api/                    # cliente tipado del contrato /api/v1
   │  ├─ client.ts            # fetch + AppError + refresco de token + ETag + SSE de trabajos
   │  ├─ types.ts             # formas de respuesta que shared no declara todavía
   │  ├─ queries.ts           # claves de TanStack Query y tiempos de frescura
   │  └─ <recurso>.ts         # search, municipalities, parcels, nearby, areas, suitability,
   │                          # intel, changes, indicators, reports, layers, glossary, ai,
   │                          # jobs, auth, projects, billing, apiKeys, admin
   │
   ├─ components/
   │  ├─ ui/                  # sistema de diseño (ver abajo)
   │  ├─ AppHeader.vue        # navegación, plan, tema
   │  ├─ SearchBox.vue        # combobox universal (WAI-ARIA)
   │  ├─ BottomSheet.vue      # panel inferior deslizable en móvil / columna en escritorio
   │  ├─ Onboarding.vue       # recorrido interactivo de 60 s con ejemplos precargados
   │  ├─ Wizard.vue           # asistente paso a paso para M5, M6 y M7
   │  ├─ ChartCard.vue        # gráfico ECharts con procedencia y tabla equivalente
   │  ├─ MetricGrid.vue       # MetricRow[] → DataValue
   │  ├─ FactorList.vue       # desglose explicable de un puntaje
   │  ├─ JobProgress.vue      # progreso de un trabajo en cola
   │  └─ GlossaryPanel.vue    # definición emergente del glosario
   │
   ├─ map/
   │  ├─ style.ts             # estilo del mapa base y atribución obligatoria
   │  ├─ layers.ts            # catálogo declarativo de capas (leyenda, unidad, glosario, plan)
   │  ├─ useMap.ts            # ciclo de vida de MapLibre, feature-state, bbox con debounce
   │  ├─ MapView.vue          # mapa + panel de capas + leyenda + dibujo + calor H3
   │  ├─ LayerPanel.vue       # encendido, opacidad y selector de fecha de corte
   │  ├─ Legend.vue           # leyenda honesta (avisa si una capa no se ve a este zoom)
   │  ├─ DrawTools.vue        # terra-draw: polígono, radio y municipio
   │  └─ H3HeatLayer.vue      # mapa de calor sobre la rejilla H3
   │
   ├─ views/                  # las 12 pantallas de §10.2 + login, registro, glosario y 404
   ├─ stores/                 # auth, map, search, parcel, area, intel, projects, billing, ui
   ├─ composables/            # useUrlState, useDebounce, useJob, useGlossary,
   │                          # useEntitlements, useShare
   ├─ charts/setup.ts         # registro mínimo de módulos de ECharts
   ├─ router/index.ts         # lazy-load, guardas de sesión y de plan
   └─ mocks/                  # ejemplos del onboarding y datos de demostración marcados
```

### Pantallas y rutas

| Ruta | Vista | Módulo | Requiere |
|---|---|---|---|
| `/` | `HomeView` | M1 | — |
| `/predio/:npn` | `ParcelView` | M2 | — |
| `/buscar` | `AdvancedSearchView` | M3 | sesión + `canUseAdvancedSearch` |
| `/zona` | `AreaAnalysisView` | M4 | sesión + `canUseAreaAnalysis` |
| `/aptitud` | `SuitabilityView` | M5 | sesión + `canUseSuitability` |
| `/localizacion` | `LocationIntelView` | M6 | sesión + `canUseLocationIntel` |
| `/cambios` | `ChangeView` | M8 | sesión + `canUseChangeDetection` |
| `/observatorio/:muniCode?` | `ObservatoryView` | M9 | — |
| `/proyectos` | `ProjectsView` | M7 · M12 | sesión |
| `/cuenta/plan` | `BillingView` | M12 | sesión |
| `/cuenta/llaves` | `ApiKeysView` | M10 | sesión + `canUseApi` |
| `/desarrolladores` | `DeveloperPortalView` | M10 | — |
| `/admin` | `AdminView` | — | sesión + administrador de plataforma |
| `/glosario` · `/ingresar` · `/registro` · `*` | `GlossaryView`, `LoginView`, `RegisterView`, `NotFoundView` | — | — |

Cuando una guarda bloquea por plan, el router lleva a `/cuenta/plan?motivo=<permiso>&volver=<ruta>`
y la vista explica qué función faltaba y ofrece volver. No se expulsa al usuario sin explicación.

---

## Sistema de diseño (`src/components/ui/`)

| Componente | Qué garantiza |
|---|---|
| `BaseButton`, `BaseCard`, `BaseBadge`, `BaseField`, `BaseModal`, `TabsGroup`, `CollapsibleSection`, `RangeSlider` | Piezas base, todas operables con teclado. `TabsGroup` implementa el patrón `tablist` de WAI-ARIA; `BaseModal` usa `<dialog>` nativo. |
| `Tooltip` | Se abre con cursor **y** con foco, se cierra con Escape, se anuncia con `aria-describedby`. |
| `GlossaryTerm` | Término subrayado que abre su definición del glosario. |
| `SemaphoreBadge` | **Semáforo siempre con texto**, con icono de forma distinta por estado y lectura para lector de pantalla. Nunca comunica solo con color. |
| `SourceBadge`, `ProvenanceFooter` | Renderizan `meta.sources[]`: fuente, dataset, fecha de corte y licencia. **Sin procedencia no muestran el contenido**: pintan un aviso explicando por qué. |
| `DataValue` | Único camino de una cifra a la pantalla: oculta el valor sin fuentes, dice «No disponible» ante `NO_DISPONIBLE` o `null`, y añade la advertencia de avalúo catastral. |
| `CoverageNotice` | Cobertura honesta con `MESSAGES.coverage`: dice qué gestor catastral es y qué sí tenemos. |
| `SyntheticDataBanner` | Banda roja «DATOS DE DEMOSTRACIÓN» cuando `meta.synthetic`. |
| `EmptyState` | Estados vacíos que explican la causa y listan lo disponible. |
| `ExplainButton`, `HowCalculated` | Explicabilidad: «Explícame esto» y «¿Cómo se calcula?» con fórmula, dirección y fuentes. |
| `LoadingSkeleton`, `ToastHost` | Carga y avisos anunciados por `aria-live`. |
| `ResultActionBar` | Barra fija **Guardar · Comparar · Exportar · Compartir enlace**, con los formatos que el plan permite. |

---

## Estado en la URL

`src/composables/useUrlState.ts` es la única forma de guardar estado de vista. Tiene dos capas:

1. Un núcleo puro (`encodeState`, `decodeState`, `serializeUrlState`, `parseUrlState` y los
   codecs `stringCodec`, `numberCodec`, `intCodec`, `boolCodec`, `bboxCodec`, `listCodec`,
   `enumCodec`, `weightsCodec`, `jsonCodec`, `nullable`), probado sin router.
2. `useUrlState(defs, options)`, que ata ese núcleo a `vue-router` con escritura diferida.

Reglas: un valor igual al de por omisión **no** se escribe (enlaces cortos); un valor inválido
en la URL **no** rompe la vista (se cae al valor por omisión); los parámetros ajenos a las
definiciones se conservan (`utm_*`, por ejemplo).

Qué viaja en la URL por vista: bbox, zoom, capas y fecha de corte en el mapa; radio de contexto
en la ficha; el DSL completo del buscador avanzado (base64url); el ámbito dibujado en zona,
aptitud, localización y cambios; plantilla, pesos y resolución en localización; los dos cortes y
los tipos de cambio en cambio territorial.

---

## Accesibilidad (WCAG AA)

- Foco visible global con `outline` de 3 px; nunca `outline: none` sin reemplazo.
- Enlace «Saltar al contenido» como primer elemento enfocable.
- El mapa es un contenedor enfocable con `role="application"`: flechas desplazan, `+`/`-`
  acercan y alejan, y `Enter` consulta el centro.
- El semáforo y los estados críticos llevan texto e icono, no solo color.
- Cada gráfico ofrece su tabla equivalente.
- `prefers-reduced-motion` desactiva animaciones y transiciones.
- Combobox de búsqueda, pestañas, diálogos y hoja inferior siguen patrones ARIA con navegación
  completa por teclado.

---

## Pruebas

```bash
pnpm --filter @terracolombia/web test
```

- `src/components/ui/ProvenanceFooter.spec.ts` — verifica que **no se renderiza la cifra sin
  fuente** y que la atribución del IGAC se reproduce literal.
- `src/components/ui/DataValue.spec.ts` — sin procedencia no hay número; `NO_DISPONIBLE` y `null`
  se muestran como «No disponible»; el cero real sí se muestra; el avalúo arrastra su advertencia.
- `src/components/ui/SemaphoreBadge.spec.ts` — el semáforo **siempre** lleva texto, con icono
  distinto por estado y lectura para lector de pantalla.
- `src/composables/useUrlState.spec.ts` — codecs, núcleo puro e integración con un router en
  memoria (lectura inicial, escritura, conservación de parámetros ajenos, `reset`, `patch`,
  `shareUrl`).

---

## Supuestos sobre el contrato de la API

Están documentados en el código (`src/api/types.ts`, `src/api/client.ts`, `src/map/layers.ts`) y
resumidos aquí para que el equipo del API los confirme o los corrija:

1. **Sobre**: toda respuesta es `{ data, meta }` con `meta: ResponseMeta` de
   `@terracolombia/shared`. La web nunca descarta `meta`: la necesita para procedencia,
   cobertura y banda de demostración.
2. **Errores**: `{ error: { code, message, details } }`, el formato de `AppError.toJSON()`, con
   `code` dentro de `ErrorCode` y `message` ya en español.
3. **Listas**: las respuestas paginadas son `{ items, nextCursor, total }` dentro de `data`;
   `total` puede ser `null` cuando calcularlo sería costoso.
4. **Asíncrono**: `POST /areas/analyze`, `POST /location-intel`, `POST /changes/compare` y
   `POST /reports` pueden devolver `{ jobId, status }` en lugar del resultado. Se sigue por
   `GET /jobs/:id` y por SSE en `GET /jobs/:id/stream`, con eventos nombrados `progress`, `done`
   y `failed`. El SSE autentica por cookie de sesión, porque `EventSource` no admite cabeceras.
5. **Sesión**: `/auth/login` y `/auth/register` devuelven `{ accessToken, expiresIn, user }` y
   dejan el refresh token en una cookie **HttpOnly**. `POST /auth/refresh` con
   `credentials: 'include'` devuelve un access token nuevo. El access token vive solo en memoria.
6. **Teselas**: `GET /tiles/:layer/{z}/{x}/{y}.mvt` sirve una capa MVT cuyo nombre interno
   coincide con el id de la capa (`parcel`, `h3`, `school`…) y acepta `?cut=AAAA-MM-DD`. Cada
   capa expone la propiedad identificadora que `promoteId` necesita para el `feature-state`
   (`npn` en predios, `h3` en celdas, `code` en municipios — ver `FEATURE_ID_PROPERTY`).
7. **Catálogo de capas**: `GET /layers` puede sobrescribir etiquetas y leyendas del catálogo
   local declarado en `src/map/layers.ts`, que sirve de respaldo si el endpoint falla.
8. **Puntuaciones**: `/suitability` y `/location-intel` incluyen siempre el desglose por factor
   con `formula`, `direction`, `unit` y `sourceDatasetIds`. Una respuesta sin desglose no se
   pinta como puntaje.
9. **Métricas**: cada `MetricRow` del tablero de zona declara `sourceDatasetIds`; las cifras sin
   datasets no se muestran.
10. **Pagos**: `POST /billing/checkout` devuelve `{ checkoutUrl, reference }` y el frontend solo
    redirige. La web nunca ve datos de tarjeta.
11. **Llaves de API**: `POST /api-keys` devuelve el secreto en claro **una sola vez**; después
    solo `maskedKey`.
12. **Informes**: `GET /reports/:id/download?format=` responde con el binario y el nombre en
    `Content-Disposition`; el informe conserva los `SourceRef` con los que se generó.

---

## Reglas del producto que la interfaz hace cumplir

| Regla de `CLAUDE.md` | Dónde se aplica |
|---|---|
| 2 · No inventar campos ni simular datos | `DataValue` (`NO_DISPONIBLE` → «No disponible»), `src/mocks/` marcado como demostración, `SyntheticDataBanner` |
| 3 · Cero datos personales | La web no tiene ninguna pantalla de predio → persona; no existe endpoint ni campo para ello |
| 4 · Sin procedencia no se muestra | `ProvenanceFooter`, `SourceBadge`, `DataValue`, `MetricGrid`, `ChartCard` |
| 5 · Avalúo catastral ≠ valor comercial | `DataValue` con `format="currency"`, ficha de predio, buscador avanzado |
| 6 · Cobertura honesta | `CoverageNotice`, `EmptyState`, panel de cobertura en administración |
| 9 · Español de Colombia | Todas las cadenas visibles salen de `MESSAGES` cuando existen; identificadores en inglés |
