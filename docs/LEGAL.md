# Marco legal y de datos

> Documento interno de trabajo. Recoge las restricciones legales que condicionan el **diseño**
> del producto (§2 de `PLAN.md`), cómo están implementadas hoy y qué queda pendiente.
>
> **Esto no es un concepto jurídico.** Lo escribió el equipo de producto a partir de la lectura
> de las licencias y de la normativa citada. Todo lo que aquí se afirma sobre el alcance de una
> licencia es una interpretación de trabajo y está sujeto a la revisión del abogado. La
> [sección 8](#8-pendientes-legales-que-bloquean-el-lanzamiento-comercial) lista lo que falta.

Actualizado: 2026-09-21

---

## 1. Resumen ejecutivo

| Pregunta | Respuesta corta |
| --- | --- |
| ¿Podemos usar la base catastral del IGAC? | Sí. Es un dato abierto bajo CC BY-SA 4.0 |
| ¿Podemos cobrar por un servicio construido sobre ella? | Sí. La licencia no prohíbe el uso comercial |
| ¿Podemos redistribuir la base? | Sí, **manteniendo la misma licencia**. Ahí está el riesgo del negocio |
| ¿Nuestros indicadores son nuestros? | Sí, pero la frontera entre «indicador propio» y «base derivada» no está resuelta |
| ¿Manejamos datos personales? | **No**, y por diseño no vamos a hacerlo |
| ¿Cubrimos todo el país? | **No.** Solo los municipios donde el IGAC es gestor catastral |
| ¿Estamos listos para el lanzamiento comercial? | **No.** Faltan los pendientes de la sección 8 |

**La tesis del negocio:** TerraColombia no vende el dato, vende el **servicio** —normalización,
cruce espacial, agregados comparables, explicabilidad, disponibilidad y SLA—. Esa tesis no es
retórica: es la respuesta a la cláusula *CompartirIgual*. Si el negocio dependiera de la
exclusividad del dato, la licencia lo haría inviable.

---

## 2. Licencias de las fuentes

### 2.1 Tabla de licencias

| Fuente | Datos | Licencia | CompartirIgual |
| --- | --- | --- | --- |
| **IGAC** | Base Catastral Pública: terrenos, construcciones, manzanas, sectores, barrios, veredas, perímetro urbano, nomenclatura vial y domiciliaria | **CC BY-SA 4.0** | **Sí** |
| **IGAC** | Agrología: suelos, capacidad de uso, vocación, conflictos de uso, oferta ambiental | CC BY-SA 4.0 | Sí |
| **IGAC** | Cartografía básica, límites oficiales, nombres geográficos, relieve | CC BY-SA 4.0 | Sí |
| **IGAC** | Zonas homogéneas físicas y geoeconómicas | CC BY-SA 4.0 (verificar por municipio) | Sí |
| **OpenStreetMap** | Vías, puntos de interés, edificios | **ODbL 1.0** | **Sí** |
| **DANE** | MGN, CNPV 2018, DIVIPOLA, proyecciones de población | Datos abiertos (Ley 1712 de 2014) | No |
| **MEN** | Establecimientos y sedes educativas, matrícula | Datos abiertos | No |
| **MinSalud** | REPS: prestadores de servicios de salud | Datos abiertos | No |
| **SECOP II** | Contratación pública | Datos abiertos | No |
| **SGC** | Amenaza por movimientos en masa, amenaza sísmica | Datos abiertos | No |
| **IDEAM** | Zonas inundables, clima | Datos abiertos | No |
| **PNN (RUNAP)** | Áreas protegidas | Datos abiertos | No |
| **ANT / MinInterior** | Resguardos indígenas y consejos comunitarios | Datos abiertos | No |
| **UPRA** | Frontera agrícola, aptitudes | Datos abiertos | No |
| **ANM / ANH** | Títulos mineros, bloques | Verificar apertura | Por verificar |
| **Copernicus** | Modelo digital de elevación 30 m | Licencia Copernicus | No |
| **TerraColombia** | Indicadores, puntajes, agregados H3, semáforos | Propietaria | No |

La licencia declarada de cada dataset vive en `meta.dataset.license` en la base y se propaga a
`meta.sources[].license` de toda respuesta de la API y de todo informe. `isShareAlike()` de
`packages/shared/src/legal.ts` es la única función que decide si una licencia arrastra la
cláusula: no hay una segunda lista en otro sitio.

### 2.2 Qué obliga la CC BY-SA 4.0

Tres obligaciones, en orden de riesgo creciente:

**a) Atribución (BY).** Siempre. En mapa, ficha, informe, exportación y respuesta de la API. El
texto canónico es:

