// app/_layout.tsx
import 'react-native-get-random-values';
import React, { useEffect, useState, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, SplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { initDb } from '@/lib/database';
import 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { Alert, View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useColorScheme } from '@/hooks/useColorScheme';
import { Colors } from '@/constants/Colors';
import { fetchAndSyncRemoteOffices } from '@/lib/officesDb';
import { fetchAndSyncRemoteLevels } from '@/lib/levelsDb';

// منع إخفاء شاشة البداية تلقائياً حتى يكون التطبيق جاهزاً
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  const [isAppReady, setIsAppReady] = useState(false);
  const [finalTargetRoute, setFinalTargetRoute] = useState<string | null>(null);
  const isInitialRedirectDone = useRef(false);

  // useEffect الأول: لتهيئة التطبيق وتحديد المسار المستهدف
  useEffect(() => {
    let authSubscription: { data: { subscription: any } } | null = null;
    let netInfoUnsubscribe: (() => void) | undefined;

    const initializeAppAndDetermineRoute = async () => {
      try {
        await initDb();
        console.log('✅ تم تهيئة قاعدة البيانات المحلية بنجاح.');

        netInfoUnsubscribe = NetInfo.addEventListener(state => {
          console.log('🔌 حالة الشبكة:', state.isConnected ? 'متصل' : 'غير متصل');
        });

        // تم تعديل هذا الجزء: الآن نقوم بمزامنة البيانات بعد تسجيل الدخول
        authSubscription = supabase.auth.onAuthStateChange(async (event, session) => {
          console.log('🔑 حدث تغيير حالة المصادقة:', event);
          if (event === 'SIGNED_OUT') {
            await determineTargetRoute(null);
          } else if (event === 'SIGNED_IN') {
            await determineTargetRoute(session?.user);
            await handleSyncOnSignIn(); // 🔥 هنا تتم المزامنة بعد تسجيل الدخول
          } else if (event === 'INITIAL_SESSION' && !isInitialRedirectDone.current) {
            await determineTargetRoute(session?.user);
            if (session?.user) {
              await handleSyncOnSignIn(); // 🔥 هنا تتم المزامنة للجلسة الأولية للمستخدم المسجل دخوله
            }
          }
        });

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error("❌ خطأ في الحصول على الجلسة عند بدء التشغيل:", sessionError.message);
          if (!isInitialRedirectDone.current) {
            await determineTargetRoute(null);
          }
        } else {
           if (!isInitialRedirectDone.current) {
            await determineTargetRoute(session?.user);
           }
        }

      } catch (error) {
        console.error('❌ فشل في تهيئة التطبيق:', error);
        setFinalTargetRoute('/signIn');
        setIsAppReady(true);
      } finally {
        SplashScreen.hideAsync();
      }
    };

    initializeAppAndDetermineRoute();

    return () => {
      if (netInfoUnsubscribe) netInfoUnsubscribe();
      if (authSubscription?.data?.subscription) {
        authSubscription.data.subscription.unsubscribe();
      }
    };
  }, []);

  // 🔥 دالة جديدة للمزامنة تُستدعى بعد تسجيل الدخول
  const handleSyncOnSignIn = async () => {
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
        console.log('🔄 مزامنة جميع المراكز والمستويات من Supabase بعد تسجيل الدخول...');
        try {
            await Promise.all([
                fetchAndSyncRemoteOffices(), 
                fetchAndSyncRemoteLevels()  
            ]);
            console.log('✅ تمت مزامنة جميع المراكز والمستويات بنجاح.');
        } catch (syncError) {
            console.error('❌ خطأ في مزامنة المراكز والمستويات الأولية بعد تسجيل الدخول:', syncError);
            Alert.alert("خطأ في المزامنة", "لم نتمكن من مزامنة البيانات الأولية مع الخادم. يرجى التحقق من اتصالك وإعادة المحاولة.");
        }
    }
  }

  const determineTargetRoute = async (user: any | null) => {
    let targetRoute = '/signIn';

    // 🔥 تم إزالة كود المزامنة من هنا. أصبح يُستدعى فقط بعد تسجيل الدخول.

    if (user) {
        console.log('✅ تحديد المسار المستهدف: تم العثور على مستخدم.');
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error("❌ خطأ في جلب ملف التعريف:", profileError.message);
            } else {
                targetRoute = profile.role === 'admin' ? '/(admin)' : '/(user)';
            }
        } catch (profileCatchError) {
            console.error("❌ خطأ غير متوقع في جلب ملف التعريف:", profileCatchError);
        }
    } else {
        console.log('❌ تحديد المسار المستهدف: لم يتم العثور على مستخدم.');
    }
    setFinalTargetRoute(targetRoute);
    isInitialRedirectDone.current = true;
    setIsAppReady(true);
  };

  useEffect(() => {
    if (fontsLoaded && isAppReady && finalTargetRoute !== null) {
      console.log(`✨ التوجيه الفعلي إلى: ${finalTargetRoute}`);
      router.replace(finalTargetRoute);
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isAppReady, finalTargetRoute]);

  if (!fontsLoaded || !isAppReady || finalTargetRoute === null) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors[colorScheme ?? 'light'].tint} />
        <Text style={styles.loadingText}>جاري إعداد التطبيق...</Text>
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="signIn" options={{ headerShown: false }} />
        <Stack.Screen name="signUp" options={{ headerShown: false }} />
        <Stack.Screen name="(admin)" options={{ headerShown: false }} />
        <Stack.Screen name="(user)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
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
});
