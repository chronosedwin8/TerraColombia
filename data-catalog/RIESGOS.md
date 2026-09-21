# Riesgos de datos — Fase 0

> Lo que puede romper el producto o impedir una promesa comercial. Sale de la inspección real, no de suposiciones.
> Generado el 2026-09-21 15:42:08 UTC por `pnpm catalog:report`.
> Esquema de catálogo v1.

## Severidad alta (79)

### Dataset con columnas de datos personales: Gestores Catastrales de Colombia

| Campo | Valor |
|---|---|
| Id | `socrata-pii-bhcx-bx97` |
| Fuente | igac |
| Afecta a | https://www.datos.gov.co/d/bhcx-bx97 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: contacto.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Alimentos del trópico para alimentación animal - AlimenTro

| Campo | Valor |
|---|---|
| Id | `socrata-pii-6arb-d547` |
| Fuente | igac |
| Afecta a | https://www.datos.gov.co/d/6arb-d547 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_alterno_2, nombre_alterno_1, nombre_alterno_3.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Registro de transacciones inmobiliarias en Colombia IGAC

| Campo | Valor |
|---|---|
| Id | `socrata-pii-7y2j-43cv` |
| Fuente | igac |
| Afecta a | https://www.datos.gov.co/d/7y2j-43cv |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_natujur, documento_justificativo.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Sedes de los Establecimientos Educativos del Departamento de Antioquia

| Campo | Valor |
|---|---|
| Id | `socrata-pii-tgsp-kujm` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/tgsp-kujm |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: tel_fono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOYACÁ

| Campo | Valor |
|---|---|
| Id | `socrata-pii-emd6-ef7x` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/emd6-ef7x |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: genero, nombre, correo_electr_nico, tel_fono, discapacidades, nombre_rector.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Listado de sedes de los Establecimientos Educativos Oficiales (municipios no certificados) del Departamento del Atlántico.

| Campo | Valor |
|---|---|
| Id | `socrata-pii-7g6s-xche` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/7g6s-xche |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_ee.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Listado de los Establecimientos Educativos No Oficiales del Departamento del Atlántico (municipios no certificados)

| Campo | Valor |
|---|---|
| Id | `socrata-pii-m6wg-s96s` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/m6wg-s96s |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: correo_electr_nico, nombre, discapacidades, nombre_rector, tel_fono, genero.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA

| Campo | Valor |
|---|---|
| Id | `socrata-pii-cfw5-qzt5` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/cfw5-qzt5 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: email, telefono, fax.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: CONECTIVIDAD EN SEDES EDUCATIVAS OFICIALES DE LOS MUNICIPIOS NO CERTIFICADOS DEL DEPARTAMENTO DE SANTANDER

| Campo | Valor |
|---|---|
| Id | `socrata-pii-spve-848d` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/spve-848d |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: operador_conectividad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_SEDES_EDUCATIVAS_PREESCOLAR_BÁSICA_Y_MEDIA

| Campo | Valor |
|---|---|
| Id | `socrata-pii-x5ay-984n` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/x5ay-984n |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: email, fax, telefono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTUDIANTES CON DISCAPACIDAD DEPARTAMENTO DE SANTANDER

| Campo | Valor |
|---|---|
| Id | `socrata-pii-b6yg-3vyi` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/b6yg-3vyi |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: etnia, d_genero.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Sedes de los Instituciones Educativas del Departamento de Boyacá

| Campo | Valor |
|---|---|
| Id | `socrata-pii-65zu-5xdk` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/65zu-5xdk |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: tel_fono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Listado de Instituciones Educativas Oficiales y No Oficiales del Departamento del Atlántico.

| Campo | Valor |
|---|---|
| Id | `socrata-pii-7tec-5fhs` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/7tec-5fhs |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_rector, genero, discapacidades, nombre, correo_electr_nico.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Listado de instituciones y centros educativos públicos del departamento de Casanare

