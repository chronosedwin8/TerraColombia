<script setup lang="ts">
/**
 * Raíz de la aplicación. Monta lo que debe existir en cualquier pantalla:
 * banda de datos de demostración, cabecera, el punto de vista del router, el panel del
 * glosario, los avisos y el recorrido de un minuto.
 */
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { useUiStore } from '@/stores/ui';
import { useAuthStore } from '@/stores/auth';
import AppHeader from '@/components/AppHeader.vue';
import GlossaryPanel from '@/components/GlossaryPanel.vue';
import Onboarding from '@/components/Onboarding.vue';
import SyntheticDataBanner from '@/components/ui/SyntheticDataBanner.vue';
import ToastHost from '@/components/ui/ToastHost.vue';

const ui = useUiStore();
const auth = useAuthStore();

function onResize(): void {
  ui.setViewportWidth(window.innerWidth);
}

onMounted(() => {
  ui.applyTheme();
  onResize();
  window.addEventListener('resize', onResize, { passive: true });

  // El recorrido de 60 s solo se ofrece la primera vez y nunca bloquea la navegación.
  if (!ui.onboardingDone) ui.startTour();

  void auth.bootstrap();
});

onUnmounted(() => {
  window.removeEventListener('resize', onResize);
});
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col">
    <!--
      Banda global de demostración: se activa con VITE_FORCE_DEMO_BANNER en entornos de prueba.
      Cada vista añade además la suya según el `meta.synthetic` de su propia respuesta.
    -->
    <SyntheticDataBanner />

    <AppHeader />

    <main id="contenido" class="min-h-0 flex-1">
      <RouterView v-slot="{ Component }">
        <!-- `key` por ruta: dos fichas distintas no comparten estado interno. -->
        <component :is="Component" />
      </RouterView>
    </main>

    <GlossaryPanel />
    <Onboarding />
    <ToastHost />
  </div>
</template>
