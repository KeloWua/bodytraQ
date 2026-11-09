import { createServer } from "node:http";
import { neon } from "@neondatabase/serverless";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Comprobamos la conexión abajo.
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}
const sql = neon(DATABASE_URL);
const PHOTO_ROOT = fileURLToPath(new URL("./media", import.meta.url));
const INDEX_PATH = fileURLToPath(new URL("./index.html", import.meta.url));
const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  if (req.url === "/") {
    try {
      const html = await readFile(INDEX_PATH);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "No se pudo leer index.html" }));
    }
    return;
  }
  const listMatch = req.url.match(/^\/api\/users\/([0-9a-f-]{36})\/entries$/);
  if (listMatch) {
    try {
      const rows = await sql`
            SELECT id, date::text AS date,
                   weight_kg::float AS weight_kg, notes
            FROM entries
            WHERE user_id = ${listMatch[1]}
            ORDER BY date DESC
        `;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          data: rows.map((row) => ({
            id: row.id,
            date: row.date,
            weightKg: row.weight_kg,
            notes: row.notes,
          })),
        }),
      );
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Error interno" }));
    }
    return;
  }

  const match = req.url.match(/^\/api\/entries\/([0-9a-f-]{36})$/);
  const photoMatch = req.url.match(/^\/api\/photos\/([0-9a-f-]{36})\/file$/);
  if (photoMatch) {
    let rows;
    try {
      rows = await sql`
      SELECT storage_path FROM photos
      WHERE id = ${photoMatch[1]}
    `;
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Error interno" }));
      return;
    }

    if (rows.length === 0) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Foto no encontrada" }));
      return;
    }

    try {
      const fileName = rows[0].storage_path.split(/[\\/]/).pop();
      const ext = path.extname(fileName).toLowerCase();
      if (!CONTENT_TYPES[ext]) throw new Error("not an image");

      const rootReal = await realpath(PHOTO_ROOT);
      const fileReal = await realpath(path.join(rootReal, fileName));
      const insideRoot = path.relative(rootReal, fileReal);
      if (insideRoot.startsWith("..") || path.isAbsolute(insideRoot)) {
        throw new Error("outside root");
      }

      const info = await stat(fileReal);
      if (!info.isFile()) throw new Error("not a file");
      const content = await readFile(fileReal);
      res.writeHead(200, { "content-type": CONTENT_TYPES[ext] });
      res.end(content);
    } catch {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Archivo no encontrado" }));
    }
    return;
  }

  if (!match) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Ruta no encontrada" }));
    return;
  }

  try {
    const rows = await sql`
      SELECT e.id, e.date::text AS date,
             e.weight_kg::float AS weight_kg, e.notes,
             p.id AS photo_id, p.view, p.storage_path
      FROM entries e
      LEFT JOIN photos p ON p.entry_id = e.id
      WHERE e.id = ${match[1]}
    `;

    if (rows.length === 0) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Registro no encontrado" }));
      return;
    }

    const entry = {
      id: rows[0].id,
      date: rows[0].date,
      weightKg: rows[0].weight_kg,
      notes: rows[0].notes,
      photos:
        rows[0].photo_id === null
          ? []
          : rows.map((row) => ({
              id: row.photo_id,
              view: row.view,
              storagePath: row.storage_path,
            })),
    };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ data: entry }));
  } catch {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Error interno" }));
  }
});

server.listen(4173, "127.0.0.1", () => {
  console.log("API local en http://127.0.0.1:4173");
});