| Campo | Valor |
|---|---|
| Id | `socrata-pii-vqup-4isj` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/vqup-4isj |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_del_establecimiento, telefono_de_la_institucion, email.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definitivas

| Campo | Valor |
|---|---|
| Id | `socrata-pii-hyqu-diue` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/hyqu-diue |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: orientacion_sexual, sexo_de_la_victima, sexo_del_agresor, estado_civil, tipo_de_discapacidad, identidad_de_genero.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS NO CERTIFICADOS CON CONEXIÓN A INTERNET - DEPARTAMENTO DE BOYACÁ

| Campo | Valor |
|---|---|
| Id | `socrata-pii-pejt-qp6n` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/pejt-qp6n |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_ie.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS DEL DEPARTAMENTO DE BOYACÁ CON CONEXION A INTERNET

| Campo | Valor |
|---|---|
| Id | `socrata-pii-xrdq-pb8b` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/xrdq-pb8b |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: operador.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Programa conexión total del Departamento de Caldas

| Campo | Valor |
|---|---|
| Id | `socrata-pii-rzcg-uhwd` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/rzcg-uhwd |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_instituci_n_educativa.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_MATRICULA_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA

| Campo | Valor |
|---|---|
| Id | `socrata-pii-ngw5-c5nw` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/ngw5-c5nw |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: genero_1, genero.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE en el Municipio de Sogamoso Boyacá

| Campo | Valor |
|---|---|
| Id | `socrata-pii-7y7n-8wu6` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/7y7n-8wu6 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: genero, discapacidad, tipo_documento, nombre_de_la_institucion.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Zonas Comunitarias para la Paz – Puntos de Conectividad Instalados en el Departamento del Caquetá

| Campo | Valor |
|---|---|
| Id | `socrata-pii-e6kt-wdhu` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/e6kt-wdhu |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: operador, nombre_ee.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Registro Especial de Prestadores de Salud en el Departamento del Atlántico.

| Campo | Valor |
|---|---|
| Id | `socrata-pii-qsh3-vq78` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/qsh3-vq78 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: email, nom_prestador, nit, telefono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Prestadores de Salud Departamento de Antioquia

| Campo | Valor |
|---|---|
| Id | `socrata-pii-b4dp-ximh` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/b4dp-ximh |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: digito_verificacion_nit, email, nit, fax, telefono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Directorio de instituciones establecimientos educativas oficiales y a nivel departamental

| Campo | Valor |
|---|---|
| Id | `socrata-pii-w3uf-w23h` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/w3uf-w23h |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: telefono_de_la_institucion, email, nombre_del_establecimiento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Entidades de salud en el Departamento de Risaralda

| Campo | Valor |
|---|---|
| Id | `socrata-pii-bvpy-6cm7` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/bvpy-6cm7 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: email, telefono.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES

| Campo | Valor |
|---|---|
| Id | `socrata-pii-y9ga-zwzy` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/y9ga-zwzy |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_del_departamento, nombre_del_municipio.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_MATRICULA_MIGRANTES_EN_EDUCACION_BASICA_Y_MEDIA

| Campo | Valor |
|---|---|
| Id | `socrata-pii-enmx-7kvv` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/enmx-7kvv |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: discapacidad, genero.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_ESTADISTICAS DE MATRICULA POR DEPARTAMENTOS_ES

| Campo | Valor |
|---|---|
| Id | `socrata-pii-4hrb-y62g` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/4hrb-y62g |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_del_departamento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MATRICULA POR GRADO Y EDAD DEPARTAMENTO DE SANTANDER

| Campo | Valor |
|---|---|
| Id | `socrata-pii-upgu-2ytp` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/upgu-2ytp |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nomb_sec.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Entidades sin ánimo de lucro en Departamento de Casanare.

| Campo | Valor |
|---|---|
| Id | `socrata-pii-hqpw-8e5g` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/hqpw-8e5g |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: tel_fono_2, nit, tel_fono_3, tel_fono_1, email.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_ETC

