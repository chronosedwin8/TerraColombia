<script setup lang="ts">
/** Tarjeta de contenido. El encabezado es opcional y admite acciones a la derecha. */
withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
    /**
     * Nivel semántico del título. 1 solo cuando la tarjeta ES el título de la página
     * (por ejemplo, la pantalla de error o de inicio de sesión): debe haber un único h1.
     */
    headingLevel?: 1 | 2 | 3 | 4;
    padded?: boolean;
  }>(),
  { title: undefined, subtitle: undefined, headingLevel: 3, padded: true },
);
</script>

<template>
  <section class="tc-card overflow-hidden">
    <header
      v-if="title || $slots.actions"
      class="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3"
    >
      <div class="min-w-0">
        <component :is="`h${headingLevel}`" v-if="title" class="truncate text-base font-semibold">
          {{ title }}
        </component>
        <p v-if="subtitle" class="mt-0.5 text-sm text-slate-600">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="shrink-0"><slot name="actions" /></div>
    </header>

    <div :class="padded ? 'p-4' : ''">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="border-t border-slate-200 bg-surface-muted px-4 py-3">
      <slot name="footer" />
    </footer>
  </section>
</template>
