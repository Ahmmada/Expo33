// app/(admin)/attendances/form.tsx
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  FlatList,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import DatePickerInput from '@/components/DatePickerInput';
import { useLocalSearchParams, router } from 'expo-router';
import { Student } from '@/lib/studentsDb';
import { getLocalOffices, Office } from '@/lib/officesDb';
import { getLocalLevels, Level } from '@/lib/levelsDb';
import {
  getStudentsByOfficeAndLevel,
  getAttendanceRecordByUuid,
  getStudentAttendanceForRecord,
  saveAttendance,
} from '@/lib/attendanceDb';
import { syncManager } from '@/lib/syncManager';
import NetInfo from '@react-native-community/netinfo';

// Possible student attendance status
type AttendanceStatus = 'present' | 'absent' | 'excused';

// Data to be used in the UI
type StudentWithAttendance = Student & {
  attendanceStatus: AttendanceStatus;
};

const AttendanceFormScreen = () => {
  const { recordUuid } = useLocalSearchParams();
  
  const [offices, setOffices] = useState<Office[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [students, setStudents] = useState<StudentWithAttendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  // مراقبة حالة الاتصال
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [loadedOffices, loadedLevels] = await Promise.all([
          getLocalOffices(),
          getLocalLevels()
        ]);
        
        setOffices(loadedOffices);
        setLevels(loadedLevels);
        
        if (recordUuid) {
          setIsEditMode(true);
          const record = await getAttendanceRecordByUuid(recordUuid as string);
          if (record) {
            setSelectedDate(record.date);
            setSelectedOffice(record.office_uuid);
            setSelectedLevel(record.level_uuid);
          }
        } else {
          const today = new Date().toISOString().split('T')[0];
          setSelectedDate(today);
          if (loadedOffices.length > 0) setSelectedOffice(loadedOffices[0].uuid);
          if (loadedLevels.length > 0) setSelectedLevel(loadedLevels[0].uuid);
        }
      } catch (error) {
        console.error('❌ خطأ في تحميل البيانات الأولية:', error);
        Alert.alert('خطأ', 'فشل في تحميل البيانات الأولية.');
      }
    };
    loadInitialData();
  }, [recordUuid]);

  useEffect(() => {
    const fetchStudentsAndAttendance = async () => {
      if (selectedOffice && selectedLevel) {
        setLoading(true);
        try {
          const fetchedStudents = await getStudentsByOfficeAndLevel(selectedOffice, selectedLevel);
          let studentAttendanceStatus: Record<string, AttendanceStatus> = {};
          
          if (isEditMode && recordUuid) {
            const statuses = await getStudentAttendanceForRecord(recordUuid as string);
            statuses.forEach(s => {
              studentAttendanceStatus[s.student_uuid] = s.status;
            });
          }
          
          const studentsWithAttendance = fetchedStudents.map(student => ({
            ...student,
            attendanceStatus: studentAttendanceStatus[student.uuid] || 'absent',
          }));
          
          setStudents(studentsWithAttendance);
        } catch (error) {
          console.error('❌ خطأ في جلب الطلاب:', error);
          Alert.alert('خطأ', 'فشل في جلب بيانات الطلاب.');
        } finally {
          setLoading(false);
        }
      } else {
        setStudents([]);
      }
    };

    fetchStudentsAndAttendance();
  }, [selectedOffice, selectedLevel, selectedDate, isEditMode, recordUuid]);

  const handleStatusChange = useCallback((studentUuid: string, status: AttendanceStatus) => {
    setStudents(prevStudents =>
      prevStudents.map(student =>
        student.uuid === studentUuid ? { ...student, attendanceStatus: status } : student
      )
    );
  }, []);

  const handleSaveAttendance = async () => {
    if (!selectedOffice || !selectedLevel || !selectedDate) {
      Alert.alert('خطأ', 'الرجاء اختيار المركز والمستوى والتاريخ.');
      return;
    }

    if (students.length === 0) {
      Alert.alert('خطأ', 'لا يوجد طلاب لحفظ حضورهم.');
      return;
    }

    setSaving(true);
    const studentsStatus = students.map(s => ({
      studentUuid: s.uuid,
      status: s.attendanceStatus,
    }));

    try {
      await saveAttendance(
        selectedDate, 
        selectedOffice, 
        selectedLevel, 
        studentsStatus, 
        isEditMode ? recordUuid as string : undefined
      );
      
      // المزامنة التلقائية بعد الحفظ
      if (isConnected) {
        try {
          await syncManager.syncEntity('attendance');
        } catch (error) {
          console.error('❌ خطأ في المزامنة التلقائية:', error);
        }
      }
      
      Alert.alert('نجاح', 'تم حفظ سجل الحضور بنجاح.');
      router.back();
    } catch (error: any) {
      console.error('❌ خطأ في حفظ الحضور:', error.message);
      // عرض رسالة خطأ واضحة للمستخدم في حالة وجود سجل مكرر
      if (error.message.includes('Attendance record already exists')) {
        Alert.alert('خطأ', 'يوجد سجل حضور مسبق لنفس المركز والمستوى والتاريخ.');
      } else {
        Alert.alert('خطأ', 'فشل في حفظ سجل الحضور.');
      }
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'present': return '#22c55e';
      case 'excused': return '#f59e0b';
      case 'absent': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusBackgroundColor = (status: AttendanceStatus) => {
    switch (status) {
      case 'present': return '#dcfce7';
      case 'excused': return '#fffbeb';
      case 'absent': return '#fee2e2';
      default: return '#f3f4f6';
    }
  };

  const renderStudentItem = ({ item, index }: { item: StudentWithAttendance; index: number }) => (
    <View style={styles.studentItem}>
      <View style={styles.studentInfo}>
        <View style={styles.serialNumber}>
          <Text style={styles.serialText}>{index + 1}</Text>
        </View>
        <View style={styles.studentDetails}>
          <Text style={styles.studentName}>{item.name}</Text>
          <Text style={styles.studentDetail}>المركز: {item.office_name || 'غير محدد'}</Text>
          <Text style={styles.studentDetail}>المستوى: {item.level_name || 'غير محدد'}</Text>
        </View>
      </View>
      <View style={styles.statusOptions}>
        <TouchableOpacity
          style={[
            styles.statusButton,
            { 
              backgroundColor: item.attendanceStatus === 'present' ? getStatusBackgroundColor('present') : '#f3f4f6',
              borderColor: item.attendanceStatus === 'present' ? getStatusColor('present') : '#d1d5db'
            }
          ]}
          onPress={() => handleStatusChange(item.uuid, 'present')}
        >
          <Text style={[
            styles.statusText,
            { color: item.attendanceStatus === 'present' ? getStatusColor('present') : '#6b7280' }
          ]}>
            حاضر
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.statusButton,
            { 
              backgroundColor: item.attendanceStatus === 'excused' ? getStatusBackgroundColor('excused') : '#f3f4f6',
              borderColor: item.attendanceStatus === 'excused' ? getStatusColor('excused') : '#d1d5db'
            }
          ]}
          onPress={() => handleStatusChange(item.uuid, 'excused')}
        >
          <Text style={[
            styles.statusText,
            { color: item.attendanceStatus === 'excused' ? getStatusColor('excused') : '#6b7280' }
          ]}>
            مستأذن
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.statusButton,
            { 
              backgroundColor: item.attendanceStatus === 'absent' ? getStatusBackgroundColor('absent') : '#f3f4f6',
              borderColor: item.attendanceStatus === 'absent' ? getStatusColor('absent') : '#d1d5db'
            }
          ]}
          onPress={() => handleStatusChange(item.uuid, 'absent')}
        >
          <Text style={[
            styles.statusText,
            { color: item.attendanceStatus === 'absent' ? getStatusColor('absent') : '#6b7280' }
          ]}>
            غائب
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.formContainer}>
      <Text style={styles.label}>التاريخ:</Text>
      <DatePickerInput 
        value={selectedDate} 
        onDateChange={setSelectedDate}
        placeholder="اختر التاريخ"
      />

      <Text style={styles.label}>المركز:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedOffice}
          onValueChange={(itemValue) => setSelectedOffice(itemValue)}
          style={styles.picker}
          enabled={!isEditMode}
        >
          <Picker.Item label="اختر المركز..." value={null} />
          {offices.map(office => (
            <Picker.Item key={office.uuid} label={office.name} value={office.uuid} />
          ))}
        </Picker>
      </View>

      <Text style={styles.label}>المستوى:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedLevel}
          onValueChange={(itemValue) => setSelectedLevel(itemValue)}
          style={styles.picker}
          enabled={!isEditMode}
        >
          <Picker.Item label="اختر المستوى..." value={null} />
          {levels.map(level => (
            <Picker.Item key={level.uuid} label={level.name} value={level.uuid} />
          ))}
        </Picker>
      </View>

      {students.length > 0 && (
        <View style={styles.studentsHeader}>
          <Text style={styles.studentsTitle}>قائمة الطلاب ({students.length})</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: '#dcfce7' }]}
              onPress={() => {
                setStudents(prev => prev.map(s => ({ ...s, attendanceStatus: 'present' })));
              }}
            >
              <Text style={[styles.quickButtonText, { color: '#22c55e' }]}>الكل حاضر</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickButton, { backgroundColor: '#fee2e2' }]}
              onPress={() => {
                setStudents(prev => prev.map(s => ({ ...s, attendanceStatus: 'absent' })));
              }}
            >
              <Text style={[styles.quickButtonText, { color: '#ef4444' }]}>الكل غائب</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const EmptyStudentsState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color="#d1d5db" />
      <Text style={styles.emptyText}>لا يوجد طلاب بهذا المركز والمستوى.</Text>
      <Text style={styles.emptySubtext}>تأكد من إضافة طلاب أولاً.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {isEditMode ? 'تعديل سجل الحضور' : 'إنشاء سجل حضور جديد'}
        </Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.saveButtonDisabled]} 
          onPress={handleSaveAttendance} 
          disabled={saving || loading}
        >
          {saving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Ionicons name="save-outline" size={24} color="white" />
          )}
        </TouchableOpacity>
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

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>جاري تحميل بيانات الطلاب...</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={item => item.uuid}
          renderItem={renderStudentItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={students.length === 0 && selectedOffice && selectedLevel ? EmptyStudentsState : null}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </SafeAreaView>
  );
};

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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  saveButton: {
    backgroundColor: '#6366f1',
    padding: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  formContainer: {
    padding: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'right',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    height: Platform.OS === 'ios' ? 120 : 50,
    width: '100%',
  },
  studentsHeader: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  studentsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 8,
  },
  quickButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6b7280',
  },
  listContent: {
    paddingBottom: 20,
  },
  studentItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  serialNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serialText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
    textAlign: 'right',
  },
  studentDetail: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'right',
  },
  statusOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  statusButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 60,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  separator: {
    height: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 50,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default AttendanceFormScreen;