> Fuente: IGAC, Base Catastral, corte AAAA-MM, CC BY-SA 4.0

Está implementado en `IGAC_ATTRIBUTION_TEMPLATE()` de `packages/shared/src/provenance.ts`, y se
inyecta automáticamente en `meta.sources[].attribution`. No hay una ruta del código que publique
una cifra catastral sin ese texto disponible.

**b) Indicar cambios.** Si adaptamos el material, hay que decirlo. Lo cumplimos declarando en cada
dataset la transformación aplicada (`meta.dataset` y el linaje de `meta.snapshot`) y, en los
informes, la fórmula de cada indicador derivado.

**c) CompartirIgual (SA).** **Esta es la cláusula que condiciona el modelo de negocio.** Si
distribuimos material adaptado, hay que distribuirlo bajo la misma licencia.

### 2.3 Qué obliga la ODbL 1.0 (OpenStreetMap)

La ODbL distingue tres cosas, y la distinción importa:

| Concepto | Qué es | Qué obliga |
| --- | --- | --- |
| **Base de datos derivada** | Una base construida a partir de la de OSM | ODbL: atribución, misma licencia, y entregar la versión de la base si se distribuye |
| **Base colectiva** | La de OSM junto a otras, sin fusionarse | Solo atribución de la parte de OSM |
| **Obra producida** | Un mapa, una imagen, un informe hecho con la base | Solo atribución |

Un informe PDF con un mapa de OSM es una **obra producida**: basta la atribución. Una exportación
GeoPackage con las vías de OSM es, casi con certeza, una **base derivada**.

Atribución exigida:

> © colaboradores de OpenStreetMap, ODbL 1.0

### 2.4 Nuestra lectura del riesgo de CompartirIgual {#riesgo-sharealike}

| Actividad | Nuestra lectura | Confianza |
| --- | --- | --- |
| Consultar y mostrar los datos en la aplicación, con atribución | Permitido; mostrar no es distribuir la base | Alta |
| Publicar informes, mapas y análisis con atribución | Permitido: son obras producidas | Alta |
| Cobrar por el servicio | Permitido: ninguna de las dos licencias prohíbe el uso comercial | Alta |
| Mantener nuestro código cerrado | Permitido: la licencia cubre los datos, no el software | Alta |
| Servir predios del IGAC por la GeoAPI a un tercero | **Es redistribución de la base.** El tercero recibe los datos bajo CC BY-SA 4.0, y así lo declaramos | Media |
| Servir teselas vectoriales con geometrías del IGAC | Probablemente también redistribución | Media |
| Publicar indicadores propios calculados sobre datos SA | **Sin resolver.** ¿Es una adaptación o una obra nueva? | **Baja** |
| Vender una base que mezcle predios del IGAC con datos del cliente | **Riesgo alto.** Probablemente base derivada; obligaría a licenciar el resultado bajo CC BY-SA 4.0 | **Baja** |

Las dos últimas filas son la razón de la sección 8.

---

## 3. Separación de datos por licencia

**Decisión de diseño:** los datos con cláusula CompartirIgual se mantienen **separados** de los
indicadores propios en la base de datos y en todas las exportaciones. Así, si mañana el concepto
del abogado dice que la cláusula alcanza a las bases derivadas, no hay que desmontar el producto:
la frontera ya está trazada.

### 3.1 En la base de datos

| Esquema | Contenido | Licencia dominante |
| --- | --- | --- |
| `raw` | Lo que llega de cada fuente, sin transformar, por corte | La de la fuente |
| `core` | Catastro normalizado (IGAC) | **CC BY-SA 4.0** |
| `ctx` | Contexto: DANE, MEN, REPS, SGC, IDEAM, RUNAP, ANT, UPRA, Copernicus, **y OSM** | Mezcla; OSM es **ODbL** |
| `analytics` | Agregados H3 e indicadores municipales calculados por nosotros | Propietaria, derivada |
| `app` | Usuarios, pagos, informes, créditos | Propietaria |
| `meta` | Catálogo de datasets, snapshots, linaje y **licencias** | Propietaria |

Reglas que se derivan de esa separación:

