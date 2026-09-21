<script setup lang="ts">
/**
 * Banda roja de datos de demostración.
 *
 * Regla 2 de CLAUDE.md: nada simulado puede pasar por real. Si `meta.synthetic` es cierto
 * —o si el entorno fuerza el aviso con `VITE_FORCE_DEMO_BANNER`— esta banda aparece pegada
 * arriba, es imposible de cerrar y acompaña a cualquier cifra en pantalla.
 */
import { computed } from 'vue';
import type { ResponseMeta } from '@terracolombia/shared';

const props = withDefaults(
  defineProps<{
    /** `meta` de la respuesta que está pintando la vista. */
    meta?: ResponseMeta | null;
    /** Alternativa directa al `meta`. */
    synthetic?: boolean;
    /** Detalle adicional: qué parte es de demostración. */
    detail?: string;
  }>(),
  { meta: null, synthetic: false, detail: undefined },
);

const forced = import.meta.env.VITE_FORCE_DEMO_BANNER === 'true';

const isSynthetic = computed(
  () => forced || props.synthetic || props.meta?.synthetic === true,
);

/** Datasets marcados como sintéticos, para nombrarlos explícitamente. */
const syntheticSources = computed(
  () => (props.meta?.sources ?? []).filter((s) => s.synthetic).map((s) => s.name),
);
</script>

<template>
  <div
    v-if="isSynthetic"
    class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-rose-900 bg-rose-700
      px-4 py-2 text-white"
    role="alert"
    data-testid="synthetic-banner"
  >
    <span
      class="rounded bg-white px-2 py-0.5 text-xs font-black uppercase tracking-wider text-rose-800"
    >
      Datos de demostración
    </span>
    <p class="text-sm">
      Lo que ves en pantalla <strong>no proviene de las fuentes oficiales</strong>. Sirve para
      probar la herramienta, no para tomar decisiones.
      <template v-if="detail"> {{ detail }}</template>
    </p>
    <p v-if="syntheticSources.length > 0" class="text-xs opacity-90">
      Conjuntos simulados: {{ syntheticSources.join(', ') }}.
    </p>
  </div>
</template>
