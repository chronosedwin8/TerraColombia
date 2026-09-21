<script setup lang="ts">
/**
 * Buscador avanzado de predios (pantalla 3 de §10.2).
 *
 * El constructor visual produce **exactamente** el DSL de `ParcelQuerySchema`: el objeto se
 * valida con Zod antes de salir, así que un filtro mal armado se detecta en el navegador y no
 * llega al backend. El DSL completo viaja en la URL (base64url), de modo que una consulta
 * compleja se comparte con un enlace.
 *
 * Lista y mapa están sincronizados: pasar el cursor por una fila resalta el predio y al revés.
 */
import { computed, ref, watch } from 'vue';
import {
  AppError,
  MESSAGES,
  NEARBY_LAYERS,
  ParcelQuerySchema,
  formatArea,
  formatCop,
  isAvailable,
  type Maybe,
  type NearbyLayer,
  type ParcelQuery,
  type ResponseMeta,
} from '@terracolombia/shared';
import { useMapStore } from '@/stores/map';
import { useEntitlements } from '@/composables/useEntitlements';
import { jsonCodec, useUrlState } from '@/composables/useUrlState';
import { queryParcels } from '@/api/parcels';
import { emptyMeta } from '@/api/client';
import type { ParcelQueryResponse } from '@/api/types';
import MapView from '@/map/MapView.vue';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseField from '@/components/ui/BaseField.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import GlossaryTerm from '@/components/ui/GlossaryTerm.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';
import ProvenanceFooter from '@/components/ui/ProvenanceFooter.vue';
import ResultActionBar from '@/components/ui/ResultActionBar.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';

const mapStore = useMapStore();
const { entitlements } = useEntitlements();

// ─── Estado del constructor ───────────────────────────────────────────────────

/** Forma editable del DSL. Se traduce a `ParcelQuery` al consultar. */
interface Builder {
  department: string;
  municipality: string;
  zone: '' | 'urbano' | 'rural';
  areaMin: string;
  areaMax: string;
  builtMin: string;
  valueMax: string;
  economicUse: string;
  addressLike: string;
  hasBuilding: '' | 'si' | 'no';
  near: Array<{ layer: NearbyLayer; maxM: number; invert: boolean; classes: string }>;
  sort: string;
  limit: number;
}

function emptyBuilder(): Builder {
  return {
    department: '',
    municipality: '',
    zone: '',
    areaMin: '',
    areaMax: '',
    builtMin: '',
    valueMax: '',
    economicUse: '',
    addressLike: '',
    hasBuilding: '',
    near: [],
    sort: 'area_m2:desc',
    limit: 100,
  };
}

const { state, shareUrl } = useUrlState({
  filtros: { default: emptyBuilder(), codec: jsonCodec<Builder>() },
});

const builder = computed(() => state.filtros);

const NEAR_LABELS: Record<NearbyLayer, string> = {
  road: 'Vía',
  school: 'Colegio o sede educativa',
  health_facility: 'Sede de salud',
  poi: 'Comercio o servicio',
  protected_area: 'Área protegida',
  hazard: 'Amenaza',
  urban_perimeter: 'Perímetro urbano',
};

const SORT_OPTIONS = [
  { value: 'area_m2:desc', label: 'Área, de mayor a menor' },
  { value: 'area_m2:asc', label: 'Área, de menor a mayor' },
  { value: 'built_area_m2:desc', label: 'Área construida, de mayor a menor' },
  { value: 'cadastral_value:asc', label: 'Avalúo catastral, de menor a mayor' },
  { value: 'npn:asc', label: 'Código predial' },
  { value: 'distance:asc', label: 'Distancia al filtro de cercanía' },
] as const;

function addNear(): void {
  state.filtros = {
    ...builder.value,
    near: [...builder.value.near, { layer: 'road', maxM: 300, invert: false, classes: '' }],
  };
}

function removeNear(index: number): void {
  state.filtros = {
    ...builder.value,
    near: builder.value.near.filter((_, i) => i !== index),
  };
}

