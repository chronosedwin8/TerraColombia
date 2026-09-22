/**
 * Lectura del ítem de ArcGIS Online que publica la GDB catastral de un departamento.
 *
 * Existe por la regla 4 de CLAUDE.md: la atribución que se muestra al usuario
 * lleva la fecha de corte, y esa fecha tiene que ser la que declara el IGAC, no
 * una que nos venga bien. Así que en cada corrida se vuelve a leer el ítem y se
 * extrae el corte del texto que publica la propia fuente.
 */

import { arcgisItemMetadataUrl } from '@terracolombia/etl-config';

export interface ArcgisItemInfo {
  readonly itemId: string;
  readonly name: string;
  readonly title: string;
  readonly owner: string;
  readonly type: string;
  readonly access: string;
  readonly sizeBytes: number;
  /** `modified` del ítem, en ISO. Es cuándo se tocó el ítem, NO la fecha de corte. */
  readonly modifiedIso: string;
  /** Texto de licencia que declara el ítem. */
  readonly licenseInfo: string;
  /**
   * Fecha de corte declarada por la fuente en su propio texto (`snippet` o
   * `description`), en `AAAA-MM-DD`.
   */
  readonly declaredCut: string | null;
  /** Fragmento exacto del que se extrajo `declaredCut`, para dejar evidencia. */
  readonly declaredCutEvidence: string | null;
}

const MONTHS: Readonly<Record<string, string>> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

/**
 * Extrae «a corte de 31 de agosto de 2026» → `2026-08-31`.
 *
 * Tolera que falte «corte» (el ítem de Huila dice «en formato GDB a 31 de agosto
 * de 2026», sin la palabra) y que el mes venga en cualquier caja. Si no encuentra
 * una fecha completa devuelve null y el cargador lo registra, en vez de inventar
 * un corte.
 */
export function parseDeclaredCut(text: string): { cut: string; evidence: string } | null {
  if (!text) return null;
  const re = /(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+de\s+(\d{4})/;
  const m = re.exec(text);
  if (!m) return null;

  const day = m[1]!.padStart(2, '0');
  const monthName = m[2]!
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const year = m[3]!;
  const month = MONTHS[monthName];
  if (!month) return null;

  const cut = `${year}-${month}-${day}`;
  // Una fecha imposible (31 de febrero) se descarta: es mejor no tener corte que
  // tener uno que la base rechazará al insertarlo como DATE.
  const parsed = new Date(`${cut}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== cut) return null;

  return { cut, evidence: m[0] };
}

/** Lee los metadatos del ítem. Lanza si el ítem no es público o no es una GDB. */
export async function fetchArcgisItem(itemId: string): Promise<ArcgisItemInfo> {
  const res = await fetch(arcgisItemMetadataUrl(itemId), {
    headers: { 'User-Agent': 'TerraColombia/0.1 (carga de base catastral IGAC)' },
  });
  if (!res.ok) {
    throw new Error(`El ítem ${itemId} respondió ${res.status} ${res.statusText}`);
  }
  const j = (await res.json()) as Record<string, unknown>;
  if (j.error) {
    throw new Error(`El ítem ${itemId} devolvió error: ${JSON.stringify(j.error)}`);
  }

  const snippet = typeof j.snippet === 'string' ? j.snippet : '';
  const description = typeof j.description === 'string' ? j.description : '';
  const declared = parseDeclaredCut(snippet) ?? parseDeclaredCut(description);

  const modified = typeof j.modified === 'number' ? j.modified : Date.now();

  return {
    itemId,
    name: typeof j.name === 'string' ? j.name : '',
    title: typeof j.title === 'string' ? j.title : '',
    owner: typeof j.owner === 'string' ? j.owner : '',
    type: typeof j.type === 'string' ? j.type : '',
    access: typeof j.access === 'string' ? j.access : '',
    sizeBytes: typeof j.size === 'number' ? j.size : 0,
    modifiedIso: new Date(modified).toISOString(),
    licenseInfo: typeof j.licenseInfo === 'string' ? j.licenseInfo : '',
    declaredCut: declared?.cut ?? null,
    declaredCutEvidence: declared?.evidence ?? null,
  };
}

/**
 * Comprueba que el ítem sigue siendo lo que se verificó en la Fase 0.
 * Devuelve la lista de discrepancias, vacía si todo cuadra.
 */
export function checkItemIdentity(
  info: ArcgisItemInfo,
  expected: { fileName: string; sizeBytes: number },
): string[] {
  const problems: string[] = [];
  if (info.owner !== 'IGAC-Admin') {
    problems.push(`El ítem ya no lo publica IGAC-Admin sino "${info.owner}".`);
  }
  if (info.type !== 'File Geodatabase') {
    problems.push(`El ítem ya no es una File Geodatabase sino "${info.type}".`);
  }
  if (info.access !== 'public') {
    problems.push(`El ítem ya no es público: access="${info.access}".`);
  }
  if (info.name !== expected.fileName) {
    problems.push(`El archivo cambió de nombre: esperado "${expected.fileName}", ahora "${info.name}".`);
  }
  if (!/creative commons/i.test(info.licenseInfo)) {
    problems.push('El ítem ya no declara licencia Creative Commons en licenseInfo.');
  }
  return problems;
}
