// hooks/useCrudSync.ts
import { useEffect, useState, useCallback } from 'react';
import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { initDb } from '@/lib/localDb/index.ts';

export interface SyncEntity {
  id: number;
  name: string;
  supabase_id?: number;
  is_synced?: number;
  operation_type?: string | null;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
}

export interface CrudConfig<T extends SyncEntity> {
  tableName: string;
  displayName: string;
  localDb: {
    getAll: () => Promise<T[]>;
    insert: (item: Omit<T, 'id'>) => Promise<number>;
    update: (id: number, item: Partial<T>) => Promise<void>;
    delete: (id: number) => Promise<void>;
    getUnsynced: () => Promise<any[]>;
    markAsSynced: (id: number) => Promise<void>;
    clearSyncQueue: (id: number) => Promise<void>;
    updateSupabaseId: (localId: number, supabaseId: number) => Promise<void>;
    mergeRemote: (remoteItem: any) => Promise<void>;
  };
}

export function useCrudSync<T extends SyncEntity>(config: CrudConfig<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [filteredItems, setFilteredItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');



// في useEffect الخاص بالتهيئة، تأكد من:
useEffect(() => {
  let unsubscribe: (() => void) | undefined;
  
  const initialize = async () => {
    try {
      await initDb(); // تأكد من استدعاء initDb هنا
      unsubscribe = NetInfo.addEventListener(state => setIsConnected(state.isConnected));
      await fetchData();
    } catch (error) {
      console.error('Initialization error:', error);
    }
  };
  
  initialize();
  return () => unsubscribe?.();
}, [fetchData]);



  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await config.localDb.getAll();
      setItems(data);
      setFilteredItems(data);
    } catch (error: any) {
      Alert.alert('خطأ', `فشل في جلب البيانات: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [config.localDb]);

  const syncData = useCallback(async () => {
    if (!isConnected) return;

    try {
      const unsynced = await config.localDb.getUnsynced();
      
      for (const change of unsynced) {
        try {
          if (change.operation === 'INSERT') {
            const { data, error } = await supabase
              .from(config.tableName)
              .insert([{ ...JSON.parse(change.payload), is_synced: true }])
              .select();
              
            if (error) throw error;
            if (data?.[0]) {
              await config.localDb.updateSupabaseId(change.entity_local_id, data[0].id);
              await config.localDb.markAsSynced(change.entity_local_id);
              await config.localDb.clearSyncQueue(change.id);
            }
          } else if (change.operation === 'UPDATE') {
            const { error } = await supabase
              .from(config.tableName)
              .update({ ...JSON.parse(change.payload), is_synced: true })
              .eq('id', change.entity_supabase_id)
              .is('deleted_at', null);
              
            if (error) throw error;
            await config.localDb.markAsSynced(change.entity_local_id);
            await config.localDb.clearSyncQueue(change.id);
          } else if (change.operation === 'DELETE') {
            const { error } = await supabase
              .from(config.tableName)
              .update({ deleted_at: new Date().toISOString(), is_synced: true })
              .eq('id', change.entity_supabase_id);
              
            if (error) throw error;
            await config.localDb.markAsSynced(change.entity_local_id);
            await config.localDb.clearSyncQueue(change.id);
          }
        } catch (error: any) {
          console.error(`Sync error for ${config.tableName}:`, error);
          Alert.alert('خطأ في المزامنة', error.message);
        }
      }

      await fetchRemoteAndMerge();
    } catch (error: any) {
      console.error('Unexpected sync error:', error);
    }
  }, [isConnected, config]);

  const fetchRemoteAndMerge = useCallback(async () => {
    if (!isConnected) return;

    try {
      const { data: remoteItems, error } = await supabase
        .from(config.tableName)
        .select('*')
        .order('id', { ascending: true });

      if (error) throw error;

      const localItems = await config.localDb.getAll();

      for (const remoteItem of remoteItems || []) {
        if (remoteItem.deleted_at) {
          await config.localDb.delete(remoteItem.id);
          continue;
        }

        const localItem = localItems.find(l => 
          String(l.supabase_id) === String(remoteItem.id) || 
          Number(l.id) === Number(remoteItem.local_id)
        );

        if (!localItem) {
          await config.localDb.mergeRemote(remoteItem);
        } else {
          const remoteTime = new Date(remoteItem.updated_at || remoteItem.created_at).getTime();
          const localTime = new Date(localItem.updated_at || localItem.created_at).getTime();

          if (remoteTime > localTime) {
            await config.localDb.mergeRemote(remoteItem);
          } else if (localTime > remoteTime) {
            await supabase
              .from(config.tableName)
              .update({
                name: localItem.name,
                updated_at: localItem.updated_at,
                is_synced: true
              })
              .eq('id', remoteItem.id);
          }
        }
      }

      await fetchData();
    } catch (error: any) {
      Alert.alert('خطأ', `فشل في جلب البيانات البعيدة: ${error.message}`);
    }
  }, [isConnected, config, fetchData]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredItems(items);
    } else {
      setFilteredItems(
        items.filter(item =>
          item.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }
  }, [searchQuery, items]);

  useEffect(() => {
    fetchData();
    if (isConnected) {
      syncData();
    }
  }, [fetchData, isConnected, syncData]);

  const createItem = async (name: string) => {
    if (!name.trim()) {
      Alert.alert('خطأ', `يرجى إدخال اسم ${config.displayName}`);
      return;
    }

    try {
      await config.localDb.insert({ name });
      await fetchData();
      if (isConnected) await syncData();
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    }
  };

  const updateItem = async (id: number, name: string) => {
    if (!name.trim()) {
      Alert.alert('خطأ', `يرجى إدخال اسم ${config.displayName}`);
      return;
    }

    try {
      await config.localDb.update(id, { name });
      await fetchData();
      if (isConnected) await syncData();
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    }
  };

  const deleteItem = async (id: number) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل تريد حذف هذا ${config.displayName}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await config.localDb.delete(id);
              await fetchData();
              if (isConnected) await syncData();
            } catch (error: any) {
              Alert.alert('خطأ', error.message);
            }
          }
        }
      ]
    );
  };

  return {
    items,
    filteredItems,
    loading,
    isConnected,
    searchQuery,
    setSearchQuery,
    createItem,
    updateItem,
    deleteItem,
    refresh: fetchData,
    sync: syncData
  };
}