1. `meta.dataset.license` es obligatorio. Un dataset sin licencia declarada **no se publica**.
2. Ninguna tabla de `core` o `ctx` se mezcla con columnas calculadas: los indicadores viven en
   `analytics` y se unen por clave, no por columna añadida.
3. Las capas de OSM dentro de `ctx` van marcadas aparte en el catálogo: la ODbL tiene reglas
   propias y no se puede tratar igual que un dato abierto del Estado.

### 3.2 En las exportaciones

Implementado en `packages/reports` (`src/tabular.ts` y `src/exporters.ts`). Toda exportación:

- incluye **siempre** el archivo u hoja `FUENTES_Y_LICENCIA`, y
- separa los datos ShareAlike de los indicadores propios en archivos, hojas o capas distintos.

| Formato | Cómo se separa | Dónde va la procedencia |
| --- | --- | --- |
| **PDF** | No aplica: es una obra producida | Sección 10, íntegra |
| **XLSX** | Hojas con prefijo `SA_` frente a `TC_`, con color de pestaña distinto | Hoja `FUENTES_Y_LICENCIA` |
| **CSV** | Carpetas `DATOS_ABIERTOS_SHAREALIKE/` e `INDICADORES_TERRACOLOMBIA/` en el ZIP | `FUENTES_Y_LICENCIA.txt` y `.csv` |
| **GeoJSON** | Un archivo por grupo dentro del ZIP | `FUENTES_Y_LICENCIA.txt` y `.csv` |
| **GeoPackage** | Una capa por grupo | Tabla no espacial `FUENTES_Y_LICENCIA` |
| **Shapefile** | Un *shapefile* por grupo dentro del ZIP | `FUENTES_Y_LICENCIA.txt` y `.csv` |
| **KML** | Un archivo por grupo dentro del ZIP | `FUENTES_Y_LICENCIA.txt` |

La clasificación es **conservadora**: si alguna fuente de una tabla tiene cláusula ShareAlike, la
tabla entera va al grupo ShareAlike. Es preferible sobre-marcar a dejar pasar un dato contaminado
en el archivo equivocado.

El texto de `FUENTES_Y_LICENCIA.txt` explica al destinatario, en español, qué implica cada grupo y
qué tiene que hacer si redistribuye.

### 3.3 En la API

- `meta.sources[]` declara fuente, dataset, fecha de corte, licencia, atribución y URL de cada
  cifra de la respuesta.
- La documentación pública tiene una página entera sobre esto:
  `apps/docs-site/guia/licencias-y-atribucion.md`.
- Los términos de uso prohíben retirar la atribución, el raspado sistemático para reconstruir la
  base y la reventa del acceso sin acuerdo.

---

## 4. Datos personales

### 4.1 Ley 1581 de 2012 (habeas data)

**Decisión de producto: cero datos personales en el territorio.** No existe, ni va a existir, la
ruta predio → persona.

Implementación:

1. **Lista negra de columnas** en `etl/config/pii-blocklist.ts`. Si una fuente trae nombre de
   propietario, número de documento, teléfono o dirección personal, la columna se descarta en la
   ingesta.
2. **El descarte se registra.** El log de la corrida deja constancia de qué columna se eliminó y
   de qué dataset: el cumplimiento tiene que ser auditable, no una afirmación.
3. **Validación en el pipeline.** El paso `validate` falla la carga si detecta un patrón de PII en
   una columna no declarada.
4. **No hay endpoint que devuelva propietarios.** No es que esté restringido: no existe.

El descargo `DISCLAIMERS.noPersonalData` lo declara en cada informe.

Lo que **sí** son datos personales en el producto son los de nuestros propios usuarios: correo,
nombre, datos de facturación. Para eso sí aplica la Ley 1581 de 2012, y por eso la política de
tratamiento de datos está en la lista de pendientes (sección 8).

### 4.2 Ley 1712 de 2014, artículo 19

Los predios con **reserva legal** quedan excluidos de la publicación. La base abierta del IGAC ya
los excluye en origen; el producto no intenta reconstruirlos ni inferirlos, y si un corte trajera
uno por error, la exclusión se aplica en la ingesta.

### 4.3 Registros de uso y del asistente

- Los registros de uso de la API guardan llave, endpoint, código de respuesta, latencia y créditos.
  No guardan el contenido de las respuestas.
