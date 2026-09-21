import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, MESSAGES } from '@terracolombia/shared';
import {
  coverageSummary,
  findParcelByLegacyNpn,
  getCoverage,
  getParcel,
  municipalityAt,
  parcelAt,
  searchAddress,
  searchText,
} from '@terracolombia/db';
import {
  isLegacyNpn,
  isNpnCandidate,
  looksLikeAddress,
  normalizeNpnInput,
  parseAddress,
  parseNpn,
  validateNpn,
} from '@terracolombia/geo';
import { DATASET_GROUPS, envelope, presentDatasets, recordUsage } from '../lib/envelope.js';

const QuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  muniCode: z.string().length(5).optional(),
});

/** Tipos de resultado que el buscador universal puede devolver. */
export type SearchResultKind =
  | 'parcel'
  | 'address'
  | 'coordinates'
  | 'municipality'
  | 'department'
  | 'neighborhood'
  | 'vereda'
  | 'toponym'
  | 'populated_place'
  | 'protected_area'
  | 'school'
  | 'health_facility';

interface SearchResult {
  kind: SearchResultKind;
  /** Qué mostrar en la lista. */
  label: string;
  /** Contexto para desambiguar. */
  context: string | null;
  /** A dónde navega el resultado. */
  target:
    | { type: 'parcel'; npn: string }
    | { type: 'municipality'; code: string }
    | { type: 'department'; code: string }
    | { type: 'point'; lng: number; lat: number; zoom: number }
    | { type: 'area'; kind: string; ref: string; lng: number | null; lat: number | null };
  /** Relevancia 0–1, para ordenar. */
  score: number;
  /** Explicación de por qué se interpretó así la entrada, para la UI. */
  interpretation: string | null;
}

/** Detecta "4.65, -74.1" y variantes con punto y coma o espacio. */
function parseCoordinates(raw: string): { lng: number; lat: number } | null {
  const cleaned = raw.replace(/[()]/g, '').trim();
  const m = cleaned.match(/^(-?\d{1,3}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]!.replace(',', '.'));
  const b = Number(m[2]!.replace(',', '.'));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Colombia: latitud entre -4,3 y 13,6; longitud entre -81,9 y -66,8.
  // Se acepta cualquiera de los dos órdenes y se decide por el rango.
  const looksLikeLatLng = a >= -5 && a <= 14 && b >= -82 && b <= -66;
  const looksLikeLngLat = b >= -5 && b <= 14 && a >= -82 && a <= -66;
  if (looksLikeLatLng) return { lat: a, lng: b };
  if (looksLikeLngLat) return { lat: b, lng: a };
  return null;
}

