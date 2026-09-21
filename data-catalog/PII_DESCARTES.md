# Descartes de datos personales — Fase 0

> Regla 3 de CLAUDE.md: toda columna con datos personales se descarta en la ingesta y queda registrada aquí. No existe ni existirá la ruta predio → persona.
> Generado el 2026-09-21 15:42:08 UTC por `pnpm catalog:report`.
> Esquema de catálogo v1.

## Resumen

| Concepto | Valor |
|---|---|
| Columnas descartadas por nombre | 244 |
| Valores redactados por heurística de contenido | 11 |
| Columnas distintas afectadas | 142 |
| Capas/datasets afectados | 79 |

## Columnas descartadas por nombre

| Columna | Regla | Motivo | Apariciones | Dónde |
|---|---|---|---|---|
| `nit_entidad` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 17 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos; https://www.datos.gov.co/resource/gra4-pcp2→SECOP II - Ubica… |
| `email` | exact | Columna en la lista negra exacta (email). | 9 | https://www.datos.gov.co/resource/cfw5-qzt5→MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA; https://www.datos.gov.co/resource/x5… |
| `nit` | exact | Columna en la lista negra exacta (nit). | 9 | https://www.datos.gov.co/resource/qsh3-vq78→Registro Especial de Prestadores de Salud en el Departamento del Atlántico.; https://www.datos.… |
| `genero` | exact | Columna en la lista negra exacta (genero). | 6 | https://www.datos.gov.co/resource/emd6-ef7x→Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOY… |
| `nombre` | exact | Columna en la lista negra exacta (nombre). | 6 | https://www.datos.gov.co/resource/emd6-ef7x→Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOY… |
| `telefono` | exact | Columna en la lista negra exacta (telefono). | 6 | https://www.datos.gov.co/resource/cfw5-qzt5→MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA; https://www.datos.gov.co/resource/x5… |
| `tel_fono` | phone | Teléfono o celular de contacto. | 5 | https://www.datos.gov.co/resource/tgsp-kujm→Sedes de los Establecimientos Educativos del Departamento de Antioquia; https://www.datos.gov.c… |
| `id_documento` | identity_document | Documento de identidad. | 5 | https://www.datos.gov.co/resource/dmgg-8hin→SECOP II - Archivos Descarga Desde 2025; https://www.datos.gov.co/resource/3skv-9na7→SECOP II -… |
| `url_descarga_documento` | identity_document | Documento de identidad. | 5 | https://www.datos.gov.co/resource/dmgg-8hin→SECOP II - Archivos Descarga Desde 2025; https://www.datos.gov.co/resource/3skv-9na7→SECOP II -… |
| `fax` | exact | Columna en la lista negra exacta (fax). | 4 | https://www.datos.gov.co/resource/cfw5-qzt5→MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA; https://www.datos.gov.co/resource/x5… |
| `titular` | exact | Columna en la lista negra exacta (titular). | 4 | https://www.datos.gov.co/resource/vwwf-4ftk→CÓDIGO ÚNICO DE MEDICAMENTOS VENCIDOS; https://www.datos.gov.co/resource/i7cb-raxc→CÓDIGO ÚNICO… |
| `documento_proveedor` | identity_document | Documento de identidad. | 4 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos; https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado;… |
| `correo_electr_nico` | email | Correo electrónico. | 3 | https://www.datos.gov.co/resource/emd6-ef7x→Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOY… |
| `discapacidades` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 3 | https://www.datos.gov.co/resource/emd6-ef7x→Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOY… |
| `nombre_rector` | person_name | Nombre o apellido de persona. | 3 | https://www.datos.gov.co/resource/emd6-ef7x→Establecimientos Educativos del sector oficial y no oficial por municipio - DEPARTAMENTO DE BOY… |
| `nombre_representante_legal` | person_name | Nombre o apellido de persona. | 3 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos; https://www.datos.gov.co/resource/qmzu-gj57→SECOP II - Prove… |
| `nit_de_la_entidad` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 3 | https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado; https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Públi… |
| `fecha_de_firma_del_contrato` | biometric | Dato biométrico o imagen de la persona. | 3 | https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado; https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Públi… |
| `nit_proveedor` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 3 | https://www.datos.gov.co/resource/a86w-fh92→SECOP II - Solicitudes CDPs; https://www.datos.gov.co/resource/hgi6-6wh3→Proponentes por Proces… |
| `fecha_firma` | biometric | Dato biométrico o imagen de la persona. | 3 | https://www.datos.gov.co/resource/s484-c9k3→SECOP - Convenios Interadministrativos; https://www.datos.gov.co/resource/ityv-bxct→SECOP - Con… |
| `nombre_grupo` | person_name | Nombre o apellido de persona. | 3 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nombre_proveedor` | person_name | Nombre o apellido de persona. | 3 | https://www.datos.gov.co/resource/uymx-8p3j→SECOP II - Plan de pagos; https://www.datos.gov.co/resource/wi7w-2nvm→SECOPII - Ofertas Por Pro… |
| `nombre_ee` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/7g6s-xche→Listado de sedes de los Establecimientos Educativos Oficiales (municipios no certificados) del … |
| `nombre_del_establecimiento` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/vqup-4isj→Listado de instituciones y centros educativos públicos del departamento de Casanare; https://ww… |
| `telefono_de_la_institucion` | phone | Teléfono o celular de contacto. | 2 | https://www.datos.gov.co/resource/vqup-4isj→Listado de instituciones y centros educativos públicos del departamento de Casanare; https://ww… |
| `operador` | operator_user | Identifica al funcionario u operario que editó el registro. | 2 | https://www.datos.gov.co/resource/xrdq-pb8b→INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS DEL DEPARTAMENTO DE BOYACÁ CON CONEXION A INTE… |
| `discapacidad` | exact | Columna en la lista negra exacta (discapacidad). | 2 | https://www.datos.gov.co/resource/7y7n-8wu6→Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE en el Municipio de Sogamos… |
| `nombre_del_departamento` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/y9ga-zwzy→MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES; https://www.datos.gov.co/resource/4hrb-y62g→MEN_E… |
| `razon_social` | exact | Columna en la lista negra exacta (razon_social). | 2 | https://www.datos.gov.co/resource/uhs6-qp53→ESTABLECIMIENTOS VIGILADOS POR EL INVIMA EN LA DISCIPLINA DE ALIMENTOS; https://www.datos.gov.c… |
| `correo_electronico` | exact | Columna en la lista negra exacta (correo_electronico). | 2 | https://www.datos.gov.co/resource/j8bh-xk3n→Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE BOYACÁ; https://www.datos… |
| `nombre_comercial` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/j8bh-xk3n→Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE BOYACÁ; https://www.datos… |
| `nombre_supervisor` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos; https://www.datos.gov.co/resource/uymx-8p3j→SECOP II - Plan … |
| `correo_representante_legal` | email | Correo electrónico. | 2 | https://www.datos.gov.co/resource/qmzu-gj57→SECOP II - Proveedores Registrados; https://www.datos.gov.co/resource/4ex9-j3n8→SECOP II - Cont… |
| `anno_firma` | biometric | Dato biométrico o imagen de la persona. | 2 | https://www.datos.gov.co/resource/s484-c9k3→SECOP - Convenios Interadministrativos; https://www.datos.gov.co/resource/ityv-bxct→SECOP - Con… |
| `identificacion_contratista` | identity_document | Documento de identidad. | 2 | https://www.datos.gov.co/resource/s484-c9k3→SECOP - Convenios Interadministrativos; https://www.datos.gov.co/resource/ityv-bxct→SECOP - Con… |
| `nombre_sub_unidad_ejecutora` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `sexo_replegal` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nombre_del_represen_legal` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nombre_familia` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nombre_rubro` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nom_razon_social_contratista` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `identificacion_del_contratista` | identity_document | Documento de identidad. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `nombre_regimen_de_contratacion` | person_name | Nombre o apellido de persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `anno_firma_contrato` | biometric | Dato biométrico o imagen de la persona. | 2 | https://www.datos.gov.co/resource/f789-7hwg→SECOP I - Procesos de Compra Pública; https://www.datos.gov.co/resource/qddk-cgux→SECOP I - Pro… |
| `numero_fax` | phone | Teléfono o celular de contacto. | 2 | https://www.datos.gov.co/resource/4ex9-j3n8→SECOP II - Contacto Entidades y Proveedores; https://www.datos.gov.co/resource/ceth-n4bn→Grupos… |
| `nit_del_proveedor` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 2 | https://www.datos.gov.co/resource/wi7w-2nvm→SECOPII - Ofertas Por Proceso; https://www.datos.gov.co/resource/b28v-edj8→SECOPII - Ofertas Po… |
| `nit_entidad_compradora` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 2 | https://www.datos.gov.co/resource/wi7w-2nvm→SECOPII - Ofertas Por Proceso; https://www.datos.gov.co/resource/b28v-edj8→SECOPII - Ofertas Po… |
| `contacto` | exact | Columna en la lista negra exacta (contacto). | 1 | https://www.datos.gov.co/resource/bhcx-bx97→Gestores Catastrales de Colombia |
| `nombre_alterno_2` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/6arb-d547→Alimentos del trópico para alimentación animal - AlimenTro |
| `nombre_alterno_1` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/6arb-d547→Alimentos del trópico para alimentación animal - AlimenTro |
| `nombre_alterno_3` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/6arb-d547→Alimentos del trópico para alimentación animal - AlimenTro |
| `nombre_natujur` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/7y2j-43cv→Registro de transacciones inmobiliarias en Colombia IGAC |
| `documento_justificativo` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/7y2j-43cv→Registro de transacciones inmobiliarias en Colombia IGAC |
| `operador_conectividad` | operator_user | Identifica al funcionario u operario que editó el registro. | 1 | https://www.datos.gov.co/resource/spve-848d→CONECTIVIDAD EN SEDES EDUCATIVAS OFICIALES DE LOS MUNICIPIOS NO CERTIFICADOS DEL DEPARTAMENTO D… |
| `etnia` | exact | Columna en la lista negra exacta (etnia). | 1 | https://www.datos.gov.co/resource/b6yg-3vyi→ESTUDIANTES CON DISCAPACIDAD DEPARTAMENTO DE SANTANDER |
| `d_genero` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/b6yg-3vyi→ESTUDIANTES CON DISCAPACIDAD DEPARTAMENTO DE SANTANDER |
| `orientacion_sexual` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `sexo_de_la_victima` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `sexo_del_agresor` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `estado_civil` | exact | Columna en la lista negra exacta (estado_civil). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `tipo_de_discapacidad` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `identidad_de_genero` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/hyqu-diue→Exámenes médico legales por presunto delito sexual. Colombia, años 2015 a 2024. Cifras definiti… |
| `nombre_ie` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/pejt-qp6n→INSTITUCIONES EDUCATIVAS OFICIALES DE MUNICIPIOS NO CERTIFICADOS CON CONEXIÓN A INTERNET - DEPA… |
| `nombre_instituci_n_educativa` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/rzcg-uhwd→Programa conexión total del Departamento de Caldas |
| `genero_1` | sensitive_attribute | Dato sensible de la persona (Ley 1581/2012, art. 5). | 1 | https://www.datos.gov.co/resource/ngw5-c5nw→MEN_MATRICULA_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA |
| `tipo_documento` | exact | Columna en la lista negra exacta (tipo_documento). | 1 | https://www.datos.gov.co/resource/7y7n-8wu6→Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE en el Municipio de Sogamos… |
| `nombre_de_la_institucion` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/7y7n-8wu6→Estudiantes Beneficiados con el Programa de Alimentación Escolar PAE en el Municipio de Sogamos… |
| `nom_prestador` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/qsh3-vq78→Registro Especial de Prestadores de Salud en el Departamento del Atlántico. |
| `digito_verificacion_nit` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 1 | https://www.datos.gov.co/resource/b4dp-ximh→Prestadores de Salud Departamento de Antioquia |
| `nombre_del_municipio` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/y9ga-zwzy→MEN_ESTADISTICAS MATRICULA POR MUNICIPIOS_ES |
| `nomb_sec` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/upgu-2ytp→MATRICULA POR GRADO Y EDAD DEPARTAMENTO DE SANTANDER |
| `tel_fono_2` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/hqpw-8e5g→Entidades sin ánimo de lucro en Departamento de Casanare. |
| `tel_fono_3` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/hqpw-8e5g→Entidades sin ánimo de lucro en Departamento de Casanare. |
| `tel_fono_1` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/hqpw-8e5g→Entidades sin ánimo de lucro en Departamento de Casanare. |
| `nombre_etc` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/sras-4t5p→MEN_ESTADISTICAS_EN_EDUCACION_EN_PREESCOLAR, BÁSICA Y MEDIA_POR_ETC |
| `nombre_gerente` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/j8bh-xk3n→Base de Prestadores de Servicios Turísticos "SITUR" - DEPARTAMENTO DE BOYACÁ |
| `numero_celular_cuadrante` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/jwvi-unqh→Directorio de cuadrantes de Metropolitanas y Departamentos de Policía |
| `nombre_o_razon_social` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/gc4x-u4iy→ESTABLECIMIENTOS INSCRITOS PARA EL MANEJO DE MEDICAMENTOS DE CONTROL ESPECIAL |
| `nom_grupo_capacidad` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/s2ru-bqt6→Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `nombre_prestador` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/s2ru-bqt6→Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `nom_descripcion_capacidad` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/s2ru-bqt6→Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `nit_ips` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 1 | https://www.datos.gov.co/resource/s2ru-bqt6→Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `numeroidentificacion` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/c36g-9fc2→Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `email_prestador` | email | Correo electrónico. | 1 | https://www.datos.gov.co/resource/c36g-9fc2→Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `email_sede` | email | Correo electrónico. | 1 | https://www.datos.gov.co/resource/c36g-9fc2→Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `telefonoprestador` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/c36g-9fc2→Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `n_mero_de_documento_ordenador_de_pago` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `nombre_del_banco` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `nombre_ordenador_del_gasto` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `descripcion_documentos_tipo` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `documentos_tipo` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `fecha_de_firma` | biometric | Dato biométrico o imagen de la persona. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `tipo_de_documento_ordenador_de_pago` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `nombre_ordenador_de_pago` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `n_mero_de_documento_supervisor` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `tipo_de_documento_supervisor` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `n_mero_de_documento_ordenador_del_gasto` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `tipo_de_documento_ordenador_del_gasto` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/jbjy-vk9h→SECOP II - Contratos Electrónicos |
| `tipo_documento_proveedor` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado |
| `nom_raz_social_contratista` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado |
| `nombre_de_la_entidad` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/rpmr-utcd→SECOP Integrado |
| `telefono_representante_legal` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/qmzu-gj57→SECOP II - Proveedores Registrados |
| `correo` | exact | Columna en la lista negra exacta (correo). | 1 | https://www.datos.gov.co/resource/qmzu-gj57→SECOP II - Proveedores Registrados |
| `nombre_aplicacion_creacion` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/u8cx-r425→SECOP II - Modificaciones a contratos |
| `usuario_pago` | operator_user | Identifica al funcionario u operario que editó el registro. | 1 | https://www.datos.gov.co/resource/ibyt-yi2f→SECOP II - Facturas |
| `n_mero_documento_representante_legal` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/4ex9-j3n8→SECOP II - Contacto Entidades y Proveedores |
| `tipo_documento_representante_legal` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/4ex9-j3n8→SECOP II - Contacto Entidades y Proveedores |
| `nombre_contratista` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/4n4q-k399→Multas y Sanciones SECOP I |
| `documento_contratista` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/4n4q-k399→Multas y Sanciones SECOP I |
| `nombre_procedimiento` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/hgi6-6wh3→Proponentes por Proceso SECOP II |
| `tipo_documento_supervisor` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/uymx-8p3j→SECOP II - Plan de pagos |
| `documento_supervisor` | identity_document | Documento de identidad. | 1 | https://www.datos.gov.co/resource/uymx-8p3j→SECOP II - Plan de pagos |
| `nombre_del_proveedor` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/p6dx-8zbt→SECOP II - Procesos de Contratación |
| `nombre_de_la_unidad_de` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/p6dx-8zbt→SECOP II - Procesos de Contratación |
| `nombre_del_procedimiento` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/p6dx-8zbt→SECOP II - Procesos de Contratación |
| `nit_del_proveedor_adjudicado` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 1 | https://www.datos.gov.co/resource/p6dx-8zbt→SECOP II - Procesos de Contratación |
| `nombre_del_adjudicador` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/p6dx-8zbt→SECOP II - Procesos de Contratación |
| `nombre_participante` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `nit_participante` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `correo_representante_legal_grupo` | email | Correo electrónico. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `correo_electronico_grupo` | email | Correo electrónico. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `nombre_representante_legal_grupo` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `numero_tel_fono_grupo` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `telefono_representante_legal_grupo` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `nit_grupo` | tax_id | NIT/RUT: de persona natural equivale a la cédula. | 1 | https://www.datos.gov.co/resource/ceth-n4bn→Grupos de Proveedores - SECOP II |
| `contacto_responsable_adquisicion` | operator_user | Identifica al funcionario u operario que editó el registro. | 1 | https://www.datos.gov.co/resource/azeg-sgqg→SECOP I - PAA Detalle |
| `correo_del_contacto` | email | Correo electrónico. | 1 | https://www.datos.gov.co/resource/9sue-ezhx→SECOPII - Plan Anual De Adquisiciones Detalle |
| `telefono_del_contacto` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/9sue-ezhx→SECOPII - Plan Anual De Adquisiciones Detalle |
| `nombre_del_contacto` | person_name | Nombre o apellido de persona. | 1 | https://www.datos.gov.co/resource/9sue-ezhx→SECOPII - Plan Anual De Adquisiciones Detalle |
| `telefono_entidad` | phone | Teléfono o celular de contacto. | 1 | https://www.datos.gov.co/resource/prdx-nxyp→SECOP I - PAA Encabezado |
| `solicitante` | exact | Columna en la lista negra exacta (solicitante). | 1 | https://www.datos.gov.co/resource/rgxm-mmea→Tienda Virtual del Estado Colombiano - Consolidado |

## Valores redactados por contenido

Columnas cuyo nombre no está en la lista negra pero cuyo contenido coincidió con un patrón de dato personal. El valor de la muestra se sustituyó por `[REDACTADO:<patrón>]`; la columna queda bajo revisión antes de ingerirse.

| Columna | Patrón | Motivo | Fuente | Contenedor | Capa |
|---|---|---|---|---|---|
| `codigo_dane` | co_phone | El valor parece un teléfono fijo o celular colombiano. | men | https://www.datos.gov.co/resource/cfw5-qzt5 | MEN_ESTABLECIMIENTOS_EDUCATIVOS_PREESCOLAR_BÁSICA_Y_MEDIA |
| `c_digo_prestador` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | minsalud | https://www.datos.gov.co/resource/s2ru-bqt6 | Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `c_digo_sede` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | minsalud | https://www.datos.gov.co/resource/s2ru-bqt6 | Relación de IPS públicas y privadas según el nivel de atención y capacidad instalada |
| `codigoprestador` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | minsalud | https://www.datos.gov.co/resource/c36g-9fc2 | Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `t_lefonosede` | co_phone | El valor parece un teléfono fijo o celular colombiano. | minsalud | https://www.datos.gov.co/resource/c36g-9fc2 | Registro Especial de Prestadores y Sedes de Servicios de Salud |
| `expediente_invima` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | minsalud | https://www.datos.gov.co/resource/n4dj-8r7k | Clicsalud - Termómetro de Precios de Medicamentos |
| `recursos_propios_alcald_as_gobernaciones_y_resguardos_ind_genas_` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | secop | https://www.datos.gov.co/resource/jbjy-vk9h | SECOP II - Contratos Electrónicos |
| `direcci_n_de_ejecuci_n_del_contrato` | person_full_name | El valor parece un nombre propio de persona (3+ palabras capitalizadas). | secop | https://www.datos.gov.co/resource/jbjy-vk9h | SECOP II - Contratos Electrónicos |
| `proveedor_adjudicado` | person_full_name | El valor parece un nombre propio de persona (3+ palabras capitalizadas). | secop | https://www.datos.gov.co/resource/jbjy-vk9h | SECOP II - Contratos Electrónicos |
| `sistema_general_de_participaciones` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | secop | https://www.datos.gov.co/resource/jbjy-vk9h | SECOP II - Contratos Electrónicos |
| `n_mero_doc_representante_legal` | co_cedula | El valor parece un número de cédula (6 a 10 dígitos). | secop | https://www.datos.gov.co/resource/qmzu-gj57 | SECOP II - Proveedores Registrados |

