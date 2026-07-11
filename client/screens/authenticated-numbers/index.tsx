import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getBackendBaseUrl } from '@/utils';

interface AuthenticatedNumber {
  phone: string;
  user_name: string;
  encrypted_name: string;
  authenticated_at: string;
  expires_at: string;
  stopped_vote_count: number;
}

// Normalize phone to digits without country code
const normalizePhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/\D/g, '');
  return (digits.length === 13 && digits.startsWith('86')) ? digits.slice(2) : digits;
};

// Format date for display
const formatDate = (dateStr: string): string => {
  try {
    // Handle ISO format and various date string formats
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '未知';
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  } catch {
    return '未知';
  }
};

export default function AuthenticatedNumbersScreen() {
  const router = useSafeRouter();
  const { user } = useAuth();
  const [authentications, setAuthentications] = useState<AuthenticatedNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchAuthentications = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (user?.id) headers['x-user-id'] = user.id;

      const response = await fetch(
        `${getBackendBaseUrl()}/api/v1/authenticate/my-authentications`,
        { headers }
      );

      if (response.ok) {
        const json = await response.json();
        setAuthentications(json.authentications || []);
      }
    } catch (error) {
      console.error('Failed to fetch authentications:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchAuthentications();
    }, [fetchAuthentications])
  );

  /**
   * 撤销认证：删除认证记录，恢复号码为可能失效
   * 服务端文件：server/src/routes/authenticate.ts
   * 接口：DELETE /api/v1/authenticate/my-authentications/:phone
   */
  const handleRevoke = useCallback((item: AuthenticatedNumber) => {
    Alert.alert(
      '撤销认证',
      `撤销 ${item.phone} 的认证后，该号码将恢复为「可能失效」状态。确认撤销？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认撤销',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(item.phone);
            try {
              const headers: Record<string, string> = {};
              if (user?.id) headers['x-user-id'] = user.id;

              const response = await fetch(
                `${getBackendBaseUrl()}/api/v1/authenticate/my-authentications/${item.phone}`,
                { method: 'DELETE', headers }
              );

              if (response.ok) {
                // Remove local status to let community status take over (possibly_invalid)
                const normalized = normalizePhone(item.phone);
                await AsyncStorage.removeItem(`@contact_status_${item.phone}`);
                await AsyncStorage.removeItem(`@contact_status_${normalized}`);

                // Remove from list
                setAuthentications(prev => prev.filter(a => a.phone !== item.phone));
                Alert.alert('已撤销', `${item.phone} 已恢复为可能失效`);
              } else {
                const json = await response.json().catch(() => ({}));
                Alert.alert('错误', json.error || '撤销失败');
              }
            } catch (error) {
              console.error('Failed to revoke:', error);
              Alert.alert('错误', '撤销失败，请重试');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [user]);

  const renderItem = ({ item }: { item: AuthenticatedNumber }) => {
    const isLoading = actionLoading === item.phone;

    return (
      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.nameRow}>
            <Text style={styles.phone}>{item.phone}</Text>
            <View style={styles.authBadge}>
              <Ionicons name="checkmark-circle" size={12} color="#10B981" />
              <Text style={styles.authBadgeText}>已认证: {item.encrypted_name}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="calendar-outline" size={12} color="#9CA3AF" />
            <Text style={styles.infoText}>认证时间: {formatDate(item.authenticated_at)}</Text>
            <Text style={styles.infoText}> | 投票: {item.stopped_vote_count}人停用</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={12} color="#9CA3AF" />
            <Text style={styles.infoText}>有效期至: {formatDate(item.expires_at)}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.revokeBtn}
          onPress={() => handleRevoke(item)}
          disabled={isLoading}
          activeOpacity={0.7}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#EF4444" />
          ) : (
            <>
              <Ionicons name="refresh-outline" size={14} color="#EF4444" />
              <Text style={styles.revokeBtnText}>恢复</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>已认证号码</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.summaryBar}>
        <View style={[styles.summaryDot, { backgroundColor: '#10B981' }]} />
        <Text style={styles.summaryText}>
          共 {authentications.length} 个已认证号码
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.centerText}>正在加载...</Text>
        </View>
      ) : authentications.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="shield-checkmark-outline" size={48} color="#9CA3AF" />
          <Text style={[styles.centerText, { color: '#6B7280' }]}>暂无已认证号码</Text>
          <Text style={styles.centerSubText}>在可能失效列表中点击「换机主」可认证号码</Text>
        </View>
      ) : (
        <FlatList
          data={authentications}
          renderItem={renderItem}
          keyExtractor={item => item.phone}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 12, backgroundColor: '#ECFDF5' },
  summaryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  summaryText: { fontSize: 13, color: '#6B7280' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  centerSubText: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardContent: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 8 },
  phone: { fontSize: 15, fontWeight: '600', color: '#111827' },
  authBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  authBadgeText: { fontSize: 11, color: '#10B981', fontWeight: '500' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  infoText: { fontSize: 12, color: '#9CA3AF' },
  revokeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', gap: 4, marginLeft: 8 },
  revokeBtnText: { fontSize: 12, fontWeight: '600', color: '#EF4444' },
});
