// lib/database.ts
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;
export const initDb = async () => {
    
  if (db) return;
  try {
    db = await SQLite.openDatabaseAsync('14.db', { useNewConnection: true });
    await db.execAsync('PRAGMA foreign_keys = ON;'); // تفعيل المفاتيح الخارجية
 
    // إنشاء جدول للمستخدمين (profiles)
await db.execAsync(`
  CREATE TABLE IF NOT EXISTS local_profiles (
    supabase_id TEXT PRIMARY KEY,
    email TEXT,
    role TEXT,
    full_name TEXT,
    avatar_url TEXT,
    password_hash TEXT,
    last_login_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

    // إنشاء جدول المستويات (levels)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT
      );
    `);

    // إنشاء جدول المراكز (offices)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS offices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT
      );
    `);


    // إنشاء جدول الطلاب (students)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        birth_date TEXT, -- اختياري
        phone TEXT, -- اختياري
        address TEXT, -- اختياري
        office_uuid TEXT NOT NULL, -- إجباري (رابط بجدول المراكز عبر UUID)
        level_uuid TEXT NOT NULL, -- إجباري (رابط بجدول المستويات عبر UUID)
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        deleted_at TEXT,
        FOREIGN KEY (office_uuid) REFERENCES offices(uuid),
        FOREIGN KEY (level_uuid) REFERENCES levels(uuid)
      );
    `);

    // إنشاء جدول سجلات الحضور (جديد)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT UNIQUE NOT NULL,
        date TEXT NOT NULL,
        office_uuid TEXT NOT NULL,
        level_uuid TEXT NOT NULL,
        supabase_id INTEGER UNIQUE,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY (office_uuid) REFERENCES offices(uuid),
        FOREIGN KEY (level_uuid) REFERENCES levels(uuid)
      );
    `);

    // إنشاء جدول حضور الطلاب (جديد)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS student_attendances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attendance_record_uuid TEXT NOT NULL,
        student_uuid TEXT NOT NULL,
        status TEXT NOT NULL,
        is_synced INTEGER DEFAULT 0,
        operation_type TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY (attendance_record_uuid) REFERENCES attendance_records(uuid) ON DELETE CASCADE,
        FOREIGN KEY (student_uuid) REFERENCES students(uuid) ON DELETE CASCADE,
        UNIQUE (attendance_record_uuid, student_uuid)
      );
    `);

    // إنشاء جدول قائمة المزامنة (sync_queue) - هذا الجدول عام لجميع الكيانات
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_local_id INTEGER,
        entity_uuid TEXT,
        entity_supabase_id INTEGER,
        operation TEXT NOT NULL,
        payload TEXT,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );
    `);

    console.log('✅ Database and tables initialized successfully!');
  } catch (error) {
    console.error('❌ Failed to initialize database:', error);
    throw error; // أعد رمي الخطأ للتعامل معه في RootLayout
  }
};

export const getDb = (): SQLite.SQLiteDatabase => {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
};
