<script setup lang="ts">
/**
 * Página no encontrada. Estado vacío honesto: se dice qué pasó y se ofrecen las tres puertas
 * de entrada del producto, no un callejón sin salida.
 */
import { useRoute } from 'vue-router';
import { MESSAGES } from '@terracolombia/shared';
import BaseCard from '@/components/ui/BaseCard.vue';
import BaseButton from '@/components/ui/BaseButton.vue';

const route = useRoute();
</script>

<template>
  <div class="mx-auto max-w-lg p-6">
    <BaseCard :title="MESSAGES.errors.notFound" :heading-level="1">
      <p class="text-sm text-slate-700">
        La dirección <code class="break-all font-mono text-xs">{{ route.fullPath }}</code> no
        corresponde a ninguna pantalla de TerraColombia. Puede ser un enlace viejo o un error de
        escritura.
      </p>

      <div class="mt-4 space-y-2">
        <BaseButton block to="/">Ir al mapa</BaseButton>
        <BaseButton block variant="secondary" to="/glosario">Ver el glosario</BaseButton>
        <BaseButton block variant="secondary" to="/desarrolladores">
          Documentación de la API
        </BaseButton>
      </div>
    </BaseCard>
  </div>
</template>
