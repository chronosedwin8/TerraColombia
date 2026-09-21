<script setup lang="ts">
/**
 * Glosario completo. Cada término técnico que aparece en la interfaz tiene entrada aquí
 * (principio «todo se explica», PLAN.md §10.1). La URL lleva el filtro y el ancla, así que un
 * enlace a una definición concreta se puede pegar en un correo.
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useGlossary } from '@/composables/useGlossary';
import { stringCodec, useUrlState } from '@/composables/useUrlState';
import BaseCard from '@/components/ui/BaseCard.vue';
import EmptyState from '@/components/ui/EmptyState.vue';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue';

const route = useRoute();
const { entries, isLoading } = useGlossary();
const { state } = useUrlState({ q: { default: '', codec: stringCodec } });

const highlighted = ref<string | null>(null);

onMounted(() => {
  // Un enlace del tipo /glosario#npn resalta y desplaza hasta ese término.
  const hash = route.hash.replace(/^#/, '');
  if (hash.length === 0) return;
  highlighted.value = hash;
  requestAnimationFrame(() => {
    document.getElementById(hash)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
});

/** Búsqueda sin tildes: «avaluo» encuentra «avalúo». */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const filtered = computed(() => {
  const term = fold(state.q.trim());
  if (term.length === 0) return entries.value;
  return entries.value.filter(
    (entry) =>
      fold(entry.term).includes(term) ||
      fold(entry.plain).includes(term) ||
      fold(entry.detail ?? '').includes(term),
  );
});
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-3 p-3">
    <header>
      <h1 class="text-xl font-semibold">Glosario</h1>
      <p class="mt-0.5 text-sm text-slate-600">
        Todo lo que aparece en TerraColombia está explicado en español claro. Si un término no
        está aquí, es un error nuestro: avísanos.
      </p>
    </header>

    <label class="block">
      <span class="sr-only">Buscar un término</span>
      <input
        v-model="state.q"
        type="search"
        class="tc-input"
        placeholder="Buscar un término (por ejemplo: avalúo, vocación, H3)"
      />
    </label>

    <p class="text-xs text-slate-500" aria-live="polite">
      {{ filtered.length }} de {{ entries.length }} términos.
    </p>

    <LoadingSkeleton v-if="isLoading && entries.length === 0" :lines="8" />

    <EmptyState
      v-else-if="filtered.length === 0"
      title="No encontramos ese término"
      body="Prueba con una palabra más corta o revisa la lista completa borrando la búsqueda."
      icon="search"
      action-label="Ver todos"
      @action="state.q = ''"
    />

    <ul v-else class="space-y-2">
      <li v-for="entry in filtered" :id="entry.id" :key="entry.id">
        <BaseCard
          :title="entry.term"
          :heading-level="2"
          :class="highlighted === entry.id ? 'ring-2 ring-brand-500' : ''"
        >
          <p class="text-sm leading-relaxed text-slate-800">{{ entry.plain }}</p>
          <p v-if="entry.detail" class="mt-2 text-sm leading-relaxed text-slate-700">
            {{ entry.detail }}
          </p>
          <p v-if="entry.source" class="mt-2 text-xs text-slate-500">
            Concepto según: {{ entry.source }}
          </p>
        </BaseCard>
      </li>
    </ul>
  </div>
</template>
