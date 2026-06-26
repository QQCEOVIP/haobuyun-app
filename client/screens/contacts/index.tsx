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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';

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

async function generatePhoneHash(phone: string): Promise<string> {
  // Simple hash function for phone numbers using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(phone);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function ContactsScreen() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [statusMenuContact, setStatusMenuContact] = useState<Contact | null>(null);

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

        setContacts(mappedContacts);
        filterContacts(mappedContacts, searchText, activeTab);
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

  const updateContactStatus = async (contact: Contact | null, newStatus: string) => {
    if (!contact || !userId) return;
    
    try {
      // 先尝试更新已有记录
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', userId)
        .eq('phone', contact.phone)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('contacts')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Generate phone_hash using a simple hash function
        const phoneHash = await generatePhoneHash(contact.phone);
        const { error } = await supabase
          .from('contacts')
          .insert({
            user_id: userId,
            name: contact.name,
            phone: contact.phone,
            phone_hash: phoneHash,
            status: newStatus,
          });
        if (error) throw error;
      }

      // 更新本地状态
      setContacts(prev => prev.map(c =>
        c.phone === contact.phone ? { ...c, status: newStatus } : c
      ));
    } catch (error: any) {
      console.error('Failed to update status:', error);
      Alert.alert('错误', '更新状态失败: ' + (error?.message || '未知错误'));
    }
    
    setStatusMenuContact(null);
  };

  useFocusEffect(
    useCallback(() => {
      loadContacts();
      return () => {
        // 清理：关闭所有弹窗，防止切换页面时遮罩闪现
        setInfoModalVisible(false);
        setStatusMenuContact(null);
      };
    }, [userId])
  );

  useEffect(() => {
    filterContacts(contacts, searchText, activeTab);
  }, [searchText, activeTab, contacts]);

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
    return (
      <TouchableOpacity style={styles.contactCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
        </View>
        <TouchableOpacity
          style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}
          onPress={() => setStatusMenuContact(item)}
        >
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusStyle.label}
          </Text>
        </TouchableOpacity>
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
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
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

      {/* 状态选择菜单 */}
      <Modal
        visible={statusMenuContact !== null}
        transparent
        animationType="fade"
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
});
