/**
 * Acceso al glosario. La lista canónica viaja en el bundle (`@terracolombia/shared`)
 * para que un tooltip nunca dependa de la red; si `GET /glossary` responde, sus entradas
 * tienen prioridad, lo que permite documentar capas nuevas sin desplegar el frontend.
 */
import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { GLOSSARY, GLOSSARY_BY_ID, type GlossaryEntry } from '@terracolombia/shared';
import { getGlossary } from '@/api/glossary';
import { queryKeys, staleTimes } from '@/api/queries';

export function useGlossary() {
  const remote = useQuery({
    queryKey: queryKeys.glossary(),
    queryFn: async () => (await getGlossary()).data,
    staleTime: staleTimes.catalog,
    // El glosario local es suficiente para operar: un fallo de red no molesta al usuario.
    retry: 1,
  });

  // `GET /glossary` devuelve `{ terms: [...] }`, no un array. Iterar el objeto lanzaba
  // `TypeError: no es iterable` dentro del computed y tumbaba la pantalla del glosario en
  // cuanto respondía la petición.
  const remoteTerms = computed<GlossaryEntry[]>(() => remote.data.value?.terms ?? []);

  const entries = computed<GlossaryEntry[]>(() => {
    const merged = new Map<string, GlossaryEntry>();
    for (const entry of GLOSSARY) merged.set(entry.id, entry);
    for (const entry of remoteTerms.value) merged.set(entry.id, entry);
    return [...merged.values()].sort((a, b) => a.term.localeCompare(b.term, 'es-CO'));
  });

  const byId = computed<Record<string, GlossaryEntry>>(() => {
    const out: Record<string, GlossaryEntry> = { ...GLOSSARY_BY_ID };
    for (const entry of remoteTerms.value) out[entry.id] = entry;
    return out;
  });

  function lookup(id: string): GlossaryEntry | null {
    return byId.value[id] ?? null;
  }

  return { entries, byId, lookup, isLoading: remote.isLoading };
}

/** Versión sin red para componentes que no pueden usar TanStack Query (p. ej. informes). */
export function lookupGlossary(id: string): GlossaryEntry | null {
  return GLOSSARY_BY_ID[id] ?? null;
}