export default async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/search',
    {
      schema: {
        tags: ['busqueda'],
        summary: 'Buscador universal',
        description:
          'Acepta dirección, nombre de municipio, código predial de 30 o 20 dígitos, coordenadas ' +
          '("4.65, -74.1"), topónimo, barrio y vereda. Devuelve resultados ordenados por relevancia ' +
          'con una explicación de cómo se interpretó la entrada.',
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1, maxLength: 200 },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
            muniCode: { type: 'string', minLength: 5, maxLength: 5 },
          },
        },
      },
    },
    async (req) => {
      const started = Date.now();
      const { q, limit, muniCode } = QuerySchema.parse(req.query);
      const trimmed = q.trim();
      const results: SearchResult[] = [];
      const usedGroups: Array<keyof typeof DATASET_GROUPS> = ['admin'];

      // 1. Código predial: es la interpretación más específica, va primero.
      if (isNpnCandidate(trimmed)) {
        const normalized = normalizeNpnInput(trimmed);

        if (isLegacyNpn(normalized)) {
          // El código anterior no se convierte: se busca tal cual en `npn_old` (regla 2).
          const matches = await findParcelByLegacyNpn(normalized);
          usedGroups.push('cadastre');
          if (matches.length > 0) {
            for (const m of matches) {
              results.push({
                kind: 'parcel',
                label: m.address ?? m.npn,
                context: `Predio · ${m.muni_name}, ${m.dept_name} · código anterior ${normalized}`,
                target: { type: 'parcel', npn: m.npn },
                score: 0.97,
                interpretation:
                  'Interpretamos la entrada como código predial del formato anterior (20 dígitos) y lo buscamos ' +
                  'tal cual en el campo que publica la fuente. No lo convertimos al formato nuevo porque no existe ' +
                  'una regla aritmética que lo permita.',
              });
            }
          } else {
            results.push({
              kind: 'parcel',
              label: normalized,
              context:
                'Es un código predial del formato anterior, pero la fuente no publica ese campo para los ' +
                'predios que tenemos cargados.',
              target: { type: 'point', lng: 0, lat: 0, zoom: 6 },
              score: 0.35,
              interpretation:
                'Parece el código predial anterior de 20 dígitos. Busca por dirección o por el código de 30 dígitos.',
            });
          }
        } else {
        const validation = validateNpn(normalized);
        if (!validation.ok) {
          results.push({
            kind: 'parcel',
            label: normalized,
            context: validation.reason,
            target: { type: 'parcel', npn: normalized },
            score: 0.3,
            interpretation: `Parece un código predial, pero ${validation.reason.toLowerCase()}`,
          });
        } else {
          const parts = parseNpn(normalized);
          const npn30 = parts.department + parts.municipality + parts.zone + parts.sector +
            parts.commune + parts.neighborhood + parts.blockOrVereda + parts.parcel +
            parts.condition + parts.building + parts.floor + parts.unit;
          const parcel = await getParcel(npn30);
          usedGroups.push('cadastre');
          if (parcel) {
            results.push({
              kind: 'parcel',
              label: parcel.address ?? npn30,
              context: `Predio · ${parcel.muni_name}, ${parcel.dept_name}`,
              target: { type: 'parcel', npn: npn30 },
              score: 1,
              interpretation: 'Interpretamos la entrada como Número Predial Nacional.',
            });
          } else {
            const coverage = await getCoverage(parts.department + parts.municipality);
            results.push({
              kind: 'parcel',
              label: npn30,
              context:
                coverage.status === 'none'
                  ? (coverage.message ?? MESSAGES.errors.parcelNotFound)
                  : MESSAGES.errors.parcelNotFound,
              target: { type: 'municipality', code: parts.department + parts.municipality },
              score: 0.5,
              interpretation:
                'El código tiene estructura válida, pero no encontramos ese predio en los cortes que tenemos.',
            });
          }
        }
        }
      }

      // 2. Coordenadas.
      const coords = parseCoordinates(trimmed);
      if (coords) {
        const muni = await municipalityAt(coords.lng, coords.lat);
        const parcel = await parcelAt(coords.lng, coords.lat);
        usedGroups.push('cadastre');
        if (parcel) {
          results.push({
            kind: 'parcel',
            label: parcel.address ?? parcel.npn,
            context: `Predio en ese punto · ${parcel.muni_name}`,
            target: { type: 'parcel', npn: parcel.npn },
            score: 0.98,
            interpretation: 'Interpretamos la entrada como coordenadas y buscamos el predio en ese punto.',
          });
        }
        results.push({
          kind: 'coordinates',
          label: `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`,
          context: muni
            ? muni.match === 'polygon'
              ? `${muni.name}, ${muni.dept_name}`
              : `Cerca de ${muni.name}, ${muni.dept_name} (municipio aproximado: aún no cargamos los límites)`
            : 'Fuera de los municipios que tenemos cargados',
          target: { type: 'point', lng: coords.lng, lat: coords.lat, zoom: 17 },
          score: 0.95,
          interpretation: 'Interpretamos la entrada como coordenadas geográficas.',
        });
      }

      // 3. Dirección.
      if (looksLikeAddress(trimmed)) {
        const parsed = parseAddress(trimmed);
        const hits = await searchAddress(parsed.canonical, {
          muniCode,
          limit,
          // Sin esto, la similitud por trigramas confunde calles distintas que comparten
          // las palabras comunes de toda dirección.
          wayNumber: parsed.wayNumber,
        });
        usedGroups.push('cadastre');
        for (const h of hits) {
          const contexto = [
            h.muni_name,
            h.npn ? null : 'sin predio asociado',
            h.is_synthetic ? 'DATOS DE DEMOSTRACIÓN' : null,
          ]
            .filter(Boolean)
            .join(' · ');
          results.push({
            kind: 'address',
            label: h.label,
            context: contexto,
            target: h.npn
              ? { type: 'parcel', npn: h.npn }
              : { type: 'point', lng: h.lng, lat: h.lat, zoom: 18 },
            score: 0.6 + Math.min(0.35, h.similarity * 0.35),
            interpretation:
              `Interpretamos la entrada como dirección y la normalizamos a "${parsed.canonical}". ` +
              (parsed.wayNumber
                ? `Solo mostramos resultados en la ${parsed.wayType ?? 'vía'} ${parsed.wayNumber}.`
                : 'No pudimos leer el número de la vía, así que la coincidencia es aproximada.'),
          });
        }
      }

      // 4. Topónimos, municipios, barrios, veredas y equipamientos.
      //
      // Si la entrada es inequívocamente una dirección (tipo de vía + número), no se busca
      // por texto: la similitud por trigramas devolvería municipios que se parecen de lejos
      // ("Carrera 7A" contra "Cabrera"), y eso es ruido que confunde más de lo que ayuda.
      const esDireccionInequivoca =
        looksLikeAddress(trimmed) && parseAddress(trimmed).wayNumber !== null;
      const textHits = esDireccionInequivoca ? [] : await searchText(trimmed, { limit, muniCode });
      for (const h of textHits) {
        const kind = h.kind as SearchResultKind;
        const target: SearchResult['target'] =
          h.kind === 'municipality'
            ? { type: 'municipality', code: h.ref }
            : h.kind === 'department'
              ? { type: 'department', code: h.ref }
              : h.lng !== null && h.lat !== null
                ? { type: 'point', lng: h.lng, lat: h.lat, zoom: h.kind === 'neighborhood' ? 16 : 14 }
                : { type: 'area', kind: h.kind, ref: h.ref, lng: h.lng, lat: h.lat };
        results.push({
          kind,
          label: h.label,
          context: h.context,
          target,
          score: Math.min(0.9, 0.4 + h.similarity * 0.5),
          interpretation: null,
        });
      }

      results.sort((a, b) => b.score - a.score);
      const top = results.slice(0, limit);

      recordUsage(req, 'search', started, { units: top.length, detail: { hasResults: top.length > 0 } });

      const datasets = await presentDatasets([...new Set(usedGroups)]);

      // Estado vacío honesto: en vez de "no encontramos nada", se dice qué SÍ hay cargado.
      // Buscar una dirección sin predios en la base no falla por escribirla mal.
      let emptyReason: string | null = null;
      if (top.length === 0) {
        const coverage = await coverageSummary();
        const conPredios = coverage?.with_parcels ?? 0;
        const total = coverage?.total_municipalities ?? 0;

        if (looksLikeAddress(trimmed)) {
          const p = parseAddress(trimmed);
          const via = p.wayType && p.wayNumber ? `${p.wayType} ${p.wayNumber}` : null;
          emptyReason =
            (via
              ? `No encontramos ninguna dirección en la ${via}. `
              : 'No encontramos esa dirección. ') +
            `Las direcciones solo se pueden buscar donde tenemos predios cargados, y por ahora ` +
            `son ${conPredios} de ${total} municipios. Busca primero el municipio por su nombre ` +
            `y navega el mapa, o usa el código predial de 30 dígitos.`;
        } else {
          emptyReason =
            'No encontramos nada con ese texto. Puedes buscar por nombre de municipio o ' +
            'departamento, por código predial de 30 dígitos, o por coordenadas como "4.65, -74.1". ' +
            `Tenemos los ${total} municipios del país; los predios están cargados en ${conPredios}.`;
        }
      }

      return envelope(
        {
          query: trimmed,
          results: top,
          /** Cuando no hay nada, se explica qué se intentó, no se devuelve una lista vacía muda. */
          emptyReason,
        },
        datasets,
      );
    },
  );

  // Resolución de un punto del mapa: qué hay exactamente en esas coordenadas.
  app.get(
    '/resolve',
    {
      schema: {
        tags: ['busqueda'],
        summary: 'Qué hay en un punto del mapa',
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
          },
        },
      },
    },
    async (req) => {
      const { lat, lng } = z
        .object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) })
        .parse(req.query);

      const muni = await municipalityAt(lng, lat);
      if (!muni) {
        throw AppError.notFound(
          'Ese punto no cae en ningún municipio de los que tenemos cargados. Puede estar fuera de Colombia.',
        );
      }
      const [parcel, coverage] = await Promise.all([parcelAt(lng, lat), getCoverage(muni.code)]);
      const datasets = await presentDatasets(['admin', 'cadastre']);

      return envelope(
        {
          point: { lng, lat },
          municipality: {
            code: muni.code,
            name: muni.name,
            deptCode: muni.dept_code,
            deptName: muni.dept_name,
            match: muni.match,
          },
          parcel: parcel
            ? { npn: parcel.npn, address: parcel.address, areaGeomM2: parcel.area_geom_m2 }
            : null,
        },
        datasets,
        {
          coverage,
          warnings:
            muni.match === 'nearest_centroid'
              ? [
                  'Aún no tenemos los límites municipales cargados: el municipio se resolvió por proximidad al centroide oficial y puede no ser exacto.',
                ]
              : [],
        },
      );
    },
  );
}
