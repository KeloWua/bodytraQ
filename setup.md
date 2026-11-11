Aquí tienes el archivo **`setup.md`** completo, condensado al grano, con el historial de decisiones, lo descartado y la arquitectura exacta por la que te has decidido.

---

# `setup.md` — Body Tracker: Especificación y Setup Definitivo

Documento maestro de configuración y arquitectura. Define qué se construye, qué se descartó, por qué motivos técnicos y el stack definitivo para ejecutar ya.

---

## 1. Visión y Objetivo
Una **PWA Local-First** instalable en móvil (iOS/Android) y PC para tracking visual del progreso corporal mediante fotos periódicas, garantizando:
* **Coste 0 €** de infraestructura.
* **Privacidad absoluta:** las fotos y datos nunca salen del dispositivo en el MVP (sin servidores, sin base de datos en la nube, sin líos de RGPD con fotos sensibles).
* **Alineación milimétrica:** fotos ajustadas a guías dibujadas por el usuario que se ven idénticas en cualquier pantalla.
* **Timeline timelapse:** navegación fluida entre fechas con flechas, teclado y gestos táctiles.
* **Preparado para la nube:** arquitectura con UUIDs y borrado lógico para añadir sincronización con Cloudflare R2 y Postgres en una Fase 2 sin reescribir la app.

---

## 2. Historial de Decisiones: Lo Descartado y Aplazado

| Elemento | Decisión | Motivo Técnico del Descarte |
| :--- | :--- | :--- |
| **Backend / Auth inicial (v1)** | **Descartado para MVP** | Añadía coste, latencia de arranque en frío (Neon) y riesgo legal/seguridad con fotos íntimas antes de validar el producto. |
| **Hosting en Vercel** | **Descartado** | Las condiciones de su plan gratuito prohíben explícitamente el uso comercial o multiusuario futuro. Se usará **Cloudflare Pages** o **Netlify**. |
| **Offsets en píxeles** | **Descartado** | Fallo grave: una foto alineada en móvil (pantalla estrecha) se desalineaba al verse en PC. |
| **Guardar fotos en IndexedDB** | **Descartado** | Safari en iOS corrompe la base de datos o crashea por falta de memoria al almacenar Blobs pesados. Se usa **OPFS**. |
| **Konva.js en el MVP** | **Sustituido por SVG** | Konva causa errores de renderizado en servidor (SSR) en Next.js y añade peso innecesario. SVG nativo + Pointer Events es más rápido en móviles. |
| **Formato WebP desde Canvas** | **Descartado en cliente** | Safari en iOS tiene soporte inconsistente para codificar a WebP desde `<canvas>`. La salida estándar de versiones será **JPEG de alta calidad (~0.88)**. |
| **Métricas complejas (EAV)** | **Aplazado a Fase 2** | Se arranca solo con `peso_kg` (columna fija) y cálculo de IMC. El 90% de la fricción inicial viene de formularios largos. |
| **Cámara Fantasma y Vídeo** | **Aplazado a Post-MVP** | Prioridad absoluta: primero validar la UX de alinear fotos y el timeline. |

---

## 3. El Setup Decidido (Stack del MVP)

* **Framework:** Next.js (App Router) configurado con `output: 'export'` (sitio 100% estático para compilar sin servidor Node.js).
* **Estilos:** Tailwind CSS con relación de aspecto fija y responsive.
* **Base de Datos Local:** **Dexie.js** (IndexedDB optimizado) para ajustes, perfiles, check-ins y metadatos de fotos.
* **Almacenamiento de Imágenes:** **OPFS (Origin Private File System)**. Sistema de archivos nativo y privado del navegador en el sandbox del dispositivo.
* **Gestos y Manipulación:** Pointer Events nativos de React / `@use-gesture/react` sobre un componente CSS común.
* **Formatos de Imagen:**
  * *Original:* Binario intacto tal cual entra (opcional, configurable).
  * *Display (Visualización):* JPEG 2000-2400px en lado largo (≈1.2 MB), con corrección EXIF automática.
  * *Thumb (Miniatura):* JPEG 400px (≈40 KB).
  * *HEIC (iPhone):* Detección y conversión en cliente antes de procesar (`heic2any`).
* **Seguridad de Datos:** Exportación e importación manual a archivo **ZIP** (imágenes) + **JSON** (base de datos) por el riesgo de purga de Safari.

---

## 4. Modelo de Datos Local (Dexie.js)

Todo registro incluye UUID generado en cliente, marcas de tiempo y soporte para borrado lógico (`deleted_at`) pensando en la sincronización futura:

