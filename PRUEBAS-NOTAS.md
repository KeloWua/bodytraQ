# Notas de Timeline: prueba reproducible

Cambios de presentación únicamente. No cambia IndexedDB, OPFS, cifrado ni formato de copia.

1. `npm ci`
2. `npm run build`
3. En una terminal: `python3 -m http.server 4173 --directory out --bind 127.0.0.1`
4. En otra: `npm install --no-save --package-lock=false playwright`, `npx playwright install chromium` y `node scripts/test-notes.mjs`.

También se puede usar Chrome instalado: `CHROME_PATH=/ruta/a/chrome node scripts/test-notes.mjs`.
El script usa un perfil temporal por resolución (390x844, 320x568 y 1280x800), sin tocar datos de otros perfiles. Crea solo registros sintéticos. Capturas en /tmp/bodytraq-notes-test, configurable con BODYTRAQ_TEST_OUTPUT. BODYTRAQ_TEST_URL cambia el servidor local.

Prueba crear y editar notas, recarga, vacío, navegación entre fechas, saltos de línea, una palabra de400caracteres y60líneas. Comprueba ausencia de desbordamiento horizontal, límite de128px, desplazamiento hasta el final con teclado, cabecera fija independiente y ausencia de errores JavaScript.

Validado en Chromium de escritorio con estas resoluciones. No se ha probado Safari/iPhone físico, instalación PWA, protección por contraseña ni recuperación de copias en esta tarea. Las capturas usan huecos de foto, no fotos personales. Estos cambios se hicieron sin Junie porque el acceso Google no llegó a completarse.