- Los *prompts* del asistente se registran **sin datos personales**, para auditoría y mejora.
- Los datos de pago no se almacenan en nuestros servidores: el cobro ocurre en la pasarela
  (Mercado Pago), y nosotros guardamos la referencia, el monto, el estado y el identificador de la
  transacción. No hay números de tarjeta en la base.

---

## 5. Cobertura catastral: un límite que también es legal

La base abierta del IGAC cubre **únicamente los municipios donde el IGAC es el gestor catastral**.
Quedan fuera los catastros descentralizados y los gestores habilitados: Bogotá, Medellín, Cali,
**Barranquilla**, Antioquia y un número creciente de gestores al amparo de la Ley 1955 de 2019 y
el Decreto 148 de 2020.

**Por qué esto es un asunto legal y no solo de producto:** un producto que se usa para decidir la
compra de un inmueble y que presenta un municipio sin datos como un municipio sin predios está
desinformando a su usuario, con las consecuencias que eso tiene.

Implementación:

- Tabla `core.cadastral_manager` (municipio → gestor → fuente → estado de cobertura → notas).
- El bloque `meta.coverage` de toda respuesta declara `status` (`full`, `partial`, `none`,
  `unknown`), el gestor y las capas que sí hay.
- Un predio de un municipio sin cobertura devuelve **HTTP 200** con `data: null` y la explicación,
  no un 404: un 404 diría «este predio no existe», que es falso.
- La interfaz muestra el mensaje y ofrece lo que sí hay. Nunca un mapa vacío sin explicación.
- Los informes llevan el bloque de advertencia de cobertura y el descargo
  `DISCLAIMERS.coverage`.

**Arquitectura de adaptadores por gestor** (Fase 7 de `PLAN.md`): cada gestor que publique datos
abiertos entra por su propio adaptador, con su propia licencia declarada. No se asume que un
catastro descentralizado tenga la misma licencia que el del IGAC: hay que verificarlo por gestor.

---

## 6. Ordenamiento territorial (POT)

No existe un repositorio nacional completo de Planes de Ordenamiento Territorial. Se integra lo que
haya (ColombiaOT, IGAC y portales municipales) y el resto se declara explícitamente:

> No disponible: consulte la Secretaría de Planeación municipal.

Reglas del producto:

1. **Nunca se infiere la clasificación del suelo.** Si no tenemos el POT de un municipio, la
   sección 7 del informe lo dice y remite a Planeación municipal.
2. **Nunca se presenta como concepto de norma.** El descargo `DISCLAIMERS.notUrbanNorm` acompaña
   toda mención de usos y aprovechamientos.
3. **Se cita el acto administrativo** (`sourceDoc`) cuando lo tenemos, para que el usuario pueda
   ir a la fuente.

Fundamento: Ley 388 de 1997. Lo que se puede construir y hacer en un predio lo determinan el POT y
los actos administrativos del municipio, no un dato catastral.

---

## 7. Textos legales obligatorios en los informes

Definidos en `packages/shared/src/legal.ts` (constante `DISCLAIMERS`) y reproducidos **íntegros**
en la sección 10 de todos los informes, en todos los niveles, y en el
`FUENTES_Y_LICENCIA.txt` de todas las exportaciones. **No se pueden quitar con marca blanca.**

### 7.1 Los ocho descargos

1. **No es certificado catastral.** «Este documento no es un certificado catastral ni un
   certificado de tradición y libertad. No acredita propiedad ni linderos.»
2. **No es avalúo.** «Este documento no es un avalúo comercial. El avalúo catastral que se
   reporta, cuando existe, es un valor fiscal determinado por la autoridad catastral y
   habitualmente difiere del valor de mercado.»
3. **No es concepto de norma urbanística.** «Este documento no es un concepto de norma
   urbanística. Los usos y aprovechamientos permitidos los determina el Plan de Ordenamiento
   Territorial y los actos administrativos del municipio. Consulte la Secretaría de Planeación
   municipal.»
4. **No reemplaza un estudio de títulos.** «Este documento no reemplaza un estudio de títulos ni
   una asesoría jurídica. Antes de cualquier transacción consulte a un abogado y verifique el
   folio de matrícula inmobiliaria en la Oficina de Registro de Instrumentos Públicos.»
5. **Escala de las amenazas.** «Las capas de amenaza provienen de estudios a escala regional o
   nacional. Sirven para orientar decisiones preliminares y no sustituyen los estudios de detalle
   exigidos para licencias de construcción o urbanización.»
