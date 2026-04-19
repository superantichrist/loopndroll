import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { getLegacyLoopndrollAppDirectoryPath } from "../loopndroll-core";
import { applyAppMigrations } from "./migrations";
import * as schema from "./schema";

export const SQLITE_PRAGMA_STATEMENTS = [
  "pragma journal_mode = wal",
  "pragma synchronous = normal",
  "pragma foreign_keys = on",
  "pragma busy_timeout = 5000",
] as const;

type LoopndrollDatabase = {
  path: string;
  client: Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

let cachedDatabase: LoopndrollDatabase | null = null;

function migrateLegacyDatabase(databasePath: string) {
  const targetDirectoryPath = dirname(databasePath);
  const legacyDirectoryPath = getLegacyLoopndrollAppDirectoryPath();

  if (legacyDirectoryPath === targetDirectoryPath || existsSync(databasePath)) {
    return;
  }

  const legacyDatabasePath = `${legacyDirectoryPath}\\app.db`;
  if (!existsSync(legacyDatabasePath)) {
    return;
  }

  mkdirSync(targetDirectoryPath, { recursive: true });

  for (const suffix of ["", "-shm", "-wal"]) {
    const sourcePath = `${legacyDatabasePath}${suffix}`;
    const targetPath = `${databasePath}${suffix}`;

    if (!existsSync(sourcePath) || existsSync(targetPath)) {
      continue;
    }

    copyFileSync(sourcePath, targetPath);
  }
}

function configureDatabase(client: Database) {
  for (const statement of SQLITE_PRAGMA_STATEMENTS) {
    client.exec(statement);
  }
}

export function getLoopndrollDatabase(databasePath: string) {
  if (cachedDatabase && cachedDatabase.path === databasePath) {
    return cachedDatabase;
  }

  migrateLegacyDatabase(databasePath);
  mkdirSync(dirname(databasePath), { recursive: true });

  const client = new Database(databasePath, { create: true });
  configureDatabase(client);
  applyAppMigrations(client);

  cachedDatabase = {
    path: databasePath,
    client,
    db: drizzle(client, { schema }),
  };

  return cachedDatabase;
}
