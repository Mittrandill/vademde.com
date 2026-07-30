import { getDatabase } from './client';
import { runMigrations } from './migrations';

export { getDatabase } from './client';

export async function initDatabase() {
  const db = await getDatabase();
  await runMigrations(db);
  return db;
}
