import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: string;
  lastContactDate?: string;
}

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '活跃' },
  { key: 'maybe_invalid', label: '可能失效' },
  { key: 'invalid', label: '确定失效' },
];

export default function ContactsScreen() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const userId = (user as any)?.id;

  const loadContacts = async () => {
    if (!userId) return;

    try {
      // 先从数据库加载本地标记的状态
      const { data: localContacts, error } = await supabase
        .from('contacts')
        .select('id, phone, status, last_contact_date')
        .eq('user_id', userId);

      if (error) throw error;

      // 请求通讯录权限
      const { status } = await Contacts.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status === 'granted') {
        const { data: deviceContacts } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize: 1000,
        });

        if (deviceContacts) {
          const mappedContacts: Contact[] = deviceContacts
            .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
            .map(c => {
              const phone = c.phoneNumbers![0].number || '';
              const localData = localContacts?.find((lc: any) => lc.phone === phone);
              return {
                id: c.id,
                name: c.name || '未知联系人',
                phone: phone,
                status: localData?.status || 'unknown',
                lastContactDate: localData?.last_contact_date,
              };
            });

          setContacts(mappedContacts);
          filterContacts(mappedContacts, searchText, activeTab);
        }
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const filterContacts = (contactList: Contact[], search: string, tab: string) => {
    let filtered = contactList;

    // 搜索过滤
    if (search) {
      filtered = filtered.filter(
        c => c.name.toLowerCase().includes(search.toLowerCase()) ||
             c.phone.includes(search)
      );
    }

    // 状态过滤
    if (tab !== 'all') {
      filtered = filtered.filter(c => c.status === tab);
    }

    setFilteredContacts(filtered);
  };

  useFocusEffect(
    useCallback(() => {
      loadContacts();
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return { bg: '#E7F7E7', text: '#67C23A', label: '活跃' };
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
    return (
      <TouchableOpacity style={styles.contactCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
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
        <Text style={styles.title}>通讯录</Text>
        <Text style={styles.subtitle}>{contacts.length} 位联系人</Text>
      </View>

      {/* 搜索框 */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索姓名或号码"
          placeholderTextColor="#B2BEC3"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* 状态标签 */}
      <View style={styles.tabContainer}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 权限提示 */}
      {hasPermission === false && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>
            需要授权访问通讯录才能检测号码状态
          </Text>
          <TouchableOpacity style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>去授权</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 联系人列表 */}
      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchText ? '未找到匹配的联系人' : '暂无联系人数据'}
            </Text>
          </View>
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
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#303133',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: '#4A90D9',
  },
  tabText: {
    fontSize: 14,
    color: '#909399',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  permissionCard: {
    backgroundColor: '#FFF8E6',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permissionText: {
    flex: 1,
    fontSize: 14,
    color: '#E6A23C',
  },
  permissionButton: {
    backgroundColor: '#E6A23C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4A90D9',
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
  emptyText: {
    fontSize: 14,
    color: '#909399',
  },
});
