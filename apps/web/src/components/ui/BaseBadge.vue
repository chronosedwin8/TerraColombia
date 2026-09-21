<script setup lang="ts">
/** Insignia informativa. Nunca transmite estado crítico por color: para eso está SemaphoreBadge. */
import { computed } from 'vue';

type Tone = 'neutral' | 'brand' | 'info' | 'warning' | 'danger' | 'success';

const props = withDefaults(defineProps<{ tone?: Tone; size?: 'sm' | 'md' }>(), {
  tone: 'neutral',
  size: 'sm',
});

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  brand: 'bg-brand-50 text-brand-800 border-brand-200',
  info: 'bg-sky-50 text-sky-900 border-sky-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-rose-50 text-rose-900 border-rose-200',
  success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
};

const classes = computed(() => [
  'inline-flex items-center gap-1 rounded-full border font-medium',
  props.size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
  TONES[props.tone],
]);
</script>

<template>
  <span :class="classes"><slot /></span>
</template>
