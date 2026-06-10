import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required, for example postgres://user:pass@localhost:5432/afribn");
  process.exit(1);
}

const migrationDir = join(process.cwd(), "migrations");
const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const fullPath = join(migrationDir, file);
  console.log(`Applying ${file}`);
  const result = spawnSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", fullPath], {
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Postgres migrations complete");
