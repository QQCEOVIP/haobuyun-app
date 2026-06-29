import React, { useState, useEffect, useCallback } from 'react';
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
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';
import { Crypto } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { CONSENSUS, type NumberStatus } from '@/constants/numberStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactAvatar from '@/components/ContactAvatar';

interface Contact {
  id: string;
  deviceContactId: string;
  name: string;
  phone: string;
  phoneNumbers: string[];
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
  const router = useSafeRouter();
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
  const [syncLoading, setSyncLoading] = useState(false);
  const [contactAvatars, setContactAvatars] = useState<Record<string, string>>({});
  const [avatarMenuContact, setAvatarMenuContact] = useState<Contact | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);

  const userId = (user as any)?.id;

  // Load custom avatars from AsyncStorage
  const loadContactAvatars = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem('@contact_avatars');
      if (json) setContactAvatars(JSON.parse(json));
    } catch (_e) { /* ignore */ }
  }, []);

  // Save custom avatar for a contact
  const saveContactAvatar = async (phone: string, uri: string) => {
    const updated = { ...contactAvatars, [phone]: uri };
    setContactAvatars(updated);
    await AsyncStorage.setItem('@contact_avatars', JSON.stringify(updated));
  };

  // Handle setting custom avatar
  const handleSetAvatar = async (contact: Contact) => {
    setAvatarMenuContact(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相册权限才能设置头像');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await saveContactAvatar(contact.phone, result.assets[0].uri);
    }
  };

  // Handle removing custom avatar
  const handleRemoveAvatar = async (contact: Contact) => {
    setAvatarMenuContact(null);
    const updated = { ...contactAvatars };
    delete updated[contact.phone];
    setContactAvatars(updated);
    await AsyncStorage.setItem('@contact_avatars', JSON.stringify(updated));
  };

  // 打开编辑弹窗
  // 同步本地数据 - 将应用中的联系人状态信息写入设备通讯录备注
  const handleSync = async () => {
    // 二次确认
    Alert.alert(
      '确认同步',
      '确认要将APP中的标签数据和头像同步到本地通讯录吗？\n\n同步后，每个联系人的备注字段将写入标签信息，头像也会同步更新。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认同步',
          onPress: async () => {
            setSyncLoading(true);
            try {
              const { status: permStatus } = await Contacts.requestPermissionsAsync();
              if (permStatus !== 'granted') {
                Alert.alert('权限不足', '需要通讯录权限才能同步');
                return;
              }

              let syncCount = 0;
              let skipCount = 0;
              let failCount = 0;
              // 遍历所有联系人，将状态标签和头像写入设备通讯录
              for (const contact of contacts) {
                try {
                  const statusLabel = contact.status ? getStatusStyle(contact.status).label : '';
                  const avatarUri = contactAvatars[contact.phone];
                  const hasAvatar = !!avatarUri;
                  
                  // 如果没有标签也没有头像，跳过
                  if (!statusLabel && !hasAvatar) {
                    skipCount++;
                    continue;
                  }

                  const noteText = statusLabel ? `[号簿云] ${statusLabel}` : '';
                  
                  // 获取现有联系人完整数据（包含所有字段）
                  const existing = await Contacts.getContactByIdAsync(contact.deviceContactId, [
                    Contacts.Fields.Name,
                    Contacts.Fields.PhoneNumbers,
                    Contacts.Fields.Emails,
                    Contacts.Fields.Note,
                    Contacts.Fields.Company,
                    Contacts.Fields.JobTitle,
                    Contacts.Fields.Image,
                  ]);
                  if (!existing) {
                    failCount++;
                    continue;
                  }

                  // 检查是否需要更新
                  const needsNoteUpdate = !!statusLabel && (!existing.note?.includes('[号簿云]') || !existing.note?.includes(statusLabel));
                  const needsAvatarUpdate = hasAvatar && !!avatarUri;
                  
                  if (!needsNoteUpdate && !needsAvatarUpdate) {
                    skipCount++;
                    continue;
                  }

                  // 构建更新数据 - 保留所有现有字段
                  const updateData: any = {
                    id: existing.id,
                    name: existing.name || contact.name,
                    phoneNumbers: existing.phoneNumbers?.map((p: any) => ({ number: p.number, label: p.label || 'mobile' })) || [],
                  };
                  
                  // iOS 需要单独设置 firstName
                  if (Platform.OS === 'ios') {
                    updateData.firstName = existing.name || contact.name;
                  }
                  
                  // 更新备注
                  if (needsNoteUpdate && noteText) {
                    updateData.note = noteText;
                  } else if (existing.note) {
                    updateData.note = existing.note;
                  }
                  
                  // 更新头像 - 需要将base64转换为文件URI
                  if (needsAvatarUpdate && avatarUri) {
                    // 如果是base64格式，先写入临时文件
                    if (avatarUri.startsWith('data:image')) {
                      try {
                        const base64Data = avatarUri.split(',')[1];
                        const tempFileUri = FileSystemLegacy.cacheDirectory + `avatar_${contact.phone.replace(/\D/g, '')}.jpg`;
                        await FileSystemLegacy.writeAsStringAsync(tempFileUri, base64Data, { encoding: FileSystemLegacy.EncodingType.Base64 });
                        updateData.image = { uri: tempFileUri };
                      } catch (e) {
                        console.warn(`[Sync] Failed to write avatar file for ${contact.name}:`, e);
                      }
                    } else {
                      // 已经是文件URI，直接使用
                      updateData.image = { uri: avatarUri };
                    }
                  }
                  
                  // 保留其他字段
                  if (existing.emails && existing.emails.length > 0) {
                    updateData.emails = existing.emails.map((e: any) => ({ email: e.email, label: e.label || 'home' }));
                  }
                  if (existing.company) updateData.company = existing.company;
                  if (existing.jobTitle) updateData.jobTitle = existing.jobTitle;

                  await Contacts.updateContactAsync(updateData);
                  syncCount++;
                } catch (e) {
                  failCount++;
                  console.warn('Sync contact error:', contact.phone, (e as any)?.message);
                }
              }

              Alert.alert('同步完成', `成功: ${syncCount} 个\n跳过: ${skipCount} 个\n失败: ${failCount} 个`);
            } catch (error) {
              console.error('Sync error:', error);
              Alert.alert('同步失败', '请重试');
            } finally {
              setSyncLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenEdit = (contact: Contact) => {
    setStatusMenuContact(null);
    setEditingContact(contact);
    setEditName(contact.name);
    setEditPhones(contact.phoneNumbers.length > 0 ? [...contact.phoneNumbers] : [contact.phone]);
    setEditAvatarUri(contactAvatars[contact.phone] || null);
    setEditModalVisible(true);
  };

  // 选择编辑头像
  const handlePickEditAvatar = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setEditAvatarUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Pick edit avatar error:', error);
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    if (!editingContact) return;
    if (!editName.trim()) {
      Alert.alert('提示', '姓名不能为空');
      return;
    }
    // Filter out empty phone numbers
    const validPhones = editPhones.map(p => p.trim()).filter(p => p.length > 0);
    if (validPhones.length === 0) {
      Alert.alert('提示', '至少需要一个号码');
      return;
    }
    setEditSaving(true);
    try {
      // Request write contacts permission on Android before saving
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录写入权限才能编辑联系人');
        setEditSaving(false);
        return;
      }

      // Build phone numbers array from the editable list
      const updatedPhones = validPhones.map(number => ({
        number,
        label: 'mobile' as const,
      }));

      // Update device contact directly - pass both name formats for cross-platform compatibility
      console.log('[Contacts] Updating contact:', editingContact.deviceContactId, 'name:', editName.trim(), 'phones:', updatedPhones.length);
      await Contacts.updateContactAsync({
        id: editingContact.deviceContactId,
        name: editName.trim(),
        firstName: editName.trim(),
        lastName: '',
        phoneNumbers: updatedPhones,
      });

      // Update local state
      const newPrimaryPhone = validPhones[0];
      setContacts(prev => prev.map(c =>
        c.deviceContactId === editingContact.deviceContactId
          ? {
              ...c,
              name: editName.trim(),
              phone: newPrimaryPhone,
              phoneNumbers: validPhones,
            }
          : c
      ));

      // Save avatar if changed
      if (editAvatarUri !== null) {
        const newAvatars = { ...contactAvatars, [editingContact.phone]: editAvatarUri };
        setContactAvatars(newAvatars);
        await AsyncStorage.setItem('@contact_avatars', JSON.stringify(newAvatars));
      }
      Alert.alert('成功', '联系人已更新');
      setEditModalVisible(false);
      setEditingContact(null);
    } catch (error) {
      console.error('Update contact error:', error);
      const errMsg = error instanceof Error ? error.message : '未知错误';
      Alert.alert('错误', `更新失败：${errMsg}`);
    } finally {
      setEditSaving(false);
    }
  };

  const loadContacts = useCallback(async () => {
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
        // 分页获取所有设备联系人 - 使用更稳健的分页逻辑
        let allDeviceContacts: Contacts.Contact[] = [];
        let offset = 0;
        const devicePageSize = 2000;
        let hasMore = true;
        while (hasMore) {
          const { data: deviceContacts } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name].filter(
              (f): f is Contacts.Field => f != null && f !== undefined
            ),
            pageSize: devicePageSize,
            pageOffset: offset,
          });
          if (!deviceContacts || deviceContacts.length === 0) {
            hasMore = false;
            break;
          }
          allDeviceContacts = allDeviceContacts.concat(deviceContacts);
          offset += deviceContacts.length;
          if (deviceContacts.length < devicePageSize) {
            hasMore = false;
          }
        }

        const mappedContacts: Contact[] = allDeviceContacts
          .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
          .map(c => {
            // 保留所有有效号码，不过滤空字符串以外的格式
            const allPhones = c.phoneNumbers!.map(p => (p.number || '').trim()).filter(n => n.length > 0);
            const phone = allPhones[0] || '';
            if (!phone) return null; // 跳过完全没有有效号码的联系人
            const localData = allLocalContacts?.find((lc: any) => lc.phone === phone);
            return {
              id: c.id,
              deviceContactId: c.id,
              name: c.name || '未知联系人',
              phone: phone,
              phoneNumbers: allPhones,
              status: localData?.status || null,
              lastContactDate: localData?.last_contact_date,
            };
          })
          .filter((c): c is Contact => c !== null);

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
  }, [userId]);

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
      // Count stopped and suspected_stopped from AsyncStorage (source of truth for labels)
      const allKeys = await AsyncStorage.getAllKeys();
      const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
      let stopped = 0;
      let suspected = 0;
      if (statusKeys.length > 0) {
        const statusEntries = await AsyncStorage.multiGet(statusKeys);
        for (const [, value] of statusEntries) {
          if (value === 'stopped') stopped++;
          else if (value === 'suspected_stopped') suspected++;
        }
      }

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

  useEffect(() => {
    filterContacts(contacts, searchText, activeTab);
  }, [searchText, activeTab, contacts]);

  useEffect(() => {
    if (contacts.length > 0) {
      fetchCleanupStats();
    }
  }, [contacts]);

  // 初始加载联系人列表（仅挂载时，Tab切换不重新加载以避免闪屏）
  useEffect(() => {
    loadContacts();
    loadContactAvatars();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

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
    const customAvatarUri = contactAvatars[item.phone];

    return (
      <TouchableOpacity
        style={styles.contactCard}
        onLongPress={() => setAvatarMenuContact(item)}
        delayLongPress={500}
      >
        {customAvatarUri ? (
          <Image source={{ uri: customAvatarUri }} style={styles.customAvatar} />
        ) : (
          <ContactAvatar name={item.name} size={44} />
        )}
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.phoneNumbers && item.phoneNumbers.length > 1 ? (
            item.phoneNumbers.map((phone, index) => (
              <Text key={index} style={[styles.contactPhone, index > 0 && styles.contactPhoneSecondary]}>
                {phone}
              </Text>
            ))
          ) : (
            <Text style={styles.contactPhone}>{item.phone}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.editIconButton}
          onPress={() => handleOpenEdit(item)}
        >
          <Ionicons name="create-outline" size={20} color="#4A90D9" />
        </TouchableOpacity>
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
    <SafeAreaView style={[styles.container, { backgroundColor: '#F5F7FA' }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={styles.title}>通讯录</Text>
            <Text style={styles.titleCount}> ({filteredContacts.length})</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.syncTextButton}
              onPress={handleSync}
              disabled={syncLoading}
            >
              <Text style={[styles.syncTextButtonText, syncLoading && { color: '#909399' }]}>
                {syncLoading ? '同步中...' : '同步'}
              </Text>
            </TouchableOpacity>
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
                <Ionicons name="options" size={16} color="#4A90D9" style={{ marginRight: 4 }} />
                <Text style={styles.cleanupTitle}>管理助手</Text>
              </View>
              <TouchableOpacity
                style={styles.pillButton}
                onPress={() => router.push('/recycle-bin')}
                activeOpacity={0.8}
              >
                <Ionicons name="trash-outline" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>回收站</Text>
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
              <TouchableOpacity
                style={styles.cleanupStatItem}
                activeOpacity={0.7}
                onPress={() => router.push('/stopped-contacts', { status: 'stopped' })}
              >
                <Text style={[styles.cleanupStatValue, { color: '#F56C6C' }]}>{cleanupStats.stopped}</Text>
                <Text style={styles.cleanupStatLabel}>确认失效</Text>
              </TouchableOpacity>
              <View style={styles.cleanupStatDivider} />
              <TouchableOpacity
                style={styles.cleanupStatItem}
                activeOpacity={0.7}
                onPress={() => router.push('/stopped-contacts', { status: 'suspected_stopped' })}
              >
                <Text style={[styles.cleanupStatValue, { color: '#FA8C16' }]}>{cleanupStats.suspected}</Text>
                <Text style={styles.cleanupStatLabel}>可能失效</Text>
              </TouchableOpacity>
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

      {/* 头像设置菜单 */}
      {avatarMenuContact !== null && (
      <Modal
        visible={true}
        transparent
        animationType="none"
        onRequestClose={() => setAvatarMenuContact(null)}
      >
        <TouchableWithoutFeedback onPress={() => setAvatarMenuContact(null)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.statusMenuCard}>
                <Text style={styles.statusMenuTitle}>
                  {contactAvatars[avatarMenuContact.phone] ? '管理头像' : '设置头像'}
                </Text>
                <Text style={styles.statusMenuContactName}>
                  {avatarMenuContact.name} ({avatarMenuContact.phone})
                </Text>
                <TouchableOpacity
                  style={[styles.statusMenuOption, { backgroundColor: '#E8F0FE' }]}
                  onPress={() => handleSetAvatar(avatarMenuContact)}
                >
                  <Ionicons name="camera" size={20} color="#4A90D9" />
                  <Text style={[styles.statusMenuOptionText, { color: '#4A90D9' }]}>
                    {contactAvatars[avatarMenuContact.phone] ? '更换头像' : '设置头像'}
                  </Text>
                </TouchableOpacity>
                {contactAvatars[avatarMenuContact.phone] && (
                  <TouchableOpacity
                    style={[styles.statusMenuOption, { backgroundColor: '#FEF0F0' }]}
                    onPress={() => handleRemoveAvatar(avatarMenuContact)}
                  >
                    <Ionicons name="trash" size={20} color="#F56C6C" />
                    <Text style={[styles.statusMenuOptionText, { color: '#F56C6C' }]}>删除头像</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.statusMenuCancel}
                  onPress={() => setAvatarMenuContact(null)}
                >
                  <Text style={styles.statusMenuCancelText}>取消</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      )}

      {/* 编辑联系人弹窗 */}
      {editModalVisible && (
        <Modal
          visible={true}
          transparent
          animationType="slide"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.editModalCard}>
              <View style={styles.editModalHeader}>
                <Text style={styles.editModalTitle}>编辑联系人</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#909399" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.editModalBody} showsVerticalScrollIndicator={false}>
                {/* 头像选择 */}
                <View style={styles.editAvatarSection}>
                  <TouchableOpacity
                    style={styles.editAvatarContainer}
                    onPress={handlePickEditAvatar}
                  >
                    {editAvatarUri ? (
                      <Image source={{ uri: editAvatarUri }} style={styles.editAvatarImage} />
                    ) : (
                      <View style={styles.editAvatarPlaceholder}>
                        <Ionicons name="camera" size={24} color="#B2BEC3" />
                      </View>
                    )}
                    <View style={styles.editAvatarEditIcon}>
                      <Ionicons name="create" size={12} color="#FFF" />
                    </View>
                  </TouchableOpacity>
                  <Text style={styles.editAvatarHint}>点击更换头像</Text>
                </View>
                <Text style={styles.editLabel}>姓名</Text>
                <TextInput
                  style={styles.editInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="请输入姓名"
                  placeholderTextColor="#B2BEC3"
                />
                <Text style={[styles.editLabel, { marginTop: 16 }]}>号码</Text>
                {editPhones.map((phone, index) => (
                  <View key={index} style={styles.editPhoneRow}>
                    <TextInput
                      style={[styles.editInput, { flex: 1 }]}
                      value={phone}
                      onChangeText={(text) => {
                        const updated = [...editPhones];
                        updated[index] = text;
                        setEditPhones(updated);
                      }}
                      placeholder="请输入号码"
                      placeholderTextColor="#B2BEC3"
                      keyboardType="phone-pad"
                    />
                    {editPhones.length > 1 && (
                      <TouchableOpacity
                        style={styles.editPhoneDeleteBtn}
                        onPress={() => {
                          const updated = editPhones.filter((_, i) => i !== index);
                          setEditPhones(updated);
                        }}
                      >
                        <Ionicons name="close-circle" size={22} color="#F56C6C" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.editPhoneAddBtn}
                  onPress={() => setEditPhones([...editPhones, ''])}
                >
                  <Ionicons name="add-circle-outline" size={20} color="#4A90D9" />
                  <Text style={styles.editPhoneAddText}>添加号码</Text>
                </TouchableOpacity>
              </ScrollView>
              <View style={styles.editModalFooter}>
                <TouchableOpacity
                  style={styles.editCancelButton}
                  onPress={() => setEditModalVisible(false)}
                >
                  <Text style={styles.editCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editSaveButton, editSaving && { opacity: 0.6 }]}
                  onPress={handleSaveEdit}
                  disabled={editSaving}
                >
                  <Text style={styles.editSaveText}>
                    {editSaving ? '保存中...' : '保存'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
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
  titleCount: {
    fontSize: 16,
    fontWeight: '400',
    color: '#909399',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  syncTextButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncTextButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90D9',
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
  customAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  contactPhoneSecondary: {
    fontSize: 13,
    color: '#B0B3B8',
    marginTop: 1,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(74, 144, 217, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editIconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  editAvatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  editAvatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    position: 'relative',
  },
  editAvatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  editAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F0F0F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editAvatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  editAvatarHint: {
    fontSize: 12,
    color: '#909399',
    marginTop: 8,
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
  editModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '85%',
    maxWidth: 360,
    overflow: 'hidden',
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  editModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#303133',
  },
  editModalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    maxHeight: 400,
  },
  editLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#606266',
    marginBottom: 8,
  },
  editInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#303133',
  },
  editModalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  editCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F5F7FA',
    alignItems: 'center',
  },
  editCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#909399',
  },
  editSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    alignItems: 'center',
  },
  editSaveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  editPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  editPhoneDeleteBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editPhoneAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  editPhoneAddText: {
    fontSize: 14,
    color: '#4A90D9',
    fontWeight: '500',
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#FFF7ED',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  cleanupButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EA580C',
  },
  pillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F56C6C',
    shadowColor: '#F56C6C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 5,
  },
  pillLeft: {
    flex: 1,
    backgroundColor: '#FBBF24',
  },
  pillRight: {
    flex: 1,
    backgroundColor: '#EF4444',
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
