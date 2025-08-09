// app/(tabs)/users.tsx
import NetInfo from '@react-native-community/netinfo';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, StatusBar,
  FlatList, Alert, TouchableOpacity, ActivityIndicator,
  Modal, ScrollView, TextInput
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getLocalOffices } from '@/lib/officesDb';
import SearchBar from '@/components/SearchBar';
import { Colors } from '@/constants/Colors';
import { router } from 'expo-router'; // استخدام router للتنقل

/* ---------- الإنترفيس ---------- */
interface User {
  id: string;
  email: string;
  full_name?: string;
  role: 'admin' | 'user';
}

interface Office {
  id: number;
  name: string;
  supabase_id?: number;
}

/* ---------- مكون فارغ ---------- */
const EmptyState = ({ loading }: { loading: boolean }) => (
  <View style={styles.emptyState}>
    {loading ? (
      <ActivityIndicator size="large" color="#6366f1" />
    ) : (
      <>
        <Ionicons name="people-outline" size={64} color="#d1d5db" />
        <Text style={styles.emptyStateText}>لا يوجد مستخدمون حتى الآن</Text>
      </>
    )}
  </View>
);

export default function UsersScreen() {
  /* ---------- الحالات ---------- */
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [allOffices, setAllOffices] = useState<Office[]>([]);
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const userId = useRef<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null); // لتخزين بيانات المستخدم الحالي

  /* ---------- جلب البيانات والمزامنة ---------- */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      setUsers(data as User[]);
      setFilteredUsers(data as User[]);
    } catch (error: any) {
      Alert.alert('خطأ', 'فشل في جلب المستخدمين: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const localOffices = await getLocalOffices();
      setAllOffices(localOffices);
    } catch (error: any) {
      Alert.alert('خطأ', 'فشل في جلب المراكز المحلية: ' + error.message);
    }
  }, []);

  const fetchUserOffices = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_offices')
        .select('office_id')
        .eq('user_id', userId);

      if (error) throw error;

      return data ? data.map(row => row.office_id) : [];
    } catch (error: any) {
      console.error("❌ خطأ في جلب مكاتب المستخدم:", error);
      return [];
    }
  };

  /* ---------- تأثيرات ومهام الخلفية ---------- */
  useEffect(() => {
    fetchUsers();
    fetchOffices();
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, [fetchUsers, fetchOffices]);

  useEffect(() => {
    const results = users.filter(user =>
      user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredUsers(results);
  }, [searchQuery, users]);

  /* ---------- دوال التحكم بالمودال ---------- */
  const handleEditUser = async (user: User) => {
    setEditingUser(user);
    setEmail(user.email);
    setFullName(user.full_name || '');
    setRole(user.role);
    setPassword(''); // مسح كلمة المرور عند التعديل
    const offices = await fetchUserOffices(user.id);
    setSelectedOfficeIds(offices);
    setModalVisible(true);
    userId.current = user.id;
  };

  const handleCreateUser = () => {
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('user');
    setSelectedOfficeIds([]);
    setModalVisible(true);
    userId.current = null;
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingUser(null);
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('user');
    setSelectedOfficeIds([]);
    userId.current = null;
  };

  const handleToggleOffice = (officeId: number) => {
    setSelectedOfficeIds(prev =>
      prev.includes(officeId)
        ? prev.filter(id => id !== officeId)
        : [...prev, officeId]
    );
  };
  
  const handleDeleteUser = async (user: User) => {
    Alert.alert(
      'تأكيد الحذف',
      `هل أنت متأكد من حذف المستخدم ${user.full_name || user.email}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: async () => {
            try {
              // حذف المستخدم من Supabase
              const { error } = await supabase.auth.admin.deleteUser(user.id);
              if (error) throw error;
              
              // بما أن RLS تعمل على جدول profiles و user_offices
              // فإن حذف المستخدم من auth.users سيؤدي تلقائياً إلى حذف السجلات المرتبطة به
              
              Alert.alert('نجاح', 'تم حذف المستخدم بنجاح.');
              fetchUsers();
            } catch (error: any) {
              Alert.alert('خطأ', 'فشل في حذف المستخدم: ' + error.message);
              console.error('❌ خطأ في حذف المستخدم:', error);
            }
          },
        },
      ]
    );
  };

  /* ---------- دالة الحفظ الرئيسية ---------- */
  const saveUser = async () => {
    if (!email || !fullName || !role || (!editingUser && !password)) {
      Alert.alert('خطأ', 'الرجاء تعبئة جميع الحقول المطلوبة');
      return;
    }

    setIsSaving(true);
    let newUserId = editingUser?.id;

    try {
      if (editingUser) {
        // تحديث مستخدم موجود
        // خطوة 1: تحديث ملف التعريف (profiles)
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: fullName,
            role: role,
          })
          .eq('id', editingUser.id);

        if (profileError) throw profileError;

        // خطوة 2: تحديث جدول الربط (user_offices)
        const { error: deleteError } = await supabase
          .from('user_offices')
          .delete()
          .eq('user_id', editingUser.id);
        if (deleteError) throw deleteError;

        if (selectedOfficeIds.length > 0) {
          const newUserOffices = selectedOfficeIds.map(officeId => ({
            user_id: editingUser.id,
            office_id: officeId,
          }));
          const { error: insertError } = await supabase
            .from('user_offices')
            .insert(newUserOffices);
          if (insertError) throw insertError;
        }

        Alert.alert('نجاح', 'تم تحديث المستخدم بنجاح.');
      } else {
        // إنشاء مستخدم جديد
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              role: role,
            },
          },
        });
        
        if (signUpError) {
          throw signUpError;
        }

        newUserId = data.user?.id;
        
        // ربط المراكز بالمستخدم الجديد
        if (newUserId && selectedOfficeIds.length > 0) {
          const newUserOffices = selectedOfficeIds.map(officeId => ({
            user_id: newUserId,
            office_id: officeId,
          }));
          const { error: insertError } = await supabase
            .from('user_offices')
            .insert(newUserOffices);
          if (insertError) throw insertError;
        }

        Alert.alert('نجاح', 'تم إنشاء المستخدم بنجاح.');
      }
      
      closeModal();
      fetchUsers();
    } catch (error: any) {
      Alert.alert('خطأ', 'فشل في حفظ المستخدم: ' + error.message);
      console.error('❌ خطأ في حفظ المستخدم:', error);
    } finally {
      setIsSaving(false);
    }
  };

  /* ---------- مكونات العرض ---------- */
  const renderItem = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.full_name || 'لا يوجد اسم'}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userRole}>
          {item.role === 'admin' ? 'مسؤول' : 'مستخدم عادي'}
        </Text>
        {currentUser && currentUser.id === item.id && (
          <Text style={styles.currentUserLabel}>(أنت)</Text>
        )}
      </View>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          onPress={() => handleEditUser(item)}
          style={[styles.actionButton, styles.editButton]}>
          <Ionicons name="create-outline" size={24} color={Colors.light.tint} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handleDeleteUser(item)}
          style={[styles.actionButton, styles.deleteButton]}>
          <Ionicons name="trash-outline" size={24} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>المستخدمون</Text>
        <TouchableOpacity style={styles.addButton} onPress={handleCreateUser}>
          <Ionicons name="person-add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
      <SearchBar searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      {loading ? (
        <ActivityIndicator size="large" color="#6366f1" style={styles.loader} />
      ) : filteredUsers.length > 0 ? (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <EmptyState loading={loading} />
      )}

      {/* مودال إضافة/تعديل المستخدم */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
              </Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.label}>البريد الإلكتروني</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                editable={!editingUser} // لا يمكن تعديله إذا كان المستخدم موجوداً
              />
              {!editingUser && (
                <>
                  <Text style={styles.label}>كلمة المرور</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </>
              )}
              <Text style={styles.label}>الاسم الكامل</Text>
              <TextInput
                style={styles.input}
                value={fullName}
                onChangeText={setFullName}
              />
              <Text style={styles.label}>الدور</Text>
              <View style={styles.roleContainer}>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'admin' && styles.roleActive]}
                  onPress={() => setRole('admin')}
                >
                  <Text style={styles.roleText}>مسؤول</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.roleButton, role === 'user' && styles.roleActive]}
                  onPress={() => setRole('user')}
                >
                  <Text style={styles.roleText}>مستخدم عادي</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>المراكز المسموح بها</Text>
              <View style={styles.officesCheckContainer}>
                {allOffices.map((office) => (
                  <TouchableOpacity
                    key={office.id}
                    style={[
                      styles.checkItem,
                      selectedOfficeIds.includes(office.supabase_id!) && styles.checkActive,
                    ]}
                    onPress={() => handleToggleOffice(office.supabase_id!)}
                  >
                    <Ionicons
                      name={
                        selectedOfficeIds.includes(office.supabase_id!)
                          ? 'checkbox-outline'
                          : 'square-outline'
                      }
                      size={24}
                      color={selectedOfficeIds.includes(office.supabase_id!) ? '#6366f1' : '#d1d5db'}
                    />
                    <Text style={styles.checkLabel}>{office.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={saveUser}
                style={[styles.modalButton, styles.saveButton]}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>حفظ</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------- الأنماط (Styles) ---------- */
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
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  addButton: {
    backgroundColor: '#6366f1',
    padding: 8,
    borderRadius: 8,
  },
  loader: {
    marginTop: 20,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  userCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  userEmail: {
    fontSize: 14,
    color: '#64748b',
  },
  userRole: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#e2e8f0',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  editButton: {
    
  },
  deleteButton: {
    
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: '90%',
    maxWidth: 500,
    maxHeight: '80%',
    overflow: 'hidden',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
    marginBottom: 16,
  },
  roleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 16,
  },
  roleButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginRight: 8,
  },
  roleActive: {
    borderColor: '#6366f1',
    backgroundColor: '#e0e7ff',
  },
  roleText: {
    fontSize: 16,
    color: '#374151',
  },
  officesCheckContainer: {
    marginTop: 8,
  },
  checkItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginVertical: 4,
    padding: 8,
    borderRadius: 8,
  },
  checkActive: {
    backgroundColor: '#e0e7ff',
  },
  checkLabel: {
    marginRight: 12,
    fontSize: 16,
    color: '#374151',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  
  currentUserLabel: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: 'bold',
    marginTop: 4,
  },
});
