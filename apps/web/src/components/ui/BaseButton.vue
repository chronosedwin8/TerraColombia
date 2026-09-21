<script setup lang="ts">
/**
 * Botón base. Siempre renderiza texto (nunca solo un icono sin `aria-label`)
 * y expone el estado de carga con `aria-busy` para los lectores de pantalla.
 */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    disabled?: boolean;
    loading?: boolean;
    /** Convierte el botón en enlace de router sin perder el estilo. */
    to?: RouteLocationRaw;
    /** Enlace externo. Se abre en pestaña nueva con `rel` seguro. */
    href?: string;
    type?: 'button' | 'submit' | 'reset';
    block?: boolean;
    /** Obligatorio cuando el contenido visible no describe la acción. */
    ariaLabel?: string;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
    to: undefined,
    href: undefined,
    type: 'button',
    block: false,
    ariaLabel: undefined,
  },
);

defineEmits<{ (e: 'click', event: MouseEvent): void }>();

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary:
    'bg-white text-brand-800 border border-brand-300 hover:bg-brand-50 disabled:text-brand-800/50',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-semaphore-blocker text-white hover:brightness-110 disabled:opacity-60',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
  lg: 'text-base px-5 py-3 gap-2.5',
};

const classes = computed(() => [
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  'disabled:cursor-not-allowed',
  VARIANTS[props.variant],
  SIZES[props.size],
  props.block ? 'w-full' : '',
]);

const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <RouterLink
    v-if="to && !isDisabled"
    :to="to"
    :class="classes"
    :aria-label="ariaLabel"
  >
    <slot />
  </RouterLink>

  <a
    v-else-if="href && !isDisabled"
    :href="href"
    target="_blank"
    rel="noreferrer noopener"
    :class="classes"
    :aria-label="ariaLabel"
  >
    <slot />
  </a>

  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="isDisabled"
    :aria-busy="loading ? 'true' : 'false'"
    :aria-label="ariaLabel"
    @click="$emit('click', $event)"
  >
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    </svg>
    <slot />
  </button>
</template>
