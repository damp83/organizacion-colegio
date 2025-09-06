# Organizacion Colegio

## Documentos (modo actual sin Firebase Storage)

La aplicación ha sido configurada para almacenar archivos pequeños directamente dentro de Firestore como cadenas base64. Esto permite seguir en el plan Spark sin activar Firebase Storage.

Características:
- Límite aproximado por archivo: 700 KB (para no superar 1MB por documento Firestore contando metadatos).
- Campos guardados por documento en la colección `documentos`: `nombre`, `archivo` (nombre original), `mimeType`, `size`, `archivoBase64`, `fecha`, `timestamp`, `createdBy`.
- Descarga: se reconstruye un `Blob` en el navegador y se fuerza descarga local.
- Documentos antiguos (subidos cuando se usaba Storage) con `storagePath` mostrarán el texto “Contenido externo no disponible”. Si más adelante se reactiva Storage se podrá re-habilitar la descarga original.

Ventajas:
- No requiere bucket de Storage ni cambio de plan.
- Reglas de Firestore ya controlan quién puede escribir (allowlist de correos / admin).

Limitaciones / advertencias:
- No usar para PDFs pesados, imágenes grandes o colecciones masivas (impacto en coste de lectura y tamaño total del documento).
- Firestore tiene límites de 1MB por documento (duro). Superar ~700KB base64 puede producir errores de escritura.
- No hay soporte de streaming parcial; siempre se descarga completo.

Migración futura a Storage (opcional):
1. Crear bucket `organizacioncentro-d3cd7.appspot.com` en región simple (ej. `europe-west1`).
2. Desplegar reglas restauradas (ya presentes en `storage.rules`).
3. Reintroducir import de `firebase-storage` y lógica de subida/descarga eliminada (ver historial de Git). Para compatibilidad se puede mantener ambos modos: si existe `archivoBase64` usar inline; si existe `storagePath` usar Storage.
4. (Opcional) Script de migración: leer documentos con `archivoBase64`, subir a Storage y reemplazar con `storagePath` + eliminar `archivoBase64`.

## Reglas de seguridad

- Firestore: control de escritura por allowlist de emails y/o claim `admin`.
- Storage (restauradas en `storage.rules`): restringen lectura/escritura a los mismos correos/claims (aunque actualmente no se usa Storage en el front-end).

## Despliegue rápido Hosting

```
cmd /c firebase deploy --only hosting --project organizacioncentro-d3cd7
```

Tras desplegar, forzar recarga (Ctrl+F5) para evitar caché.

## Emuladores locales

## Ejecutar emuladores localmente

- Requisitos: Firebase CLI (firebase-tools) instalado y logueado.

### Opción 1: desde PowerShell

```
# Si PowerShell bloquea scripts, invoca via cmd
cmd /c firebase emulators:start --only hosting,firestore,auth --project organizacioncentro-d3cd7
```

### Opción 2: usar solo Hosting (sirve carpeta public)

```
cmd /c firebase emulators:start --only hosting --project organizacioncentro-d3cd7
```

La app intenta conectarse a los emuladores de Auth (9099) y Firestore (8080) cuando detecta localhost.

## Próximos pasos sugeridos

- Añadir paginación / ordenación a `documentos` cuando crezca el volumen.
- Implementar migración a Storage si se requieren archivos más grandes.
- Añadir compresión (ej. zip) previa a subir si se quiere ahorrar tamaño.
- Crear script de limpieza para borrar documentos obsoletos según antigüedad.

## Deploy a Hosting

```
cmd /c firebase deploy --only hosting --project organizacioncentro-d3cd7
```