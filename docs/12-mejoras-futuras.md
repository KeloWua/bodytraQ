# BodyTRAQ - posibles mejoras futuras

Aparcadas, sin fecha. Nada de esto está en la app validada.

## Recordar cámara y temporizador (aparcada el 16 nov 2026)
- Idea: al abrir "Cámara con guías", empezar con la última cámara (trasera/frontal) y el último temporizador (0/3/10 s) usados.
- Ya hecha y probada fuera del PC: archivo nuevo src/lib/cameraPrefs.ts (localStorage, clave bodytraq.cameraPrefs.v1, con validación) y 4 líneas en src/components/CameraCapture.tsx. Parche guardado: recordar-camara-temporizador.patch (sobre feat/camara-guias-directo f508d66).
- Estado: retirada a petición de Kelo. No entra en ninguna rama validada. El usuario dijo que no le importa mucho.
- Nota: en pruebas con Chrome y cámara simulada funcionó (también al crear un nuevo registro con otra fecha). Kelo informó que en su móvil no lo recordaba; no se pudo confirmar si probó la preview nueva (https://bodytraq-ux-test.pages.dev) o la anterior, que no incluye el cambio.

## Otras ideas de la revisión de CameraCapture.tsx
- Serie de vistas: tras capturar una vista, pasar a la siguiente con el mismo temporizador.
- Aviso previo del permiso de cámara y error con instrucción concreta por navegador.
- Control de opacidad y grosor de las guías sobre el vídeo.
- Señal sonora opcional en la cuenta atrás (la vibración no funciona en iOS).
- Botón "repetir" justo tras la captura, antes del alineador.

## Pendiente de producto ya anotado
- No hay pantalla para eliminar un registro entero (el modelo tiene deleted_at).
- Sincronización en la nube y métricas extra (Fase 2 del setup.md), aplazadas.
