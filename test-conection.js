import { pool } from "./src/db.js";

async function probarConexion() {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("Conexión exitosa:", result.rows[0]);
  } catch (error) {
    console.error("Error conectando a PostgreSQL:", error);
  }
}

probarConexion();