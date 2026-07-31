import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_NAME = 'vademde.db';

let dbPromise: Promise<SQLiteDatabase> | null = null;

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    // Reddedilen promise önbellekte bırakılırsa sonraki çağrılar yeniden denemeden aynı
    // hatayı döndürür ve geçici bir açılış hatası kalıcı hale gelir. Örn. web'de OPFS
    // kilidi başka bir sekmedeyken açılış başarısız olur; o sekme kapandıktan sonra
    // tekrar denenebilmesi için önbellek sıfırlanır.
    dbPromise = openDatabaseAsync(DATABASE_NAME).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}
