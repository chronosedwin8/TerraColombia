---
title: Licencias y atribución
description: Qué licencia tiene cada dato de la GeoAPI, qué obliga la atribución al IGAC y qué implica la cláusula CompartirIgual de CC BY-SA 4.0 para quien redistribuya.
---

# Licencias y atribución

::: danger Lee esta página antes de construir un producto encima
Los datos que sirve esta API son abiertos, pero **abierto no es lo mismo que sin condiciones**.
Dos de las fuentes principales —la base catastral del IGAC y OpenStreetMap— llevan cláusula
*CompartirIgual*, que puede alcanzar a lo que tú publiques a partir de ellas.

Esta página describe cómo entendemos nosotros esas licencias. **No es asesoría jurídica.** Si vas
a redistribuir datos o a publicar una base derivada, consulta a tu abogado.
:::

## Licencias por fuente

| Fuente | Datos | Licencia | ¿CompartirIgual? |
| --- | --- | --- | --- |
| **IGAC** | Base Catastral Pública (predios, construcciones, manzanas, sectores, nomenclatura) | **CC BY-SA 4.0** | **Sí** |
| **IGAC** | Agrología: suelos, capacidad de uso, vocación, conflictos de uso | CC BY-SA 4.0 | Sí |
| **IGAC** | Cartografía básica, límites oficiales, nombres geográficos | CC BY-SA 4.0 | Sí |
| **OpenStreetMap** | Vías, puntos de interés, edificios | **ODbL 1.0** | **Sí** |
| **DANE** | MGN, CNPV 2018, DIVIPOLA, proyecciones | Datos abiertos (Ley 1712 de 2014) | No |
| **MEN** | Establecimientos y sedes educativas, matrícula | Datos abiertos | No |
| **MinSalud (REPS)** | Prestadores de servicios de salud | Datos abiertos | No |
| **SGC** | Amenaza por movimientos en masa, amenaza sísmica | Datos abiertos | No |
| **IDEAM** | Zonas inundables, clima | Datos abiertos | No |
| **PNN (RUNAP)** | Áreas protegidas | Datos abiertos | No |
| **ANT / MinInterior** | Resguardos y territorios colectivos | Datos abiertos | No |
| **UPRA** | Frontera agrícola, aptitudes | Datos abiertos | No |
| **Copernicus** | Modelo digital de elevación 30 m | Licencia Copernicus | No |
| **TerraColombia** | Indicadores calculados, puntajes, agregados H3 | Propietaria, uso según tu plan | No |

El campo `meta.sources[].license` de cada respuesta trae el identificador exacto, y
`meta.sources[].attribution` el texto que debes mostrar. **Usa esos campos**: son la fuente de
verdad y se actualizan si una entidad cambia su licencia.

## La atribución obligatoria

Si tu producto muestra datos catastrales del IGAC, en cualquier forma —un mapa, una tabla, una
ficha, un PDF, una respuesta de tu propia API—, debe aparecer:

> **Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0**

Sustituye `AAAA-MM` por el corte que traiga `meta.cutDate`. Ese texto ya viene armado en
`meta.sources[].attribution`.

Para OpenStreetMap:

> **© colaboradores de OpenStreetMap, ODbL 1.0**

Dónde ponerla:

- **En un mapa:** visible sobre el mapa, en el pie o en un control de atribución abierto por
  defecto. No vale esconderla detrás de un icono que nadie pulsa.
- **En una tabla o una ficha:** junto a los datos o en un pie de página de la misma vista.
- **En un PDF o un XLSX:** en la sección o la hoja de fuentes. Nuestros informes ya la incluyen.
- **En tu propia API:** en el cuerpo de la respuesta, no solo en tu documentación.

## Qué implica *CompartirIgual* {#sharealike}

La CC BY-SA 4.0 y la ODbL 1.0 comparten una idea: **si distribuyes una obra adaptada, la
distribuyes con la misma licencia**. Esto es lo que suele sorprender.

### Lo que casi con certeza puedes hacer

- **Consultar la API** para tu propio uso interno, sin publicar nada.
- **Mostrar** los datos en tu aplicación, con la atribución. Mostrar no es redistribuir la base.
- **Publicar análisis, informes, mapas y conclusiones** sobre esos datos, con la atribución.
- **Vender un servicio** que use estos datos. Ninguna de las dos licencias prohíbe el uso
  comercial, y ninguna exige que tu código sea abierto.
- **Combinar** estos datos con los tuyos para tomar decisiones internas.

### Donde está el riesgo

- **Redistribuir la base**, entera o en trozos sustanciales: un volcado de predios, un
  *feature service*, un archivo descargable, un endpoint que sirva las geometrías del IGAC. Eso
  es distribución, y arrastra la licencia original.
- **Publicar una base derivada**: si mezclas los predios del IGAC con tus datos y publicas el
  resultado como una base consultable, la parte adaptada va con CC BY-SA 4.0. Dónde termina «tu
  dato» y empieza «el dato adaptado» es exactamente la pregunta difícil.
- **ODbL tiene además la cláusula de *base de datos derivada*** y el concepto de *obra
  producida*: un mapa hecho con datos de OSM es una obra producida y solo exige atribución, pero
  una base que incorpora datos de OSM es una base derivada y exige ODbL. La frontera entre las
  dos, otra vez, depende de qué publiques.

