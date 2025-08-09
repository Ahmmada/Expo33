// app/(user)/_layout.tsx
import 'react-native-get-random-values';
import { Tabs , router} from 'expo-router';
import React, { useState, useEffect } from 'react';
import { Alert, View, ActivityIndicator, Text, StyleSheet, TouchableOpacity , Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from '@/lib/supabase';
import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { MaterialCommunityIcons, FontAwesome6, Ionicons } from '@expo/vector-icons';

export default function UserTabLayout() {
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
   //          const netState = await NetInfo.fetch(); // التحقق من حالة الاتصال بالإنترنت
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
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      headerRight: () => <LogoutButton />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="students"
        options={{
          headerShown: true,
          title: 'الطلاب',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="account-details" size={20} color={color} />
          ),
        }}
      />
       <Tabs.Screen
        name="attendances"
        options={{
          headerShown: true,
          title: 'إدارة الحضور',
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="book-check-outline" size={20} color={color} />
          ),
        }}
      />
      {/* لا توجد شاشات إضافية هنا للمستخدم العادي */}
    </Tabs>
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