6. **Cobertura.** «La cobertura de datos catastrales depende del gestor catastral de cada
   municipio. Cuando un municipio no es jurisdicción del IGAC o no publica datos abiertos, este
   documento lo indica explícitamente y no infiere información.»
7. **Vigencia.** «Todo dato se presenta con su fecha de corte. Los procesos catastrales,
   ambientales y de ordenamiento cambian con el tiempo; verifique la vigencia antes de decidir.»
8. **Sin datos personales.** «Este producto no procesa ni entrega datos personales de propietarios
   u ocupantes. La información es de carácter territorial.»

### 7.2 La advertencia del avalúo

Regla 5 de `CLAUDE.md`: **cualquier dato económico catastral va acompañado de la advertencia
«avalúo catastral ≠ valor comercial»**, con ese texto literal.

Se aplica en: la ficha del predio, cada tabla que contenga la columna, la sección 10 del informe,
las notas de cabecera de los CSV, la hoja de fuentes del XLSX y el `FUENTES_Y_LICENCIA.txt`. Las
teselas vectoriales **no incluyen** el avalúo, precisamente porque una tesela no puede llevar la
advertencia.

Hay pruebas automatizadas que fallan si el texto desaparece de las plantillas o de las
exportaciones.

### 7.3 Datos de demostración

Regla derivada de ADR-006: si un informe toca un snapshot sintético, la **portada lleva una banda
"DATOS DE DEMOSTRACIÓN"** y la hoja de fuentes lo repite. No se puede quitar con marca blanca.
Presentar un dato de demostración como real sería la peor falla posible de este producto.

### 7.4 Qué permite cambiar la marca blanca

| Se puede cambiar | No se puede quitar |
| --- | --- |
| Nombre de la organización | La sección de fuentes y fechas de corte |
| Logo (solo `data:` URI de imagen) | Los ocho descargos, íntegros |
| Colores principal y de acento (solo hexadecimal) | La advertencia «avalúo catastral ≠ valor comercial» |
| Nota del pie de página | El QR de verificación y la huella del contenido |
| La mención «Generado por TerraColombia» | La atribución al IGAC y a OpenStreetMap |
| — | La banda de datos de demostración |

Los colores y el logo se sanean (`safeColor`, `safeLogo`): cualquier otra cosa se descarta, para
que la marca blanca no sea una vía de inyección de CSS ni de carga de recursos remotos en el PDF.

---

## 8. Pendientes legales que bloquean el lanzamiento comercial

Ordenados por criticidad. Los tres primeros están en `LEGAL_PENDING` de
`packages/shared/src/legal.ts` y se imprimen en el `FUENTES_Y_LICENCIA.txt` de toda exportación:
mientras no se resuelvan, quien reciba un archivo nuestro lo sabe.

### P1 — Concepto de abogado sobre el alcance de CompartirIgual 🔴 BLOQUEANTE

**Qué falta.** Un concepto escrito que responda:

1. ¿Servir datos del IGAC por nuestra API es «distribuir una adaptación»? Si lo es, ¿basta con
   declarar CC BY-SA 4.0 en `meta.sources[]`, como hacemos hoy?
2. ¿Un indicador calculado sobre datos CC BY-SA 4.0 —un puntaje H3, un semáforo de aptitud— es
   una **adaptación** que hereda la licencia, o una obra nueva?
3. Si un cliente exporta a GeoPackage y publica el resultado, ¿qué obligación tiene? ¿Y qué
   obligación tenemos nosotros de advertírselo? (Hoy se lo advertimos en
   `FUENTES_Y_LICENCIA.txt`; ¿es suficiente?)
4. ¿La separación `SA_` / `TC_` de nuestras exportaciones es jurídicamente relevante o solo
   cosmética?
5. Lo mismo, por separado, para la **ODbL 1.0** de OpenStreetMap, que tiene su propio concepto de
   base derivada y su cláusula de «entregar la versión de la base».

**Por qué bloquea.** La respuesta a (2) determina si podemos licenciar nuestros indicadores como
propietarios. Si la respuesta es «son adaptaciones», el plan de precios de los planes Business y
API hay que repensarlo.

**Mitigación mientras tanto.** La separación por licencia ya está implementada, así que la
decisión se puede aplicar sin rehacer el producto. Y el discurso comercial ya está construido
sobre el servicio, no sobre la exclusividad del dato.

### P2 — Política de tratamiento de datos personales 🔴 BLOQUEANTE

