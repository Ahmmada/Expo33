// app/(admin)/attendances/index.tsx
import { useEffect, useState, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Alert, 
  RefreshControl,
  SafeAreaView,
  StatusBar 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import {
  getAllAttendanceRecords,
  deleteAttendanceRecord,
  AttendanceRecord,
} from '@/lib/attendanceDb';
import { syncManager } from '@/lib/syncManager';
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedChanges } from '@/lib/syncQueueDb';
import SearchBar from '@/components/SearchBar';
import SyncButton from '@/components/SyncButton';

export default function AttendanceIndexScreen() {
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [filteredAttendanceRecords, setFilteredAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const fetchAttendanceRecords = useCallback(async () => {
    setLoading(true);
    try {
      const records = await getAllAttendanceRecords();
      setAttendanceRecords(records);
      
      const changes = await getUnsyncedChanges('attendance_records');
      setUnsyncedCount(changes.length);
    } catch (error) {
      console.error("❌ فشل في جلب سجلات الحضور:", error);
      Alert.alert('خطأ', 'فشل في جلب سجلات الحضور.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSyncComplete = useCallback((success: boolean, message: string) => {
    if (success) {
      fetchAttendanceRecords(); // تحديث القائمة بعد المزامنة الناجحة
    }
    if (message) {
      Alert.alert(success ? 'نجاح المزامنة' : 'خطأ في المزامنة', message);
    }
  }, [fetchAttendanceRecords]);

  // مراقبة حالة الاتصال
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // استخدام useFocusEffect لجلب البيانات في كل مرة يتم فيها التركيز على الشاشة
  useFocusEffect(
    useCallback(() => {
      fetchAttendanceRecords();
    }, [fetchAttendanceRecords])
  );

  // تأثير useEffect لتصفية السجلات بناءً على البحث
  useEffect(() => {
    if (searchQuery === '') {
      setFilteredAttendanceRecords(attendanceRecords);
    } else {
      const lowerCaseQuery = searchQuery.toLowerCase();
      const filtered = attendanceRecords.filter(record => 
        record.date.toLowerCase().includes(lowerCaseQuery) ||
        record.office_name?.toLowerCase().includes(lowerCaseQuery) ||
        record.level_name?.toLowerCase().includes(lowerCaseQuery)
      );
      setFilteredAttendanceRecords(filtered);
    }
  }, [searchQuery, attendanceRecords]);

  const handleDelete = useCallback((uuid: string) => {
    Alert.alert(
      'حذف سجل الحضور',
      'هل أنت متأكد أنك تريد حذف هذا السجل نهائيًا؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAttendanceRecord(uuid);
              await fetchAttendanceRecords();
              
              // المزامنة التلقائية بعد الحذف
              if (isConnected) {
                try {
                  await syncManager.syncEntity('attendance');
                } catch (error) {
                  console.error('❌ خطأ في المزامنة التلقائية:', error);
                }
              }
              
              Alert.alert('نجاح', 'تم حذف السجل بنجاح.');
            } catch (error) {
              console.error("❌ فشل في الحذف:", error);
              Alert.alert('خطأ', 'فشل في حذف السجل.');
            }
          },
        },
      ]
    );
  }, [fetchAttendanceRecords, isConnected]);

  const renderItem = ({ item, index }: { item: AttendanceRecord; index: number }) => (
    <View style={styles.card}>
      <View style={styles.recordInfo}>
        <View style={styles.serialNumber}>
          <Text style={styles.serialText}>{index + 1}</Text>
        </View>
        <View style={styles.recordDetails}>
          <Text style={styles.recordDate}>{item.date}</Text>
          <Text style={styles.recordDetail}>المركز: {item.office_name || 'غير محدد'}</Text>
          <Text style={styles.recordDetail}>المستوى: {item.level_name || 'غير محدد'}</Text>
          {item.operation_type && (
            <Text style={styles.syncStatus}>
              حالة المزامنة: <Text style={{ color: 'orange', fontWeight: 'bold' }}>
                معلق ({item.operation_type})
              </Text>
            </Text>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.editButton]} 
          onPress={() => router.push({ 
            pathname: '/(admin)/attendances/form', 
            params: { recordUuid: item.uuid } 
          })}
        >
          <Ionicons name="create-outline" size={18} color="#3b82f6" />
          <Text style={styles.editText}>تعديل</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.deleteButton]} 
          onPress={() => handleDelete(item.uuid)}
        >
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={styles.deleteText}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const EmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="calendar-outline" size={64} color="#d1d5db" />
      <Text style={styles.emptyStateText}>
        {searchQuery ? 'لا توجد نتائج للبحث' : 'لا توجد سجلات حضور حتى الآن'}
      </Text>
      <Text style={styles.emptyStateSubtext}>
        {searchQuery ? `عن "${searchQuery}"` : 'ابدأ بإنشاء سجل حضور جديد'}
      </Text>
    </View>
  );

  const ResultsCount = () => (
    <View style={styles.resultsContainer}>
      <Text style={styles.resultsText}>
        {filteredAttendanceRecords.length} من {attendanceRecords.length} سجل
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      <View style={styles.header}>
        <Text style={styles.title}>سجلات الحضور</Text>
        <View style={styles.headerActions}>
          <SyncButton 
            entityType="attendance"
            onSyncComplete={handleSyncComplete}
            size="small"
            showLabel={false}
          />
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={() => router.push('/(admin)/attendances/form')}
          >
            <Ionicons name="add-circle" size={24} color="white" />
            <Text style={styles.addButtonText}>سجل جديد</Text>
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

      {searchQuery.length > 0 && attendanceRecords.length > 0 && <ResultsCount />}

      <FlatList
        data={filteredAttendanceRecords}
        keyExtractor={item => item.uuid}
        refreshing={loading}
        onRefresh={fetchAttendanceRecords}
        renderItem={renderItem}
        ListEmptyComponent={EmptyState}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
  },
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
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  resultsContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  resultsText: {
    fontSize: 14,
    color: '#64748b',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
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
  recordInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  serialNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serialText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  recordDetails: {
    flex: 1,
  },
  recordDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  recordDetail: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 1,
  },
  syncStatus: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  editButton: {
    backgroundColor: '#eff6ff',
  },
  deleteButton: {
    backgroundColor: '#fef2f2',
  },
  editText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
});