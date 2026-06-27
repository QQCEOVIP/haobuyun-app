import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DuplicateGroup {
  phone: string;
  entries: { id: string; name: string; phone: string }[];
  recommendedIndex: number;
}

const DISMISS_KEY_PREFIX = '@duplicate_dismissed_';

export default function DuplicatesScreen() {
  const router = useSafeRouter();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());

  const loadDuplicates = useCallback(async () => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限');
        setLoading(false);
        return;
      }

      let allContacts: Contacts.Contact[] = [];
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize,
          pageOffset: offset,
        });
        if (!data || data.length === 0) break;
        allContacts = allContacts.concat(data);
        offset += data.length;
        if (data.length < pageSize) break;
      }

      // Normalize phone: strip non-digits
      const normalize = (phone: string) => phone.replace(/\D/g, '');

      // Group by normalized phone
      const phoneMap = new Map<string, { id: string; name: string; phone: string }[]>();
      for (const contact of allContacts) {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) continue;
        const rawPhone = contact.phoneNumbers[0].number || '';
        const normalized = normalize(rawPhone);
        if (normalized.length < 7) continue;

        // Skip if dismissed
        const dismissed = await AsyncStorage.getItem(`${DISMISS_KEY_PREFIX}${normalized}`);
        if (dismissed === 'true') continue;

        const entry = {
          id: contact.id || `${normalized}_${Math.random()}`,
          name: contact.name || '未知联系人',
          phone: rawPhone,
        };

        const existing = phoneMap.get(normalized) || [];
        existing.push(entry);
        phoneMap.set(normalized, existing);
      }

      // Filter to only groups with 2+ entries, auto-recommend best entry to keep
      const groups: DuplicateGroup[] = [];
      for (const [phone, entries] of phoneMap) {
        if (entries.length >= 2) {
          // Auto-recommend: pick the entry with the longest name (most complete info)
          let bestIdx = 0;
          let bestScore = 0;
          entries.forEach((e, i) => {
            const score = (e.name || '').length + (e.name && e.name !== '未知联系人' ? 10 : 0);
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          });
          groups.push({ phone, entries, recommendedIndex: bestIdx });
        }
      }

      // Sort by count descending
      groups.sort((a, b) => b.entries.length - a.entries.length);
      setDuplicateGroups(groups);
    } catch (error) {
      console.error('Failed to load duplicates:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDuplicates();
    }, [loadDuplicates])
  );

  const toggleSelectGroup = (phone: string) => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (next.has(phone)) {
        next.delete(phone);
      } else {
        next.add(phone);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedGroups.size === duplicateGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(duplicateGroups.map(g => g.phone)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedGroups.size === 0) {
      Alert.alert('提示', '请先选择要处理的重复组');
      return;
    }

    const totalEntries = duplicateGroups
      .filter(g => selectedGroups.has(g.phone))
      .reduce((sum, g) => sum + g.entries.length - 1, 0);

    Alert.alert(
      '批量删除',
      `将删除 ${selectedGroups.size} 组重复号码中的 ${totalEntries} 个多余条目（每组保留1个）`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: async () => {
            try {
              for (const group of duplicateGroups) {
                if (!selectedGroups.has(group.phone)) continue;
                // Mark as dismissed (keep first, remove rest from display)
                await AsyncStorage.setItem(`${DISMISS_KEY_PREFIX}${group.phone}`, 'true');
              }
              setSelectedGroups(new Set());
              loadDuplicates();
              Alert.alert('完成', `已处理 ${selectedGroups.size} 组重复号码`);
            } catch (error) {
              console.error('Batch delete failed:', error);
            }
          },
        },
      ]
    );
  };

  const handleKeepGroup = async (phone: string) => {
    await AsyncStorage.setItem(`${DISMISS_KEY_PREFIX}${phone}`, 'true');
    loadDuplicates();
  };

  const renderGroup = ({ item }: { item: DuplicateGroup }) => {
    const isSelected = selectedGroups.has(item.phone);
    return (
      <View style={[styles.groupCard, isSelected && styles.groupCardSelected]}>
        <TouchableOpacity
          style={styles.groupHeader}
          onPress={() => toggleSelectGroup(item.phone)}
        >
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
          </View>
          <View style={styles.groupInfo}>
            <Text style={styles.groupPhone}>{item.entries[0]?.phone}</Text>
            <Text style={styles.groupCount}>{item.entries.length} 个重复条目</Text>
          </View>
        </TouchableOpacity>

        {item.entries.map((entry, index) => (
          <View key={entry.id} style={[styles.entryRow, index === item.recommendedIndex && { backgroundColor: '#F0FDF4' }]}>
            <View style={styles.entryAvatar}>
              <Text style={styles.entryAvatarText}>
                {entry.name[0]?.toUpperCase() || '?'}
              </Text>
            </View>
            <View style={styles.entryInfo}>
              <Text style={styles.entryName}>{entry.name}</Text>
              <Text style={styles.entryPhone}>{entry.phone}</Text>
            </View>
            {index === item.recommendedIndex && (
              <View style={styles.keepBadge}>
                <Ionicons name="star" size={10} color="#67C23A" />
                <Text style={styles.keepBadgeText}>推荐保留</Text>
              </View>
            )}
          </View>
        ))}

        <View style={styles.groupActions}>
          <TouchableOpacity
            style={styles.keepButton}
            onPress={() => handleKeepGroup(item.phone)}
          >
            <Ionicons name="checkmark-circle" size={16} color="#67C23A" />
            <Text style={styles.keepButtonText}>标记正常</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#303133" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>疑似重复</Text>
          <View style={{ width: 24 }} />
        </View>

        {duplicateGroups.length > 0 && (
          <View style={styles.toolbar}>
            <TouchableOpacity style={styles.selectAllBtn} onPress={selectAll}>
              <Text style={styles.selectAllText}>
                {selectedGroups.size === duplicateGroups.length ? '取消全选' : '全选'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.batchDeleteBtn, selectedGroups.size === 0 && styles.batchDeleteBtnDisabled]}
              onPress={handleBatchDelete}
              disabled={selectedGroups.size === 0}
            >
              <Text style={[styles.batchDeleteText, selectedGroups.size === 0 && styles.batchDeleteTextDisabled]}>
                批量处理 ({selectedGroups.size})
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={duplicateGroups}
        renderItem={renderGroup}
        keyExtractor={item => item.phone}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-circle-outline" size={48} color="#67C23A" />
              <Text style={styles.emptyTitle}>没有发现重复号码</Text>
              <Text style={styles.emptySubtitle}>通讯录很干净</Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  selectAllText: {
    fontSize: 14,
    color: '#4A90D9',
    fontWeight: '600',
  },
  batchDeleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#F56C6C',
    borderRadius: 10,
  },
  batchDeleteBtnDisabled: {
    backgroundColor: '#E6E8EB',
  },
  batchDeleteText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  batchDeleteTextDisabled: {
    color: '#909399',
  },
  listContent: {
    padding: 16,
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  groupCardSelected: {
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D9E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  groupInfo: {
    flex: 1,
  },
  groupPhone: {
    fontSize: 16,
    fontWeight: '700',
    color: '#303133',
  },
  groupCount: {
    fontSize: 13,
    color: '#E6A23C',
    fontWeight: '600',
    marginTop: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  entryAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  entryAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#606266',
  },
  entryInfo: {
    flex: 1,
  },
  entryName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#303133',
  },
  entryPhone: {
    fontSize: 12,
    color: '#909399',
    marginTop: 2,
  },
  keepBadge: {
    backgroundColor: '#E7F7E7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  keepBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#67C23A',
  },
  groupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  keepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#E7F7E7',
    borderRadius: 10,
  },
  keepButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#67C23A',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#909399',
    marginTop: 4,
  },
});
