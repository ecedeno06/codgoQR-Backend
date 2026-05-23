import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Buscar mascota para generar/imprimir QR desde el frontend administrativo
app.get("/api/mascotas/buscar", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        mensaje: "Debe enviar un texto de búsqueda",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        nombre_mascota,
        codigo_qr,
        color,
        sexo,
        microchip
      FROM public.mascotas
      WHERE
        nombre_mascota ILIKE $1
        OR codigo_qr ILIKE $1
        OR microchip ILIKE $1
      ORDER BY id DESC
      LIMIT 10
      `,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: "Error buscando mascota",
    });
  }
});

// Endpoint público que usa el celular cuando escanea el QR
app.get("/api/public/mascotas/qr/:codigo_qr", async (req, res) => {
  try {
    const { codigo_qr } = req.params;

    const result = await pool.query(
      `
      SELECT
        m.nombre_mascota,
        m.color,
        m.sexo,
        m.foto,
        m.microchip,
        r.nombre_raza,
        p.telefono_contacto
      FROM public.mascotas m
      LEFT JOIN public.razas r ON r.id = m.idraza
      LEFT JOIN public.propietarios p ON p.id = m.id_propietario
      WHERE m.codigo_qr = $1
      LIMIT 1
      `,
      [codigo_qr]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        mensaje: "Mascota no encontrada",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: "Error consultando mascota",
    });
  }
});

app.listen(3001, () => {
  console.log("Backend corriendo en http://localhost:3001");
});