// lib/syncManager.ts
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { getUnsyncedChanges, clearSyncedChange } from './syncQueueDb';
import { 
  markOfficeAsSynced, 
  updateLocalOfficeSupabaseId,
  deleteLocalOfficeByUuidAndMarkSynced,
  fetchAndSyncRemoteOffices 
} from './officesDb';
import { 
  markLevelAsSynced, 
  updateLocalLevelSupabaseId,
  deleteLocalLevelByUuidAndMarkSynced,
  fetchAndSyncRemoteLevels 
} from './levelsDb';
import { 
  markStudentAsSynced, 
  updateLocalStudentSupabaseId,
  deleteLocalStudentByUuidAndMarkSynced,
  fetchAndSyncRemoteStudents 
} from './studentsDb';
import { syncUpAttendanceRecords, syncDownAttendanceRecords } from './attendanceDb';

export interface SyncResult {
  success: boolean;
  message: string;
  syncedCount: number;
  failedCount: number;
}

export class SyncManager {
  private static instance: SyncManager;
  private isSyncing = false;

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  async checkConnectivity(): Promise<boolean> {
    const netState = await NetInfo.fetch();
    return netState.isConnected ?? false;
  }

  async syncAll(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        message: 'المزامنة قيد التشغيل بالفعل',
        syncedCount: 0,
        failedCount: 0
      };
    }

    const isConnected = await this.checkConnectivity();
    if (!isConnected) {
      return {
        success: false,
        message: 'لا يوجد اتصال بالإنترنت',
        syncedCount: 0,
        failedCount: 0
      };
    }

    this.isSyncing = true;
    let totalSynced = 0;
    let totalFailed = 0;

    try {
      console.log('🔄 بدء المزامنة الشاملة...');

      // 1. مزامنة البيانات المحلية إلى Supabase
      const uploadResult = await this.syncLocalToRemote();
      totalSynced += uploadResult.syncedCount;
      totalFailed += uploadResult.failedCount;

      // 2. مزامنة البيانات من Supabase إلى المحلي
      const downloadResult = await this.syncRemoteToLocal();
      totalSynced += downloadResult.syncedCount;
      totalFailed += downloadResult.failedCount;

      console.log(`✅ انتهت المزامنة الشاملة - نجح: ${totalSynced}, فشل: ${totalFailed}`);

      return {
        success: totalFailed === 0,
        message: totalFailed === 0 
          ? `تمت المزامنة بنجاح (${totalSynced} عنصر)`
          : `مزامنة جزئية - نجح: ${totalSynced}, فشل: ${totalFailed}`,
        syncedCount: totalSynced,
        failedCount: totalFailed
      };

    } catch (error: any) {
      console.error('❌ خطأ في المزامنة الشاملة:', error.message);
      return {
        success: false,
        message: `خطأ في المزامنة: ${error.message}`,
        syncedCount: totalSynced,
        failedCount: totalFailed + 1
      };
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncLocalToRemote(): Promise<SyncResult> {
    let syncedCount = 0;
    let failedCount = 0;

    try {
      const unsyncedChanges = await getUnsyncedChanges();
      console.log(`📤 مزامنة ${unsyncedChanges.length} تغيير محلي إلى Supabase...`);

      // تجميع التغييرات حسب النوع والعملية لتحسين الأداء
      const groupedChanges = this.groupChangesByEntityAndOperation(unsyncedChanges);

      for (const [entityType, operations] of Object.entries(groupedChanges)) {
        for (const [operation, changes] of Object.entries(operations)) {
          try {
            const result = await this.syncEntityChanges(entityType, operation as any, changes);
            syncedCount += result.syncedCount;
            failedCount += result.failedCount;
          } catch (error: any) {
            console.error(`❌ خطأ في مزامنة ${entityType} ${operation}:`, error.message);
            failedCount += changes.length;
          }
        }
      }

      return { success: failedCount === 0, message: '', syncedCount, failedCount };
    } catch (error: any) {
      console.error('❌ خطأ في مزامنة البيانات المحلية:', error.message);
      return { success: false, message: error.message, syncedCount, failedCount: failedCount + 1 };
    }
  }

  private async syncRemoteToLocal(): Promise<SyncResult> {
    let syncedCount = 0;
    let failedCount = 0;

    try {
      console.log('📥 مزامنة البيانات من Supabase إلى المحلي...');

      // ترتيب المزامنة: المراكز والمستويات أولاً، ثم الطلاب، ثم الحضور
      const syncOperations = [
        { name: 'المراكز', fn: fetchAndSyncRemoteOffices },
        { name: 'المستويات', fn: fetchAndSyncRemoteLevels },
        { name: 'الطلاب', fn: fetchAndSyncRemoteStudents },
        { name: 'سجلات الحضور', fn: syncDownAttendanceRecords },
      ];

      for (const operation of syncOperations) {
        try {
          await operation.fn();
          syncedCount++;
          console.log(`✅ تمت مزامنة ${operation.name} بنجاح`);
        } catch (error: any) {
          console.error(`❌ خطأ في مزامنة ${operation.name}:`, error.message);
          failedCount++;
        }
      }

      return { success: failedCount === 0, message: '', syncedCount, failedCount };
    } catch (error: any) {
      console.error('❌ خطأ في مزامنة البيانات البعيدة:', error.message);
      return { success: false, message: error.message, syncedCount, failedCount: failedCount + 1 };
    }
  }

  private groupChangesByEntityAndOperation(changes: any[]) {
    const grouped: Record<string, Record<string, any[]>> = {};
    
    changes.forEach(change => {
      if (!grouped[change.entity]) {
        grouped[change.entity] = {};
      }
      if (!grouped[change.entity][change.operation]) {
        grouped[change.entity][change.operation] = [];
      }
      grouped[change.entity][change.operation].push(change);
    });

    return grouped;
  }

  private async syncEntityChanges(
    entityType: string, 
    operation: 'INSERT' | 'UPDATE' | 'DELETE', 
    changes: any[]
  ): Promise<SyncResult> {
    let syncedCount = 0;
    let failedCount = 0;

    for (const change of changes) {
      try {
        const success = await this.syncSingleChange(entityType, operation, change);
        if (success) {
          syncedCount++;
          await clearSyncedChange(change.id);
        } else {
          failedCount++;
        }
      } catch (error: any) {
        console.error(`❌ خطأ في مزامنة ${entityType} ${operation}:`, error.message);
        failedCount++;
      }
    }

    return { success: failedCount === 0, message: '', syncedCount, failedCount };
  }

  private async syncSingleChange(
    entityType: string, 
    operation: 'INSERT' | 'UPDATE' | 'DELETE', 
    change: any
  ): Promise<boolean> {
    const payload = JSON.parse(change.payload);

    switch (entityType) {
      case 'offices':
        return await this.syncOfficeChange(operation, change, payload);
      case 'levels':
        return await this.syncLevelChange(operation, change, payload);
      case 'students':
        return await this.syncStudentChange(operation, change, payload);
      case 'attendance_records':
        return await this.syncAttendanceChange(operation, change, payload);
      default:
        console.warn(`⚠️ نوع كيان غير معروف: ${entityType}`);
        return false;
    }
  }

  private async syncOfficeChange(operation: string, change: any, payload: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'INSERT':
          const { data: insertData, error: insertError } = await supabase
            .from('offices')
            .insert({
              uuid: payload.uuid,
              name: payload.name,
              created_at: payload.created_at,
              updated_at: payload.updated_at,
            })
            .select()
            .single();

          if (insertError) {
            if (insertError.code === '23505') {
              await deleteLocalOfficeByUuidAndMarkSynced(payload.uuid);
              return true;
            }
            throw insertError;
          }

          await updateLocalOfficeSupabaseId(change.entity_local_id, change.entity_uuid, insertData.id);
          await markOfficeAsSynced(change.entity_local_id);
          return true;

        case 'UPDATE':
          const { error: updateError } = await supabase
            .from('offices')
            .update({
              name: payload.name,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (updateError) throw updateError;
          await markOfficeAsSynced(change.entity_local_id);
          return true;

        case 'DELETE':
          const { error: deleteError } = await supabase
            .from('offices')
            .update({
              deleted_at: payload.deleted_at,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (deleteError) throw deleteError;
          return true;

        default:
          return false;
      }
    } catch (error: any) {
      console.error(`❌ خطأ في مزامنة المركز ${operation}:`, error.message);
      return false;
    }
  }

  private async syncLevelChange(operation: string, change: any, payload: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'INSERT':
          const { data: insertData, error: insertError } = await supabase
            .from('levels')
            .insert({
              uuid: payload.uuid,
              name: payload.name,
              created_at: payload.created_at,
              updated_at: payload.updated_at,
            })
            .select()
            .single();

          if (insertError) {
            if (insertError.code === '23505') {
              await deleteLocalLevelByUuidAndMarkSynced(payload.uuid);
              return true;
            }
            throw insertError;
          }

          await updateLocalLevelSupabaseId(change.entity_local_id, change.entity_uuid, insertData.id);
          await markLevelAsSynced(change.entity_local_id);
          return true;

        case 'UPDATE':
          const { error: updateError } = await supabase
            .from('levels')
            .update({
              name: payload.name,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (updateError) throw updateError;
          await markLevelAsSynced(change.entity_local_id);
          return true;

        case 'DELETE':
          const { error: deleteError } = await supabase
            .from('levels')
            .update({
              deleted_at: payload.deleted_at,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (deleteError) throw deleteError;
          return true;

        default:
          return false;
      }
    } catch (error: any) {
      console.error(`❌ خطأ في مزامنة المستوى ${operation}:`, error.message);
      return false;
    }
  }

  private async syncStudentChange(operation: string, change: any, payload: any): Promise<boolean> {
    try {
      switch (operation) {
        case 'INSERT':
          // جلب office_id و level_id من Supabase باستخدام UUID
          const [officeResult, levelResult] = await Promise.all([
            supabase.from('offices').select('id').eq('uuid', payload.office_uuid).single(),
            supabase.from('levels').select('id').eq('uuid', payload.level_uuid).single()
          ]);

          if (officeResult.error || levelResult.error) {
            console.error('❌ لا يمكن العثور على المركز أو المستوى في Supabase');
            return false;
          }

          const { data: insertData, error: insertError } = await supabase
            .from('students')
            .insert({
              uuid: payload.uuid,
              name: payload.name,
              birth_date: payload.birth_date || null,
              phone: payload.phone || null,
              address: payload.address || null,
              office_id: officeResult.data.id,
              level_id: levelResult.data.id,
              created_at: payload.created_at,
              updated_at: payload.updated_at,
            })
            .select()
            .single();

          if (insertError) {
            if (insertError.code === '23505') {
              await deleteLocalStudentByUuidAndMarkSynced(payload.uuid);
              return true;
            }
            throw insertError;
          }

          await updateLocalStudentSupabaseId(change.entity_local_id, change.entity_uuid, insertData.id);
          await markStudentAsSynced(change.entity_local_id);
          return true;

        case 'UPDATE':
          // جلب office_id و level_id للتحديث
          const [updateOfficeResult, updateLevelResult] = await Promise.all([
            supabase.from('offices').select('id').eq('uuid', payload.office_uuid).single(),
            supabase.from('levels').select('id').eq('uuid', payload.level_uuid).single()
          ]);

          if (updateOfficeResult.error || updateLevelResult.error) {
            console.error('❌ لا يمكن العثور على المركز أو المستوى للتحديث');
            return false;
          }

          const { error: updateError } = await supabase
            .from('students')
            .update({
              name: payload.name,
              birth_date: payload.birth_date || null,
              phone: payload.phone || null,
              address: payload.address || null,
              office_id: updateOfficeResult.data.id,
              level_id: updateLevelResult.data.id,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (updateError) throw updateError;
          await markStudentAsSynced(change.entity_local_id);
          return true;

        case 'DELETE':
          const { error: deleteError } = await supabase
            .from('students')
            .update({
              deleted_at: payload.deleted_at,
              updated_at: payload.updated_at,
            })
            .eq('uuid', payload.uuid)
            .is('deleted_at', null);

          if (deleteError) throw deleteError;
          return true;

        default:
          return false;
      }
    } catch (error: any) {
      console.error(`❌ خطأ في مزامنة الطالب ${operation}:`, error.message);
      return false;
    }
  }

  private async syncAttendanceChange(operation: string, change: any, payload: any): Promise<boolean> {
    try {
      // استخدام دوال المزامنة الموجودة في attendanceDb
      await syncUpAttendanceRecords();
      return true;
    } catch (error: any) {
      console.error(`❌ خطأ في مزامنة الحضور ${operation}:`, error.message);
      return false;
    }
  }

  async syncEntity(entityType: 'offices' | 'levels' | 'students' | 'attendance'): Promise<SyncResult> {
    const isConnected = await this.checkConnectivity();
    if (!isConnected) {
      return {
        success: false,
        message: 'لا يوجد اتصال بالإنترنت',
        syncedCount: 0,
        failedCount: 0
      };
    }

    try {
      let syncedCount = 0;
      let failedCount = 0;

      // مزامنة التغييرات المحلية أولاً
      const unsyncedChanges = await getUnsyncedChanges();
      const entityChanges = unsyncedChanges.filter(change => 
        change.entity === entityType || 
        (entityType === 'attendance' && change.entity === 'attendance_records')
      );

      for (const change of entityChanges) {
        try {
          const success = await this.syncSingleChange(change.entity, change.operation, change);
          if (success) {
            syncedCount++;
            await clearSyncedChange(change.id);
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
        }
      }

      // مزامنة البيانات البعيدة
      try {
        switch (entityType) {
          case 'offices':
            await fetchAndSyncRemoteOffices();
            break;
          case 'levels':
            await fetchAndSyncRemoteLevels();
            break;
          case 'students':
            await fetchAndSyncRemoteStudents();
            break;
          case 'attendance':
            await syncDownAttendanceRecords();
            break;
        }
        syncedCount++;
      } catch (error) {
        failedCount++;
      }

      return {
        success: failedCount === 0,
        message: failedCount === 0 ? 'تمت المزامنة بنجاح' : 'مزامنة جزئية',
        syncedCount,
        failedCount
      };

    } catch (error: any) {
      console.error(`❌ خطأ في مزامنة ${entityType}:`, error.message);
      return {
        success: false,
        message: error.message,
        syncedCount: 0,
        failedCount: 1
      };
    }
  }

  async getUnsyncedCount(): Promise<number> {
    try {
      const changes = await getUnsyncedChanges();
      return changes.length;
    } catch (error) {
      console.error('❌ خطأ في جلب عدد التغييرات غير المتزامنة:', error);
      return 0;
    }
  }
}

export const syncManager = SyncManager.getInstance();