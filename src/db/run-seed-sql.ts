import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Set it in your environment before running SQL seed.",
    );
  }

  const seedPath = resolve(process.cwd(), "db/seed.sql");
  const seedSql = await readFile(seedPath, "utf8");

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await pool.query(seedSql);
    console.log("Executed db/seed.sql successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  process.exitCode = 1;
  console.error("Failed to execute SQL seed:", err);
});
