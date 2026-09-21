import { onScopeDispose, ref, watch, type Ref } from 'vue';

/** Función diferida con cancelación. Se usa en el mapa (consultas por bbox) y en el buscador. */
export function useDebounceFn<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 250,
): { run: (...args: A) => void; cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const flush = (): void => {
    if (!pending) return;
    const args = pending;
    cancel();
    fn(...args);
  };

  onScopeDispose(cancel);

  return {
    run: (...args: A) => {
      pending = args;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const a = pending;
        pending = null;
        if (a) fn(...a);
      }, delayMs);
    },
    cancel,
    flush,
  };
}

/** Copia diferida de un ref: útil para no disparar una consulta por cada tecla. */
export function useDebouncedRef<T>(source: Ref<T>, delayMs = 300): Ref<T> {
  const debounced = ref(source.value) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(source, (value) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      debounced.value = value;
    }, delayMs);
  });

  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
  });

  return debounced;
}