| Campo | Valor |
|---|---|
| Id | `socrata-pii-sras-4t5p` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/sras-4t5p |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_etc.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTABLECIMIENTOS VIGILADOS POR EL INVIMA EN LA DISCIPLINA DE ALIMENTOS

| Campo | Valor |
|---|---|
| Id | `socrata-pii-uhs6-qp53` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/uhs6-qp53 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: razon_social, nit.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: CÓDIGO ÚNICO DE MEDICAMENTOS VENCIDOS

| Campo | Valor |
|---|---|
| Id | `socrata-pii-vwwf-4ftk` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/vwwf-4ftk |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: titular.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: CÓDIGO ÚNICO DE MEDICAMENTOS VIGENTES

| Campo | Valor |
|---|---|
| Id | `socrata-pii-i7cb-raxc` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/i7cb-raxc |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: titular.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: CÓDIGO ÚNICO DE MEDICAMENTOS EN TRÁMITE DE RENOVACIÓN

| Campo | Valor |
|---|---|
| Id | `socrata-pii-vgr4-gemg` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/vgr4-gemg |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: titular.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE BOYACÁ

| Campo | Valor |
|---|---|
| Id | `socrata-pii-j8bh-xk3n` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/j8bh-xk3n |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: correo_electronico, nombre_comercial, nombre_gerente.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTABLECIMIENTOS AUTORIZADOS PARA EL ALMACENAMIENTO Y DISTRIBUCIÓN DE MEDICAMENTOS

| Campo | Valor |
|---|---|
| Id | `socrata-pii-2btt-9z2g` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/2btt-9z2g |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Directorio de cuadrantes de Metropolitanas y Departamentos de Policía

| Campo | Valor |
|---|---|
| Id | `socrata-pii-jwvi-unqh` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/jwvi-unqh |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: numero_celular_cuadrante.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: CÓDIGO ÚNICO DE MEDICAMENTOS OTROS ESTADOS

| Campo | Valor |
|---|---|
| Id | `socrata-pii-spzp-dfuc` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/spzp-dfuc |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: titular.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTABLECIMIENTOS FABRICANTES DE DISPOSITIVOS MÉDICOS SOBRE MEDIDA

| Campo | Valor |
|---|---|
| Id | `socrata-pii-f25x-wa6y` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/f25x-wa6y |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTABLECIMIENTOS INSCRITOS PARA EL MANEJO DE MEDICAMENTOS DE CONTROL ESPECIAL

| Campo | Valor |
|---|---|
| Id | `socrata-pii-gc4x-u4iy` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/gc4x-u4iy |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_o_razon_social.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: ESTABLECIMIENTOS IMPORTADORES CERTIFICADOS EN CCAA DE DISPOSITIVOS MÉDICOS Y EQUIPOS BIOMÉDICOS

| Campo | Valor |
|---|---|
| Id | `socrata-pii-s3n2-sqjp` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/s3n2-sqjp |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Establecimientos con manejo de medicamentos de control especial

| Campo | Valor |
|---|---|
| Id | `socrata-pii-jebm-jp6y` |
| Fuente | men |
| Afecta a | https://www.datos.gov.co/d/jebm-jp6y |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: razon_social.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada

| Campo | Valor |
|---|---|
| Id | `socrata-pii-s2ru-bqt6` |
| Fuente | minsalud |
| Afecta a | https://www.datos.gov.co/d/s2ru-bqt6 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nom_grupo_capacidad, email, nombre_prestador, nom_descripcion_capacidad, tel_fono, nit_ips.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Registro Especial de Prestadores y Sedes de Servicios de Salud

| Campo | Valor |
|---|---|
| Id | `socrata-pii-c36g-9fc2` |
| Fuente | minsalud |
| Afecta a | https://www.datos.gov.co/d/c36g-9fc2 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: numeroidentificacion, email_prestador, email_sede, telefonoprestador.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Sedes de prestadores con servicio de vacunación

