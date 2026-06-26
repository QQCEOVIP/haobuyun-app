import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';
import { Crypto } from 'expo-crypto';
import { CONSENSUS, type NumberStatus } from '@/constants/numberStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: string | null;
  lastContactDate?: string;
}

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '正常' },
  { key: 'stopped', label: '停机' },
  { key: 'suspected_stopped', label: '疑似停机' },
];

export default function ContactsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [statusMenuContact, setStatusMenuContact] = useState<Contact | null>(null);
  const [cleanupStats, setCleanupStats] = useState({ duplicate: 0, stopped: 0, suspected: 0 });
  const [communityMarks, setCommunityMarks] = useState<Map<string, { status: NumberStatus; markCount: number }>>(new Map());

  const userId = (user as any)?.id;

  const loadContacts = async () => {
    if (!userId) return;

    try {
      // 分页获取所有supabase联系人
      let allLocalContacts: any[] = [];
      let page = 0;
      const dbPageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('contacts')
          .select('id, phone, status, last_contact_date')
          .eq('user_id', userId)
          .range(page * dbPageSize, (page + 1) * dbPageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allLocalContacts = allLocalContacts.concat(data);
        if (data.length < dbPageSize) break;
        page++;
      }

      const { status } = await Contacts.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status === 'granted') {
        // 分页获取所有设备联系人
        let allDeviceContacts: Contacts.Contact[] = [];
        let offset = 0;
        const devicePageSize = 1000;
        while (true) {
          const { data: deviceContacts } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
            pageSize: devicePageSize,
            pageOffset: offset,
          });
          if (!deviceContacts || deviceContacts.length === 0) break;
          allDeviceContacts = allDeviceContacts.concat(deviceContacts);
          offset += deviceContacts.length;
          if (deviceContacts.length < devicePageSize) break;
        }

        const mappedContacts: Contact[] = allDeviceContacts
          .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
          .map(c => {
            const phone = c.phoneNumbers![0].number || '';
            const localData = allLocalContacts?.find((lc: any) => lc.phone === phone);
            return {
              id: c.id,
              name: c.name || '未知联系人',
              phone: phone,
              status: localData?.status || null,
              lastContactDate: localData?.last_contact_date,
            };
          });

        // Load locally persisted status overrides from AsyncStorage
        const allKeys = await AsyncStorage.getAllKeys();
        const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
        const statusEntries = statusKeys.length > 0
          ? await AsyncStorage.multiGet(statusKeys)
          : [];
        const localStatusMap = new Map<string, string>();
        for (const [key, value] of statusEntries) {
          if (value) {
            const phone = key.replace('@contact_status_', '');
            localStatusMap.set(phone, value);
          }
        }

        // Apply AsyncStorage status as fallback when Supabase has no status
        const finalContacts = mappedContacts.map(c => ({
          ...c,
          status: c.status || localStatusMap.get(c.phone) || null,
        }));

        setContacts(finalContacts);
        filterContacts(finalContacts, searchText, activeTab);
        // Fetch community marks after contacts are loaded
        fetchCommunityMarks();
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const filterContacts = (contactList: Contact[], search: string, tab: string) => {
    let filtered = contactList;

    if (search) {
      filtered = filtered.filter(
        c => c.name.toLowerCase().includes(search.toLowerCase()) ||
             c.phone.includes(search)
      );
    }

    if (tab !== 'all') {
      filtered = filtered.filter(c => c.status === tab);
    }

    setFilteredContacts(filtered);
  };

  const fetchCleanupStats = async () => {
    if (!userId) return;
    try {
      // Count stopped and suspected_stopped from supabase
      const { data: statusCounts } = await supabase
        .from('contacts')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['stopped', 'suspected_stopped']);

      const stopped = statusCounts?.filter(c => c.status === 'stopped').length || 0;
      const suspected = statusCounts?.filter(c => c.status === 'suspected_stopped').length || 0;

      // Count potential duplicates by phone number
      const phoneMap = new Map<string, number>();
      contacts.forEach(c => {
        const normalized = c.phone.replace(/\D/g, '');
        if (normalized.length >= 7) {
          phoneMap.set(normalized, (phoneMap.get(normalized) || 0) + 1);
        }
      });
      const duplicate = Array.from(phoneMap.values()).filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0);

      setCleanupStats({ duplicate, stopped, suspected });
    } catch (error) {
      console.error('Failed to fetch cleanup stats:', error);
    }
  };

  const fetchCommunityMarks = async () => {
    try {
      const { data, error } = await supabase.rpc('get_all_community_statuses');
      if (error) {
        console.warn('Failed to fetch community statuses:', error.message);
        return;
      }
      if (!data) return;

      // Build a map: phone_hash -> { status, markCount }
      const markMap = new Map<string, { status: NumberStatus; markCount: number }>();
      for (const row of data) {
        if (row.mark_count >= CONSENSUS.MIN_MARKS) {
          markMap.set(row.phone_hash, {
            status: row.status as NumberStatus,
            markCount: row.mark_count,
          });
        }
      }

      // Pre-compute phone hashes for all current contacts
      const phoneHashMaps = new Map<string, string>();
      for (const contact of contacts) {
        if (contact.phone) {
          const hash = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            contact.phone,
          );
          phoneHashMaps.set(contact.phone, hash);
        }
      }

      // Build a phone -> community mark map for easy lookup in render
      const phoneCommunityMap = new Map<string, { status: NumberStatus; markCount: number }>();
      for (const [phone, hash] of phoneHashMaps) {
        const communityMark = markMap.get(hash);
        if (communityMark) {
          phoneCommunityMap.set(phone, communityMark);
        }
      }

      setCommunityMarks(phoneCommunityMap);
    } catch (error) {
      console.error('Failed to fetch community marks:', error);
    }
  };

  const updateContactStatus = async (contact: Contact | null, newStatus: string) => {
    if (!contact || !userId) return;
    try {
      // Try UPDATE first - this may be allowed by RLS
      const { data: updatedData, error: updateError } = await supabase
        .from('contacts')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('phone', contact.phone)
        .select();

      if (updateError) {
        // UPDATE failed (possibly RLS), fall through to local-only update
        console.warn('Supabase UPDATE failed, using local-only update:', updateError.message);
      } else if (updatedData && updatedData.length > 0) {
        // UPDATE succeeded and matched rows
        // Update local state
        setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, status: newStatus } : c));
        setStatusMenuContact(null);
        return;
      }
      
      // No existing record in Supabase (UPDATE matched 0 rows) or UPDATE failed
      // Try INSERT but don't fail if RLS blocks it
      const { error: insertError } = await supabase
        .from('contacts')
        .insert({ user_id: userId, name: contact.name, phone: contact.phone, status: newStatus });
      
      if (insertError) {
        // INSERT blocked by RLS - that's okay, just update local state
        console.warn('Supabase INSERT failed (RLS), using local-only update:', insertError.message);
      }
      
      // Always update local state regardless of Supabase result
      setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, status: newStatus } : c));
      // Persist to AsyncStorage for cross-session durability
      await AsyncStorage.setItem(`@contact_status_${contact.phone}`, newStatus);
    } catch (error: any) {
      console.error('Failed to update status:', error);
      // Still update local state even on error
      setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, status: newStatus } : c));
    }
    setStatusMenuContact(null);
  };

  useFocusEffect(
    useCallback(() => {
      // 延迟到过渡动画完成后再执行重度异步操作，防止切换闪屏
      const handle = InteractionManager.runAfterInteractions(() => {
        loadContacts();
      });
      return () => handle.cancel();
    }, [userId])
  );

  useEffect(() => {
    filterContacts(contacts, searchText, activeTab);
  }, [searchText, activeTab, contacts]);

  useEffect(() => {
    if (contacts.length > 0) {
      fetchCleanupStats();
    }
  }, [contacts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const getStatusStyle = (status: string | null) => {
    switch (status) {
      case 'normal':
        return { bg: '#E7F7E7', text: '#67C23A', label: '正常' };
      case 'stopped':
        return { bg: '#FEF0F0', text: '#F56C6C', label: '停机' };
      case 'suspected_stopped':
        return { bg: '#FFF8E6', text: '#E6A23C', label: '疑似停机' };
      default:
        return { bg: '#F5F7FA', text: '#909399', label: '未标记' };
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const statusStyle = getStatusStyle(item.status);
    const communityMark = communityMarks.get(item.phone);
    const communityStyle = communityMark ? getStatusStyle(communityMark.status) : null;

    return (
      <TouchableOpacity style={styles.contactCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
        </View>
        <View style={styles.badgeContainer}>
          {communityStyle ? (
            <>
              <TouchableOpacity
                style={styles.badgeGroup}
                activeOpacity={0.7}
                onPress={() => setStatusMenuContact(item)}
              >
                <Text style={styles.badgeLabel}>我的</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>
                    {statusStyle.label}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.badgeGroup}>
                <Text style={styles.badgeLabel}>社区</Text>
                <View style={[styles.statusBadge, { backgroundColor: communityStyle.bg }]}>
                  <Text style={[styles.statusText, { color: communityStyle.text }]}>
                    {communityMark!.markCount}人标记{communityStyle.label}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
              onPress={() => setStatusMenuContact(item)}
            >
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {statusStyle.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>通讯录</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setInfoModalVisible(true)}
            >
              <Ionicons name="information-circle-outline" size={24} color="#4A90D9" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#909399" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="搜索联系人或号码"
            value={searchText}
            onChangeText={setSearchText}
            placeholderTextColor="#909399"
          />
        </View>
        <View style={styles.tabContainer}>
          {STATUS_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.cleanupCard}>
            <View style={styles.cleanupHeader}>
              <View style={styles.cleanupTitleRow}>
                <Ionicons name="trash" size={16} color="#4A90D9" style={{ marginRight: 4 }} />
                <Text style={styles.cleanupTitle}>清理助手</Text>
              </View>
              <TouchableOpacity
                style={styles.cleanupButton}
                onPress={() => router.push('/(tabs)/cleanup')}
              >
                <Text style={styles.cleanupButtonText}>立即清理 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.cleanupStats}>
              <TouchableOpacity
                style={styles.cleanupStatItem}
                activeOpacity={0.7}
                onPress={() => router.push('/duplicates')}
              >
                <Text style={[styles.cleanupStatValue, { color: '#E6A23C' }]}>{cleanupStats.duplicate}</Text>
                <Text style={styles.cleanupStatLabel}>疑似重复</Text>
              </TouchableOpacity>
              <View style={styles.cleanupStatDivider} />
              <View style={styles.cleanupStatItem}>
                <Text style={[styles.cleanupStatValue, { color: '#F56C6C' }]}>{cleanupStats.stopped}</Text>
                <Text style={styles.cleanupStatLabel}>确认失效</Text>
              </View>
              <View style={styles.cleanupStatDivider} />
              <View style={styles.cleanupStatItem}>
                <Text style={[styles.cleanupStatValue, { color: '#FA8C16' }]}>{cleanupStats.suspected}</Text>
                <Text style={styles.cleanupStatLabel}>可能失效</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          hasPermission === false ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#909399" />
              <Text style={styles.emptyText}>需要通讯录权限</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#909399" />
              <Text style={styles.emptyText}>暂无联系人</Text>
            </View>
          )
        }
      />

      {/* 说明弹窗 */}
      {infoModalVisible && (
      <Modal
        visible={true}
        transparent
        animationType="none"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setInfoModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>状态说明</Text>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#67C23A' }]} />
                  <Text style={styles.infoText}>
                    <Text style={{ fontWeight: '600' }}>正常</Text>：号码可正常使用
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#F56C6C' }]} />
                  <Text style={styles.infoText}>
                    <Text style={{ fontWeight: '600' }}>停机</Text>：号码已确认停机或空号
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#E6A23C' }]} />
                  <Text style={styles.infoText}>
                    <Text style={{ fontWeight: '600' }}>疑似停机</Text>：号码可能已停机，建议核实
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#909399' }]} />
                  <Text style={styles.infoText}>
                    <Text style={{ fontWeight: '600' }}>未标记</Text>：尚未设置状态
                  </Text>
                </View>
                <TouchableOpacity
                  style={{ marginTop: 16, alignItems: 'center' }}
                  onPress={() => setInfoModalVisible(false)}
                >
                  <Text style={{ color: '#4A90D9', fontSize: 15, fontWeight: '600' }}>知道了</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      )}

      {/* 状态选择菜单 */}
      {statusMenuContact !== null && (
      <Modal
        visible={true}
        transparent
        animationType="none"
        onRequestClose={() => setStatusMenuContact(null)}
      >
        <TouchableWithoutFeedback onPress={() => setStatusMenuContact(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.statusMenuCard}>
                <Text style={styles.statusMenuTitle}>选择状态</Text>
                <Text style={styles.statusMenuContactName}>
                  {statusMenuContact?.name} ({statusMenuContact?.phone})
                </Text>
                <TouchableOpacity
                  style={[styles.statusMenuOption, { backgroundColor: '#E7F7E7' }]}
                  onPress={() => updateContactStatus(statusMenuContact, 'normal')}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#67C23A" />
                  <Text style={[styles.statusMenuOptionText, { color: '#67C23A' }]}>正常</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusMenuOption, { backgroundColor: '#FEF0F0' }]}
                  onPress={() => updateContactStatus(statusMenuContact, 'stopped')}
                >
                  <Ionicons name="close-circle" size={20} color="#F56C6C" />
                  <Text style={[styles.statusMenuOptionText, { color: '#F56C6C' }]}>停机</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusMenuOption, { backgroundColor: '#FFF8E6' }]}
                  onPress={() => updateContactStatus(statusMenuContact, 'suspected_stopped')}
                >
                  <Ionicons name="alert-circle" size={20} color="#E6A23C" />
                  <Text style={[styles.statusMenuOptionText, { color: '#E6A23C' }]}>疑似停机</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.statusMenuCancel}
                  onPress={() => setStatusMenuContact(null)}
                >
                  <Text style={styles.statusMenuCancelText}>取消</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#303133',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#303133',
  },
  tabContainer: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#F5F7FA',
  },
  activeTab: {
    backgroundColor: '#4A90D9',
  },
  tabText: {
    fontSize: 13,
    color: '#606266',
  },
  activeTabText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  contactCard: {
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
  },
  contactPhone: {
    fontSize: 14,
    color: '#909399',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  badgeContainer: {
    alignItems: 'flex-end',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  badgeLabel: {
    fontSize: 10,
    color: '#909399',
    marginRight: 4,
    minWidth: 24,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#909399',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    width: '80%',
    maxWidth: 320,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#606266',
    lineHeight: 20,
  },
  statusMenuCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    width: '80%',
    maxWidth: 320,
  },
  statusMenuTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusMenuContactName: {
    fontSize: 13,
    color: '#909399',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  statusMenuOptionText: {
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  statusMenuCancel: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  statusMenuCancelText: {
    fontSize: 15,
    color: '#909399',
    fontWeight: '600',
  },
  cleanupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#4A90D9',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(74, 144, 217, 0.1)',
  },
  cleanupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cleanupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#303133',
  },
  cleanupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cleanupButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(74, 144, 217, 0.1)',
    borderRadius: 12,
  },
  cleanupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A90D9',
  },
  cleanupStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cleanupStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  cleanupStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  cleanupStatLabel: {
    fontSize: 12,
    color: '#909399',
    marginTop: 2,
  },
  cleanupStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#F0F0F0',
  },
});