function toNumber(raw: string): number | undefined {
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return raw.trim().length > 0 && Number.isFinite(value) ? value : undefined;
}

function splitList(raw: string): string[] | undefined {
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
}

/** Constructor visual → DSL. Devuelve el error de validación en español si no cuadra. */
const dslResult = computed<
  { ok: true; query: ParcelQuery } | { ok: false; message: string }
>(() => {
  const b = builder.value;

  const areaMin = toNumber(b.areaMin);
  const areaMax = toNumber(b.areaMax);
  const builtMin = toNumber(b.builtMin);
  const valueMax = toNumber(b.valueMax);

  const candidate = {
    scope: {
      ...(b.department.length === 2 ? { department: b.department } : {}),
      ...(b.municipality.length === 5 ? { municipality: b.municipality } : {}),
      ...(mapStore.cutDate ? { cutDate: mapStore.cutDate } : {}),
    },
    where: {
      ...(b.zone ? { zone: b.zone } : {}),
      ...(areaMin !== undefined || areaMax !== undefined
        ? {
            area_m2: {
              ...(areaMin !== undefined ? { gte: areaMin } : {}),
              ...(areaMax !== undefined ? { lte: areaMax } : {}),
            },
          }
        : {}),
      ...(builtMin !== undefined ? { built_area_m2: { gte: builtMin } } : {}),
      ...(valueMax !== undefined ? { cadastral_value: { lte: valueMax } } : {}),
      ...(splitList(b.economicUse) ? { economic_use: splitList(b.economicUse) } : {}),
      ...(b.addressLike.trim().length > 0 ? { address_like: b.addressLike.trim() } : {}),
      ...(b.hasBuilding ? { has_building: b.hasBuilding === 'si' } : {}),
    },
    near: b.near.map((filter) => ({
      layer: filter.layer,
      max_m: filter.maxM,
      invert: filter.invert,
      ...(splitList(filter.classes) ? { class: splitList(filter.classes) } : {}),
    })),
    sort: b.sort,
    limit: Math.min(b.limit, entitlements.value.maxQueryLimit),
    geometry: 'centroid' as const,
  };

  const parsed = ParcelQuerySchema.safeParse(candidate);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      message: first?.message ?? 'Revisa los filtros: hay una combinación que no podemos consultar.',
    };
  }
  return { ok: true, query: parsed.data };
});

// ─── Consulta ─────────────────────────────────────────────────────────────────

/*
 * `POST /parcels/query` devuelve `{rows, nextCursor, limitApplied, cadastralValueWarning}`,
 * no una página con `items` y `total`. Guardarlo como `Page` dejaba la tabla vacía aunque
 * la consulta respondiera bien: con 528 predios en Soledad se veía "Todavía no hay
 * resultados".
 */
const page = ref<ParcelQueryResponse | null>(null);
const meta = ref<ResponseMeta>(emptyMeta());
const isLoading = ref(false);
const error = ref<AppError | null>(null);
const hoveredNpn = ref<string | null>(null);

async function run(): Promise<void> {
  const result = dslResult.value;
  if (!result.ok) {
    error.value = new AppError('VALIDATION', result.message);
    return;
  }
  isLoading.value = true;
  error.value = null;
  try {
    const response = await queryParcels(result.query);
    page.value = response.data;
    meta.value = response.meta;
  } catch (e) {
    error.value = e instanceof AppError ? e : new AppError('INTERNAL', MESSAGES.common.error);
    page.value = null;
  } finally {
    isLoading.value = false;
  }
}

const rows = computed(() => page.value?.rows ?? []);

/*
 * Las cifras pueden llegar como el centinela `'NO_DISPONIBLE'`, no solo como null: la
 * fuente declara el hueco en vez de omitirlo. Formatearlo sin comprobarlo imprimía
 * "NaN m²".
 */
function areaLabel(value: Maybe<number>): string {
  return isAvailable(value) ? formatArea(value) : MESSAGES.common.notAvailable;
}

