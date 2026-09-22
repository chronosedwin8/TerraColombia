<script setup lang="ts">
/**
 * Recorrido interactivo de 60 segundos (PLAN.md §10.1).
 *
 * Cuatro pasos de unos 15 s, cada uno con un ejemplo precargado que se puede abrir de
 * inmediato. Se muestra una sola vez (queda registrado en `localStorage`) y siempre se puede
 * saltar: nunca bloquea el producto.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { GUIDED_EXAMPLES } from '@/mocks/examples';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseModal from '@/components/ui/BaseModal.vue';
import type { OnboardingStep } from './types';

const ui = useUiStore();
const router = useRouter();
const route = useRoute();

/**
 * En ingresar y registro no se abre: el recorrido es sobre el mapa, y un diálogo modal
 * encima del formulario deja la página inerte (el navegador ignora lo que se teclea
 * detrás de un `<dialog>` modal). Se detectó con el recorrido automatizado de la interfaz,
 * que no conseguía escribir el correo.
 */
const AUTH_PATHS = ['/ingresar', '/registro'];
const allowedHere = computed(() => !AUTH_PATHS.includes(route.path));

const STEPS: OnboardingStep[] = [
  {
    id: 'ask',
    title: 'Pregúntale al territorio',
    body: 'Escribe una dirección, un código predial, un municipio o un lugar. También puedes hacer clic en el mapa: te decimos qué hay ahí.',
    seconds: 15,
    ...(GUIDED_EXAMPLES[0] ? { example: { label: GUIDED_EXAMPLES[0].label, to: GUIDED_EXAMPLES[0].to } } : {}),
  },
  {
    id: 'layers',
    title: 'Enciende las capas que te importan',
    body: 'Predios, colegios, salud, suelos, amenazas y áreas protegidas. Cada capa trae su leyenda, su unidad y su fuente con fecha de corte.',
    seconds: 15,
    ...(GUIDED_EXAMPLES[1] ? { example: { label: GUIDED_EXAMPLES[1].label, to: GUIDED_EXAMPLES[1].to } } : {}),
  },
  {
    id: 'area',
    title: 'Dibuja una zona y compárala',
    body: 'Traza un polígono o un radio y recibe un tablero con predios, población, equipamientos y riesgos. Puedes comparar hasta cuatro zonas lado a lado.',
    seconds: 15,
    ...(GUIDED_EXAMPLES[2] ? { example: { label: GUIDED_EXAMPLES[2].label, to: GUIDED_EXAMPLES[2].to } } : {}),
  },
  {
    id: 'decide',
    title: 'Decide con criterios tuyos',
    body: 'En «¿Dónde abro mi negocio?» tú fijas los pesos. Nosotros mostramos los indicadores y su desglose: no te decimos qué elegir, te damos con qué elegir.',
    seconds: 15,
    ...(GUIDED_EXAMPLES[3] ? { example: { label: GUIDED_EXAMPLES[3].label, to: GUIDED_EXAMPLES[3].to } } : {}),
  },
];

const step = computed(() => (ui.tourStep >= 0 ? STEPS[ui.tourStep] ?? null : null));
const example = computed(() => step.value?.example ?? null);
const totalSeconds = computed(() => STEPS.reduce((sum, s) => sum + s.seconds, 0));

function next(): void {
  ui.nextTourStep(STEPS.length);
}

function openExample(to: string): void {
  ui.finishTour();
  void router.push(to);
}
</script>

<template>
  <BaseModal
    :open="ui.tourActive && step !== null && allowedHere"
    title="Recorrido de un minuto"
    size="md"
    @close="ui.finishTour()"
  >
    <template v-if="step">
      <p class="text-xs text-slate-500">
        Paso {{ ui.tourStep + 1 }} de {{ STEPS.length }} · unos {{ totalSeconds }} segundos en total
      </p>

      <h3 class="mt-2 text-lg font-semibold">{{ step.title }}</h3>
      <p class="mt-1.5 text-sm leading-relaxed text-slate-700">{{ step.body }}</p>

      <div v-if="example" class="mt-4 rounded-md border border-brand-200 bg-brand-50 p-3">
        <p class="text-xs font-medium text-brand-900">Pruébalo con un ejemplo</p>
        <BaseButton variant="secondary" size="sm" class="mt-1.5" @click="openExample(example.to)">
          {{ example.label }}
        </BaseButton>
      </div>

      <!-- Barra de avance: da la sensación de que esto se acaba pronto. -->
      <div class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          class="h-full rounded-full bg-brand-600 transition-[width] duration-300"
          :style="{ width: `${((ui.tourStep + 1) / STEPS.length) * 100}%` }"
          role="presentation"
        />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-2">
        <BaseButton variant="ghost" size="sm" @click="ui.finishTour()">Saltar</BaseButton>
        <BaseButton size="sm" @click="next">
          {{ ui.tourStep + 1 >= STEPS.length ? 'Empezar' : 'Siguiente' }}
        </BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
