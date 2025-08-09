// components/SyncButton.tsx
import React, { useState, useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { syncManager } from '@/lib/syncManager';
import { getUnsyncedCount } from '@/lib/syncQueueDb';
import NetInfo from '@react-native-community/netinfo';

interface SyncButtonProps {
  onSyncComplete?: (success: boolean, message: string) => void;
  style?: any;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
  entityType?: 'offices' | 'levels' | 'students' | 'attendance';
}

export default function SyncButton({ 
  onSyncComplete, 
  style, 
  size = 'medium', 
  showLabel = true,
  entityType 
}: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const updateUnsyncedCount = async () => {
      try {
        const count = await getUnsyncedCount(entityType);
        setUnsyncedCount(count);
      } catch (error) {
        console.error('❌ خطأ في جلب عدد التغييرات غير المتزامنة:', error);
      }
    };

    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
    });

    updateUnsyncedCount();
    const interval = setInterval(updateUnsyncedCount, 5000); // تحديث كل 5 ثوان

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [entityType]);

  const handleSync = async () => {
    if (!isConnected) {
      onSyncComplete?.(false, 'لا يوجد اتصال بالإنترنت');
      return;
    }

    setSyncing(true);
    try {
      const result = entityType 
        ? await syncManager.syncEntity(entityType)
        : await syncManager.syncAll();
      
      onSyncComplete?.(result.success, result.message);
      
      // تحديث العداد بعد المزامنة
      const newCount = await getUnsyncedCount(entityType);
      setUnsyncedCount(newCount);
    } catch (error: any) {
      onSyncComplete?.(false, `خطأ في المزامنة: ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const getIconSize = () => {
    switch (size) {
      case 'small': return 16;
      case 'large': return 28;
      default: return 20;
    }
  };

  const getButtonStyle = () => {
    const baseStyle = [styles.syncButton];
    if (!isConnected) baseStyle.push(styles.syncButtonDisabled);
    if (size === 'small') baseStyle.push(styles.syncButtonSmall);
    if (size === 'large') baseStyle.push(styles.syncButtonLarge);
    return baseStyle;
  };

  return (
    <TouchableOpacity
      style={[...getButtonStyle(), style]}
      onPress={handleSync}
      disabled={syncing || !isConnected}
    >
      {syncing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <View style={styles.syncContent}>
          <Ionicons 
            name="sync-outline" 
            size={getIconSize()} 
            color={isConnected ? "#fff" : "#9ca3af"} 
          />
          {unsyncedCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unsyncedCount}</Text>
            </View>
          )}
        </View>
      )}
      {showLabel && (
        <Text style={[styles.syncText, !isConnected && styles.syncTextDisabled]}>
          مزامنة
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  syncButton: {
    backgroundColor: '#374151',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
    position: 'relative',
  },
  syncButtonSmall: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  syncButtonLarge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  syncButtonDisabled: {
    backgroundColor: '#6b7280',
    opacity: 0.6,
  },
  syncContent: {
    position: 'relative',
  },
  syncText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  syncTextDisabled: {
    color: '#9ca3af',
  },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
});