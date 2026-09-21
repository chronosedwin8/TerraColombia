<script setup lang="ts">
/**
 * Panel lateral del glosario. Lo abre cualquier `GlossaryTerm` de la aplicación a través del
 * store de interfaz, así que un término explicado en la ficha se explica igual en el mapa.
 */
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { useGlossary } from '@/composables/useGlossary';
import BaseModal from '@/components/ui/BaseModal.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const ui = useUiStore();
const { lookup } = useGlossary();

const entry = computed(() => (ui.glossaryPanelId ? lookup(ui.glossaryPanelId) : null));
</script>

<template>
  <BaseModal
    :open="entry !== null"
    :title="entry?.term ?? 'Glosario'"
    size="sm"
    @close="ui.closeGlossary()"
  >
    <template v-if="entry">
      <p class="text-sm leading-relaxed text-slate-800">{{ entry.plain }}</p>
      <p v-if="entry.detail" class="mt-3 text-sm leading-relaxed text-slate-700">
        {{ entry.detail }}
      </p>
      <p v-if="entry.source" class="mt-3 text-xs text-slate-500">
        Concepto según: {{ entry.source }}
      </p>
    </template>

    <template #footer>
      <div class="flex justify-between gap-2">
        <BaseButton variant="ghost" size="sm" to="/glosario" @click="ui.closeGlossary()">
          Ver todo el glosario
        </BaseButton>
        <BaseButton size="sm" @click="ui.closeGlossary()">Entendido</BaseButton>
      </div>
    </template>
  </BaseModal>
</template>
