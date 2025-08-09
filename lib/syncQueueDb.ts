// lib/syncQueueDb.ts
import { getDb } from './database';

export type SyncQueueItem = {
  id: number;
  entity: string;
  entity_local_id?: number;
  entity_uuid?: string;
  entity_supabase_id?: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: string; // JSON string
  timestamp: number;
};

// إضافة تغيير جديد إلى قائمة المزامنة
export const addToSyncQueue = async (
  entity: string,
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  entity_uuid: string,
  payload?: any
): Promise<void> => {
  const db = getDb();
  await db.runAsync(
    `
    INSERT INTO sync_queue (entity, entity_uuid, operation, payload)
    VALUES (?, ?, ?, ?);
    `,
    [entity, entity_uuid, operation, payload ? JSON.stringify(payload) : null]
  );
};

// جلب جميع التغييرات غير المتزامنة
export const getUnsyncedChanges = async (entityFilter?: string): Promise<any[]> => {
  const db = getDb();
  
  let query = 'SELECT id, entity, entity_local_id, entity_uuid, entity_supabase_id, operation, payload, timestamp FROM sync_queue';
  let params: any[] = [];
  
  if (entityFilter) {
    query += ' WHERE entity = ?';
    params.push(entityFilter);
  }
  
  query += ' ORDER BY timestamp ASC;';
  
  const result = await db.getAllAsync(query, params);
  return result;
};

// جلب عدد التغييرات غير المتزامنة
export const getUnsyncedCount = async (entityFilter?: string): Promise<number> => {
  const db = getDb();
  
  let query = 'SELECT COUNT(*) as count FROM sync_queue';
  let params: any[] = [];
  
  if (entityFilter) {
    query += ' WHERE entity = ?';
    params.push(entityFilter);
  }
  
  const result = await db.getFirstAsync<{ count: number }>(query, params);
  return result?.count || 0;
};

// مسح جميع التغييرات المتزامنة لكيان معين
export const clearSyncedChangesForEntity = async (entity: string): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE entity = ?;', [entity]);
};

// مسح جميع التغييرات القديمة (أكثر من 7 أيام)
export const clearOldSyncChanges = async (): Promise<void> => {
  const db = getDb();
  const weekAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60); // 7 أيام بالثواني
  await db.runAsync('DELETE FROM sync_queue WHERE timestamp < ?;', [weekAgo]);
};

export const clearSyncedChange = async (id: number): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?;', [id]);
};


