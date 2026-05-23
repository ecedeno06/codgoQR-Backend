import { pool } from './src/db.js';

async function test() {
  try {
    const qr = 'QR-54309969';
    console.log(`Checking data for ${qr}...`);
    const result = await pool.query('SELECT * FROM public.mascotas WHERE codigo_qr = $1', [qr]);
    if (result.rows.length > 0) {
      console.log('Mascota data:', result.rows[0]);
      const ownerId = result.rows[0].id_propietario;
      console.log('Owner ID:', ownerId);
      
      if (ownerId) {
        const owner = await pool.query('SELECT * FROM public.usuarios WHERE "idUsuario" = $1', [ownerId]);
        console.log('Owner data:', owner.rows[0] || 'NOT FOUND');
      }
    } else {
      console.log('Pet not found');
    }
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await pool.end();
  }
}

test();
