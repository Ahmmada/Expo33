// app/(admin)/students.tsx
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Alert,
  Modal,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Platform,
  FlatList,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import SearchBar from '@/components/SearchBar';
import {
  getLocalStudents,
  insertLocalStudent,
  updateLocalStudent,
  deleteLocalStudent,
  updateLocalStudentSupabaseId,
  Student,
  markStudentAsSynced,
  markRemoteDeletedLocally,
  updateLocalStudentFieldsBySupabase,
  insertFromSupabaseIfNotExists,
  deleteLocalStudentByUuidAndMarkSynced,
  getStudentByUuid,
  fetchAndSyncRemoteStudents,
} from '@/lib/studentsDb';
import { getLocalOffices } from '@/lib/officesDb';
import { getLocalLevels } from '@/lib/levelsDb';
import { getUnsyncedChanges, clearSyncedChange } from '@/lib/syncQueueDb';
import NetInfo from '@react-native-community/netinfo';
import { Picker } from '@react-native-picker/picker';
import DatePickerInput from '@/components/DatePickerInput';
import { exportStudentsToPdf } from '@/lib/pdfExporter';
import StudentItem from '@/components/StudentItem'; 

export default function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [offices, setOffices] = useState<any[]>([]);
  const [levels, setLevels] = useState<any[]>([]);

  // حقول النموذج
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [selectedOfficeUuid, setSelectedOfficeUuid] = useState<string | null>(null);
  const [selectedLevelUuid, setSelectedLevelUuid] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const initializeStudentsScreen = async () => {
      try {
        unsubscribe = NetInfo.addEventListener(state => setIsConnected(state.isConnected));
        await Promise.all([fetchStudents(), loadOfficesAndLevels()]);
      } catch (error) {
        console.error('❌ Failed to prepare StudentsScreen:', error);
        Alert.alert('خطأ', 'فشل في تهيئة شاشة الطلاب');
      }
    };
    initializeStudentsScreen();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const loadOfficesAndLevels = async () => {
    try {
      const [officesData, levelsData] = await Promise.all([
        getLocalOffices(),
        getLocalLevels(),
      ]);
      setOffices(officesData);
      setLevels(levelsData);
    } catch (error) {
      console.error('❌ خطأ في تحميل المراكز والمستويات:', error);
      Alert.alert('خطأ', 'فشل في تحميل بيانات المراكز أو المستويات.');
    }
  };

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const localData = await getLocalStudents();
      setStudents(localData);
      setFilteredStudents(localData);
    } catch (error: any) {
      Alert.alert('خطأ في جلب البيانات المحلية', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncDataWithSupabase = useCallback(async () => {
    if (!isConnected) {
      console.log('Not connected to internet, skipping Supabase sync.');
      return;
    }

    try {
      const unsyncedChanges = await getUnsyncedChanges();
      if (unsyncedChanges.length > 0) {
        console.log(`Attempting to sync ${unsyncedChanges.length} changes...`);
      }

      await Promise.all(unsyncedChanges.map(async (change) => {
        try {
          if (change.entity === 'students') {
            const payload = JSON.parse(change.payload);
            let syncSuccessful = false;

            if (change.operation === 'INSERT') {
              // جلب office_id و level_id من Supabase باستخدام UUID
              const [officeResult, levelResult] = await Promise.all([
                supabase.from('offices').select('id').eq('uuid', payload.office_uuid).single(),
                supabase.from('levels').select('id').eq('uuid', payload.level_uuid).single()
              ]);

              if (officeResult.error || levelResult.error) {
                console.error('❌ Cannot find office or level in Supabase:', officeResult.error || levelResult.error);
                return;
              }

              const { data, error } = await supabase
                .from('students')
                .insert([{
                  uuid: payload.uuid,
                  name: payload.name,
                  birth_date: payload.birth_date || null,
                  phone: payload.phone || null,
                  address: payload.address || null,
                  office_id: officeResult.data.id,
                  level_id: levelResult.data.id,
                  created_at: payload.created_at,
                  updated_at: payload.updated_at,
                  is_synced: true
                }])
                .select();

              if (error) {
                if (error.code === '23505' && error.message.includes('students_name_key')) {
                  return new Promise<void>((resolve) => {
                    Alert.alert(
                      'تنبيه',
                      `اسم الطالب "${payload.name}" موجود بالفعل. هل تريد حذف الإدخال المحلي؟`,
                      [
                        { text: 'إلغاء', style: 'cancel', onPress: () => resolve() },
                        {
                          text: 'حذف',
                          style: 'destructive',
                          onPress: async () => {
                            await deleteLocalStudentByUuidAndMarkSynced(payload.uuid);
                            await clearSyncedChange(change.id);
                            resolve();
                          },
                        },
                      ]
                    );
                  });
                }
                throw error;
              }
              if (data && data.length > 0) {
                await updateLocalStudentSupabaseId(change.entity_local_id, change.entity_uuid, data[0].id);
                await markStudentAsSynced(change.entity_local_id);
                syncSuccessful = true;
              }
            } 
            else if (change.operation === 'UPDATE') {
              // جلب office_id و level_id من Supabase باستخدام UUID
              const [officeResult, levelResult] = await Promise.all([
                supabase.from('offices').select('id').eq('uuid', payload.office_uuid).single(),
                supabase.from('levels').select('id').eq('uuid', payload.level_uuid).single()
              ]);

              if (officeResult.error || levelResult.error) {
                console.error('❌ Cannot find office or level in Supabase:', officeResult.error || levelResult.error);
                return;
              }

              const { error } = await supabase
                .from('students')
                .update({
                  name: payload.name,
                  birth_date: payload.birth_date || null,
                  phone: payload.phone || null,
                  address: payload.address || null,
                  office_id: officeResult.data.id,
                  level_id: levelResult.data.id,
                  updated_at: payload.updated_at,
                  is_synced: true
                })
                .eq('uuid', payload.uuid)
                .is('deleted_at', null);

              if (error) throw error;
              await markStudentAsSynced(change.entity_local_id);
              syncSuccessful = true;
            }
            else if (change.operation === 'DELETE') {
              const { error } = await supabase
                .from('students')
                .update({
                  deleted_at: payload.deleted_at,
                  updated_at: payload.updated_at,
                  is_synced: true
                })
                .eq('uuid', payload.uuid)
                .is('deleted_at', null);
              if (error) throw error;
              syncSuccessful = true;
            }

            if (syncSuccessful) {
              await clearSyncedChange(change.id);
              console.log(`✅ Synced ${change.operation} for student UUID: ${change.entity_uuid}`);
            }
          }
        } catch (error: any) {
          console.error(`❌ Error syncing change ${change.id}:`, error.message);
          Alert.alert('خطأ في المزامنة', `حدث خطأ أثناء مزامنة: ${error.message}`);
        }
      }));

      await fetchStudents();
      await fetchAndSyncRemoteStudents();
    } catch (error: any) {
      console.error('❌ Unexpected error during syncDataWithSupabase:', error.message);
    }
  }, [isConnected, fetchStudents]);

  useEffect(() => {
    const init = async () => {
      await fetchStudents();
      if (isConnected) {
        await syncDataWithSupabase();
      }
    };
    init();
  }, [fetchStudents, isConnected, syncDataWithSupabase]);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredStudents(students);
    } else {
      setFilteredStudents(
        students.filter(student =>
          student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (student.office_name && student.office_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (student.level_name && student.level_name.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      );
    }
  }, [searchQuery, students]);

  const resetForm = () => {
    setName('');
    setBirthDate('');
    setPhone('');
    setAddress('');
    setSelectedOfficeUuid(null);
    setSelectedLevelUuid(null);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('خطأ', 'يرجى إدخال اسم الطالب');
      return;
    }
    if (!selectedOfficeUuid) {
      Alert.alert('خطأ', 'يرجى اختيار المركز');
      return;
    }
    if (!selectedLevelUuid) {
      Alert.alert('خطأ', 'يرجى اختيار المستوى');
      return;
    }

    try {
      const studentData = {
        name: name.trim(),
        birth_date: birthDate || undefined,
        phone: phone || undefined,
        address: address || undefined,
        office_uuid: selectedOfficeUuid,
        level_uuid: selectedLevelUuid,
      };

      if (editingId) {
        await updateLocalStudent(editingId, studentData);
      } else {
        const { localId, uuid } = await insertLocalStudent(studentData);
        console.log(`New local student created: ID=${localId}, UUID=${uuid}`);
      }

      resetForm();
      setModalVisible(false);
      await fetchStudents();

      if (isConnected) {
        await syncDataWithSupabase();
      }
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    setName(student.name);
    setBirthDate(student.birth_date || '');
    setPhone(student.phone || '');
    setAddress(student.address || '');
    setSelectedOfficeUuid(student.office_uuid);
    setSelectedLevelUuid(student.level_uuid);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل تريد حذف هذا الطالب؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLocalStudent(id);
              await fetchStudents();
              setSearchQuery('');
              if (isConnected) {
                await syncDataWithSupabase();
              }
            } catch (error: any) {
              Alert.alert('خطأ في الحذف', error.message);
            }
          },
        },
      ]
    );
  };

  const renderStudentItem = ({ item, index }: { item: Student; index: number }) => (
    <StudentItem
      item={item}
      index={index}
      onEdit={handleEdit}
      onDelete={handleDelete}
    />
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="folder-open-outline" size={64} color="#d1d5db" />
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد طلاب حتى الآن'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery ? `عن "${searchQuery}"` : 'ابدأ بإنشاء طالب جديد'}
      </Text>
    </View>
  );

  const ResultsCount = () => (
    <View style={styles.resultsContainer}>
      <Text style={styles.resultsText}>
        {filteredStudents.length} من {students.length} طالب
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

<View style={styles.header}>
    <Text style={styles.title}>الطلاب</Text>
    <View style={{ flexDirection: 'row', gap: 10 }}>
        {/* زر تصدير التقرير */}
<TouchableOpacity style={styles.exportButton} onPress={() => exportStudentsToPdf(filteredStudents)}>
    <Ionicons name="share-outline" size={24} color="#6366f1" />
    <Text style={styles.exportButtonText}>تصدير</Text>
</TouchableOpacity>
        {/* زر إضافة طالب جديد */}
        <TouchableOpacity style={styles.addButton} onPress={() => {
            setModalVisible(true);
            resetForm();
        }}>
            <Ionicons name="add-circle" size={24} color="white" />
            <Text style={styles.addButtonText}>طالب جديد</Text>
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

      {searchQuery.length > 0 && students.length > 0 && <ResultsCount />}

    <FlatList
        data={filteredStudents}
        keyExtractor={item => item.uuid || item.id.toString()}
        refreshing={loading}
        onRefresh={async () => {
          await fetchStudents();
          if (isConnected) {
            await syncDataWithSupabase();
          }
        }}
        renderItem={renderStudentItem}
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
          resetForm();
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {editingId ? 'تعديل الطالب' : 'إنشاء طالب جديد'}
                </Text>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                  }}
                >
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.label}>اسم الطالب *</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="أدخل اسم الطالب"
                  style={styles.input}
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                  autoFocus
                />

                <Text style={styles.label}>تاريخ الميلاد</Text>
                <DatePickerInput
                  value={birthDate}
                  onDateChange={setBirthDate}
                  placeholder="تاريخ الميلاد (YYYY-MM-DD)"
                />

                <Text style={styles.label}>رقم الهاتف</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="أدخل رقم الهاتف"
                  style={styles.input}
                  keyboardType="phone-pad"
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                />

                <Text style={styles.label}>عنوان السكن</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="أدخل عنوان السكن"
                  style={styles.input}
                  textAlign={Platform.OS === 'android' ? 'right' : 'left'}
                />

                <Text style={styles.label}>المركز *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedOfficeUuid}
                    onValueChange={(itemValue) => setSelectedOfficeUuid(itemValue)}
                    itemStyle={styles.pickerItem}
                  >
                    <Picker.Item label="اختر المركز..." value={null} />
                    {offices.map(office => (
                      <Picker.Item
                        key={office.uuid}
                        label={office.name}
                        value={office.uuid}
                      />
                    ))}
                  </Picker>
                </View>

                <Text style={styles.label}>المستوى *</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedLevelUuid}
                    onValueChange={(itemValue) => setSelectedLevelUuid(itemValue)}
                    itemStyle={styles.pickerItem}
                  >
                    <Picker.Item label="اختر المستوى..." value={null} />
                    {levels.map(level => (
                      <Picker.Item
                        key={level.uuid}
                        label={level.name}
                        value={level.uuid}
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
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
          </ScrollView>
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
  studentItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  studentInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  serialNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  serialText: { fontSize: 14, fontWeight: 'bold', color: '#6366f1' },
  studentDetails: { flex: 1 },
  nameContainer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  studentName: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginRight: 8 },
  syncStatus: { fontSize: 12, color: 'orange', fontWeight: 'bold' },
  studentId: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  studentDetail: { fontSize: 13, color: '#475569', marginBottom: 2 },
  studentActions: { flexDirection: 'column', gap: 8, marginTop: 4 },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    maxWidth: 400,
    width: '100%',
    alignSelf: 'center',
    elevation: 8,
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
    marginBottom: 12,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 12,
    overflow: 'hidden',
  },
  pickerItem: {
    textAlign: 'right',
    height: 120,
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

   
    exportButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 8,
        backgroundColor: '#e0e7ff',
        borderWidth: 1,
        borderColor: '#6366f1',
    },
    exportButtonText: {
        color: '#6366f1',
        fontWeight: '600',
        fontSize: 14
    },
  
    
});


