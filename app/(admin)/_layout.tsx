// app/(admin)/_layout.tsx
import React, { useState, useEffect } from 'react';
import { Drawer } from 'expo-router/drawer';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { MaterialCommunityIcons, FontAwesome6 } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { Alert, View, ActivityIndicator, Text, StyleSheet, TouchableOpacity } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';

export default function AdminDrawerLayout() {
  const colorScheme = useColorScheme();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد أنك تريد تسجيل الخروج؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تسجيل الخروج',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
   //           const netState = await NetInfo.fetch(); // التحقق من حالة الاتصال بالإنترنت
 //             const isConnected = netState.isConnected;

              // إذا كان متصلاً بالإنترنت، حاول تسجيل الخروج من Supabase
  //            if (isConnected) {
 //               const { error } = await supabase.auth.signOut();
 //               if (error) {
 //                 Alert.alert('خطأ في تسجيل الخروج عبر الإنترنت', error.message);
 //                 setLoading(false);
 //                 return; // توقف هنا إذا كان هناك خطأ في Supabase
//                }
//              }

              // بعد تسجيل الخروج من Supabase (إذا كان متصلاً) أو في وضع عدم الاتصال
              // نقوم ببساطة بإعادة توجيه المستخدم إلى صفحة تسجيل الدخول
              Alert.alert('تم تسجيل الخروج', 'تم تسجيل خروجك بنجاح.');
              router.replace('/signIn'); // إعادة توجيه إلى شاشة تسجيل الدخول
            } catch (error: any) {
              Alert.alert('خطأ في تسجيل الخروج', error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };
  
  // مكون الزر الذي سيتم عرضه في الرأس
  const LogoutButton = () => (
    <TouchableOpacity
      style={styles.logoutButton}
      onPress={handleSignOut}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors[colorScheme ?? 'light'].text} />
      ) : (
        <Ionicons
          name="log-out-outline"
          size={24}
          color={Colors[colorScheme ?? 'light'].text}
        />
      )}
    </TouchableOpacity>
  );

  return (
    <Drawer screenOptions={{
      headerShown: true,
      drawerActiveTintColor: Colors[colorScheme ?? 'light'].tint,
      headerStyle: {
        backgroundColor: Colors[colorScheme ?? 'light'].background,
      },
      headerTintColor: Colors[colorScheme ?? 'light'].text,
      headerRight: () => <LogoutButton />, // إضافة زر تسجيل الخروج هنا
    }}>
      <Drawer.Screen
        name="index"
        options={{
          drawerLabel: 'الرئيسية',
          title: 'لوحة تحكم المسؤول',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="students"
        options={{
          drawerLabel: 'الطلاب',
          title: 'إدارة الطلاب',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="account-details" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="attendances"
        options={{
          drawerLabel: 'سجلات حضور الطلاب',
          title: 'إدارة الحضور',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-check-outline" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="users"
        options={{
          drawerLabel: 'المستخدمون',
          title: 'إدارة المستخدمين',
          drawerIcon: ({ color, size }) => (
            <FontAwesome6 name="users" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="levels"
        options={{
          drawerLabel: 'المستويات',
          title: 'إدارة المستويات',
          drawerIcon: ({ color, size }) => (
            <FontAwesome6 name="ranking-star" size={size} color={color} />
          ),
        }}
      />
      <Drawer.Screen
        name="offices"
        options={{
          drawerLabel: 'المراكز',
          title: 'إدارة المراكز',
          drawerIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="school-outline" size={size} color={color} />
          ),
        }}
      />

    </Drawer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6366f1',
  },
  logoutButton: {
    paddingRight: 16,
  },
});
