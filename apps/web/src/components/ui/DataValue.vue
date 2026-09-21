<script setup lang="ts">
/**
 * Muestra **un** dato con su etiqueta.
 *
 * Tres reglas duras del producto, todas verificadas en `DataValue.spec.ts`:
 *  1. Sin procedencia no se muestra la cifra (regla 4 de CLAUDE.md). Si `sources` llega vacío,
 *     se renderiza un aviso, nunca el valor.
 *  2. `NO_DISPONIBLE` y `null` se muestran como "No disponible". **Jamás** como 0, "—" a secas
 *     ni un promedio inventado (regla 2).
 *  3. Todo dato económico catastral arrastra la advertencia de que el avalúo no es precio de
 *     venta (regla 5). Se activa con `format="currency"` o con `warnCadastralValue`.
 */
import { computed } from 'vue';
import {
  MESSAGES,
  NOT_AVAILABLE,
  formatArea,
  formatCop,
  formatDistance,
  formatNumber,
  isAvailable,
  type Maybe,
  type SourceRef,
} from '@terracolombia/shared';
import Tooltip from './Tooltip.vue';

defineEmits<{ (e: 'glossary', id: string): void }>();

type Format = 'text' | 'number' | 'area' | 'distance' | 'currency' | 'percent';

const props = withDefaults(
  defineProps<{
    label: string;
    value: Maybe<number | string>;
    /** Fuentes que respaldan esta cifra. Vacío ⇒ no se muestra el valor. */
    sources: SourceRef[];
    format?: Format;
    unit?: string;
    digits?: number;
    /** Término del glosario que explica la etiqueta. */
    glossaryId?: string;
    /** Fuerza la advertencia de avalúo catastral ≠ valor comercial. */
    warnCadastralValue?: boolean;
    /** Disposición: en línea (ficha) o apilada (tablero). */
    layout?: 'inline' | 'stacked';
    /** Texto de ayuda bajo el valor. */
    hint?: string;
  }>(),
  {
    format: 'text',
    unit: undefined,
    digits: 0,
    glossaryId: undefined,
    warnCadastralValue: false,
    layout: 'stacked',
    hint: undefined,
  },
);

const hasProvenance = computed(() => props.sources.length > 0);
const available = computed(() => isAvailable(props.value));

const formatted = computed<string>(() => {
  const value = props.value;
  if (!isAvailable(value)) return MESSAGES.common.notAvailable;

  if (typeof value === 'string') {
    // Algunas fuentes devuelven el centinela dentro de un texto: se respeta.
    return value === NOT_AVAILABLE ? MESSAGES.common.notAvailable : value;
  }

  switch (props.format) {
    case 'area':
      return formatArea(value);
    case 'distance':
      return formatDistance(value);
    case 'currency':
      return formatCop(value);
    case 'percent':
      return `${formatNumber(value, props.digits)} %`;
    case 'number':
      return `${formatNumber(value, props.digits)}${props.unit ? ` ${props.unit}` : ''}`;
    default:
      return String(value);
  }
});

const showsCadastralWarning = computed(
  () => available.value && (props.warnCadastralValue || props.format === 'currency'),
);
</script>

<template>
  <div
    :class="
      layout === 'inline'
        ? 'flex items-baseline justify-between gap-3 py-1.5'
        : 'flex flex-col gap-0.5 py-1.5'
    "
    data-testid="data-value"
  >
    <span class="tc-label flex items-center gap-1">
      <span>{{ label }}</span>
      <button
        v-if="glossaryId"
        type="button"
        class="text-slate-400 hover:text-brand-700"
        :aria-label="`Qué significa ${label}`"
        @click="$emit('glossary', glossaryId)"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.9 7.4a1.4 1.4 0 1 1 1.9 1.5c-.5.2-.9.7-.9 1.3v.5a.7.7 0 0 0 1.4 0v-.4c1.1-.4 1.9-1.4 1.9-2.6A2.8 2.8 0 0 0 7.5 7a.7.7 0 0 0 1.4.4Zm1.1 7.3a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z"
            clip-rule="evenodd"
          />
        </svg>
      </button>
    </span>

    <!-- Sin fuentes declaradas: no se muestra el número. -->
    <div v-if="!hasProvenance" class="text-sm text-slate-600" data-testid="data-value-no-source">
      <Tooltip
        text="No mostramos cifras sin fuente, fecha de corte y licencia declaradas."
      >
        <span class="cursor-help border-b border-dashed border-slate-400">
          {{ MESSAGES.common.notAvailableLong }}
        </span>
      </Tooltip>
    </div>

    <!-- Con fuentes: se muestra el valor o, honestamente, "No disponible". -->
    <div v-else class="text-sm">
      <span
        :class="
          available
            ? 'font-semibold tabular-nums text-slate-900'
            : 'italic text-slate-500'
        "
        data-testid="data-value-text"
      >
        {{ formatted }}
      </span>

      <p v-if="hint" class="mt-0.5 text-xs font-normal text-slate-500">{{ hint }}</p>

      <p
        v-if="showsCadastralWarning"
        class="mt-0.5 text-xs font-normal text-amber-800"
        data-testid="cadastral-warning"
      >
        {{ MESSAGES.parcel.cadastralValueWarning }}
      </p>
    </div>
  </div>
</template>
