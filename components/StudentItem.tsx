// components/StudentItem.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Student } from '@/lib/studentsDb';

interface StudentItemProps {
  item: Student;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}

export default function StudentItem({ item, index, onEdit, onDelete }: StudentItemProps) {
  return (
    <View style={styles.studentCard}>
      {/* معلومات الطالب */}
      <View style={styles.studentInfo}>
        {/* رقم تسلسلي */}
        <View style={styles.serialNumber}>
          <Text style={styles.serialText}>{index + 1}</Text>
        </View>

        {/* تفاصيل الطالب */}
        <View style={styles.studentDetails}>
          {/* الاسم وحالة المزامنة */}
          <View style={styles.nameContainer}>
            <Text style={styles.studentName}>{item.name}</Text>
            {item.operation_type && (
              <View style={styles.syncBadge}>
                <Ionicons name="sync-outline" size={12} color="#f59e0b" />
                <Text style={styles.syncText}>معلق</Text>
              </View>
            )}
          </View>

          {/* المركز والمستوى */}
          <View style={styles.locationContainer}>
            <View style={styles.locationItem}>
              <Ionicons name="business-outline" size={14} color="#6b7280" />
              <Text style={styles.locationText}>
                {item.office_name || 'غير محدد'}
              </Text>
            </View>
            <View style={styles.locationItem}>
              <Ionicons name="school-outline" size={14} color="#6b7280" />
              <Text style={styles.locationText}>
                {item.level_name || 'غير محدد'}
              </Text>
            </View>
          </View>

          {/* معلومات إضافية */}
          <View style={styles.additionalInfo}>
            {item.birth_date && (
              <View style={styles.infoItem}>
                <Ionicons name="calendar-outline" size={12} color="#9ca3af" />
                <Text style={styles.infoText}>{item.birth_date}</Text>
              </View>
            )}
            {item.phone && (
              <View style={styles.infoItem}>
                <Ionicons name="call-outline" size={12} color="#9ca3af" />
                <Text style={styles.infoText}>{item.phone}</Text>
              </View>
            )}
            {item.address && (
              <View style={styles.infoItem}>
                <Ionicons name="location-outline" size={12} color="#9ca3af" />
                <Text style={styles.infoText} numberOfLines={1}>
                  {item.address}
                </Text>
              </View>
            )}
          </View>

          {/* معرفات النظام */}
          <View style={styles.systemInfo}>
            <Text style={styles.systemText}>ID: {item.id}</Text>
            {item.supabase_id && (
              <Text style={styles.systemText}>Supabase: {item.supabase_id}</Text>
            )}
          </View>
        </View>
      </View>

      {/* أزرار الإجراءات */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.editButton} onPress={onEdit}>
          <Ionicons name="create-outline" size={18} color="#3b82f6" />
          <Text style={styles.editText}>تعديل</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color="#ef4444" />
          <Text style={styles.deleteText}>حذف</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  studentCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  studentInfo: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  serialNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e0e7ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  serialText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6366f1',
  },
  studentDetails: {
    flex: 1,
    gap: 8,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  studentName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 2,
  },
  syncText: {
    fontSize: 10,
    color: '#f59e0b',
    fontWeight: '600',
  },
  locationContainer: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
  },
  additionalInfo: {
    gap: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#6b7280',
  },
  systemInfo: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  systemText: {
    fontSize: 11,
    color: '#9ca3af',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
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
});