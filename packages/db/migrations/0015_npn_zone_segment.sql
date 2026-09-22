-- 0015 · El tramo de zona del código predial no es urbano/rural
--
-- `core.npn_is_valid` exigía que las posiciones 6 y 7 del NPN fueran '01' o '02',
-- siguiendo el supuesto del plan: 01 urbano, 02 rural. Inspeccionados los 5,1
-- millones de predios reales cargados de 31 departamentos, ese tramo vale:
--
--   '00' en TODOS los predios rurales (capa R_TERRENO),
--   '01' en la cabecera urbana,
--   '02' a '08' en corregimientos y centros poblados.
--
-- Identifica el área urbana concreta, no la clase de suelo. La clase de suelo
-- del proyecto vive en `core.parcel.zone` y sale de la capa de origen. Con la
-- restricción vieja, la función declaraba inválido a cada predio rural del país
-- y a todo predio urbano fuera de la cabecera. Regla 2: el dato manda.

CREATE OR REPLACE FUNCTION core.npn_is_valid(npn TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT npn IS NOT NULL
     AND npn ~ '^[0-9]{30}$'
     AND substring(npn FROM 1 FOR 2) <> '00'
     AND substring(npn FROM 3 FOR 3) <> '000';
$$;

COMMENT ON FUNCTION core.npn_is_valid(TEXT) IS
  'Validez estructural del NPN de 30 dígitos. El tramo de zona (pos. 6-7) admite cualquier par de dígitos: 00 rural, 01 cabecera, 02+ otras áreas urbanas (IGAC).';