**Qué falta.** Redactar, publicar y exigir la aceptación en el registro de la política de
tratamiento de datos conforme a la Ley 1581 de 2012 y al Decreto 1377 de 2013:

- finalidades del tratamiento;
- derechos del titular y canal para ejercerlos;
- responsable y encargado del tratamiento;
- plazos de conservación;
- transferencias y transmisiones internacionales (tenemos infraestructura en AWS y una pasarela de
  pagos con operación regional);
- registro de la base de datos ante la SIC, si aplica por tamaño de la empresa.

**Alcance.** Cubre a **nuestros usuarios**, no a los predios. Los datos territoriales no son
personales y no entran aquí.

**Por qué bloquea.** No se puede cobrar a una persona natural sin política de tratamiento
publicada y aceptada.

### P3 — Revisión por abogado de los textos de descargo 🔴 BLOQUEANTE

**Qué falta.** Que un abogado revise los ocho descargos de la sección 7, la advertencia del
avalúo y el texto de cobertura, y confirme que:

- limitan efectivamente la responsabilidad frente a una decisión de compra tomada con el informe;
- no prometen nada que no entreguemos;
- son compatibles con el Estatuto del Consumidor (Ley 1480 de 2011) en la venta a persona natural.

**Por qué bloquea.** El Informe Territorial de Predio se vende a personas que están a punto de
comprar un inmueble. Es el escenario de reclamación más probable del producto.

### P4 — Facturación electrónica ante la DIAN 🟠 ALTA

**Qué falta.** Contratar un proveedor tecnológico autorizado y conectar el puerto
`InvoiceProvider` de `packages/payments`. Hoy existe el puerto y un `NoopInvoiceProvider` que
**deja constancia explícita** de que la factura no se emitió, en lugar de fingir que sí.

**Consecuencia actual.** El pago se registra y el producto se entrega, pero la factura electrónica
hay que emitirla por fuera del sistema. No es sostenible a volumen.

### P5 — Términos y condiciones del servicio 🟠 ALTA

**Qué falta.** Redactar y publicar los términos que hoy solo están descritos en la documentación:

- límites de uso, cuotas y prohibición de raspado sistemático;
- prohibición de reventa del acceso a la API sin acuerdo;
- prohibición de retirar la atribución de nuestras salidas;
- prohibición de presentar los indicadores como avalúos, conceptos jurídicos o certificados;
- limitación de responsabilidad y ley aplicable;
- SLA de los planes que lo prometen (Enterprise).

### P6 — Licencia de los catastros descentralizados 🟡 MEDIA

**Qué falta.** Verificar, **gestor por gestor**, la licencia de los datos de cada catastro
descentralizado antes de integrarlo (Bogotá, Medellín, Cali, Barranquilla, Antioquia y los demás).

**Riesgo.** Asumir que todos publican bajo CC BY-SA 4.0 porque el IGAC lo hace. No hay razón para
creerlo, y un gestor podría tener términos más restrictivos o prohibir el uso comercial.

### P7 — Licencia de las fuentes por verificar 🟡 MEDIA

**Qué falta.** Confirmar la licencia y las condiciones de uso de:

- **ANM / ANH** (títulos mineros y bloques): apertura por verificar.
- **Observatorio Inmobiliario del IGAC**: qué expone y con qué licencia. Si trae datos de mercado,
  cambia el producto; si su licencia es restrictiva, no se integra.
- **Zonas homogéneas geoeconómicas**: disponibilidad abierta por municipio.
- **IDEAM y SGC**: términos concretos de cada servicio, más allá de «datos abiertos».

**Regla mientras tanto:** un dataset sin licencia verificada **no se publica**. `meta.dataset` no
admite licencia nula.

### P8 — Propiedad intelectual de las plantillas de negocio 🟢 BAJA

**Qué falta.** Decidir si las plantillas de localización (pesos, fórmulas, umbrales por tipo de
negocio) se protegen como secreto empresarial o se publican como parte de la explicabilidad.

**Tensión real.** El producto promete que todo indicador trae su fórmula, y esa promesa es parte
de su valor. Publicar las fórmulas es coherente con el discurso y facilita que un competidor las
copie. La decisión es de negocio, no jurídica, pero tiene consecuencias jurídicas.

### P9 — Marca y nombre 🟢 BAJA

