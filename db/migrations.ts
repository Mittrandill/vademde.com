import type { SQLiteDatabase } from 'expo-sqlite';

interface Migration {
  version: number;
  up: string;
}

// docs/06-teknik-mimari.md §10.4 — yerel-first davranış: çevrimdışı taslaklar
// ve senkronizasyon kuyruğu. Finansal kayıt şeması (Aşama 2) burada yer almaz.
const migrations: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        document_uri TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        client_version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
      CREATE INDEX IF NOT EXISTS idx_drafts_workspace ON drafts(workspace_id);
    `,
  },
];

export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await db.getAllAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  const appliedVersions = new Set(applied.map((row) => row.version));

  for (const migration of migrations.sort((a, b) => a.version - b.version)) {
    if (appliedVersions.has(migration.version)) continue;

    await db.execAsync(migration.up);
    await db.runAsync(
      'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      [migration.version, new Date().toISOString()]
    );
  }
}
