<script setup lang="ts">
/**
 * Selector de departamento o municipio con búsqueda por nombre.
 *
 * POR QUÉ EXISTE
 *
 * El buscador avanzado pedía el código DIVIPOLA a mano: «Código de 2 dígitos» y «Código
 * DIVIPOLA de 5 dígitos». Nadie se sabe que Soledad es 08758, así que el filtro obligatorio
 * del formulario era justo el que el usuario no podía rellenar. Aquí se escribe el nombre y
 * el código lo pone el componente.
 *
 * Se escribe a mano y no con una librería de terceros porque el patrón de combobox accesible
 * es corto y la dependencia añadiría peso al paquete del mapa, que ya es el más grande.
 *
 * Accesibilidad (WCAG 2.1): el campo es `role="combobox"` con `aria-expanded`,
 * `aria-controls` y `aria-activedescendant`; la lista es `role="listbox"` y cada opción
 * `role="option"` con `aria-selected`. Se maneja con flechas, Enter y Escape, y el elemento
 * activo se anuncia al lector de pantalla.
 */
import { computed, nextTick, ref, watch } from 'vue';

export interface PlaceOption {
  /** Código DIVIPOLA: dos dígitos para departamento, cinco para municipio. */
  code: string;
  name: string;
  /** Segunda línea: el departamento del municipio, o su región. */
  context?: string | null;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    options: readonly PlaceOption[];
    label: string;
    /** Texto de ayuda bajo el campo. */
    hint?: string | null;
    placeholder?: string;
    disabled?: boolean;
    /** Mensaje cuando no hay opciones que ofrecer todavía. */
    emptyHint?: string | null;
    id?: string;
  }>(),
  {
    hint: null,
    placeholder: 'Escribe para buscar…',
    disabled: false,
    emptyHint: null,
    id: undefined,
  },
);

const emit = defineEmits<{ 'update:modelValue': [string] }>();

const inputId = computed(() => props.id ?? `place-${Math.random().toString(36).slice(2, 8)}`);
const listId = computed(() => `${inputId.value}-lista`);

const query = ref('');
const open = ref(false);
const activeIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

/** Opción actualmente elegida, si el valor corresponde a alguna de la lista. */
const selected = computed(() => props.options.find((o) => o.code === props.modelValue) ?? null);

/*
 * Se busca sin tildes y sin mayúsculas: en Colombia «Chía», «Chia» y «CHIA» tienen que
 * encontrar lo mismo, y nadie escribe las tildes en un buscador.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const filtered = computed(() => {
  const q = fold(query.value);
  if (q === '') return props.options.slice(0, 80);
  // También se busca por código: quien SÍ se lo sabe no tiene que escribir el nombre.
  return props.options
    .filter((o) => fold(o.name).includes(q) || o.code.startsWith(q))
    .slice(0, 80);
});

/** Lo que se ve en el campo cuando está cerrado: el nombre elegido, no el código. */
const displayValue = computed(() => {
  if (open.value) return query.value;
  return selected.value ? `${selected.value.name} (${selected.value.code})` : '';
});

function onInput(event: Event): void {
  query.value = (event.target as HTMLInputElement).value;
  open.value = true;
  activeIndex.value = filtered.value.length > 0 ? 0 : -1;
}

function choose(option: PlaceOption): void {
  emit('update:modelValue', option.code);
  query.value = '';
  open.value = false;
  activeIndex.value = -1;
}

function clear(): void {
  emit('update:modelValue', '');
  query.value = '';
  activeIndex.value = -1;
  void nextTick(() => inputRef.value?.focus());
}

function onFocus(): void {
  if (props.disabled) return;
  open.value = true;
  query.value = '';
}

function onBlur(): void {
  // Se cierra con retardo para que el clic en una opción llegue antes que el cierre.
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  const lista = filtered.value;

  if (event.key === 'Escape') {
    open.value = false;
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    open.value = true;
    if (lista.length === 0) return;
    const paso = event.key === 'ArrowDown' ? 1 : -1;
    activeIndex.value = (activeIndex.value + paso + lista.length) % lista.length;
    return;
  }
  if (event.key === 'Enter') {
    const opcion = activeIndex.value >= 0 ? lista[activeIndex.value] : lista[0];
    if (opcion && open.value) {
      event.preventDefault();
      choose(opcion);
    }
    return;
  }
  if (event.key === 'Backspace' && query.value === '' && props.modelValue !== '') {
    // Borrar con el campo vacío deshace la selección: es lo que espera quien navega
    // solo con teclado y no ve el botón de limpiar.
    clear();
  }
}

// Si cambia la lista de opciones —por ejemplo al elegir otro departamento— y el valor
// actual ya no está en ella, se limpia: dejarlo sería mostrar un código que no aplica.
watch(
  () => props.options,
  (opciones) => {
    if (props.modelValue !== '' && !opciones.some((o) => o.code === props.modelValue)) {
      emit('update:modelValue', '');
    }
  },
);
</script>

<template>
  <div class="relative">
    <label :for="inputId" class="tc-label">{{ label }}</label>

    <div class="relative mt-1">
      <input
        :id="inputId"
        ref="inputRef"
        type="text"
        role="combobox"
        autocomplete="off"
        :aria-expanded="open"
        :aria-controls="listId"
        :aria-activedescendant="
          open && activeIndex >= 0 ? `${listId}-opcion-${activeIndex}` : undefined
        "
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        class="tc-input pr-8"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKeydown"
      />

      <button
        v-if="modelValue !== '' && !disabled"
        type="button"
        class="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400
          hover:bg-slate-100 hover:text-slate-700"
        :aria-label="`Quitar ${label.toLowerCase()}`"
        @click="clear"
      >
        <svg class="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <p v-if="hint" class="mt-1 text-xs text-slate-500">{{ hint }}</p>

    <ul
      v-if="open && filtered.length > 0"
      :id="listId"
      role="listbox"
      :aria-label="label"
      class="absolute left-0 right-0 z-modal mt-1 max-h-72 overflow-y-auto rounded-md border
        border-slate-200 bg-white py-1 shadow-panel"
    >
      <li
        v-for="(option, index) in filtered"
        :id="`${listId}-opcion-${index}`"
        :key="option.code"
        role="option"
        :aria-selected="option.code === modelValue"
        class="cursor-pointer px-3 py-1.5 text-sm"
        :class="index === activeIndex ? 'bg-brand-50' : 'hover:bg-surface-muted'"
        @mousedown.prevent="choose(option)"
        @mouseenter="activeIndex = index"
      >
        <span class="font-medium">{{ option.name }}</span>
        <span class="ml-1.5 text-xs text-slate-500">{{ option.code }}</span>
        <span v-if="option.context" class="block text-xs text-slate-500">{{ option.context }}</span>
      </li>
    </ul>

    <!-- Estado vacío: se dice por qué no hay nada que elegir, no se deja el hueco mudo. -->
    <div
      v-else-if="open && !disabled"
      class="absolute left-0 right-0 z-modal mt-1 rounded-md border border-slate-200 bg-white
        px-3 py-2 text-xs text-slate-600 shadow-panel"
    >
      {{
        options.length === 0
          ? (emptyHint ?? 'Todavía no hay opciones para elegir.')
          : `Ningún resultado para «${query}».`
      }}
    </div>
  </div>
</template>