### Cómo nos organizamos nosotros para que tú puedas distinguir

Precisamente porque esa frontera importa, **separamos los datos por licencia en todas las
salidas**:

| Salida | Cómo se separa |
| --- | --- |
| **XLSX** | Hojas con prefijo `SA_` (datos CompartirIgual) y `TC_` (indicadores propios), más la hoja obligatoria `FUENTES_Y_LICENCIA` |
| **CSV** | Carpetas `DATOS_ABIERTOS_SHAREALIKE/` e `INDICADORES_TERRACOLOMBIA/` dentro del ZIP, más `FUENTES_Y_LICENCIA.txt` |
| **GeoJSON** | Un archivo por grupo dentro del ZIP, más `FUENTES_Y_LICENCIA.txt` |
| **GeoPackage** | Una capa por grupo, más la tabla no espacial `FUENTES_Y_LICENCIA` |
| **Shapefile** | Un *shapefile* por grupo dentro del ZIP, más `FUENTES_Y_LICENCIA.txt` |
| **KML** | Un archivo por grupo dentro del ZIP, más `FUENTES_Y_LICENCIA.txt` |
| **Respuestas JSON** | El bloque `meta.sources[]` indica la licencia de cada dataset, con `shareAlike` explícito en las exportaciones |

Así, cuando decidas qué publicar, puedes ver exactamente qué parte del contenido arrastra la
obligación y qué parte es un indicador nuestro.

::: info No reclamamos exclusividad sobre el dato abierto
El negocio de TerraColombia es el **servicio**: normalizar, cruzar, agregar, explicar y mantener
la disponibilidad. Los datos de origen son públicos y puedes descargarlos de cada entidad. No
pretendemos ser dueños de lo que es de todos.
:::

## Los indicadores que calculamos nosotros

Los puntajes, los agregados por celda H3, las distancias calculadas, los semáforos de aptitud y
los índices de accesibilidad son **obra de TerraColombia**. Se entregan bajo las condiciones de
tu plan y no llevan cláusula CompartirIgual.

Dos advertencias:

1. **Se calculan a partir de datos con CompartirIgual.** La pregunta de si un indicador derivado
   es una «adaptación» a efectos de la licencia no tiene una respuesta pacífica. Por eso los
   separamos: para que puedas decidir con la información delante.
2. **Cada indicador viene con su fórmula y sus datasets de origen.** Puedes recalcularlo tú mismo
   desde los datos abiertos si prefieres no depender de nosotros.

## Restricciones de la propia API

Además de las licencias de los datos, los términos del servicio prohíben:

- **Raspado sistemático** para reconstruir la base. Hay cuotas de teselas y de área por plan, y
  la detección de patrones de barrido.
- **Reventa del acceso** a la API sin acuerdo previo. Tu llave es para tu producto, no para
  revenderla como pasarela.
- **Retirar la atribución** de nuestras salidas, incluida la hoja `FUENTES_Y_LICENCIA`. La marca
  blanca del plan Business cambia el logo y los colores; **no** quita las fuentes ni los
  descargos legales.
- **Presentar los indicadores como avalúos, conceptos jurídicos o certificados.** No lo son, y los
  informes lo dicen expresamente.

## Datos personales

La API **no entrega datos personales**. No hay propietarios, ni números de documento, ni
teléfonos, ni direcciones de personas. Las columnas con esa información se descartan en la
ingesta y se registra el descarte.

Esto no te exime de tus propias obligaciones: si tú cruzas estos datos territoriales con datos de
tus clientes, el tratamiento de esos datos personales es tuyo y te aplica la **Ley 1581 de 2012**.

Los predios con reserva legal quedan excluidos, conforme al **artículo 19 de la Ley 1712 de
2014**.

## Cobertura: una advertencia que también es legal

La base catastral abierta del IGAC cubre **solo los municipios donde el IGAC es el gestor
catastral**. Quedan fuera los catastros descentralizados y los gestores habilitados —Bogotá,
Medellín, Cali, Barranquilla, Antioquia y un número creciente—.

`meta.coverage` lo dice en cada respuesta. **Muéstralo.** Presentar un municipio sin datos como
un municipio sin predios es desinformar a tu usuario, y en un producto que se usa para decidir
compras de inmuebles eso tiene consecuencias.

## Enlaces a las licencias

- [CC BY-SA 4.0, texto en español](https://creativecommons.org/licenses/by-sa/4.0/deed.es)
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Copyright de OpenStreetMap](https://www.openstreetmap.org/copyright)
- [Datos abiertos del Estado colombiano](https://www.datos.gov.co/)
- [Ley 1712 de 2014](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=56882)
- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981)

## Qué está pendiente por nuestra parte

Somos transparentes con lo que todavía no está resuelto:

1. **Concepto de abogado sobre el alcance de la cláusula CompartirIgual** en bases derivadas y en
   la redistribución vía API. Está pendiente y bloquea el lanzamiento comercial pleno.
2. **Política de tratamiento de datos** (Ley 1581 de 2012) publicada y aceptada en el registro.
3. **Revisión por abogado de los textos de descargo** de los informes.

El documento interno con la lista completa es `docs/LEGAL.md` del repositorio del producto.
