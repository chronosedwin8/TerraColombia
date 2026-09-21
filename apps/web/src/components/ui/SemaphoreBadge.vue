<script setup lang="ts">
/**
 * Semáforo. **Regla de accesibilidad del producto (PLAN.md §10.1): nunca solo color.**
 *
 * Cada estado lleva:
 *  - un texto en español siempre visible (no un `title`, no un `aria-label` a secas),
 *  - un icono con forma propia (círculo ✓, triángulo !, octágono ✕, rombo ?),
 *  - contraste AA sobre su fondo.
 *
 * Quien no distinga colores, quien use lector de pantalla y quien imprima en blanco y negro
 * reciben la misma información. Esto lo verifica `SemaphoreBadge.spec.ts`.
 */
import { computed } from 'vue';
import { MESSAGES } from '@terracolombia/shared';
import type { SemaphoreStatus } from './types';

type Canonical = 'ok' | 'caution' | 'blocker' | 'unknown';

const props = withDefaults(
  defineProps<{
    status: SemaphoreStatus;
    /** Texto propio. Si no se da, se usa el rótulo estándar del estado. */
    label?: string;
    size?: 'sm' | 'md' | 'lg';
    /** Explicación corta bajo el rótulo. */
    description?: string;
  }>(),
  { label: undefined, size: 'md', description: undefined },
);

const TO_CANONICAL: Record<SemaphoreStatus, Canonical> = {
  ok: 'ok',
  favorable: 'ok',
  caution: 'caution',
  condicionado: 'caution',
  blocker: 'blocker',
  desfavorable: 'blocker',
  unknown: 'unknown',
  sin_datos: 'unknown',
};

/** Rótulos por omisión. Los de aptitud salen de MESSAGES para no duplicar cadenas. */
const DEFAULT_LABELS: Record<SemaphoreStatus, string> = {
  ok: 'Sin restricciones',
  favorable: MESSAGES.suitability.favorable,
  caution: 'Con condiciones',
  condicionado: MESSAGES.suitability.condicionado,
  blocker: 'Restricción fuerte',
  desfavorable: MESSAGES.suitability.desfavorable,
  unknown: MESSAGES.common.notAvailable,
  sin_datos: MESSAGES.suitability.sin_datos,
};

/** Lectura larga para el lector de pantalla: dice el estado antes del rótulo. */
const SR_PREFIX: Record<Canonical, string> = {
  ok: 'Estado favorable:',
  caution: 'Estado con condiciones:',
  blocker: 'Estado desfavorable:',
  unknown: 'Estado sin datos:',
};

const STYLES: Record<Canonical, string> = {
  ok: 'bg-emerald-50 text-emerald-900 border-emerald-300',
  caution: 'bg-amber-50 text-amber-900 border-amber-400',
  blocker: 'bg-rose-50 text-rose-900 border-rose-400',
  unknown: 'bg-slate-100 text-slate-700 border-slate-300',
};

const ICON_COLOR: Record<Canonical, string> = {
  ok: 'text-semaphore-ok',
  caution: 'text-semaphore-caution',
  blocker: 'text-semaphore-blocker',
  unknown: 'text-semaphore-unknown',
};

const canonical = computed<Canonical>(() => TO_CANONICAL[props.status]);
const text = computed(() => props.label ?? DEFAULT_LABELS[props.status]);
const srText = computed(() => `${SR_PREFIX[canonical.value]} ${text.value}`);

const sizeClasses = computed(() => {
  if (props.size === 'sm') return 'px-2 py-0.5 text-xs gap-1.5';
  if (props.size === 'lg') return 'px-4 py-2 text-base gap-2.5';
  return 'px-3 py-1.5 text-sm gap-2';
});

const iconSize = computed(() => (props.size === 'sm' ? 'h-3.5 w-3.5' : props.size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'));
</script>

<template>
  <span
    class="inline-flex flex-col items-start rounded-md border font-medium"
    :class="[STYLES[canonical], sizeClasses]"
    data-testid="semaphore-badge"
    :data-status="canonical"
  >
    <span class="inline-flex items-center" :class="size === 'sm' ? 'gap-1.5' : 'gap-2'">
      <!-- Forma distinta por estado: la información no depende del color. -->
      <svg
        :class="[iconSize, ICON_COLOR[canonical]]"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
      >
        <template v-if="canonical === 'ok'">
          <circle cx="12" cy="12" r="10" />
          <path
            d="m7.5 12.4 3 3 6-6.4"
            fill="none"
            stroke="#ffffff"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </template>
        <template v-else-if="canonical === 'caution'">
          <path d="M12 2.5 22.5 21H1.5L12 2.5Z" />
          <path
            d="M12 9v5.2"
            fill="none"
            stroke="#ffffff"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <circle cx="12" cy="17.6" r="1.3" fill="#ffffff" />
        </template>
        <template v-else-if="canonical === 'blocker'">
          <path d="M8 1.5h8L22.5 8v8L16 22.5H8L1.5 16V8L8 1.5Z" />
          <path
            d="m8.6 8.6 6.8 6.8M15.4 8.6l-6.8 6.8"
            fill="none"
            stroke="#ffffff"
            stroke-width="2.2"
            stroke-linecap="round"
          />
        </template>
        <template v-else>
          <path d="M12 1.8 22.2 12 12 22.2 1.8 12 12 1.8Z" />
          <path
            d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.6c-.6.3-.9.8-.9 1.5v.5"
            fill="none"
            stroke="#ffffff"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="12" cy="17.2" r="1.2" fill="#ffffff" />
        </template>
      </svg>

      <!-- El texto SIEMPRE se renderiza: es la garantía de que el color no es el único canal. -->
      <span class="sr-only">{{ srText }}</span>
      <span aria-hidden="true" data-testid="semaphore-text">{{ text }}</span>
    </span>

    <span v-if="description" class="mt-0.5 pl-6 text-xs font-normal opacity-90">
      {{ description }}
    </span>
  </span>
</template>