| Campo | Valor |
|---|---|
| Id | `socrata-pii-9vau-g3q7` |
| Fuente | minsalud |
| Afecta a | https://www.datos.gov.co/d/9vau-g3q7 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Clicsalud - Termómetro de Precios de Medicamentos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-n4dj-8r7k` |
| Fuente | minsalud |
| Afecta a | https://www.datos.gov.co/d/n4dj-8r7k |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_comercial.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Contratos Electrónicos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-jbjy-vk9h` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/jbjy-vk9h |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: n_mero_de_documento_ordenador_de_pago, nombre_del_banco, nombre_ordenador_del_gasto, nit_entidad, descripcion_documentos_tipo, documentos_tipo, fecha_de_firma, documento_proveedor, tipo_de_documento_ordenador_de_pago, nombre_ordenador_de_pago, n_mero_de_documento_supervisor, tipo_de_documento_supervisor, nombre_supervisor, n_mero_de_documento_ordenador_del_gasto, tipo_de_documento_ordenador_del_gasto, nombre_representante_legal.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP Integrado

| Campo | Valor |
|---|---|
| Id | `socrata-pii-rpmr-utcd` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/rpmr-utcd |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: tipo_documento_proveedor, documento_proveedor, nom_raz_social_contratista, nombre_de_la_entidad, nit_de_la_entidad, fecha_de_firma_del_contrato.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Proveedores Registrados

| Campo | Valor |
|---|---|
| Id | `socrata-pii-qmzu-gj57` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/qmzu-gj57 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre, nit, nombre_representante_legal, telefono, correo_representante_legal, telefono_representante_legal, fax, correo.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Ubicaciones ejecucion contratos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-gra4-pcp2` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/gra4-pcp2 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad, documento_proveedor.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Ubicaciones Adicionales

| Campo | Valor |
|---|---|
| Id | `socrata-pii-wwhe-4sq8` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/wwhe-4sq8 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Rubros Presupuestales

| Campo | Valor |
|---|---|
| Id | `socrata-pii-cwhv-7fnp` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/cwhv-7fnp |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Solicitudes CDPs

| Campo | Valor |
|---|---|
| Id | `socrata-pii-a86w-fh92` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/a86w-fh92 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit, nit_proveedor.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP - Convenios Interadministrativos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-s484-c9k3` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/s484-c9k3 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: anno_firma, fecha_firma, identificacion_contratista.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP I - Procesos de Compra Pública

| Campo | Valor |
|---|---|
| Id | `socrata-pii-f789-7hwg` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/f789-7hwg |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_sub_unidad_ejecutora, fecha_de_firma_del_contrato, sexo_replegal, nombre_del_represen_legal, nombre_grupo, nombre_familia, nombre_rubro, nom_razon_social_contratista, identificacion_del_contratista, nombre_regimen_de_contratacion, anno_firma_contrato, nit_de_la_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Archivos Descarga Desde 2025

| Campo | Valor |
|---|---|
| Id | `socrata-pii-dmgg-8hin` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/dmgg-8hin |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: id_documento, url_descarga_documento, nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Modificaciones a contratos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-u8cx-r425` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/u8cx-r425 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_aplicacion_creacion.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Facturas

| Campo | Valor |
|---|---|
| Id | `socrata-pii-ibyt-yi2f` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/ibyt-yi2f |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: usuario_pago.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Contacto Entidades y Proveedores

| Campo | Valor |
|---|---|
| Id | `socrata-pii-4ex9-j3n8` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/4ex9-j3n8 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: n_mero_documento_representante_legal, tipo_documento_representante_legal, nombre_representante_legal, correo_electronico, correo_representante_legal, nit_entidad, numero_fax.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Archivos Descarga Historico 2023

| Campo | Valor |
|---|---|
| Id | `socrata-pii-3skv-9na7` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/3skv-9na7 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: id_documento, nit_entidad, url_descarga_documento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Multas y Sanciones SECOP I

| Campo | Valor |
|---|---|
| Id | `socrata-pii-4n4q-k399` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/4n4q-k399 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad, nombre_contratista, documento_contratista.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Proponentes por Proceso SECOP II

| Campo | Valor |
|---|---|
| Id | `socrata-pii-hgi6-6wh3` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/hgi6-6wh3 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_proveedor, nit_entidad, nombre_procedimiento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Plan de pagos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-uymx-8p3j` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/uymx-8p3j |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_proveedor, nit_entidad, tipo_documento_supervisor, documento_proveedor, documento_supervisor, nombre_supervisor.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Procesos de Contratación

