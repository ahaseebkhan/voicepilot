import { Pool } from "pg";

let pool: Pool | null = null;

// Check required env vars
const {
  DB_USER,
  DB_HOST,
  DB_NAME,
  DB_PASSWORD,
  DB_PORT,
} = process.env;

if (DB_USER && DB_HOST && DB_NAME && DB_PASSWORD) {
  pool = new Pool({
    user: DB_USER,
    host: DB_HOST,
    database: DB_NAME,
    password: DB_PASSWORD,
    port: Number(DB_PORT) || 5432, // fallback to default
  });

  pool.on("connect", () => {
    console.log(":white_check_mark: Connected to PostgreSQL");
  });

  pool.on("error", (err) => {
    console.warn(":warning: PostgreSQL connection error:", err.message);
  });

} else {
  console.warn(":warning: Database environment variables missing. DB disabled.");
}

export { pool };
