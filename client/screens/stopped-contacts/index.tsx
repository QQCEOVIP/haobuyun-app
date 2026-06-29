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
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

interface StoppedContact {
  id: string;
  name: string;
  phone: string;
  label: string;
}

const STATUS_LABELS: Record<string, string> = {
  stopped: '确认失效',
  suspected_stopped: '可能失效',
};

const STATUS_COLORS: Record<string, string> = {
  stopped: '#EF4444',
  suspected_stopped: '#F97316',
};

export default function StoppedContactsScreen() {
  const router = useSafeRouter();
  const { status } = useSafeSearchParams<{ status: string }>();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<StoppedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Safely resolve status - default to 'stopped' if invalid
  const validStatus = (status === 'stopped' || status === 'suspected_stopped') ? status : 'stopped';
  const label = STATUS_LABELS[validStatus] || '失效';
  const color = STATUS_COLORS[validStatus] || '#6B7280';

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const { status: permStatus } = await Contacts.requestPermissionsAsync();
      if (permStatus !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限');
        setLoading(false);
        return;
      }

      const fields: Contacts.Field[] = [
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Name,
      ].filter((f): f is Contacts.Field => f != null && f !== undefined);

      let allContacts: Contacts.Contact[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        try {
          const { data } = await Contacts.getContactsAsync({
            fields,
            pageSize,
            pageOffset: offset,
          });
          if (!data || data.length === 0) break;
          allContacts = allContacts.concat(data);
          offset += data.length;
          if (data.length < pageSize) break;
        } catch (pageError) {
          console.error('Failed to fetch contacts page:', pageError);
          break;
        }
      }

      const result: StoppedContact[] = [];
      for (const contact of allContacts) {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) continue;
        const phone = contact.phoneNumbers[0].number || '';
        if (!phone) continue;

        try {
          const storedLabel = await AsyncStorage.getItem(`@contact_status_${phone}`);
          if (storedLabel === validStatus) {
            result.push({
              id: contact.id || phone,
              name: contact.name || '未知联系人',
              phone,
              label: storedLabel,
            });
          }
        } catch (storageError) {
          console.warn('AsyncStorage read failed for', phone, storageError);
        }
      }

      setContacts(result);
    } catch (error) {
      console.error('Failed to load stopped contacts:', error);
    } finally {
      setLoading(false);
    }
  }, [validStatus]);

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [loadContacts])
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
    if (selectedIds.size === contacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      Alert.alert('提示', '请先选择要删除的号码');
      return;
    }

    Alert.alert(
      '确认删除',
      `将从设备通讯录中删除 ${selectedIds.size} 个${label}号码？此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const toDelete = contacts.filter(c => selectedIds.has(c.id));
              let successCount = 0;
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (user?.id) headers['x-user-id'] = user.id;

              // Batch soft delete via backend API - send phone numbers (not device IDs)
              if (user?.id && toDelete.length > 0) {
                const phones = toDelete.map(c => c.phone).filter(Boolean);
                if (phones.length > 0) {
                  await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/batch-delete`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ phones }),
                  }).catch(() => { /* Silently fail if backend is unavailable */ });
                }
              }

              for (const contact of toDelete) {
                try {
                  // Only attempt device contact removal if we have a valid device contact ID
                  if (contact.id && !contact.id.startsWith('@')) {
                    await Contacts.removeContactAsync(contact.id).catch(() => {
                      // Contact might not exist in device, skip silently
                    });
                  }
                  await AsyncStorage.removeItem(`@contact_status_${contact.phone}`);
                  successCount++;
                } catch (itemError) {
                  console.warn('Failed to delete contact:', contact.name, itemError);
                }
              }
              Alert.alert('完成', `已删除 ${successCount} 个${label}号码`);
              setSelectedIds(new Set());
              loadContacts();
            } catch (error) {
              console.error('Failed to delete:', error);
              Alert.alert('错误', '删除失败，请重试');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: StoppedContact }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.card, isSelected && { backgroundColor: '#FEF2F2' }]}
        onPress={() => toggleSelect(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, isSelected && { backgroundColor: color, borderColor: color }]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.cardPhone}>{item.phone}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
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
        <Text style={styles.headerTitle}>{label}号码</Text>
        <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
          <Text style={styles.selectAllText}>
            {selectedIds.size === contacts.length && contacts.length > 0 ? '取消全选' : '全选'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.summaryBar, { backgroundColor: `${color}10` }]}>
        <View style={[styles.summaryDot, { backgroundColor: color }]} />
        <Text style={styles.summaryText}>
          共 {contacts.length} 个{label}号码
          {selectedIds.size > 0 ? `，已选 ${selectedIds.size} 个` : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={color} />
          <Text style={styles.centerText}>正在扫描通讯录...</Text>
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.centerState}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
          <Text style={[styles.centerText, { color: '#10B981' }]}>没有{label}号码</Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        />
      )}

      {selectedIds.size > 0 && (
        <View style={styles.bottomBar}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: color }]} onPress={handleDeleteSelected}>
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>删除已选 ({selectedIds.size})</Text>
          </TouchableOpacity>
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
  selectAllText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, margin: 16, borderRadius: 12 },
  summaryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  summaryText: { fontSize: 13, color: '#6B7280' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  cardPhone: { fontSize: 13, color: '#6B7280' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: 32 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 8 },
});