| Campo | Valor |
|---|---|
| Id | `socrata-pii-p6dx-8zbt` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/p6dx-8zbt |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_del_proveedor, nit_entidad, nombre_de_la_unidad_de, nombre_del_procedimiento, nit_del_proveedor_adjudicado, nombre_del_adjudicador.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Archivos Descarga Historico Hasta 2021

| Campo | Valor |
|---|---|
| Id | `socrata-pii-f8va-cf4m` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/f8va-cf4m |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: id_documento, url_descarga_documento, nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Archivos Descarga Historico 2022

| Campo | Valor |
|---|---|
| Id | `socrata-pii-kgcd-kt7i` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/kgcd-kt7i |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad, url_descarga_documento, id_documento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP - Convenios Interadministrativos Historico

| Campo | Valor |
|---|---|
| Id | `socrata-pii-ityv-bxct` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/ityv-bxct |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: fecha_firma, identificacion_contratista, anno_firma.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP I - Procesos de Compra Pública Historico

| Campo | Valor |
|---|---|
| Id | `socrata-pii-qddk-cgux` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/qddk-cgux |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_familia, nombre_rubro, nom_razon_social_contratista, identificacion_del_contratista, nombre_grupo, nombre_del_represen_legal, nombre_sub_unidad_ejecutora, anno_firma_contrato, nombre_regimen_de_contratacion, sexo_replegal, nit_de_la_entidad, fecha_de_firma_del_contrato.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Archivos Descarga Historico 2024

| Campo | Valor |
|---|---|
| Id | `socrata-pii-nbae-kzan` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/nbae-kzan |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad, url_descarga_documento, id_documento.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Grupos de Proveedores - SECOP II

| Campo | Valor |
|---|---|
| Id | `socrata-pii-ceth-n4bn` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/ceth-n4bn |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_participante, nit_participante, correo_representante_legal_grupo, correo_electronico_grupo, nombre_representante_legal_grupo, numero_tel_fono_grupo, telefono_representante_legal_grupo, numero_fax, nit_grupo, nombre_grupo.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP I - Adiciones

| Campo | Valor |
|---|---|
| Id | `socrata-pii-7fix-nd37` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/7fix-nd37 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: fecha_firma.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP II - Modificaciones a Procesos

| Campo | Valor |
|---|---|
| Id | `socrata-pii-e2u2-swiw` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/e2u2-swiw |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP I - PAA Detalle

| Campo | Valor |
|---|---|
| Id | `socrata-pii-azeg-sgqg` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/azeg-sgqg |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: contacto_responsable_adquisicion.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOPII - Ofertas Por Proceso

| Campo | Valor |
|---|---|
| Id | `socrata-pii-wi7w-2nvm` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/wi7w-2nvm |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_del_proveedor, nombre_proveedor, nit_entidad_compradora.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOPII - Plan Anual De Adquisiciones Detalle

| Campo | Valor |
|---|---|
| Id | `socrata-pii-9sue-ezhx` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/9sue-ezhx |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: correo_del_contacto, telefono_del_contacto, nombre_del_contacto, nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOP I - PAA Encabezado

| Campo | Valor |
|---|---|
| Id | `socrata-pii-prdx-nxyp` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/prdx-nxyp |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: telefono_entidad, nit_entidad.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: Tienda Virtual del Estado Colombiano - Consolidado

