// components/SyncStatus.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { syncManager } from '@/lib/syncManager';
import { authManager } from '@/lib/authManager';

interface SyncStatusProps {
  showSyncButton?: boolean;
  style?: any;
}

export default function SyncStatus({ showSyncButton = true, style }: SyncStatusProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'completed' | 'error' | 'idle'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    // مراقبة حالة الاتصال
    const unsubscribeNet = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });

    // مراقبة حالة المزامنة
    const handleSyncStatus = (status: 'syncing' | 'completed' | 'error') => {
      setSyncStatus(status);
      if (status === 'completed') {
        setLastSyncTime(new Date());
        setTimeout(() => setSyncStatus('idle'), 2000); // إخفاء حالة "مكتملة" بعد ثانيتين
      } else if (status === 'error') {
        setTimeout(() => setSyncStatus('idle'), 3000); // إخفاء حالة "خطأ" بعد 3 ثوان
      }
    };

    syncManager.addSyncListener(handleSyncStatus);

    return () => {
      unsubscribeNet();
      syncManager.removeSyncListener(handleSyncStatus);
    };
  }, []);

  const handleManualSync = async () => {
    if (!authManager.isAuthenticated()) {
      return;
    }

    const result = await syncManager.fullSync();
    if (!result.success && result.error) {
      console.error('خطأ في المزامنة اليدوية:', result.error);
    }
  };

  const getStatusColor = () => {
    if (!isConnected) return '#ef4444'; // أحمر - غير متصل
    if (syncStatus === 'syncing') return '#f59e0b'; // برتقالي - جاري المزامنة
    if (syncStatus === 'completed') return '#10b981'; // أخضر - مكتملة
    if (syncStatus === 'error') return '#ef4444'; // أحمر - خطأ
    return '#6b7280'; // رمادي - خامل
  };

  const getStatusText = () => {
    if (!isConnected) return 'غير متصل';
    if (syncStatus === 'syncing') return 'جاري المزامنة...';
    if (syncStatus === 'completed') return 'تمت المزامنة';
    if (syncStatus === 'error') return 'خطأ في المزامنة';
    return isConnected ? 'متصل' : 'غير متصل';
  };

  const getStatusIcon = () => {
    if (!isConnected) return 'cloud-offline-outline';
    if (syncStatus === 'syncing') return 'sync-outline';
    if (syncStatus === 'completed') return 'checkmark-circle-outline';
    if (syncStatus === 'error') return 'alert-circle-outline';
    return 'cloud-done-outline';
  };

  const formatLastSyncTime = () => {
    if (!lastSyncTime) return '';
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.statusContainer}>
        <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
        <View style={styles.statusTextContainer}>
          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>
          {lastSyncTime && syncStatus === 'idle' && (
            <Text style={styles.lastSyncText}>
              آخر مزامنة: {formatLastSyncTime()}
            </Text>
          )}
        </View>
        {syncStatus === 'syncing' ? (
          <ActivityIndicator size="small" color={getStatusColor()} />
        ) : (
          <Ionicons name={getStatusIcon()} size={20} color={getStatusColor()} />
        )}
      </View>

      {showSyncButton && isConnected && authManager.isAuthenticated() && (
        <TouchableOpacity
          style={[
            styles.syncButton,
            syncStatus === 'syncing' && styles.syncButtonDisabled
          ]}
          onPress={handleManualSync}
          disabled={syncStatus === 'syncing'}
        >
          {syncStatus === 'syncing' ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="sync-outline" size={16} color="#fff" />
          )}
          <Text style={styles.syncButtonText}>
            {syncStatus === 'syncing' ? 'جاري المزامنة...' : 'مزامنة'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lastSyncText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  syncButtonDisabled: {
    backgroundColor: '#a5b4fc',
  },
  syncButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});