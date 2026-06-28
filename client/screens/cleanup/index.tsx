import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: string;
  invalid_reason?: string;
}

export default function CleanupScreen() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const userId = (user as any)?.id;

  const loadInvalidContacts = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, name, phone, status, invalid_reason')
        .eq('user_id', userId)
        .or('status.eq.maybe_invalid,status.eq.invalid');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInvalidContacts();
    }, [userId])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadInvalidContacts();
    setRefreshing(false);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const handleDelete = () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要删除的联系人');
      return;
    }

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedIds.size} 位联系人吗？删除前建议先备份通讯录。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete: set is_deleted = true so contacts appear in recycle bin
              const { error } = await supabase
                .from('contacts')
                .update({ is_deleted: true, deleted_at: new Date().toISOString() })
                .in('id', Array.from(selectedIds));

              if (error) throw error;

              // Also record to backend trash API for recycle bin
              if (user?.id) {
                try {
                  await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/trash`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-user-id': user.id },
                    body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
                  });
                } catch { /* ignore */ }
              }

              setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
              setSelectedIds(new Set());
              Alert.alert('删除成功', `已删除 ${selectedIds.size} 位联系人，可在回收站恢复`);
            } catch (error) {
              Alert.alert('删除失败', '请重试');
            }
          },
        },
      ]
    );
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'maybe_invalid':
        return { bg: '#FFF8E6', text: '#E6A23C', label: '可能失效' };
      case 'invalid':
        return { bg: '#FEF0F0', text: '#F56C6C', label: '确定失效' };
      default:
        return { bg: '#F5F7FA', text: '#909399', label: '未知' };
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const statusStyle = getStatusStyle(item.status);
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.contactCard, isSelected && styles.contactSelected]}
        onPress={() => toggleSelect(item.id)}
      >
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          {item.invalid_reason && (
            <Text style={styles.reasonText}>{item.invalid_reason}</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusStyle.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>清理失效号码</Text>
          <Text style={styles.subtitle}>
            {contacts.length} 位可能失效的联系人
          </Text>
        </View>
        <TouchableOpacity onPress={selectAll}>
          <Text style={styles.selectAllText}>
            {selectedIds.size === contacts.length ? '取消全选' : '全选'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 警告提示 */}
      <View style={styles.warningCard}>
        <View style={styles.warningIcon}>
          <Ionicons name="warning" size={20} color="#E6A23C" />
        </View>
        <Text style={styles.warningText}>
          删除联系人前请确认对方确实已失效。删除后如需恢复，可从备份中导入。
        </Text>
      </View>

      {/* 列表 */}
      <FlatList
        data={contacts}
        renderItem={renderContact}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#67C23A" />
            </View>
            <Text style={styles.emptyTitle}>太棒了！</Text>
            <Text style={styles.emptyText}>
              您的通讯录中没有发现失效号码
            </Text>
          </View>
        }
      />

      {/* 底部操作栏 */}
      {contacts.length > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedText}>
              已选择 {selectedIds.size} 位
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.deleteButton, selectedIds.size === 0 && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            disabled={selectedIds.size === 0}
          >
            <Text style={styles.deleteButtonText}>删除所选</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#303133',
  },
  subtitle: {
    fontSize: 14,
    color: '#909399',
    marginTop: 4,
  },
  selectAllText: {
    fontSize: 14,
    color: '#4A90D9',
    fontWeight: '600',
  },
  warningCard: {
    backgroundColor: '#FFF8E6',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    marginRight: 8,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#E6A23C',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  contactSelected: {
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#4A90D9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D9E6',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#909399',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
  },
  contactPhone: {
    fontSize: 13,
    color: '#909399',
    marginTop: 2,
  },
  reasonText: {
    fontSize: 12,
    color: '#F56C6C',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#909399',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#E6E8EB',
  },
  selectedInfo: {
    flex: 1,
  },
  selectedText: {
    fontSize: 14,
    color: '#909399',
  },
  deleteButton: {
    backgroundColor: '#F56C6C',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  deleteButtonDisabled: {
    backgroundColor: '#D1D9E6',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
