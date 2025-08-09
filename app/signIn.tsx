// app/signIn.tsx
import NetInfo from '@react-native-community/netinfo';
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { saveLocalProfile, getLocalProfile, verifyOfflinePassword } from '@/lib/localProfile';
import * as SecureStore from 'expo-secure-store';

const LAST_EMAIL_KEY = 'last_signIn_email';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const fetchLastEmail = async () => {
      try {
        const storedEmail = await SecureStore.getItemAsync(LAST_EMAIL_KEY);
        if (storedEmail) {
          setEmail(storedEmail);
        }
      } catch (error) {
        console.error('Failed to retrieve last email from SecureStore:', error);
      }
    };

    fetchLastEmail();
  }, []);

  const handleSignIn = async () => {
    setLoading(true);

    const netState = await NetInfo.fetch();
    const isConnected = netState.isConnected;

    try {
      if (!isConnected) {
        // ------- وضع عدم الاتصال -------
        const verified = await verifyOfflinePassword(email, password);
        if (verified) {
          router.replace(verified.role === 'admin' ? '/(admin)' : '/(user)');
        } else {
          Alert.alert('بيانات غير صحيحة أو غير متوفرة محليًا');
        }
        return;
      }

      // ------- وضع الاتصال بالإنترنت -------
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('خطأ في تسجيل الدخول', error.message);
      } else {
        // حفظ آخر بريد إلكتروني
        await SecureStore.setItemAsync(LAST_EMAIL_KEY, email);

        const { data: profile } = await supabase
          .from('profiles')
          .select('role') // تأكد من جلب full_name و avatar_url
          .eq('id', data.user.id)
          .single();

        if (profile) {
          // حفظ ملف تعريف المستخدم محلياً للاستخدام في وضع عدم الاتصال
          await saveLocalProfile({
            supabase_id: data.user.id,
            email: data.user.email,
            role: profile.role,
  full_name: data.user.user_metadata?.full_name,
  avatar_url: data.user.user_metadata?.avatar_url,
            password_hash: password,
          });

          // إعادة توجيه المستخدم بناءً على الدور
          if (profile.role === 'admin') {
            router.replace('/(admin)');
          } else {
            router.replace('/(user)');
          }
        } else {
          Alert.alert('خطأ', 'فشل في جلب ملف تعريف المستخدم.');
        }
      }
    } catch (error: any) {
      Alert.alert('خطأ', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.content}>
        <Text style={styles.title}>تسجيل الدخول</Text>
        <TextInput
          style={styles.input}
          placeholder="البريد الإلكتروني"
          placeholderTextColor="#9ca3af"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!loading}
        />
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="كلمة المرور"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            editable={!loading}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={24}
              color="#9ca3af"
            />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>تسجيل الدخول</Text>
          )}
        </TouchableOpacity>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'right',
  },
  button: {
    width: '100%',
    backgroundColor: '#6366f1',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  
});
