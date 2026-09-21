/**
 * Preferencias de interfaz: tema, panel inferior móvil, onboarding y avisos.
 * Lo que sobrevive a la recarga se guarda en `localStorage`; nada de esto es dato personal.
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ThemePreference = 'light' | 'dark' | 'system';
/** Alturas del panel inferior deslizable en móvil (PLAN.md §10.1). */
export type SheetState = 'hidden' | 'peek' | 'half' | 'full';

const STORAGE_KEYS = {
  theme: 'tc:theme',
  onboarding: 'tc:onboarding-done',
  sheet: 'tc:sheet-state',
} as const;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Modo privado o almacenamiento bloqueado: la preferencia solo dura la sesión.
  }
}

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

let toastSeq = 0;

export const useUiStore = defineStore('ui', () => {
  const stored = readStorage(STORAGE_KEYS.theme);
  const theme = ref<ThemePreference>(
    stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system',
  );

  const sheetState = ref<SheetState>('peek');
  const layerPanelOpen = ref(false);
  const glossaryPanelId = ref<string | null>(null);
  const toasts = ref<Toast[]>([]);

  const onboardingDone = ref(readStorage(STORAGE_KEYS.onboarding) === '1');
  /** Paso actual del recorrido guiado de 60 s; -1 = no está activo. */
  const tourStep = ref(-1);
  const tourActive = computed(() => tourStep.value >= 0);

  /** Ancho de ventana para decidir móvil/escritorio sin depender de CSS. */
  const viewportWidth = ref(typeof window === 'undefined' ? 1280 : window.innerWidth);
  const isMobile = computed(() => viewportWidth.value < 768);

  function applyTheme(): void {
    if (typeof document === 'undefined') return;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
    const effective = theme.value === 'system' ? (prefersDark ? 'dark' : 'light') : theme.value;
    document.documentElement.dataset['theme'] = effective;
  }

  watch(theme, (value) => {
    writeStorage(STORAGE_KEYS.theme, value);
    applyTheme();
  });

  function setTheme(value: ThemePreference): void {
    theme.value = value;
  }

  function setSheetState(value: SheetState): void {
    sheetState.value = value;
    writeStorage(STORAGE_KEYS.sheet, value);
  }

  function cycleSheet(): void {
    const order: SheetState[] = ['peek', 'half', 'full'];
    const index = order.indexOf(sheetState.value);
    const next = order[(index + 1) % order.length];
    if (next) setSheetState(next);
  }

  function startTour(): void {
    tourStep.value = 0;
  }

  function nextTourStep(total: number): void {
    if (tourStep.value + 1 >= total) {
      finishTour();
      return;
    }
    tourStep.value += 1;
  }

  function finishTour(): void {
    tourStep.value = -1;
    onboardingDone.value = true;
    writeStorage(STORAGE_KEYS.onboarding, '1');
  }

  function openGlossary(id: string): void {
    glossaryPanelId.value = id;
  }

  function closeGlossary(): void {
    glossaryPanelId.value = null;
  }

  function notify(kind: Toast['kind'], message: string): number {
    toastSeq += 1;
    const id = toastSeq;
    toasts.value = [...toasts.value, { id, kind, message }];
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
    return id;
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function setViewportWidth(width: number): void {
    viewportWidth.value = width;
  }

  return {
    theme,
    sheetState,
    layerPanelOpen,
    glossaryPanelId,
    toasts,
    onboardingDone,
    tourStep,
    tourActive,
    isMobile,
    viewportWidth,
    applyTheme,
    setTheme,
    setSheetState,
    cycleSheet,
    startTour,
    nextTourStep,
    finishTour,
    openGlossary,
    closeGlossary,
    notify,
    dismiss,
    setViewportWidth,
  };
});