function copLabel(value: Maybe<number>): string {
  return isAvailable(value) ? formatCop(value) : MESSAGES.common.notAvailable;
}

/**
 * La API no devuelve cuántas coincidencias hay en total: con `nextCursor` se sabe si queda
 * más, pero no cuánto. Se dice lo que se sabe —cuántas se están mostrando y si hay más— en
 * vez de prometer un número que nadie ha contado.
 */
const resultsTitle = computed(() => {
  const n = rows.value.length;
  if (n === 0) return 'Resultados';
  return page.value?.nextCursor ? `Resultados (${n}, hay más)` : `Resultados (${n})`;
});

/** Centroides de los resultados, para pintarlos sobre el mapa y sincronizar lista y mapa. */
const overlay = computed(() => {
  const features = rows.value
    .filter((row) => row.centroid !== null)
    .map((row) => ({
      type: 'Feature' as const,
      id: row.npn,
      geometry: { type: 'Point' as const, coordinates: row.centroid as number[] },
      properties: { npn: row.npn, hovered: row.npn === hoveredNpn.value },
    }));
  return features.length > 0 ? { type: 'FeatureCollection' as const, features } : null;
});

/** Tabla exportable como CSV en el navegador, sin pasar por el backend. */
function toCsv(): string {
  const header = [
    'codigo_predial',
    'municipio',
    'direccion',
    'zona',
    'area_m2',
    'area_construida_m2',
    'destino_economico',
    'avaluo_catastral_cop',
  ];
  const lines = rows.value.map((row) =>
    [
      row.npn,
      row.muniName,
      row.address ?? MESSAGES.common.notAvailable,
      row.zoneLabel ?? MESSAGES.common.notAvailable,
      row.areaGeomM2 ?? '',
      row.builtAreaM2 ?? '',
      row.economicUse ?? MESSAGES.common.notAvailable,
      row.cadastralValue ?? '',
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(','),
  );
  // Hoja de fuentes obligatoria en toda exportación (PLAN.md §11).
  const sourceLines = [
    '',
    '"FUENTES_Y_LICENCIA"',
    ...meta.value.sources.map(
      (source) => `"${source.attribution} · corte ${source.cutDate ?? 'no declarado'}"`,
    ),
  ];
  return [header.join(','), ...lines, ...sourceLines].join('\n');
}

function downloadCsv(): void {
  const blob = new Blob([`﻿${toCsv()}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'terracolombia-predios.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Al cambiar el corte temporal la consulta anterior deja de ser válida.
watch(() => mapStore.cutDate, () => {
  page.value = null;
});
</script>

<template>
  <div class="mx-auto max-w-[110rem] space-y-3 p-3">
    <SyntheticDataBanner :meta="meta" />

    <h1 class="text-xl font-semibold">Buscador avanzado de predios</h1>

    <div class="grid gap-3 lg:grid-cols-[22rem_1fr]">
      <!-- ── Constructor visual de filtros ──────────────────────────────────── -->
      <BaseCard title="Filtros" :heading-level="2">
        <form class="space-y-3" @submit.prevent="run">
          <div class="grid grid-cols-2 gap-2">
            <BaseField label="Departamento" hint="Código de 2 dígitos">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="state.filtros.department"
                  class="tc-input"
                  inputmode="numeric"
                  maxlength="2"
                  :aria-describedby="describedBy"
                />
              </template>
            </BaseField>

            <BaseField label="Municipio" hint="Código DIVIPOLA de 5 dígitos">
              <template #default="{ id, describedBy }">
                <input
                  :id="id"
                  v-model="state.filtros.municipality"
                  class="tc-input"
                  inputmode="numeric"
                  maxlength="5"
                  :aria-describedby="describedBy"
                />
              </template>
            </BaseField>
          </div>

          <p class="text-xs text-slate-500">
            Se exige departamento o municipio: una consulta nacional de predios no es viable ni
            para ti ni para el servidor.
          </p>

          <BaseField label="Zona">
            <template #default="{ id }">
              <select :id="id" v-model="state.filtros.zone" class="tc-input">
                <option value="">Urbano y rural</option>
                <option value="urbano">Solo urbano</option>
                <option value="rural">Solo rural</option>
              </select>
            </template>
          </BaseField>

          <div class="grid grid-cols-2 gap-2">
            <BaseField label="Área mínima (m²)">
              <template #default="{ id }">
                <input :id="id" v-model="state.filtros.areaMin" class="tc-input" inputmode="decimal" />
              </template>
            </BaseField>
            <BaseField label="Área máxima (m²)">
              <template #default="{ id }">
                <input :id="id" v-model="state.filtros.areaMax" class="tc-input" inputmode="decimal" />
              </template>
            </BaseField>
          </div>

          <BaseField label="Área construida mínima (m²)">
            <template #default="{ id }">
              <input :id="id" v-model="state.filtros.builtMin" class="tc-input" inputmode="decimal" />
            </template>
          </BaseField>

          <BaseField
            label="Avalúo catastral máximo (COP)"
            hint="Recuerda: el avalúo catastral no es el precio de venta."
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                v-model="state.filtros.valueMax"
                class="tc-input"
                inputmode="numeric"
                :aria-describedby="describedBy"
              />
            </template>
          </BaseField>

          <BaseField label="Destino económico" hint="Separa varios con comas">
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                v-model="state.filtros.economicUse"
                class="tc-input"
                :aria-describedby="describedBy"
                placeholder="lote, habitacional, comercial"
              />
            </template>
          </BaseField>

          <BaseField label="Dirección contiene">
            <template #default="{ id }">
              <input :id="id" v-model="state.filtros.addressLike" class="tc-input" />
            </template>
          </BaseField>

          <BaseField label="Construcciones">
            <template #default="{ id }">
              <select :id="id" v-model="state.filtros.hasBuilding" class="tc-input">
                <option value="">No importa</option>
                <option value="si">Solo con construcción</option>
                <option value="no">Solo lotes sin construcción</option>
              </select>
            </template>
          </BaseField>

          <!-- Filtros espaciales de cercanía -->
          <fieldset class="rounded-md border border-slate-200 p-3">
            <legend class="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Cercanía
            </legend>

            <div v-for="(filter, index) in state.filtros.near" :key="index" class="mb-3 space-y-2">
              <select v-model="filter.layer" class="tc-input" aria-label="Capa de cercanía">
                <option v-for="layer in NEARBY_LAYERS" :key="layer" :value="layer">
                  {{ NEAR_LABELS[layer] }}
                </option>
              </select>

              <div class="flex items-center gap-2">
                <input
                  v-model.number="filter.maxM"
                  type="number"
                  min="10"
                  max="20000"
                  step="10"
                  class="tc-input"
                  aria-label="Distancia máxima en metros"
                />
                <span class="text-xs text-slate-600">m</span>
              </div>

              <input
                v-model="filter.classes"
                class="tc-input"
                placeholder="Subclases, separadas por comas (opcional)"
                aria-label="Subclases de la capa"
              />

              <label class="flex items-center gap-2 text-xs text-slate-700">
                <input v-model="filter.invert" type="checkbox" class="h-4 w-4 accent-brand-600" />
                Al contrario: excluir los predios que cumplen
              </label>

              <BaseButton variant="ghost" size="sm" @click="removeNear(index)">
                Quitar este filtro
              </BaseButton>
            </div>

            <BaseButton variant="secondary" size="sm" @click="addNear">
              Añadir filtro de cercanía
            </BaseButton>
          </fieldset>

          <BaseField label="Ordenar por">
            <template #default="{ id }">
              <select :id="id" v-model="state.filtros.sort" class="tc-input">
                <option v-for="option in SORT_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </template>
          </BaseField>

          <BaseField
            label="Máximo de resultados"
            :hint="`Tu plan permite hasta ${entitlements.maxQueryLimit}`"
          >
            <template #default="{ id, describedBy }">
              <input
                :id="id"
                v-model.number="state.filtros.limit"
                type="number"
                min="1"
                :max="entitlements.maxQueryLimit"
                class="tc-input"
                :aria-describedby="describedBy"
              />
            </template>
          </BaseField>

          <p v-if="!dslResult.ok" class="text-sm font-medium text-amber-800" role="status">
            {{ dslResult.message }}
          </p>

          <div class="flex gap-2">
            <BaseButton type="submit" :loading="isLoading" :disabled="!dslResult.ok">
              Buscar predios
            </BaseButton>
            <BaseButton variant="ghost" @click="state.filtros = emptyBuilder()">Limpiar</BaseButton>
          </div>
        </form>

        <!-- El DSL exacto que se enviará: transparencia y ayuda para quien use la API. -->
        <details class="mt-4 rounded-md border border-slate-200 bg-surface-muted p-2 text-xs">
          <summary class="cursor-pointer font-medium">Ver la consulta que se enviará</summary>
          <pre class="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">{{
            dslResult.ok ? JSON.stringify(dslResult.query, null, 2) : dslResult.message
          }}</pre>
        </details>
      </BaseCard>

      <!-- ── Mapa + tabla sincronizados ─────────────────────────────────────── -->
      <div class="space-y-3">
        <div class="h-72">
          <MapView height="100%" :overlay="overlay" show-legend />
        </div>

        <BaseCard
          :title="resultsTitle"
          :heading-level="2"
          :padded="false"
        >
          <template #actions>
            <BaseButton
              variant="secondary"
              size="sm"
              :disabled="rows.length === 0 || !entitlements.canExport"
              @click="downloadCsv"
            >
              Descargar CSV
            </BaseButton>
          </template>

          <LoadingSkeleton v-if="isLoading" :lines="6" class="p-4" />

          <EmptyState
            v-else-if="error"
            :title="MESSAGES.common.error"
            :body="error.message"
            icon="search"
            action-label="Reintentar"
            @action="run"
          />

          <EmptyState
            v-else-if="rows.length === 0"
            title="Todavía no hay resultados"
            body="Arma los filtros a la izquierda y pulsa «Buscar predios». Si ya buscaste y no salió nada, prueba a ampliar el área o a quitar un filtro de cercanía."
            icon="search"
          />

          <div v-else class="max-h-[28rem] overflow-auto">
            <table class="tc-table">
              <caption class="sr-only">
                Predios que cumplen los filtros, sincronizados con el mapa.
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <GlossaryTerm id="npn" label="Código predial" />
                  </th>
                  <th scope="col">Dirección</th>
                  <th scope="col">Zona</th>
                  <th scope="col">Área</th>
                  <th scope="col">Destino</th>
                  <th scope="col">Avalúo catastral</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.npn"
                  class="cursor-pointer"
                  :class="hoveredNpn === row.npn ? 'bg-brand-50' : 'hover:bg-surface-muted'"
                  @mouseenter="hoveredNpn = row.npn"
                  @mouseleave="hoveredNpn = null"
                  @click="$router.push({ name: 'parcel', params: { npn: row.npn } })"
                >
                  <th scope="row" class="whitespace-nowrap font-mono text-xs font-normal">
                    {{ row.npn }}
                  </th>
                  <td>{{ row.address ?? MESSAGES.common.notAvailable }}</td>
                  <td>{{ row.zoneLabel ?? MESSAGES.common.notAvailable }}</td>
                  <td class="tabular-nums">
                    {{ areaLabel(row.areaGeomM2) }}
                  </td>
                  <td>{{ row.economicUse ?? MESSAGES.common.notAvailable }}</td>
                  <td class="tabular-nums">
                    {{
                      copLabel(row.cadastralValue)
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <template #footer>
            <ProvenanceFooter :meta="meta" compact />
          </template>
        </BaseCard>

        <ResultActionBar
          :share-url="shareUrl()"
          share-title="Búsqueda de predios en TerraColombia"
          :formats="['csv', 'xlsx', 'geojson', 'gpkg']"
          :can-compare="false"
          @export="downloadCsv"
        />
      </div>
    </div>
  </div>
</template>
