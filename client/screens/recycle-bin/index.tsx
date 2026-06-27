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

interface TrashContact {
  id: number;
  name: string;
  phone_numbers: string;
  deleted_at: string;
}

export default function RecycleBinScreen() {
  const router = useSafeRouter();
  const [trashContacts, setTrashContacts] = useState<TrashContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/trash`);
      if (!response.ok) throw new Error('Failed to load trash');
      const data = await response.json();
      setTrashContacts(data);
    } catch (error) {
      console.error('Failed to load trash:', error);
      Alert.alert('错误', '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTrash();
    }, [loadTrash])
  );

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === trashContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trashContacts.map(c => c.id)));
    }
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要恢复的号码');
      return;
    }

    setActionLoading(true);
    try {
      // 批量恢复：逐个调用恢复接口
      for (const id of selectedIds) {
        const response = await fetch(
          `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/${id}/restore`,
          { method: 'POST' }
        );
        if (!response.ok) throw new Error(`Failed to restore ${id}`);
      }
      Alert.alert('完成', `已恢复 ${selectedIds.size} 个号码`);
      setSelectedIds(new Set());
      loadTrash();
    } catch (error) {
      console.error('Failed to restore:', error);
      Alert.alert('错误', '恢复失败，请重试');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePermanentDelete = () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要永久删除的号码');
      return;
    }

    Alert.alert(
      '永久删除',
      `将永久删除 ${selectedIds.size} 个号码？此操作不可撤销！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认永久删除',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              for (const id of selectedIds) {
                await fetch(
                  `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/${id}/permanent`,
                  { method: 'DELETE' }
                );
              }
              Alert.alert('完成', `已永久删除 ${selectedIds.size} 个号码`);
              setSelectedIds(new Set());
              loadTrash();
            } catch (error) {
              console.error('Failed to delete:', error);
              Alert.alert('错误', '删除失败');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  const renderItem = ({ item }: { item: TrashContact }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, isSelected && { backgroundColor: '#EFF6FF' }]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name || '未知'}</Text>
          <Text style={styles.cardPhone}>{item.phone_numbers}</Text>
          <Text style={styles.cardDate}>删除于 {formatDate(item.deleted_at)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>回收站</Text>
        <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
          <Text style={styles.selectAllText}>
            {selectedIds.size === trashContacts.length && trashContacts.length > 0 ? '取消全选' : '全选'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryBar}>
        <Ionicons name="information-circle" size={16} color="#6B7280" />
        <Text style={styles.summaryText}>
          共 {trashContacts.length} 个已删除号码
          {selectedIds.size > 0 ? `，已选 ${selectedIds.size} 个` : ''}
          {' · 60天后自动清理'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.centerText}>正在加载回收站...</Text>
        </View>
      ) : trashContacts.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="trash-outline" size={48} color="#D1D5DB" />
          <Text style={styles.centerText}>回收站为空</Text>
          <Text style={styles.centerSubText}>删除的号码会在这里保留60天</Text>
        </View>
      ) : (
        <FlatList
          data={trashContacts}
          renderItem={renderItem}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        />
      )}

      {selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#3B82F6', flex: 1, marginRight: 8 }]}
              onPress={handleRestore}
              disabled={actionLoading}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>恢复 ({selectedIds.size})</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#EF4444', flex: 1, marginLeft: 8 }]}
              onPress={handlePermanentDelete}
              disabled={actionLoading}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>永久删除</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  selectAllBtn: { padding: 4 },
  selectAllText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, margin: 16, backgroundColor: '#F3F4F6', borderRadius: 12 },
  summaryText: { fontSize: 13, color: '#6B7280', marginLeft: 6, flex: 1 },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  centerSubText: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  cardPhone: { fontSize: 13, color: '#6B7280', marginBottom: 2 },
  cardDate: { fontSize: 11, color: '#9CA3AF' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: 32 },
  bottomActions: { flexDirection: 'row' },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', marginLeft: 6 },
});
