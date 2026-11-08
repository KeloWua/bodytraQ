# Base de datos

Migraciones SQL de BodyTRAQ. Las aplica Kelo a mano; la app nunca las ejecuta.

## Estado actual

- Entorno de desarrollo aislado. NO apto para producción.
- Autenticación y control de acceso: pendientes. Las tablas aún no tienen RLS ni permisos configurados.
- Fotos: aquí solo viven metadatos. El almacenamiento de imágenes (privado y con acceso controlado) se decide aparte; no está resuelto todavía.
- No meter datos reales ni fotos reales por ahora.
- La API que leerá esto aún no está subida ni lista.

## Cuando exista el proyecto Neon (aún no creado)

Opción fácil: pegar el contenido de la migración en el SQL Editor de la consola web de Neon.

Opción terminal (si tienes psql):

```powershell
psql "PEGAR_AQUI_LA_CONNECTION_STRING" -f db/migrations/0001_init.sql
```

La connection string nunca va al repo ni al chat: se guarda en el vault.
