import React, { useState, useCallback } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

const EXPO_PUBLIC_BACKEND_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL;

interface DeletedContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  deleted_at: string;
}

export default function RecycleBinScreen() {
  const { session } = useAuth();
  const [deletedContacts, setDeletedContacts] = useState<DeletedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchDeletedContacts = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      setLoading(true);
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/trash`, {
        headers: { 'x-session': session.access_token },
      });
      const data = await response.json();
      if (response.ok) {
        setDeletedContacts(data);
      }
    } catch (error) {
      console.error('Failed to fetch deleted contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchDeletedContacts();
    }, [fetchDeletedContacts])
  );

  const handleRestore = async (id: string) => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/${id}/restore`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session.access_token,
        },
      });
      if (response.ok) {
        setDeletedContacts(prev => prev.filter(c => c.id !== id));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        Alert.alert('成功', '联系人已恢复');
      } else {
        Alert.alert('恢复失败', '请稍后重试');
      }
    } catch (error) {
      Alert.alert('错误', '恢复失败，请重试');
    }
  };

  const handleBatchRestore = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要恢复的联系人');
      return;
    }
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/trash/restore-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session.access_token,
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await response.json();
      if (response.ok) {
        Alert.alert('成功', data.message || `已恢复 ${selectedIds.size} 个联系人`);
        setSelectedIds(new Set());
        fetchDeletedContacts();
      } else {
        Alert.alert('恢复失败', data.error || '请稍后重试');
      }
    } catch (error) {
      Alert.alert('错误', '恢复失败，请重试');
    }
  };

  const handlePermanentDelete = (id: string) => {
    Alert.alert('永久删除', '确定要永久删除此联系人吗？此操作不可撤销。', [
      { text: '取消', style: 'cancel' },
      {
        text: '永久删除',
        style: 'destructive',
        onPress: async () => {
          if (!session?.access_token) return;
          try {
            const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/${id}/permanent`, {
              method: 'DELETE',
              headers: { 'x-session': session.access_token },
            });
            if (response.ok) {
              setDeletedContacts(prev => prev.filter(c => c.id !== id));
              setSelectedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
              Alert.alert('成功', '已永久删除');
            }
          } catch (error) {
            Alert.alert('错误', '删除失败，请重试');
          }
        },
      },
    ]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getDaysRemaining = (deletedAt: string): number => {
    const deletedDate = new Date(deletedAt);
    const expiryDate = new Date(deletedDate.getTime() + 60 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const diff = expiryDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  };

  const renderContact = ({ item }: { item: DeletedContact }) => {
    const daysRemaining = getDaysRemaining(item.deleted_at);
    const isSelected = selectedIds.has(item.id);

    return (
      <View style={[styles.contactCard, isSelected && styles.contactCardSelected]}>
        <TouchableOpacity style={styles.checkbox} onPress={() => toggleSelect(item.id)}>
          <View style={[styles.checkboxBox, isSelected && styles.checkboxBoxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          <Text style={styles.deleteTime}>
            删除于 {new Date(item.deleted_at).toLocaleDateString()} · 剩余 {daysRemaining} 天
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.restoreBtn} onPress={() => handleRestore(item.id)}>
            <Ionicons name="refresh" size={16} color="#4A90D9" />
            <Text style={styles.restoreText}>恢复</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handlePermanentDelete(item.id)}>
            <Ionicons name="trash" size={16} color="#F56C6C" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#303133" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>回收站</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.infoBar}>
        <Ionicons name="information-circle" size={16} color="#909399" />
        <Text style={styles.infoText}>已删除的联系人将保留 60 天，之后自动永久删除</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      ) : deletedContacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="trash-outline" size={48} color="#C0C4CC" />
          <Text style={styles.emptyText}>回收站为空</Text>
        </View>
      ) : (
        <FlatList
          data={deletedContacts}
          keyExtractor={item => item.id}
          renderItem={renderContact}
          contentContainerStyle={styles.list}
        />
      )}

      {selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <Text style={styles.selectedCount}>已选择 {selectedIds.size} 项</Text>
          <TouchableOpacity style={styles.batchRestoreBtn} onPress={handleBatchRestore}>
            <Text style={styles.batchRestoreText}>批量恢复</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#303133' },
  infoBar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 12, padding: 10,
    backgroundColor: '#F0F5FF', borderRadius: 8,
  },
  infoText: { fontSize: 12, color: '#909399', flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#C0C4CC', marginTop: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 100 },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#D1D9E6', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  contactCardSelected: { borderWidth: 1.5, borderColor: '#4A90D9' },
  checkbox: { marginRight: 12 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 1.5,
    borderColor: '#DCDFE6', justifyContent: 'center', alignItems: 'center',
  },
  checkboxBoxSelected: { backgroundColor: '#4A90D9', borderColor: '#4A90D9' },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '600', color: '#303133' },
  contactPhone: { fontSize: 13, color: '#606266', marginTop: 2 },
  deleteTime: { fontSize: 11, color: '#909399', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoreBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: 'rgba(74, 144, 217, 0.1)', borderRadius: 6,
  },
  restoreText: { fontSize: 12, color: '#4A90D9', fontWeight: '600' },
  deleteBtn: {
    padding: 6, backgroundColor: 'rgba(245, 108, 108, 0.1)', borderRadius: 6,
  },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  selectedCount: { fontSize: 14, color: '#606266' },
  batchRestoreBtn: {
    backgroundColor: '#4A90D9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8,
  },
  batchRestoreText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
