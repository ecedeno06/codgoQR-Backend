import { pool } from './src/db.js';

async function fix() {
  try {
    console.log('Trimming codigo_qr in public.mascotas...');
    const result = await pool.query('UPDATE public.mascotas SET codigo_qr = TRIM(codigo_qr) WHERE codigo_qr LIKE $1', ['%\n%']);
    console.log(`Updated ${result.rowCount} rows.`);
    
    // Check again
    const check = await pool.query('SELECT codigo_qr FROM public.mascotas WHERE id_mascota = $1', ['3']);
    console.log('New codigo_qr for ID 3:', JSON.stringify(check.rows[0].codigo_qr));
    
  } catch (e) {
    console.error('ERROR:', e);
  } finally {
    await pool.end();
  }
}

fix();
