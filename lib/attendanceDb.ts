// lib/attendanceDb.ts
import { getDb } from './database';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase';
import { addToSyncQueue, clearSyncedChange, getUnsyncedChanges } from './syncQueueDb';

export type AttendanceRecord = {
  id: number;
  uuid: string;
  date: string;
  office_uuid: string;
  level_uuid: string;
  office_name?: string;
  level_name?: string;
  supabase_id?: number;
  is_synced?: number;
  operation_type?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type StudentAttendance = {
  id: number;
  attendance_record_uuid: string;
  student_uuid: string;
  status: 'present' | 'absent' | 'excused';
  is_synced?: number;
  operation_type?: string | null;
  created_at?: string;
  updated_at?: string;
};

// ===================================================
//              وظائف قاعدة البيانات المحلية
// ===================================================

// جلب جميع سجلات الحضور
export const getAllAttendanceRecords = async (): Promise<AttendanceRecord[]> => {
  const db = getDb();
  return await db.getAllAsync<AttendanceRecord>(`
    SELECT ar.*, o.name as office_name, l.name as level_name
    FROM attendance_records ar
    LEFT JOIN offices o ON ar.office_uuid = o.uuid
    LEFT JOIN levels l ON ar.level_uuid = l.uuid
    ORDER BY ar.date DESC;
  `);
};

// جلب سجل حضور بواسطة UUID
export const getAttendanceRecordByUuid = async (uuid: string): Promise<AttendanceRecord | undefined> => {
  const db = getDb();
  const record = await db.getFirstAsync<AttendanceRecord>(`
    SELECT * FROM attendance_records WHERE uuid = ?;
  `, [uuid]);
  return record;
};

// دالة جديدة: جلب سجل حضور بناءً على التاريخ والمركز والمستوى
export const getAttendanceRecordByDateOfficeAndLevel = async (
  date: string,
  officeUuid: string,
  levelUuid: string
): Promise<AttendanceRecord | undefined> => {
  const db = getDb();
  const record = await db.getFirstAsync<AttendanceRecord>(`
    SELECT * FROM attendance_records WHERE date = ? AND office_uuid = ? AND level_uuid = ?;
  `, [date, officeUuid, levelUuid]);
  return record;
};

// جلب حضور الطلاب لسجل معين
export const getStudentAttendanceForRecord = async (recordUuid: string): Promise<StudentAttendance[]> => {
  const db = getDb();
  return await db.getAllAsync<StudentAttendance>(`
    SELECT * FROM student_attendances WHERE attendance_record_uuid = ?;
  `, [recordUuid]);
};

// جلب الطلاب لمركز ومستوى معين
export const getStudentsByOfficeAndLevel = async (officeUuid: string, levelUuid: string) => {
  const db = getDb();
  const students = await db.getAllAsync<any>(`
    SELECT * FROM students WHERE office_uuid = ? AND level_uuid = ? AND deleted_at IS NULL;
  `, [officeUuid, levelUuid]);
  return students;
};

// حفظ سجل الحضور (إضافة أو تعديل)
export const saveAttendance = async (
  date: string,
  officeUuid: string,
  levelUuid: string,
  studentStatuses: { studentUuid: string; status: 'present' | 'absent' | 'excused' }[],
  recordUuid?: string
) => {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    let currentRecordUuid = recordUuid || uuidv4();
    const now = new Date().toISOString();

    // التحقق من التكرار عند إضافة سجل جديد فقط
    if (!recordUuid) {
      const existingRecord = await getAttendanceRecordByDateOfficeAndLevel(date, officeUuid, levelUuid);
      if (existingRecord) {
        throw new Error('Attendance record already exists for this date, office, and level.');
      }
    }

    // 1. التعامل مع سجل الحضور الرئيسي
    if (recordUuid) {
      // تعديل سجل موجود
      await db.runAsync(
        `
        UPDATE attendance_records
        SET date = ?, office_uuid = ?, level_uuid = ?, is_synced = 0, operation_type = 'UPDATE', updated_at = ?
        WHERE uuid = ?;
        `,
        [date, officeUuid, levelUuid, now, currentRecordUuid]
      );
      // حذف الحضور القديم للطلاب قبل إضافة الجديد
      await db.runAsync(`DELETE FROM student_attendances WHERE attendance_record_uuid = ?;`, [currentRecordUuid]);
      await addToSyncQueue('attendance_records', 'UPDATE', currentRecordUuid);
    } else {
      // إضافة سجل جديد
      await db.runAsync(
        `
        INSERT INTO attendance_records (uuid, date, office_uuid, level_uuid, created_at, updated_at, is_synced, operation_type)
        VALUES (?, ?, ?, ?, ?, ?, 0, 'INSERT');
        `,
        [currentRecordUuid, date, officeUuid, levelUuid, now, now]
      );
      await addToSyncQueue('attendance_records', 'INSERT', currentRecordUuid);
    }
    
    // 2. إضافة حضور الطلاب
    for (const status of studentStatuses) {
      await db.runAsync(
        `
        INSERT INTO student_attendances (attendance_record_uuid, student_uuid, status, is_synced, operation_type, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'INSERT', ?, ?);
        `,
        [currentRecordUuid, status.studentUuid, status.status, now, now]
      );
    }
  });
};

