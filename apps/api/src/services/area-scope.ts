import { AppError, AREA_ANALYSIS_HARD_LIMIT_KM2 } from '@terracolombia/shared';
import type { AreaScope, GeoJsonGeometry } from '@terracolombia/shared';
import { approxAreaKm2, radiusToPolygon } from '@terracolombia/geo';
import { getMunicipalityGeoJson, query } from '@terracolombia/db';
import { sql } from '@terracolombia/db/sql';

/**
 * Convierte cualquier `AreaScope` del DSL en una geometría concreta y valida el área contra
 * el plan del usuario. Un solo sitio decide esto, para que todas las rutas de zona apliquen
 * los mismos límites.
 */
export interface ResolvedScope {
  geometry: GeoJsonGeometry;
  areaKm2: number;
  /** Municipio del ámbito, si se puede determinar. */
  muniCode: string | null;
  /** Descripción legible del ámbito, para informes y mensajes. */
  label: string;
  /** Avisos sobre cómo se resolvió (por ejemplo, isócrona aproximada). */
  warnings: string[];
}

export async function resolveAreaScope(
  scope: AreaScope,
  maxAreaKm2: number,
): Promise<ResolvedScope> {
  const warnings: string[] = [];
  let geometry: GeoJsonGeometry;
  let muniCode: string | null = null;
  let label: string;

  switch (scope.kind) {
    case 'polygon': {
      geometry = scope.geometry;
      label = 'Polígono dibujado';
      break;
    }
    case 'radius': {
      geometry = radiusToPolygon(scope.center, scope.radiusM);
      label = `Radio de ${scope.radiusM} m`;
      break;
    }
    case 'municipality': {
      const geom = await getMunicipalityGeoJson(scope.muniCode);
      if (!geom) {
        throw new AppError(
          'COVERAGE_MISSING',
          `Todavía no tenemos el límite geográfico del municipio ${scope.muniCode}. ` +
            'Falta cargar el Marco Geoestadístico Nacional del DANE. Mientras tanto, dibuja un polígono o usa un radio.',
          { muniCode: scope.muniCode },
        );
      }
      geometry = geom as GeoJsonGeometry;
      muniCode = scope.muniCode;
      label = `Municipio ${scope.muniCode}`;
      break;
    }
    case 'isochrone': {
      // Sin red vial enrutable cargada, una isócrona honesta no es posible.
      // Se aproxima por distancia euclídea con velocidades típicas y se DECLARA como aproximación.
      const speedKmh = scope.mode === 'walk' ? 4.5 : 25;
      const radiusM = (speedKmh * 1000 * scope.minutes) / 60;
      geometry = radiusToPolygon(scope.center, radiusM);
      label = `Aproximación de ${scope.minutes} min ${scope.mode === 'walk' ? 'a pie' : 'en carro'}`;
      warnings.push(
        `Esta no es una isócrona por red vial: es un círculo de ${Math.round(radiusM)} m calculado con ` +
          `una velocidad media de ${speedKmh} km/h. El área real de alcance será menor y de forma irregular. ` +
          'La isócrona por red requiere cargar el grafo vial (pgRouting), que está pendiente.',
      );
      break;
    }
  }

  const areaKm2 = approxAreaKm2(geometry);

  if (areaKm2 <= 0) {
    throw new AppError(
      'VALIDATION',
      'El área que enviaste no tiene superficie. Revisa que el polígono esté cerrado y no se cruce consigo mismo.',
      {},
    );
  }

  const limit = Math.min(maxAreaKm2, AREA_ANALYSIS_HARD_LIMIT_KM2);
  if (areaKm2 > limit) throw AppError.areaTooLarge(areaKm2, limit);

  // Si no se conocía el municipio, se intenta inferir del centroide.
  if (!muniCode) {
    const rows = await query<{ code: string }>(sql`
      SELECT m.code
      FROM core.municipality m
      WHERE m.geom IS NOT NULL
        AND ST_Intersects(m.geom, ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326)))
      LIMIT 1
    `);
    muniCode = rows[0]?.code ?? null;
    if (!muniCode) {
      // Respaldo por centroide más cercano cuando aún no hay límites del MGN.
      const near = await query<{ code: string }>(sql`
        SELECT m.code
        FROM core.municipality m
        WHERE m.centroid IS NOT NULL
        ORDER BY m.centroid <-> ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326))
        LIMIT 1
      `);
      muniCode = near[0]?.code ?? null;
      if (muniCode) {
        warnings.push(
          'El municipio del área se determinó por proximidad al centroide oficial, porque aún no tenemos los límites municipales cargados.',
        );
      }
    }
  }

  return { geometry, areaKm2, muniCode, label, warnings };
}
