<script setup lang="ts">
/**
 * Barra fija de resultados: **Guardar · Comparar · Exportar · Compartir enlace**.
 * PLAN.md §10.1 la exige en todo resultado, así que vive en el sistema de diseño y no
 * se reimplementa por vista.
 *
 * Respeta los permisos del plan: si el plan no incluye exportación, el botón no desaparece
 * —eso confundiría— sino que se deshabilita y dice qué plan lo incluye.
 */
import { computed, ref } from 'vue';
import { MESSAGES } from '@terracolombia/shared';
import { useEntitlements } from '@/composables/useEntitlements';
import { useShare } from '@/composables/useShare';
import type { ExportFormat } from '@/api/types';
import BaseButton from './BaseButton.vue';

const props = withDefaults(
  defineProps<{
    /** URL compartible del estado actual (la produce `useUrlState().shareUrl()`). */
    shareUrl: string;
    /** Título para la hoja de compartir nativa en móvil. */
    shareTitle?: string;
    canCompare?: boolean;
    canSave?: boolean;
    busy?: boolean;
    /** Formatos ofrecidos por esta vista; se intersecan con los del plan. */
    formats?: ExportFormat[];
  }>(),
  {
    shareTitle: 'TerraColombia',
    canCompare: true,
    canSave: true,
    busy: false,
    formats: () => ['pdf', 'xlsx', 'csv', 'geojson'],
  },
);

const emit = defineEmits<{
  (e: 'save'): void;
  (e: 'compare'): void;
  (e: 'export', format: ExportFormat): void;
}>();

const { entitlements, can, minPlanFor } = useEntitlements();
const { copied, share } = useShare();
const exportOpen = ref(false);

/** Solo se ofrecen formatos que la vista soporta **y** que el plan permite. */
const availableFormats = computed(() =>
  props.formats.filter((f) => entitlements.value.exportFormats.includes(f)),
);

const canExport = computed(() => can('canExport') && availableFormats.value.length > 0);
const exportHint = computed(() =>
  canExport.value ? undefined : `Disponible desde el plan ${minPlanFor('canExport') ?? 'Pro'}`,
);

const FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: 'PDF (informe)',
  xlsx: 'Excel (XLSX)',
  csv: 'CSV',
  geojson: 'GeoJSON',
  gpkg: 'GeoPackage',
  shp: 'Shapefile',
  kml: 'KML',
};

async function onShare(): Promise<void> {
  await share({ title: props.shareTitle, url: props.shareUrl });
}

function onExport(format: ExportFormat): void {
  exportOpen.value = false;
  emit('export', format);
}
</script>

<template>
  <div
    class="sticky bottom-0 z-overlay flex flex-wrap items-center gap-2 border-t border-slate-200
      bg-white/95 px-3 py-2 backdrop-blur"
    role="toolbar"
    aria-label="Acciones sobre este resultado"
    data-testid="result-action-bar"
  >
    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!canSave || busy"
      @click="emit('save')"
    >
      {{ MESSAGES.common.save }}
    </BaseButton>

    <BaseButton
      variant="secondary"
      size="sm"
      :disabled="!canCompare || busy"
      @click="emit('compare')"
    >
      {{ MESSAGES.common.compare }}
    </BaseButton>

    <div class="relative">
      <BaseButton
        variant="secondary"
        size="sm"
        :disabled="!canExport || busy"
        :aria-label="exportHint ? `${MESSAGES.common.export}. ${exportHint}` : MESSAGES.common.export"
        @click="exportOpen = !exportOpen"
      >
        {{ MESSAGES.common.export }}
      </BaseButton>

      <ul
        v-if="exportOpen && canExport"
        class="absolute bottom-full left-0 z-modal mb-1 min-w-44 rounded-md border border-slate-200
          bg-white py-1 shadow-panel"
        role="menu"
      >
        <li v-for="format in availableFormats" :key="format">
          <button
            type="button"
            role="menuitem"
            class="w-full px-3 py-1.5 text-left text-sm hover:bg-surface-muted"
            @click="onExport(format)"
          >
            {{ FORMAT_LABELS[format] }}
          </button>
        </li>
      </ul>
    </div>

    <BaseButton variant="secondary" size="sm" :disabled="busy" @click="onShare">
      {{ copied ? 'Enlace copiado' : MESSAGES.common.share }}
    </BaseButton>

    <p v-if="exportHint" class="ml-auto text-xs text-slate-500">{{ exportHint }}</p>

    <slot />
  </div>
</template>
