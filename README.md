# Organizacion Colegio - Emuladores

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

## Deploy a Hosting

```
cmd /c firebase deploy --only hosting --project organizacioncentro-d3cd7
```