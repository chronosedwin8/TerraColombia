-- 0010 · Corrección del tratamiento del código predial anterior (20 dígitos)
--
-- La migración 0007 definía `core.npn_normalize` convirtiendo un código de 20 dígitos a uno
-- de 30 añadiendo ceros. Eso es incorrecto: el tramo del NPN de 30 que identifica el terreno
-- ocupa 21 dígitos (depto 2 + municipio 3 + zona 2 + sector 2 + comuna 2 + barrio 2 +
-- manzana/vereda 4 + terreno 4), así que el código de 20 NO es un prefijo del de 30, y su
-- estructura interna no está documentada de forma verificable en las fuentes inspeccionadas.
--
-- Por la regla 2 de CLAUDE.md, aquí no se inventa ninguna conversión: un código de 20 dígitos
-- se resuelve buscándolo en `core.parcel.npn_old`, que es la columna que trae la propia
-- fuente cuando la publica.

-- `npn_normalize` pasa a normalizar SOLO el de 30 dígitos. Devuelve NULL para cualquier otra
-- longitud, incluido el de 20, para que quien lo llame use la búsqueda por npn_old.
CREATE OR REPLACE FUNCTION core.npn_normalize(input TEXT)
RETURNS CHAR(30)
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE
  s TEXT;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  s := regexp_replace(input, '[^0-9]', '', 'g');
  IF length(s) = 30 THEN
    RETURN s::CHAR(30);
  END IF;
  RETURN NULL;
END $$;

COMMENT ON FUNCTION core.npn_normalize(TEXT) IS
  'Normaliza un NPN de 30 digitos quitando separadores. Devuelve NULL para el codigo anterior de 20: ese se busca por npn_old.';

CREATE OR REPLACE FUNCTION core.npn_is_legacy(input TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT input IS NOT NULL AND length(regexp_replace(input, '[^0-9]', '', 'g')) = 20;
$$;

COMMENT ON FUNCTION core.npn_is_legacy(TEXT) IS
  'true si la entrada tiene la forma del codigo predial anterior de 20 digitos.';

-- Los 21 digitos que identifican el terreno, sin la parte de propiedad horizontal.
CREATE OR REPLACE FUNCTION core.npn_terrain_prefix(npn CHAR(30))
RETURNS CHAR(21)
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT substring(npn FROM 1 FOR 21)::CHAR(21);
$$;

-- `core.npn_matrix` ya usaba los 21 primeros digitos: se deja igual y se documenta.
COMMENT ON FUNCTION core.npn_matrix(CHAR) IS
  'NPN del predio matriz: los 21 digitos del terreno mas los nueve neutros de propiedad horizontal.';

-- Indice para resolver rapido el codigo anterior. Parcial: la mayoria de fuentes no lo traen.
CREATE INDEX IF NOT EXISTS parcel_npn_old_digits_idx
  ON core.parcel (npn_old) WHERE npn_old IS NOT NULL;