```
settings (Registro único: 'current')
  - height_cm: number (opcional)
  - weight_unit: 'kg' | 'lb' (por defecto 'kg')
  - default_layout: 'single' | 'dual'
  - show_date, show_weight, show_bmi: boolean
  - active_view_ids: string[]
  - schema_version: number

view_profiles (Perfiles de cámara: Frontal, Espalda, etc.)
  - id: string (UUIDv4)
  - name: string
  - order: number
  - guides: JSON string (array de trazos normalizados 0.0 a 1.0)
  - created_at, updated_at: ISO string
  - deleted_at: ISO string (opcional)

check_ins (Día de registro)
  - id: string (UUIDv4)
  - date: string (YYYY-MM-DD, único)
  - weight_kg: number (SIEMPRE en kg; si la UI está en lbs se convierte al vuelo)
  - notes: string (opcional)
  - created_at, updated_at: ISO string
  - deleted_at: ISO string (opcional)

photos (Fotos tomadas)
  - id: string (UUIDv4)
  - check_in_id: string (FK)
  - view_profile_id: string (FK)
  - display_path: string (nombre de archivo en OPFS)
  - thumb_path: string (nombre de archivo en OPFS)
  - original_path: string (opcional)
  - width, height: number (dimensiones reales del display)
  - scale: number (1.0 = base cover)
  - rotation: number (grados, -180 a 180)
  - offset_x: number (fracción -0.5 a 0.5 respecto al centro del marco)
  - offset_y: number (fracción -0.5 a 0.5 respecto al centro del marco)
  - upload_status: 'local_only' | 'pending' | 'synced' (clave para Fase 2)
  - created_at, updated_at: ISO string
  - deleted_at: ISO string (opcional)
  - Índice compuesto: [check_in_id + view_profile_id] (Única foto por vista y día)
```

---

## 5. Regla Matemática de Oro: Marco 3:4 y Transformación

Para garantizar que lo que se alinea en el editor se vea exactamente igual en el timeline (sea un iPhone o un monitor 4K):

1. **Marco:** Contenedor CSS con `aspect-ratio: 3 / 4; overflow: hidden; position: relative;`.
2. **Pivote:** El centro exacto del marco es el origen `(0, 0)`.
3. **Escala Base (`scale = 1`):** La imagen cubre el marco sin deformarse.
   * Si la relación de aspecto de la foto es $> 0.75$ (más ancha que 3:4): la altura se iguala al 100% del marco y el ancho sobresale centrado.
   * Si es $< 0.75$ (más alta que 3:4): el ancho se iguala al 100% del marco y la altura sobresale centrada.
4. **Capa de Transformación CSS:**
   ```css
   transform: translate(calc(var(--offset-x) * 100%), calc(var(--offset-y) * 100%))
              rotate(calc(var(--rotation) * 1deg))
              scale(var(--scale));
   transform-origin: center center;
   ```
   *Al aplicar el desplazamiento a una capa que mide el 100% del marco, un `offset_x = 0.1` significa siempre exactamente un 10% del ancho del marco en cualquier pantalla.*

---

## 6. Plan de Ejecución del MVP (2 Semanas)

* **Fase 1: Infraestructura Base (HECHO):**
  * Proyecto Next.js configurado en estático (`output: 'export'`).
  * Esquema Dexie con inicialización automática de "Frontal" y "Espalda".
  * Módulo OPFS para lectura/escritura y comprobación de cuota de disco.
* **Fase 2: Motor Visual y Editor de Guías (Días 3-5):**
  * Componente `AlignedPhoto` reutilizable con la matemática de marco 3:4.
  * Editor SVG: trazado de líneas rectas y pincel libre con coordenadas 0.0-1.0.
  * Toggle para encender/apagar guías.
* **Fase 3: Captura y Alineación (Días 6-8):**
  * Selector de cámara / archivo con conversor de orientación EXIF y HEIC.
  * Generación en canvas de versión grande (2000px) y miniatura (400px).
  * Gestos táctiles de pellizco (zoom), giro con dos dedos y arrastre.
  * Guardado atómico en OPFS + Dexie.
* **Fase 4: Timeline y Navegación (Días 9-11):**
  * Selector de vista: 1 foto o 2 fotos en paralelo (Frontal + Espalda).
  * Navegación instantánea con flechas, teclado y swipe táctil.
  * Precarga en segundo plano de fechas adyacentes (efecto time-lapse sin parpadeos).
  * Cabecera con fecha, peso e IMC.
* **Fase 5: Copia de Seguridad y Pruebas en iPhone (Días 12-14):**
  * Exportar/Importar archivo ZIP con fotos y base de datos completa.
  * Pruebas de instalación PWA en Safari de iOS y verificación de retención de datos.

---

Este es el mapa de ruta definitivo. Cuando me des luz verde, pasamos directamente a la **Fase 2: El componente visual `AlignedPhoto` y el editor SVG de guías**. y vas a hacerme esta app, el body traq, crea rama nueva y haz esto porfavor. y ya me avisas
