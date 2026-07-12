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
import { useAuth } from '@/contexts/AuthContext';
import * as Contacts from 'expo-contacts';
import { getBackendBaseUrl } from '@/utils';
import * as AsyncStorage from "@react-native-async-storage/async-storage";

interface TrashContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  deleted_at: string;
}

function normalizePhoneForCompare(phone: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  if (digits.length === 14 && digits.startsWith("860")) return digits.slice(3);
  return digits;
}

function normalizePhoneForDevice(phone: string): string {
  if (!phone) return "";
  const hasPlus = phone.trim().startsWith("+");
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("86")) return digits.slice(2);
  if (digits.length === 14 && digits.startsWith("860")) return digits.slice(3);
  if (hasPlus && digits.length > 0) return `+${digits}`;
  return digits;
}

export default function RecycleBinScreen() {
  const router = useSafeRouter();
  const { user } = useAuth();
  const [trashContacts, setTrashContacts] = useState<TrashContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) {
        headers['x-user-id'] = user.id;
      }
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/contacts/trash`, { headers });
      if (!response.ok) throw new Error('Failed to load trash');
      const result = await response.json();
      // Backend returns { success, data, total }
      setTrashContacts(Array.isArray(result) ? result : (result.data || []));
    } catch (error) {
      console.error('Failed to load trash:', error);
      Alert.alert('错误', '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      loadTrash();
    }, [loadTrash])
  );

  const toggleSelect = (id: string) => {
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

  const invalidateHomeStats = async () => {
    try {
      await AsyncStorage.multiRemove(["home_stats_cache", "home_stats_timestamp", "contacts_status_distribution", "contacts_total_count"]);
      console.log("[RecycleBin] Home stats cache invalidated");
    } catch (e) {
      console.warn("[RecycleBin] Failed to invalidate home stats cache:", e);
    }
  };

  const handleRestore = async () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要恢复的号码');
      return;
    }

    console.log('[RecycleBin] Starting restore, selectedIds:', Array.from(selectedIds));
    setActionLoading(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) headers['x-user-id'] = user.id;
      /**
       * 服务端文件：server/src/routes/contacts.ts
       * 接口：POST /api/v1/contacts/trash/restore-batch
       * Body 参数：ids: string[]
       */
      console.log('[RecycleBin] Calling restore-batch API with ids:', Array.from(selectedIds));
      const response = await fetch(
        `${getBackendBaseUrl()}/api/v1/contacts/trash/restore-batch`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ids: Array.from(selectedIds) }),
        }
      );
      
      console.log('[RecycleBin] API response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[RecycleBin] API error:', errorText);
        throw new Error('Failed to restore');
      }
      const result = await response.json();
      console.log('[RecycleBin] API result:', result);

      // Request contacts permission and add contacts to device
      const selectedContacts = trashContacts.filter(c => selectedIds.has(c.id));
      console.log('[RecycleBin] Selected contacts to add to device:', selectedContacts.length);
      console.log('[RecycleBin] Contact details:', selectedContacts.map(c => ({ name: c.name, phone: c.phone })));
      
      let addedToDevice = 0;
      let skippedExisting = 0;
      let failedToAdd = 0;
      
      if (selectedContacts.length > 0) {
        try {
          const { status } = await Contacts.requestPermissionsAsync();
          console.log('[RecycleBin] Contacts permission status:', status);
          
          if (status === 'granted') {
            // 获取本地通讯录所有联系人，用于去重检查
            const localContacts = await Contacts.getContactsAsync({
              fields: [Contacts.Fields.PhoneNumbers],
            });
            const localPhones = new Set<string>();
            for (const lc of localContacts.data) {
              for (const p of (lc.phoneNumbers || [])) {
                const normalized = normalizePhoneForCompare(p.number || "");
                if (normalized.length >= 7) localPhones.add(normalized);
              }
            }

            for (const contact of selectedContacts) {
              try {
                // 检查本地是否已存在该号码
                const normalizedPhone = normalizePhoneForCompare(contact.phone || "");
                if (normalizedPhone && localPhones.has(normalizedPhone)) {
                  console.log('[RecycleBin] Contact already exists locally, skipping device add:', contact.name, contact.phone);
                  skippedExisting++;
                  continue;
                }

                console.log('[RecycleBin] Adding contact to device:', contact.name, contact.phone);
                const devicePhone = normalizePhoneForDevice(contact.phone || "");
                const contactPayload: any = {
                  [Contacts.Fields.FirstName]: contact.name || "",
                };
                if (devicePhone) {
                  contactPayload[Contacts.Fields.PhoneNumbers] = [{
                    number: devicePhone,
                    label: 'main',
                  }];
                }
                const addResult = await Contacts.addContactAsync(contactPayload);
                if (normalizedPhone) { localPhones.add(normalizedPhone); }
                console.log('[RecycleBin] Contact added successfully, id:', addResult);
                addedToDevice++;
              } catch (e: any) {
                console.warn('[RecycleBin] Failed to add contact to device:', contact.name, e?.message || e);
                failedToAdd++;
              }
            }
          } else {
            // Permission denied - show clear error but still complete the cloud restore
            console.warn('[RecycleBin] Contacts permission denied');
            Alert.alert(
              '权限不足',
              '无法添加到设备通讯录，但已在云端恢复。请授予通讯录权限后重试。',
              [{ text: '确定' }]
            );
          }
        } catch (e: any) {
          console.warn('[RecycleBin] Failed to add contacts to device:', e?.message || e);
          failedToAdd = selectedContacts.length;
        }
      }

      console.log('[RecycleBin] Restore complete. Added:', addedToDevice, 'Failed:', failedToAdd);
      await invalidateHomeStats();
      
      // Show result message
      let message = result.message || `已恢复 ${selectedIds.size} 个号码`;
      if (addedToDevice > 0) message += `\n已添加 ${addedToDevice} 个到设备通讯录`;
      if (skippedExisting > 0) message += `\n${skippedExisting} 个号码已存在于设备中`;
      if (failedToAdd > 0) message += `\n${failedToAdd} 个添加到设备失败（云端已恢复）`;
      
      Alert.alert('完成', message);
      setSelectedIds(new Set());
      loadTrash();
    } catch (error) {
      console.error('[RecycleBin] Failed to restore:', error);
      Alert.alert('错误', `恢复失败：${error instanceof Error ? error.message : String(error)}`);
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
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (user?.id) headers['x-user-id'] = user.id;
              for (const id of selectedIds) {
                await fetch(
                  `${getBackendBaseUrl()}/api/v1/contacts/${id}/permanent`,
                  { method: 'DELETE', headers }
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
          <Text style={styles.cardPhone}>{item.phone}</Text>
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
