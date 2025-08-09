// app/(admin)/offices.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '@/components/SearchBar';
import {
  getLocalOffices,
  insertLocalOffice,
  updateLocalOffice,
  deleteLocalOffice,
  Office,
} from '@/lib/officesDb';
import { syncManager } from '@/lib/syncManager';
import SyncButton from '@/components/SyncButton';
import NetInfo from '@react-native-community/netinfo';

export default function OfficesScreen() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [filteredOffices, setFilteredOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [syncMessage, setSyncMessage] = useState<string>('');

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const initializeOfficesScreen = async () => {
      try {
        unsubscribe = NetInfo.addEventListener(state => setIsConnected(state.isConnected));
        await fetchOffices();
      } catch (error) {
        console.error('❌ Failed to prepare OfficesScreen:', error);
        Alert.alert('خطأ', 'فشل في تهيئة شاشة المراكز');
      }
    };
    initializeOfficesScreen();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const fetchOffices = useCallback(async () => {
    setLoading(true);
    try {
      const localData = await getLocalOffices();
      setOffices(localData);
      setFilteredOffices(localData);
    } catch (error: any) {
      Alert.alert('خطأ في جلب البيانات المحلية', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSyncComplete = useCallback((success: boolean, message: string) => {
    setSyncMessage(message);
    if (success) {
      fetchOffices(); // تحديث القائمة بعد المزامنة الناجحة
    }
    if (message) {
      Alert.alert(success ? 'نجاح المزامنة' : 'خطأ في المزامنة', message);
    }
  }, [fetchOffices]);

  useEffect(() => {
    fetchOffices();
  }, [fetchOffices]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredOffices(offices);
    } else {
      setFilteredOffices(
        offices.filter(office =>
          office.name.toLowerCase().includes(searchQuery.toLowerCase())
        )
      );
    }
  }, [searchQuery, offices]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم المركز');
      return;
    }

    try {
      if (editingId) {
        await updateLocalOffice(editingId, name);
      } else {
        const { localId, uuid } = await insertLocalOffice({ name });
        console.log(`New local office created: ID=${localId}, UUID=${uuid}`);
      }

      setName('');
      setEditingId(null);
      setModalVisible(false);
      await fetchOffices();

      // المزامنة التلقائية بعد الحفظ
      if (isConnected) {
        try {
          await syncManager.syncEntity('offices');
        } catch (error) {
          console.error('❌ خطأ في المزامنة التلقائية:', error);
        }
      }
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
      // لا يتم إغلاق المودال أو إعادة تعيين القيم
    }
  };

  const handleDelete = async (id: number) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل تريد حذف هذا المركز؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalOffice(id);
              await fetchOffices();
              setSearchQuery('');
              
              // المزامنة التلقائية بعد الحذف
              if (isConnected) {
                try {
                  await syncManager.syncEntity('offices');
                } catch (error) {
                  console.error('❌ خطأ في المزامنة التلقائية:', error);
                }
              }
            } catch (error: any) {
              Alert.alert('خطأ في الحذف', error.message);
            }
          },
        },
      ]
    );
  };

  const renderOfficeItem = ({ item, index }: { item: Office; index: number }) => (
    <View style={styles.officeItem}>
      <View style={styles.officeInfo}>
        <View style={styles.serialNumber}>
          <Text style={styles.serialText}>{index + 1}</Text>
        </View>
        <View style={styles.officeDetails}>
          <Text style={styles.officeName}>{item.name}</Text>
          <Text style={styles.officeId}>رقم التعريف (محلي): {item.id}</Text>
          {item.supabase_id && (
            <Text style={styles.officeId}>رقم التعريف (Supabase): {item.supabase_id}</Text>
          )}
          {item.operation_type && (
            <Text style={styles.officeId}>
              حالة المزامنة:{' '}
              <Text style={{ color: 'orange', fontWeight: 'bold' }}>
                معلق ({item.operation_type})
              </Text>
            </Text>
          )}
        </View>
      </View>
      <View style={styles.officeActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => {
            setEditingId(item.id);
            setName(item.name);
            setModalVisible(true);
          }}
        >
          <Ionicons name="create-outline" size={18} color="#3b82f6" />
          <Text style={styles.editText}>تعديل</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDelete(item.id)}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={styles.deleteText}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد مراكز حتى الآن'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery ? `عن "${searchQuery}"` : 'ابدأ بإنشاء مركز جديد'}
      </Text>
    </View>
  );

  const ResultsCount = () => (
    <View style={styles.resultsContainer}>
      <Text style={styles.resultsText}>
        {filteredOffices.length} من {offices.length} مركز
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      <View style={styles.header}>
        <Text style={styles.title}>المراكز</Text>
        <View style={styles.headerActions}>
          <SyncButton 
            entityType="offices"
            onSyncComplete={handleSyncComplete}
            size="small"
            showLabel={false}
          />
          <TouchableOpacity style={styles.addButton} onPress={() => {
            setModalVisible(true);
            setName('');
            setEditingId(null);
          }}>
            <Ionicons name="add-circle" size={24} color="white" />
            <Text style={styles.addButtonText}>مركز جديد</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isConnected !== null && (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
          }}
        >
          <Text
            style={{
              color: isConnected ? '#16a34a' : '#dc2626',
              fontWeight: 'bold',
              textAlign: 'center',
            }}
          >
            {isConnected ? 'متصل بالإنترنت' : 'غير متصل بالإنترنت'}
          </Text>
        </View>
      )}

      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />

      {searchQuery.length > 0 && offices.length > 0 && <ResultsCount />}

      <FlatList
        data={filteredOffices}
        keyExtractor={item => item.uuid || item.id.toString()}
        refreshing={loading}
        onRefresh={async () => {
          await fetchOffices();
        }}
        renderItem={renderOfficeItem}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setModalVisible(false);
          setEditingId(null);
          setName('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'تعديل المركز' : 'إنشاء مركز جديد'}
              </Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  setModalVisible(false);
                  setEditingId(null);
                  setName('');
                }}
              >
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.label}>اسم المركز</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="أدخل اسم المركز"
                style={styles.input}
                autoFocus
              />
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setModalVisible(false);
                  setEditingId(null);
                  setName('');
                }}
              >
                <Text style={styles.cancelText}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSave}
              >
                <Text style={styles.saveText}>{editingId ? 'تحديث' : 'إنشاء'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 28, fontWeight: 'bold', color: '#1e293b' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  resultsContainer: { marginHorizontal: 16, marginBottom: 12 },
  resultsText: { fontSize: 14, color: '#64748b' },
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },
  officeItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  officeInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  serialNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serialText: { fontSize: 14, fontWeight: 'bold', color: '#6366f1' },
  officeDetails: { flex: 1 },
  officeName: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
  officeId: { fontSize: 12, color: '#6b7280' },
  officeActions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editButton: { backgroundColor: '#eff6ff' },
  deleteButton: { backgroundColor: '#fef2f2' },
  editText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  deleteText: { color: '#ef4444', fontSize: 12, fontWeight: '600' },
  separator: { height: 8 },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: { fontSize: 18, color: '#6b7280', marginTop: 16 },
  emptyStateSubtext: { fontSize: 14, color: '#9ca3af', marginTop: 4 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#1e293b' },
  closeButton: { padding: 4 },
  modalBody: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: { backgroundColor: '#f3f4f6' },
  saveButton: { backgroundColor: '#6366f1' },
  cancelText: { color: '#374151', fontWeight: '600' },
  saveText: { color: 'white', fontWeight: '600' },
});