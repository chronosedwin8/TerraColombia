<script setup lang="ts">
/**
 * Cabecera y navegación principal. En móvil se reduce a logo + menú, porque el mapa manda.
 * El menú es un `<nav>` con lista: los lectores de pantalla pueden saltarlo de una vez.
 */
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import BaseButton from '@/components/ui/BaseButton.vue';
import BaseBadge from '@/components/ui/BaseBadge.vue';

const auth = useAuthStore();
const ui = useUiStore();
const menuOpen = ref(false);

interface NavItem {
  to: string;
  label: string;
  /** Solo se muestra con sesión iniciada. */
  private?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Explorar' },
  { to: '/buscar', label: 'Buscar predios' },
  { to: '/zona', label: 'Analizar zona' },
  { to: '/localizacion', label: '¿Dónde abro?' },
  { to: '/cambios', label: 'Cambios' },
  { to: '/observatorio', label: 'Observatorio' },
  { to: '/proyectos', label: 'Mis proyectos', private: true },
];

const items = computed(() => NAV.filter((item) => !item.private || auth.isAuthenticated));

const themeLabel = computed(() =>
  ui.theme === 'dark' ? 'Tema oscuro' : ui.theme === 'light' ? 'Tema claro' : 'Tema del sistema',
);

function cycleTheme(): void {
  ui.setTheme(ui.theme === 'system' ? 'light' : ui.theme === 'light' ? 'dark' : 'system');
}
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div class="mx-auto flex max-w-[110rem] items-center gap-3 px-3 py-2">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2 font-semibold">
        <svg class="h-7 w-7" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="6" fill="#1c4f42" />
          <path d="M6 22.5 12.5 11l5 8 3-4.5L26 22.5Z" fill="#76b8a3" />
          <circle cx="11" cy="8.5" r="2.5" fill="#d4e9e1" />
        </svg>
        <span class="hidden sm:inline">TerraColombia</span>
      </RouterLink>

      <nav class="hidden flex-1 md:block" aria-label="Navegación principal">
        <ul class="flex flex-wrap items-center gap-1">
          <li v-for="item in items" :key="item.to">
            <RouterLink
              :to="item.to"
              class="rounded px-2.5 py-1.5 text-sm text-slate-700 hover:bg-surface-muted"
              active-class="bg-brand-50 font-medium text-brand-900"
            >
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <BaseBadge v-if="auth.isAuthenticated" tone="brand" size="sm">
          Plan {{ auth.planName }}
        </BaseBadge>

        <button
          type="button"
          class="rounded px-2 py-1.5 text-xs text-slate-600 hover:bg-surface-muted"
          :aria-label="`Cambiar tema. Actual: ${themeLabel}`"
          @click="cycleTheme"
        >
          {{ themeLabel }}
        </button>

        <template v-if="auth.isAuthenticated">
          <BaseButton variant="ghost" size="sm" to="/cuenta/plan">Cuenta</BaseButton>
          <BaseButton variant="secondary" size="sm" @click="auth.logout()">Salir</BaseButton>
        </template>
        <template v-else>
          <BaseButton variant="ghost" size="sm" to="/ingresar">Ingresar</BaseButton>
          <BaseButton size="sm" to="/registro">Crear cuenta</BaseButton>
        </template>

        <button
          type="button"
          class="rounded p-2 md:hidden"
          :aria-expanded="menuOpen"
          aria-controls="tc-mobile-nav"
          aria-label="Abrir menú"
          @click="menuOpen = !menuOpen"
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>

    <nav
      v-if="menuOpen"
      id="tc-mobile-nav"
      class="border-t border-slate-200 md:hidden"
      aria-label="Navegación principal (móvil)"
    >
      <ul class="divide-y divide-slate-100">
        <li v-for="item in items" :key="item.to">
          <RouterLink
            :to="item.to"
            class="block px-4 py-3 text-sm"
            active-class="bg-brand-50 font-medium text-brand-900"
            @click="menuOpen = false"
          >
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </header>
</template>
