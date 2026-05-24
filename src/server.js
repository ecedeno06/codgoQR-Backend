import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { query } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const PUBLIC_PORTAL_URL = process.env.PUBLIC_PORTAL_URL || 'http://localhost:5173';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'qr-mascotas-backend' });
});

/**
 * Ruta pública: no requiere login.
 * Esta es la ruta que usa el frontend público cuando alguien escanea el QR.
 */
app.get('/api/public/mascotas/qr/:codigo_qr', async (req, res) => {
  const { codigo_qr } = req.params;

  try {
    const result = await query(
      `
      SELECT
          m.id_mascota,
          u.email,
          m.nombre_mascota,
          m.color,
          m.microchip,
          m.codigo_qr,
          m.foto,
          m.sexo,
          u.nombre AS nombre_propietario,

          a.latitud,
          a.longitud,
          a.precision_metros,
          a.fecha_hora

      FROM public.mascotas m

      LEFT JOIN public.usuarios u
          ON u."idUsuario" = m.id_propietario

      LEFT JOIN LATERAL (
          SELECT
              av.latitud,
              av.longitud,
              av.precision_metros,
              av.fecha_hora
          FROM public.avistamientos av
          WHERE av.codigo_qr = m.codigo_qr
          ORDER BY av.fecha_hora DESC
          LIMIT 1
      ) a ON TRUE

      WHERE m.codigo_qr ILIKE $1
      LIMIT 1;
      `,
      [codigo_qr]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ mensaje: 'Mascota no encontrada' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error consultando la mascota' });
  }
});

/**
 * Ruta para buscar mascotas (usada en el admin para generar QRs)
 */
app.get('/api/mascotas/buscar', async (req, res) => {
  const { q } = req.query;

  if (!q) {
    return res.status(400).json({ mensaje: 'Debe enviar un texto de búsqueda' });
  }

  try {
    const result = await query(
      `
      SELECT
        m.id_mascota,
        m.nombre_mascota,
        m.codigo_qr,
        m.color,
        m.sexo,
        m.microchip,
        m.foto,
        u.nombre as nombre_propietario
      FROM public.mascotas m
      LEFT JOIN public.usuarios u ON u."idUsuario" = m.id_propietario
      WHERE
        m.nombre_mascota ILIKE $1
        OR TRIM(m.codigo_qr) ILIKE $1
        OR m.microchip ILIKE $1
      ORDER BY m.id_mascota DESC
      LIMIT 10
      `,
      [`%${q}%`]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error buscando mascota' });
  }
});

/**
 * Ruta dummy administrativa: crear mascota.
 * En un sistema real esta ruta debe estar protegida con login/token.
 */
app.post('/api/admin/mascotas', async (req, res) => {
  const {
    email,
    nombre_mascota,
    idraza,
    peso,
    tamano,
    color,
    fecha_de_nacimiento,
    esterilizado,
    id_propietario,
    sexo,
    id_compania,
    foto,
    microchip
  } = req.body;

  try {
    const result = await query(
      `
      INSERT INTO public.mascotas
      (
        email,
        nombre_mascota,
        idraza,
        peso,
        tamano,
        color,
        fecha_de_nacimiento,
        esterilizado,
        id_propietario,
        sexo,
        id_compania,
        foto,
        microchip
      )
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id_mascota, nombre_mascota, codigo_qr
      `,
      [
        email || null,
        nombre_mascota,
        idraza || 1, // Default raza
        peso || 0,
        tamano || 0,
        color || 'No especificado',
        fecha_de_nacimiento || new Date(),
        esterilizado ?? false,
        id_propietario || 10,
        sexo || 'M',
        id_compania || 1,
        foto || {},
        microchip || null
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error en POST /api/admin/mascotas:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        mensaje: 'Código QR duplicado. Reintenta la creación del registro.',
        error: error.message
      });
    }

    return res.status(500).json({ 
      mensaje: 'Error creando la mascota',
      detalles: error.message
    });
  }
});

/**
 * Ruta para actualizar una mascota existente
 */
app.patch('/api/admin/mascotas/:codigo_qr', async (req, res) => {
  const { codigo_qr } = req.params;
  const {
    nombre_mascota,
    email,
    color,
    microchip,
    foto,
    sexo
  } = req.body;

  try {
    const result = await query(
      `
      UPDATE public.mascotas
      SET
        nombre_mascota = COALESCE($1, nombre_mascota),
        email = COALESCE($2, email),
        color = COALESCE($3, color),
        microchip = COALESCE($4, microchip),
        foto = COALESCE($5, foto),
        sexo = COALESCE($6, sexo)
      WHERE codigo_qr = $7
      RETURNING id_mascota, nombre_mascota, codigo_qr
      `,
      [nombre_mascota, email, color, microchip, foto, sexo, codigo_qr]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ mensaje: 'Mascota no encontrada' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    console.error('Error en PATCH /api/admin/mascotas:', error);
    return res.status(500).json({ 
      mensaje: 'Error actualizando la mascota',
      detalles: error.message
    });
  }
});

/**
 * Genera la imagen QR en base64.
 * El QR contiene la URL pública completa, no solo el código.
 */
app.get('/api/admin/mascotas/:codigo_qr/qr-image', async (req, res) => {
  const { codigo_qr } = req.params;

  try {
    const publicUrl = `${PUBLIC_PORTAL_URL}/mascotas/qr/${codigo_qr}`;

    const qrBase64 = await QRCode.toDataURL(publicUrl, {
      errorCorrectionLevel: 'H',
      width: 320,
      margin: 2
    });

    return res.json({
      codigo_qr,
      publicUrl,
      qrBase64
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ mensaje: 'Error generando QR' });
  }
});

/**
 * Registra un avistamiento de mascota con ubicación GPS
 */
app.post('/api/public/mascotas/qr/:codigo_qr/avistamiento', async (req, res) => {
  const { codigo_qr } = req.params;
  const { latitud, longitud, precision_metros, fecha_hora } = req.body;

  if (!latitud || !longitud) {
    return res.status(400).json({ mensaje: 'Faltan coordenadas' });
  }

  try {
    const result = await query(
      `
      INSERT INTO public.avistamientos (codigo_qr, latitud, longitud, precision_metros, fecha_hora)
      VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
      RETURNING *
      `,
      [codigo_qr, latitud, longitud, precision_metros, fecha_hora]
    );

    return res.status(201).json({
      mensaje: 'Avistamiento registrado con éxito',
      id: result.rows[0].id_avistamiento
    });
  } catch (error) {
    console.error('Error guardando avistamiento:', error);
    return res.status(500).json({ mensaje: 'Error interno guardando la ubicación' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
