// lib/localProfile.ts
import * as Crypto from 'expo-crypto';
import { getDb } from './database';

export interface LocalProfile {
  supabase_id: string;
  email?: string;
  role?: string;
  full_name?: string;
  avatar_url?: string;
  password_hash?: string; // SHA-256
  last_login_at?: string;
}

// تشفير كلمة المرور بـ SHA-256
const hashPassword = async (plain: string): Promise<string> =>
  await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    plain
  );

// حفظ أو تحديث الملف الشخصي
export const saveLocalProfile = async (
  profile: Omit<LocalProfile, 'last_login_at'>
): Promise<void> => {
  const db = getDb();
  const hashed = profile.password_hash
    ? await hashPassword(profile.password_hash)
    : null;

  await db.runAsync(
    `INSERT OR REPLACE INTO local_profiles
       (supabase_id, email, role, full_name, avatar_url, password_hash, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'));`,
    [
      profile.supabase_id,
      profile.email ?? null,
      profile.role ?? null,
      profile.full_name ?? null,
      profile.avatar_url ?? null,
      hashed,
    ]
  );
};

// استرجاع آخر ملف شخصي
export const getLocalProfile = async (): Promise<LocalProfile | null> => {
  const db = getDb();
  const rows = await db.getAllAsync<LocalProfile>(
    'SELECT * FROM local_profiles ORDER BY last_login_at DESC LIMIT 1;'
  );
  return rows[0] ?? null;
};

// حذف الملف (تسجيل الخروج)
export const deleteLocalProfile = async (): Promise<void> => {
  const db = getDb();
  await db.runAsync('DELETE FROM local_profiles;');
};

// التحقق من صحة كلمة المرور محليًا
export const verifyOfflinePassword = async (
  email: string,
  password: string
): Promise<LocalProfile | null> => {
  const db = getDb();
  const row = await db.getFirstAsync<LocalProfile>(
    'SELECT * FROM local_profiles WHERE email = ?;',
    [email]
  );
  if (!row || !row.password_hash) return null;

  const inputHash = await hashPassword(password);
  return inputHash === row.password_hash ? row : null;
};