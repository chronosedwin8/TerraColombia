<script setup lang="ts">
/**
 * Portal de desarrolladores (pantalla 11 de §10.2, módulo M10).
 *
 * Enlaza la documentación OpenAPI y el *playground* (que viven en `apps/docs-site`) y trae un
 * quickstart copiable. Los ejemplos usan **exactamente** el contrato de §9 y el DSL real de
 * `ParcelQuerySchema`: nada inventado, para que el copiar y pegar funcione.
 */
import { computed, ref } from 'vue';
import { DISCLAIMERS, LICENSES } from '@terracolombia/shared';
import { useShare } from '@/composables/useShare';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import TabsGroup from '@/components/ui/TabsGroup.vue';
import type { TabItem } from '@/components/ui/types';

const { copy, copied } = useShare();
const activeTab = ref('quickstart');

const DOCS_URL = import.meta.env.VITE_DOCS_URL ?? 'http://localhost:4173';

const tabs: TabItem[] = [
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'endpoints', label: 'Endpoints' },
  { id: 'dsl', label: 'DSL de consulta' },
  { id: 'legal', label: 'Licencias y atribución' },
];

/** Endpoints públicos, tal como los declara §9 del plan. */
const ENDPOINTS = [
  { method: 'GET', path: '/search?q=', description: 'Búsqueda universal: dirección, NPN, municipio, topónimo o lat,lng.' },
  { method: 'GET', path: '/municipalities/:code', description: 'Ficha del municipio con su gestor catastral y estado de cobertura.' },
  { method: 'GET', path: '/parcels/:npn', description: 'Ficha completa del predio.' },
  { method: 'GET', path: '/parcels/:npn/context?radius=', description: 'Entorno: equipamientos, vías, población, suelos, amenazas.' },
  { method: 'GET', path: '/parcels/:npn/history', description: 'Cambios del predio entre cortes.' },
  { method: 'POST', path: '/parcels/query', description: 'Filtros alfanuméricos y espaciales (DSL validado con Zod).' },
  { method: 'GET', path: '/nearby?lat&lng&radius&layers=', description: 'Qué hay alrededor de un punto.' },
  { method: 'POST', path: '/areas/analyze', description: 'Tablero de una zona. Asíncrono si el área es grande.' },
  { method: 'POST', path: '/suitability', description: 'Aptitud de terreno con desglose por factor.' },
  { method: 'POST', path: '/location-intel', description: 'Celdas H3 puntuadas según plantilla y pesos.' },
  { method: 'GET', path: '/location-intel/templates', description: 'Plantillas de negocio disponibles.' },
  { method: 'POST', path: '/changes/compare', description: 'Diferencias entre dos cortes en un área.' },
  { method: 'GET', path: '/indicators/:muniCode', description: 'Indicadores municipales del observatorio.' },
  { method: 'POST', path: '/reports', description: 'Encolar un informe. Devuelve { jobId, status }.' },
  { method: 'GET', path: '/reports/:id/download?format=', description: 'Descargar el informe en PDF, XLSX, CSV, GeoJSON, GPKG o KML.' },
  { method: 'GET', path: '/jobs/:id', description: 'Estado de una operación asíncrona.' },
  { method: 'GET', path: '/jobs/:id/stream', description: 'Progreso en vivo por Server-Sent Events.' },
  { method: 'GET', path: '/layers', description: 'Catálogo de capas con leyendas y glosario.' },
  { method: 'GET', path: '/glossary', description: 'Glosario de términos técnicos.' },
  { method: 'GET', path: '/tiles/:layer/:z/:x/:y.mvt', description: 'Teselas vectoriales con control de plan.' },
] as const;

const QUICKSTART = `# 1. Crea una llave en /cuenta/llaves y expórtala
export TC_API_KEY="tc_live_..."

# 2. Busca un municipio
curl -s "https://api.terracolombia.co/geo/v1/search?q=Soledad" \\
  -H "Authorization: Bearer $TC_API_KEY" | jq '.data[0]'

# 3. Pide la ficha de un predio por su código predial de 30 dígitos
curl -s "https://api.terracolombia.co/geo/v1/parcels/<NPN>" \\
  -H "Authorization: Bearer $TC_API_KEY" | jq '{data: .data.summary, fuentes: .meta.sources}'

# 4. Toda respuesta trae meta.sources[]: fuente, dataset, fecha de corte y licencia.
#    Si vas a publicar las cifras, la atribución es obligatoria.`;

const DSL_EXAMPLE = `POST /geo/v1/parcels/query
Content-Type: application/json

{
  "scope": { "municipality": "08573" },
  "where": {
    "zone": "urbano",
    "area_m2": { "gte": 1000 },
    "economic_use": ["lote"]
  },
  "near": [
    { "layer": "road", "class": ["primary", "trunk"], "max_m": 300 },
    { "layer": "school", "max_m": 800 }
  ],
  "sort": "area_m2:desc",
  "limit": 100,
  "geometry": "centroid"
}`;

