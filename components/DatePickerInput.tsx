// components/DatePickerInput.tsx
import React, { useState } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  Platform,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

interface DatePickerInputProps {
  value: string; // التاريخ الحالي بتنسيق YYYY-MM-DD
  onDateChange: (dateString: string) => void; // دالة يتم استدعاؤها عند تغيير التاريخ
  placeholder?: string; // النص البديل (placeholder) للحقل
  style?: any; // ستايلات إضافية لتطبيقها على الـ Pressable
}

const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onDateChange,
  placeholder = 'اختر التاريخ',
  style,
}) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  // تحويل القيمة string إلى Date object للـ picker
  // إذا كانت القيمة غير صالحة (empty string أو undefined)، نستخدم التاريخ الحالي
  const initialDate = value ? new Date(value) : new Date();

  const onChange = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || initialDate;
    setShowDatePicker(Platform.OS === 'ios'); // إخفاء الـ picker على iOS بعد الاختيار

    // تنسيق التاريخ إلى YYYY-MM-DD
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0');
    const day = String(currentDate.getDate()).padStart(2, '0');
    onDateChange(`${year}-${month}-${day}`); // استدعاء الدالة الممرة من الـ parent
  };

  const showMode = () => {
    setShowDatePicker(true);
  };

  return (
    <View>
      <Pressable onPress={showMode} style={[styles.input, style]}>
        <Text style={{ color: value ? '#000' : '#888' }}>
          {value || placeholder}
        </Text>
      </Pressable>
      {showDatePicker && (
        <DateTimePicker
          testID="dateTimePicker"
          value={initialDate}
          mode="date"
          display="default" // أو 'spinner' أو 'calendar'
          onChange={onChange}
          locale="ar" // 💡 يمكنك تعيين اللغة العربية
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  input: {
    width: '100%',
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16, // هذا الستايل لا يؤثر على Pressable مباشرة بل على Text داخله
    textAlign: 'right', // هذا الستايل لا يؤثر على Pressable مباشرة بل على Text داخله
    justifyContent: 'center', // لمحاذاة النص في المنتصف عموديا
    minHeight: 50, // لتثبيت ارتفاع الحقل
  },
});

export default DatePickerInput;