| Campo | Valor |
|---|---|
| Id | `socrata-pii-rgxm-mmea` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/rgxm-mmea |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nit_proveedor, nit_entidad, solicitante.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

### Dataset con columnas de datos personales: SECOPII - Ofertas Por Proceso Historico

| Campo | Valor |
|---|---|
| Id | `socrata-pii-b28v-edj8` |
| Fuente | secop |
| Afecta a | https://www.datos.gov.co/d/b28v-edj8 |
| Módulos | M2, M4, M7 |

**Qué pasa.** Columnas descartadas por la lista negra: nombre_proveedor, nit_del_proveedor, nit_entidad_compradora.

**Qué hacemos.** Ingerir solo con proyección explícita de columnas (`$select`), nunca `SELECT *`, y declararlas en `piiBlocklist` del dataset de ETL.

## Severidad media (6)

### Pendiente de verificar en Geoportal DANE — descargas del Marco Geoestadístico Nacional

| Campo | Valor |
|---|---|
| Id | `manual-pending-dane-geoportal-obtener-la-url-directa-y` |
| Fuente | dane |
| Afecta a | https://geoportal.dane.gov.co/ |
| Módulos | M1 |

**Qué pasa.** Obtener la URL directa y estable del ZIP del MGN del año en curso (el portal usa descargas por formulario).

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

### Pendiente de verificar en Geoportal DANE — descargas del Marco Geoestadístico Nacional

| Campo | Valor |
|---|---|
| Id | `manual-pending-dane-geoportal-confirmar-la-licencia-de` |
| Fuente | dane |
| Afecta a | https://geoportal.dane.gov.co/ |
| Módulos | M1 |

**Qué pasa.** Confirmar la licencia de uso y la atribución exigida.

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

### Pendiente de verificar en Geoportal DANE — descargas del Marco Geoestadístico Nacional

| Campo | Valor |
|---|---|
| Id | `manual-pending-dane-geoportal-verificar-el-crs-de-entr` |
| Fuente | dane |
| Afecta a | https://geoportal.dane.gov.co/ |
| Módulos | M1 |

**Qué pasa.** Verificar el CRS de entrega (se espera EPSG:4686) y la codificación de los CSV.

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

### Pendiente de verificar en IGAC — portal de datos abiertos (ArcGIS Hub)

| Campo | Valor |
|---|---|
| Id | `manual-pending-igac-datos-abiertos-hub-localizar-la-url-directa` |
| Fuente | igac |
| Afecta a | https://datos-abiertos-igac-igac-oit.hub.arcgis.com/ |
| Módulos | M1 |

**Qué pasa.** Localizar la URL directa del paquete departamental de la Base Catastral Pública del corte vigente.

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

### Pendiente de verificar en IGAC — portal de datos abiertos (ArcGIS Hub)

| Campo | Valor |
|---|---|
| Id | `manual-pending-igac-datos-abiertos-hub-confirmar-si-la-licencia` |
| Fuente | igac |
| Afecta a | https://datos-abiertos-igac-igac-oit.hub.arcgis.com/ |
| Módulos | M1 |

**Qué pasa.** Confirmar si la licencia del paquete catastral es CC BY-SA 4.0 (como asume PLAN.md §2) o CC BY 4.0 (como declaran los datasets espejados en datos.gov.co).

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

### Pendiente de verificar en OpenStreetMap — extracto de Colombia (Geofabrik)

| Campo | Valor |
|---|---|
| Id | `manual-pending-osm-geofabrik-colombia-decidir-el-subconjunto-d` |
| Fuente | osm |
| Afecta a | https://download.geofabrik.de/south-america/colombia.html |
| Módulos | M1 |

**Qué pasa.** Decidir el subconjunto de etiquetas a ingerir (osm2pgsql style) para no cargar todo el país.

**Qué hacemos.** Resolver antes de declarar el dataset en `etl/config/datasets`.