**Qué falta.** «TerraColombia» es un nombre de trabajo. Verificar disponibilidad en la SIC,
registrar la marca y comprobar que no colisiona con entidades públicas ni induce a pensar que el
producto es oficial. **Un producto de datos catastrales que parece oficial y no lo es es un
problema**, no solo de marca.

---

## 9. Checklist de lanzamiento

Ninguna de estas casillas está marcada todavía.

- [ ] P1 · Concepto de abogado sobre CompartirIgual recibido y aplicado
- [ ] P2 · Política de tratamiento de datos publicada y aceptada en el registro
- [ ] P3 · Descargos revisados por abogado
- [ ] P4 · Proveedor de facturación electrónica contratado y conectado
- [ ] P5 · Términos y condiciones publicados
- [ ] P6 · Licencias de los gestores catastrales integrados verificadas una a una
- [ ] P7 · Licencias de ANM/ANH, Observatorio Inmobiliario y zonas homogéneas verificadas
- [ ] P8 · Decisión sobre la propiedad de las plantillas de negocio
- [ ] P9 · Marca registrada
- [ ] Auditoría de que ninguna respuesta de la API publica una cifra sin procedencia
- [ ] Auditoría de que la lista negra de PII cubre todos los datasets integrados
- [ ] Prueba de que las exportaciones separan correctamente por licencia en los siete formatos
- [ ] Prueba de que los ocho descargos aparecen íntegros en los tres niveles de informe

---

## 10. Reglas operativas que se derivan de todo esto

Resumen accionable para quien escriba código en este repositorio:

1. **Sin procedencia no se muestra.** Toda cifra lleva fuente, dataset, fecha de corte y licencia.
2. **Sin licencia declarada no se publica.** `meta.dataset.license` es obligatorio.
3. **Nunca se inventa un campo, una capa ni una URL de fuente.** Si no existe, se marca
   `NO_DISPONIBLE`.
4. **Cero datos personales.** Si una fuente los trae, se descartan en la ingesta y se registra.
5. **Avalúo catastral ≠ valor comercial**, con ese texto literal, junto a toda cifra económica
   catastral.
6. **Cobertura honesta.** Un municipio sin datos se explica; nunca se presenta como vacío.
7. **Los datos ShareAlike van separados** de los indicadores propios, en la base y en toda
   exportación.
8. **Los descargos van íntegros**, en todos los niveles de informe y en toda exportación.
9. **La marca blanca no quita la parte legal.**
10. **Un snapshot sintético se marca siempre**, en la portada y en la hoja de fuentes.

---

## 11. Referencias

### Normativa

- [Ley 1581 de 2012](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981) — protección de datos personales
- [Decreto 1377 de 2013](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646) — reglamentario de la Ley 1581
- [Ley 1712 de 2014](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=56882) — transparencia y acceso a la información pública
- [Ley 388 de 1997](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=339) — desarrollo territorial y POT
- [Ley 1955 de 2019](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=93970) — catastro multipropósito y gestores catastrales
- [Decreto 148 de 2020](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=107556) — reglamentario del catastro multipropósito
- [Ley 1480 de 2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306) — Estatuto del Consumidor

### Licencias

- [CC BY-SA 4.0, texto en español](https://creativecommons.org/licenses/by-sa/4.0/deed.es)
- [CC BY-SA 4.0, texto legal completo](https://creativecommons.org/licenses/by-sa/4.0/legalcode.es)
- [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Copyright y licencia de OpenStreetMap](https://www.openstreetmap.org/copyright)

### En este repositorio

| Archivo | Qué contiene |
| --- | --- |
| `packages/shared/src/legal.ts` | `DISCLAIMERS`, `LICENSES`, `isShareAlike()`, `LEGAL_PENDING` |
| `packages/shared/src/provenance.ts` | `SourceRef`, `Coverage`, `ResponseMeta`, `IGAC_ATTRIBUTION_TEMPLATE()` |
| `packages/reports/src/tabular.ts` | Clasificación por licencia y texto de `FUENTES_Y_LICENCIA` |
| `packages/reports/src/exporters.ts` | Separación por licencia en los siete formatos |
| `packages/reports/src/templates/parcel-report.ts` | Las 10 secciones del informe de predio |
| `etl/config/pii-blocklist.ts` | Lista negra de columnas con datos personales |
| `apps/docs-site/guia/licencias-y-atribucion.md` | La versión pública de este documento |
| `CLAUDE.md` | Las diez reglas obligatorias del repositorio |
| `PLAN.md` §2 | El marco legal original del que sale este documento |
