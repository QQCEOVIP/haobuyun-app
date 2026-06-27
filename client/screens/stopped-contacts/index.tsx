import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

interface ContactItem {
  id: number;
  phone: string;
  name: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  stopped: { label: '确认失效', color: '#F56C6C', bg: '#FEF0F0' },
  suspected_stopped: { label: '可能失效', color: '#E6A23C', bg: '#FFF8E6' },
};

export default function StoppedContactsScreen() {
  const { session } = useAuth();
  const { status } = useLocalSearchParams<{ status: string }>();
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [processing, setProcessing] = useState(false);

  const config = STATUS_CONFIG[status || 'stopped'] || STATUS_CONFIG.stopped;

  const fetchContacts = useCallback(async () => {
    if (!session?.access_token || !status) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts?status=${status}`,
        { headers: { 'x-session': session.access_token } }
      );
      const data = await response.json();
      if (data.success) {
        setContacts(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, status]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要删除的号码');
      return;
    }
    Alert.alert(
      '确认删除',
      `确定要从通讯录中删除选中的 ${selectedIds.size} 个号码吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            if (!session?.access_token) return;
            setProcessing(true);
            try {
              await fetch(
                `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/batch`,
                {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-session': session.access_token,
                  },
                  body: JSON.stringify({ ids: Array.from(selectedIds) }),
                }
              );
              Alert.alert('成功', '已删除选中号码');
              setSelectedIds(new Set());
              fetchContacts();
            } catch (error) {
              Alert.alert('错误', '删除失败，请重试');
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkNormal = async (id: number) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-session': session.access_token,
          },
          body: JSON.stringify({ status: 'normal' }),
        }
      );
      const data = await response.json();
      if (data.success) {
        setContacts(prev => prev.filter(c => c.id !== id));
      }
    } catch (error) {
      Alert.alert('错误', '操作失败，请重试');
    }
  };

  const renderItem = ({ item }: { item: ContactItem }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => toggleSelect(item.id)}
        >
          <View style={[styles.checkboxInner, isSelected && styles.checkboxChecked]}>
            {isSelected && <Text style={styles.checkmark}>✓</Text>}
          </View>
        </TouchableOpacity>
        <View style={styles.cardContent}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
        </View>
        <TouchableOpacity
          style={styles.markNormalBtn}
          onPress={() => handleMarkNormal(item.id)}
        >
          <Text style={styles.markNormalText}>标记正常</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={config.color} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{config.label}号码</Text>
        <Text style={styles.headerCount}>共 {contacts.length} 个</Text>
      </View>

      {contacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>暂无{config.label}的号码</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={contacts}
            keyExtractor={item => item.id.toString()}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
              <Text style={styles.selectAllText}>
                {selectedIds.size === contacts.length ? '取消全选' : '全选'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.batchDeleteBtn,
                { backgroundColor: config.color, opacity: processing ? 0.6 : 1 },
              ]}
              onPress={handleBatchDelete}
              disabled={processing}
            >
              <Text style={styles.batchDeleteText}>
                {processing ? '处理中...' : `批量删除 (${selectedIds.size})`}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#303133' },
  headerCount: { fontSize: 14, color: '#909399' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#909399' },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSelected: { borderWidth: 2, borderColor: '#4A90D9' },
  checkbox: { marginRight: 12 },
  checkboxInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DCDFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  checkmark: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  cardContent: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '600', color: '#303133' },
  contactPhone: { fontSize: 13, color: '#909399', marginTop: 2 },
  markNormalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E7F7E7',
  },
  markNormalText: { fontSize: 12, fontWeight: '600', color: '#67C23A' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  selectAllBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCDFE6',
    marginRight: 12,
  },
  selectAllText: { fontSize: 14, color: '#606266' },
  batchDeleteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  batchDeleteText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