// حذف سجل حضور نهائيًا
export const deleteAttendanceRecord = async (uuid: string) => {
  const db = getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM student_attendances WHERE attendance_record_uuid = ?;`, [uuid]);
    await db.runAsync(`DELETE FROM attendance_records WHERE uuid = ?;`, [uuid]);
    await addToSyncQueue('attendance_records', 'DELETE', uuid);
  });
};

// ===================================================
//                   وظائف المزامنة
// ===================================================

/**
 * مزامنة سجلات الحضور من المحلي إلى Supabase.
 */
export const syncUpAttendanceRecords = async () => {
  const isConnected = await NetInfo.fetch();
  if (!isConnected.isConnected) {
    console.log('❌ لا يوجد اتصال بالإنترنت لمزامنة الحضور');
    return;
  }

  try {
    const unsyncedChanges = await getUnsyncedChanges();
    const attendanceChanges = unsyncedChanges.filter(change => change.entity === 'attendance_records');
    
    if (attendanceChanges.length === 0) {
      console.log('📭 لا توجد تغييرات حضور للمزامنة');
      return;
    }

    console.log(`📤 مزامنة ${attendanceChanges.length} تغيير حضور إلى Supabase...`);

    for (const change of attendanceChanges) {
      const db = getDb();
      const localRecord = await db.getFirstAsync<AttendanceRecord>(`
        SELECT * FROM attendance_records WHERE uuid = ?;
      `, [change.entity_uuid]);

      if (!localRecord && change.operation !== 'DELETE') {
        console.warn(`⚠️ سجل الحضور المحلي غير موجود: ${change.entity_uuid}`);
        await clearSyncedChange(change.id);
        continue;
      }
      
      switch (change.operation) {
        case 'INSERT':
          try {
            const { error: insertError, data: insertedRecord } = await supabase
              .from('attendance_records')
              .insert({
                uuid: localRecord!.uuid,
                date: localRecord!.date,
                office_uuid: localRecord!.office_uuid,
                level_uuid: localRecord!.level_uuid,
                created_at: localRecord!.created_at,
                updated_at: localRecord!.updated_at,
              })
              .select()
              .single();

            if (insertError) {
              if (insertError.code === '23505') {
                console.log(`⚠️ سجل الحضور موجود بالفعل: ${localRecord!.uuid}`);
                await clearSyncedChange(change.id);
                continue;
              }
              throw insertError;
            }
            
            // مزامنة حضور الطلاب المرتبطين
            const localStudentAttendances = await getStudentAttendanceForRecord(localRecord!.uuid);
            if (localStudentAttendances.length > 0) {
              const studentAttendancesToInsert = localStudentAttendances.map(sa => ({
                attendance_record_uuid: sa.attendance_record_uuid,
                student_uuid: sa.student_uuid,
                status: sa.status,
                created_at: sa.created_at,
                updated_at: sa.updated_at,
              }));
              
              const { error: saInsertError } = await supabase
                .from('student_attendances')
                .insert(studentAttendancesToInsert);

              if (saInsertError) throw saInsertError;
            }

            await db.runAsync(
              `UPDATE attendance_records SET is_synced = 1, supabase_id = ? WHERE uuid = ?;`,
              [insertedRecord.id, localRecord!.uuid]
            );
            await clearSyncedChange(change.id);
            console.log(`✅ تمت مزامنة سجل حضور جديد: ${localRecord!.uuid}`);
          } catch (insertErr: any) {
            console.error(`❌ خطأ في إدراج سجل الحضور: ${insertErr.message}`);
            continue;
          }
          break;

        case 'UPDATE':
          try {
            const { error: updateError } = await supabase
              .from('attendance_records')
              .update({
                date: localRecord!.date,
                office_uuid: localRecord!.office_uuid,
                level_uuid: localRecord!.level_uuid,
                updated_at: localRecord!.updated_at,
              })
              .eq('uuid', localRecord!.uuid);

            if (updateError) throw updateError;
            
            // تحديث حضور الطلاب بطريقة أكثر كفاءة
            const localStudentAttendances = await getStudentAttendanceForRecord(localRecord!.uuid);
            
            // حذف جميع الحضور الحالي وإعادة إدراجه (أبسط وأكثر أماناً)
            const { error: deleteAllError } = await supabase
              .from('student_attendances')
              .delete()
              .eq('attendance_record_uuid', localRecord!.uuid);

            if (deleteAllError) console.warn('⚠️ خطأ في حذف الحضور القديم:', deleteAllError.message);

            // إدراج الحضور الجديد
            if (localStudentAttendances.length > 0) {
              const studentAttendancesToInsert = localStudentAttendances.map(sa => ({
                attendance_record_uuid: sa.attendance_record_uuid,
                student_uuid: sa.student_uuid,
                status: sa.status,
                created_at: sa.created_at,
                updated_at: sa.updated_at,
              }));
              
              const { error: saInsertError } = await supabase
                .from('student_attendances')
                .insert(studentAttendancesToInsert);

              if (saInsertError) throw saInsertError;
            }

            await db.runAsync(`UPDATE attendance_records SET is_synced = 1 WHERE uuid = ?;`, [localRecord!.uuid]);
            await clearSyncedChange(change.id);
            console.log(`✅ تم تحديث سجل حضور: ${localRecord!.uuid}`);
          } catch (updateErr: any) {
            console.error(`❌ خطأ في تحديث سجل الحضور: ${updateErr.message}`);
            continue;
          }
          break;

        case 'DELETE':
          try {
            const { error: deleteError } = await supabase
              .from('attendance_records')
              .update({ deleted_at: new Date().toISOString() })
              .eq('uuid', change.entity_uuid);

            if (deleteError) throw deleteError;

            await clearSyncedChange(change.id);
            console.log(`✅ تم حذف سجل حضور: ${change.entity_uuid}`);
          } catch (deleteErr: any) {
            console.error(`❌ خطأ في حذف سجل الحضور: ${deleteErr.message}`);
            continue;
          }
          break;
      }
    }
    console.log('✅ انتهت مزامنة سجلات الحضور إلى Supabase');
  } catch (error: any) {
    console.error('❌ خطأ في مزامنة سجلات الحضور إلى Supabase:', error.message);
    throw error;
  }
};

/**
 * مزامنة سجلات الحضور من Supabase إلى المحلي.
 */
export const syncDownAttendanceRecords = async () => {
  const isConnected = await NetInfo.fetch();
  if (!isConnected.isConnected) {
    console.log('❌ لا يوجد اتصال بالإنترنت لجلب سجلات الحضور');
    return;
  }

  try {
    console.log('📥 جلب سجلات الحضور من Supabase...');
    const { data: remoteRecords, error: fetchError } = await supabase
      .from('attendance_records')
      .select(`
        *,
        student_attendances(
          student_uuid,
          status,
          created_at,
          updated_at
        )
      `)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    if (!remoteRecords || remoteRecords.length === 0) {
      console.log('📭 لا توجد سجلات حضور في Supabase');
      return;
    }

    const db = getDb();
    const localRecords = await getAllAttendanceRecords();

    await db.withTransactionAsync(async () => {
      // معالجة السجلات المحذوفة بعيدياً
      const { data: deletedRecords } = await supabase
        .from('attendance_records')
        .select('uuid, updated_at')
        .not('deleted_at', 'is', null);

      if (deletedRecords) {
        for (const deletedRecord of deletedRecords) {
          const existingLocal = localRecords.find(l => l.uuid === deletedRecord.uuid);
          if (existingLocal) {
            await db.runAsync(`DELETE FROM student_attendances WHERE attendance_record_uuid = ?;`, [deletedRecord.uuid]);
            await db.runAsync(`DELETE FROM attendance_records WHERE uuid = ?;`, [deletedRecord.uuid]);
            console.log(`🗑️ تم حذف سجل محذوف بعيدياً: ${deletedRecord.uuid}`);
          }
        }
      }

      // التعامل مع الإضافة والتحديث
      for (const remoteRecord of remoteRecords) {
        const localRecord = localRecords.find(l => l.uuid === remoteRecord.uuid);
        const remoteUpdate = new Date(remoteRecord.updated_at || remoteRecord.created_at).getTime();

        if (!localRecord) {
          // إضافة سجل جديد من Supabase
          await db.runAsync(
            `
            INSERT OR IGNORE INTO attendance_records 
            (uuid, date, office_uuid, level_uuid, supabase_id, created_at, updated_at, is_synced, operation_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, NULL);
            `,
            [
              remoteRecord.uuid, 
              remoteRecord.date, 
              remoteRecord.office_uuid, 
              remoteRecord.level_uuid,
              remoteRecord.id,
              remoteRecord.created_at, 
              remoteRecord.updated_at
            ]
          );

          // إضافة حضور الطلاب
          const studentAttendances = remoteRecord.student_attendances || [];
          if (studentAttendances.length > 0) {
            for (const sa of studentAttendances) {
              await db.runAsync(
                `
                INSERT OR IGNORE INTO student_attendances 
                (attendance_record_uuid, student_uuid, status, created_at, updated_at, is_synced, operation_type)
                VALUES (?, ?, ?, ?, ?, 1, NULL);
                `,
                [remoteRecord.uuid, sa.student_uuid, sa.status, sa.created_at || remoteRecord.created_at, sa.updated_at || remoteRecord.updated_at]
              );
            }
          }
          console.log(`➕ تم إضافة سجل حضور جديد من Supabase: ${remoteRecord.uuid}`);

        } else {
          const localUpdate = new Date(localRecord.updated_at || localRecord.created_at || 0).getTime();
          
          // تحديث فقط إذا كان التحديث البعيد أحدث والسجل المحلي متزامن
          if (remoteUpdate > localUpdate && !localRecord.operation_type) {
            // تحديث سجل محلي قديم من Supabase
            await db.runAsync(
              `
              UPDATE attendance_records
              SET date = ?, office_uuid = ?, level_uuid = ?, supabase_id = ?, updated_at = ?, is_synced = 1, operation_type = NULL
              WHERE uuid = ?;
              `,
              [
                remoteRecord.date, 
                remoteRecord.office_uuid, 
                remoteRecord.level_uuid, 
                remoteRecord.id,
                remoteRecord.updated_at, 
                localRecord.uuid
              ]
            );
            
            // تحديث حضور الطلاب
            const studentAttendances = remoteRecord.student_attendances || [];
            // حذف الحضور القديم قبل إضافة الجديد
            await db.runAsync(`DELETE FROM student_attendances WHERE attendance_record_uuid = ?;`, [localRecord.uuid]);
            
            if (studentAttendances.length > 0) {
              for (const sa of studentAttendances) {
                await db.runAsync(
                  `
                  INSERT INTO student_attendances (attendance_record_uuid, student_uuid, status, created_at, updated_at, is_synced, operation_type)
                  VALUES (?, ?, ?, ?, ?, 1, NULL);
                  `,
                  [remoteRecord.uuid, sa.student_uuid, sa.status, sa.created_at || remoteRecord.created_at, sa.updated_at || remoteRecord.updated_at]
                );
              }
            }

            console.log(`🔄 تم تحديث سجل حضور محلي من Supabase: ${localRecord.uuid}`);
          }
        }
      }
    });
    console.log('✅ تمت مزامنة سجلات الحضور البعيدة بنجاح مع المحلي.');
  } catch (error: any) {
    console.error('❌ خطأ في جلب ومزامنة سجلات الحضور البعيدة:', error.message);
    throw error;
  }
};