const licenses = computed(() => Object.values(LICENSES));
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-3 p-3">
    <header>
      <h1 class="text-xl font-semibold">Portal de desarrolladores</h1>
      <p class="mt-0.5 text-sm text-slate-600">
        GeoAPI de datos territoriales de Colombia, normalizados y con procedencia. Respuestas en
        JSON y GeoJSON, envueltas en <code>{ data, meta }</code>.
      </p>
    </header>

    <div class="flex flex-wrap gap-2">
      <BaseButton :href="`${DOCS_URL}/openapi`" variant="primary" size="sm">
        Documentación OpenAPI 3.1
      </BaseButton>
      <BaseButton :href="`${DOCS_URL}/playground`" variant="secondary" size="sm">
        Playground
      </BaseButton>
      <BaseButton :href="`${DOCS_URL}/openapi.json`" variant="secondary" size="sm">
        Descargar el esquema
      </BaseButton>
      <BaseButton to="/cuenta/llaves" variant="secondary" size="sm">Mis llaves</BaseButton>
    </div>

    <TabsGroup v-model="activeTab" :tabs="tabs" aria-label="Documentación de la API">
      <template #quickstart>
        <BaseCard title="Primeros pasos en menos de cinco minutos" :heading-level="2">
          <template #actions>
            <BaseButton variant="secondary" size="sm" @click="copy(QUICKSTART)">
              {{ copied ? 'Copiado' : 'Copiar' }}
            </BaseButton>
          </template>
          <pre class="overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">{{ QUICKSTART }}</pre>
          <p class="mt-3 text-sm text-slate-700">
            Los errores llegan como <code>{ "error": { "code", "message", "details" } }</code>, con
            el mensaje ya en español. Los códigos son estables:
            <code>PARCEL_NOT_FOUND</code>, <code>INVALID_NPN</code>, <code>AREA_TOO_LARGE</code>,
            <code>QUOTA_EXCEEDED</code>, <code>RATE_LIMITED</code>, <code>TIMEOUT</code>.
          </p>
        </BaseCard>
      </template>

      <template #endpoints>
        <BaseCard title="Endpoints" :heading-level="2" :padded="false">
          <table class="tc-table">
            <thead>
              <tr>
                <th scope="col">Método</th>
                <th scope="col">Ruta</th>
                <th scope="col">Qué hace</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="endpoint in ENDPOINTS" :key="`${endpoint.method}-${endpoint.path}`">
                <td class="font-mono text-xs">{{ endpoint.method }}</td>
                <td class="font-mono text-xs">{{ endpoint.path }}</td>
                <td>{{ endpoint.description }}</td>
              </tr>
            </tbody>
          </table>
        </BaseCard>
      </template>

      <template #dsl>
        <BaseCard title="DSL de /parcels/query" :heading-level="2">
          <template #actions>
            <BaseButton variant="secondary" size="sm" @click="copy(DSL_EXAMPLE)">
              {{ copied ? 'Copiado' : 'Copiar' }}
            </BaseButton>
          </template>

          <p class="text-sm text-slate-700">
            El DSL se valida con Zod y se traduce a SQL parametrizado. Nunca se concatenan cadenas,
            y los nombres de columna salen de una lista blanca: lo que no está en el esquema, no
            existe.
          </p>

          <pre class="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-100">{{ DSL_EXAMPLE }}</pre>

          <p class="mt-3 text-sm text-slate-700">
            <code>scope</code> exige <code>department</code> o <code>municipality</code>: una
            consulta nacional de predios no es viable. <code>limit</code> tiene techo por plan, y
            los análisis grandes se encolan y se siguen por SSE.
          </p>
        </BaseCard>
      </template>

      <template #legal>
        <div class="space-y-3">
          <BaseCard title="Licencias de los datos" :heading-level="2" :padded="false">
            <table class="tc-table">
              <thead>
                <tr>
                  <th scope="col">Identificador</th>
                  <th scope="col">Nombre</th>
                  <th scope="col">CompartirIgual</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="license in licenses" :key="license.id">
                  <td class="font-mono text-xs">{{ license.id }}</td>
                  <td>
                    <a
                      v-if="license.url"
                      class="tc-link"
                      :href="license.url"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {{ license.name }}
                    </a>
                    <span v-else>{{ license.name }}</span>
                  </td>
                  <td>{{ license.shareAlike ? 'Sí' : 'No' }}</td>
                </tr>
              </tbody>
            </table>
          </BaseCard>

          <BaseCard title="Atribución obligatoria" :heading-level="2">
            <p class="text-sm text-slate-700">
              Cada respuesta trae <code>meta.sources[]</code> con la atribución exacta que debes
              reproducir. Para la base catastral el texto es:
            </p>
            <pre class="mt-2 rounded-md bg-surface-muted p-3 font-mono text-xs">Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0</pre>
            <p class="mt-2 text-sm text-slate-700">
              La cláusula CompartirIgual de CC BY-SA 4.0 puede alcanzar a bases derivadas que
              redistribuyas. Mantén separados los datos del IGAC de tus propios indicadores.
            </p>
          </BaseCard>

          <BaseCard title="Advertencias que debes propagar" :heading-level="2">
            <ul class="list-disc space-y-1.5 pl-4 text-sm text-slate-700">
              <li>{{ DISCLAIMERS.notCertificate }}</li>
              <li>{{ DISCLAIMERS.notAppraisal }}</li>
              <li>{{ DISCLAIMERS.notUrbanNorm }}</li>
              <li>{{ DISCLAIMERS.notTitleStudy }}</li>
              <li>{{ DISCLAIMERS.hazardScale }}</li>
              <li>{{ DISCLAIMERS.coverage }}</li>
              <li>{{ DISCLAIMERS.noPersonalData }}</li>
            </ul>
          </BaseCard>
        </div>
      </template>
    </TabsGroup>
  </div>
</template>
