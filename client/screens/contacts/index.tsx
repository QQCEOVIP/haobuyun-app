import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
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
import { getBackendBaseUrl } from '@/utils';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { CONSENSUS, type NumberStatus } from '@/constants/numberStatus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ContactAvatar from '@/components/ContactAvatar';

// 替代 Modal 的轻量级遮罩组件，避免 Modal 原生行为导致的闪屏
const Overlay = ({ visible, children, onClose }: { visible: boolean; children: React.ReactNode; onClose?: () => void }) => {
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose} disabled={!onClose}>
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        />
      </TouchableWithoutFeedback>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
};

// Avatar component with error fallback for device contact images
function DeviceAvatar({ uri, name, size }: { uri: string | null | undefined; name: string; size: number }) {
  const [loadError, setLoadError] = useState(false);

  if (!uri || loadError) {
    return <ContactAvatar name={name} size={size} />;
  }

  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      onError={() => setLoadError(true)}
    />
  );
}

interface Contact {
  id: string;
  deviceContactId: string;
  name: string;
  phone: string;
  phoneNumbers: string[];
  status: string | null;
  lastContactDate?: string;
  image?: string | null;
  emails?: string[];
  company?: string;
  jobTitle?: string;
  note?: string;
}

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'normal', label: '正常' },
  { key: 'stopped', label: '停用' },
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
  const [communityMarks, setCommunityMarks] = useState<Map<string, { status: NumberStatus; voteCount: number }>>(new Map());
  const [syncLoading, setSyncLoading] = useState(false);
  const [contactAvatars, setContactAvatars] = useState<Record<string, string>>({});
  const [avatarMenuContact, setAvatarMenuContact] = useState<Contact | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhones, setEditPhones] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editAvatarUri, setEditAvatarUri] = useState<string | null>(null);
  const [editEmails, setEditEmails] = useState<string[]>([]);
  const [editCompany, setEditCompany] = useState('');
  const [editJobTitle, setEditJobTitle] = useState('');
  const [editNote, setEditNote] = useState('');

  // 社区投票相关状态
  const [communityVotes, setCommunityVotes] = useState<Map<string, { stoppedCount: number; communityStatus: string | null }>>(new Map());
  const [votePanelVisible, setVotePanelVisible] = useState(false);
  const [votePanelContact, setVotePanelContact] = useState<Contact | null>(null);

  // 首次加载标记：防止Tab切换时闪屏
  const [initialLoaded, setInitialLoaded] = useState(false);

  // 批量管理相关状态
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);

  const userId = (user as any)?.id;

  // Safety: reset any stuck modal states when screen regains focus to prevent screen darkening
  useFocusEffect(
    useCallback(() => {
      setInfoModalVisible(false);
      setStatusMenuContact(null);
      setAvatarMenuContact(null);
      setEditModalVisible(false);
      setVotePanelVisible(false);

      return () => {
        setInfoModalVisible(false);
        setStatusMenuContact(null);
        setAvatarMenuContact(null);
        setEditModalVisible(false);
        setVotePanelVisible(false);
      };
    }, [])
  );

  // 阈值配置（与服务端保持一致）
  const CONFIRMED_THRESHOLD = 11; // >10票且无人认证 → 确认失效
  const MAYBE_THRESHOLD = 3;      // 3-10票 → 可能失效

  // 新用户检查：注册是否满7天
  // NOTE: 暂时解除限制，正式上线前需恢复7天限制
  const isUserNew = (): boolean => {
    return false; // 暂时解除限制，所有用户立即可参与
    // const createdAt = (user as any)?.created_at;
    // if (!createdAt) return true; // 未知则假定为新用户
    // const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    // return daysSince < 7;
  };

  // 反垃圾检查：1小时内最多50次投票
  const checkVoteSpam = async (): Promise<boolean> => {
    try {
      const timestamp = await AsyncStorage.getItem('@vote_count_timestamp');
      const count = await AsyncStorage.getItem('@vote_count');
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (timestamp && count) {
        const ts = parseInt(timestamp, 10);
        const cnt = parseInt(count, 10);
        if (now - ts < oneHour && cnt >= 50) {
          return true; // 是垃圾行为
        }
      }
      return false;
    } catch {
      return false;
    }
  };

  // 增加投票计数
  const incrementVoteCount = async () => {
    try {
      const timestamp = await AsyncStorage.getItem('@vote_count_timestamp');
      const count = await AsyncStorage.getItem('@vote_count');
      const now = Date.now();
      const oneHour = 60 * 60 * 1000;

      if (timestamp && count) {
        const ts = parseInt(timestamp, 10);
        const cnt = parseInt(count, 10);
        if (now - ts < oneHour) {
          await AsyncStorage.setItem('@vote_count', String(cnt + 1));
        } else {
          await AsyncStorage.setItem('@vote_count_timestamp', String(now));
          await AsyncStorage.setItem('@vote_count', '1');
        }
      } else {
        await AsyncStorage.setItem('@vote_count_timestamp', String(now));
        await AsyncStorage.setItem('@vote_count', '1');
      }
    } catch {
      // ignore
    }
  };

  // 上传投票到服务端
  const uploadVote = async (phone: string, vote: 'stopped' | 'valid') => {
    // 新用户检查：注册未满7天不能投票
    if (isUserNew()) {
      // 检查是否已显示过提示
      const tipShown = await AsyncStorage.getItem('@new_user_vote_tip_shown');
      if (!tipShown) {
        Alert.alert('提示', '注册满7天后可参与号码状态共享');
        await AsyncStorage.setItem('@new_user_vote_tip_shown', '1');
      }
      // 无论是否显示过提示，都不上传投票
      return;
    }

    // 反垃圾检查
    if (await checkVoteSpam()) {
      Alert.alert('提示', '标记过于频繁，请稍后再试');
      return;
    }

    try {
      const baseUrl = getBackendBaseUrl();
      if (vote === 'valid') {
        // 撤回投票
        await fetch(`${baseUrl}/api/v1/votes`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({ phone }),
        });
      } else {
        // 提交/更新投票
        await fetch(`${baseUrl}/api/v1/votes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': userId,
          },
          body: JSON.stringify({ phone, vote }),
        });
      }
      await incrementVoteCount();
    } catch (error) {
      console.warn('Failed to upload vote:', error);
    }
  };

  // 获取号码实时社区状态
  const fetchNumberStatus = async (phone: string) => {
    try {
      const baseUrl = getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/number-status/${encodeURIComponent(phone)}`, {
        headers: { 'x-user-id': userId },
      });
      if (response.ok) {
        const data = await response.json();
        // 更新社区投票缓存
        if (data.vote_stats) {
          setCommunityVotes(prev => {
            const next = new Map(prev);
            next.set(phone, {
              stoppedCount: data.vote_stats.stopped_count || 0,
              communityStatus: data.vote_stats.community_status || null,
            });
            return next;
          });
        }
        return data;
      }
    } catch (error) {
      console.warn('Failed to fetch number status:', error);
    }
    return null;
  };

  // 加载社区投票缓存
  const loadCommunityVotesCache = async () => {
    try {
      const json = await AsyncStorage.getItem('@community_votes_cache');
      if (json) {
        const data = JSON.parse(json);
        const map = new Map<string, { stoppedCount: number; communityStatus: string | null }>();
        for (const item of data) {
          if (item.stopped_count > 0) {
            map.set(item.phone, {
              stoppedCount: item.stopped_count,
              communityStatus: item.community_status,
            });
          }
        }
        setCommunityVotes(map);
      }
    } catch {
      // ignore
    }
  };

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
  // hbyun-sync: bidirectional contact state reconciliation v3.1
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
                  // 头像同步检查：只有当联系人还没有头像时才需要同步（避免重复写入）
                  const needsAvatarUpdate = hasAvatar && !existing.image;
                  
                  if (!needsNoteUpdate && !needsAvatarUpdate) {
                    skipCount++;
                    continue;
                  }

                  // 构建更新数据 - 保留所有现有字段
                  const updateData: any = {
                    id: existing.id,
                    name: existing.name || contact.name,
                    phoneNumbers: existing.phoneNumbers?.map((p: any) => ({ number: p.number, label: (p.label && p.label !== 'null' && p.label !== 'undefined') ? p.label : 'mobile' })) || [],
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
                    updateData.emails = existing.emails.map((e: any) => ({ email: e.email, label: (e.label && e.label !== 'null' && e.label !== 'undefined') ? e.label : 'home' }));
                  }
                  if (existing.company) updateData.company = existing.company;
                  if (existing.jobTitle) updateData.jobTitle = existing.jobTitle;

                  console.log(`[Sync] Updating ${contact.name} (${contact.phone}): note=${needsNoteUpdate}, avatar=${needsAvatarUpdate}`);
                  await Contacts.updateContactAsync(updateData);
                  syncCount++;
                  console.log(`[Sync] Successfully synced ${contact.name}`);
                } catch (e) {
                  console.warn(`[Sync] Failed to sync ${contact.name}:`, e);
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

  const handleOpenEdit = async (contact: Contact) => {
    setStatusMenuContact(null);
    setEditingContact(contact);
    setEditName(contact.name);
    setEditPhones(contact.phoneNumbers.length > 0 ? [...contact.phoneNumbers] : [contact.phone]);
    setEditAvatarUri(contactAvatars[contact.phone] || contact.image || null);
    // Load full contact details (email, company, jobTitle, note)
    try {
      const fullContact = await Contacts.getContactByIdAsync(contact.deviceContactId);
      if (fullContact) {
        const emails = (fullContact.emails || []).map((e: any) => e.email || '').filter((e: string) => e.length > 0);
        setEditEmails(emails.length > 0 ? emails : []);
        setEditCompany(fullContact.company || '');
        setEditJobTitle(fullContact.jobTitle || '');
        setEditNote(fullContact.note || '');
      }
    } catch {
      setEditEmails([]);
      setEditCompany('');
      setEditJobTitle('');
      setEditNote('');
    }
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

      // Build emails array from the editable list
      const updatedEmails = editEmails
        .map(e => e.trim())
        .filter(e => e.length > 0)
        .map(email => ({ email, label: 'home' as const }));

      // Update device contact directly - pass both name formats for cross-platform compatibility
      console.log('[Contacts] Updating contact:', editingContact.deviceContactId, 'name:', editName.trim(), 'phones:', updatedPhones.length);
      await Contacts.updateContactAsync({
        id: editingContact.deviceContactId,
        name: editName.trim(),
        firstName: editName.trim(),
        lastName: '',
        phoneNumbers: updatedPhones,
        emails: updatedEmails,
        company: editCompany.trim(),
        jobTitle: editJobTitle.trim(),
        note: editNote.trim(),
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

  const handleDeleteContact = () => {
    if (!editingContact) return;

    Alert.alert(
      '删除联系人',
      '是否确认删除该联系人？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. 先从本地设备删除（确保本地一定被删除）
              if (editingContact.deviceContactId) {
                try {
                  await Contacts.removeContactAsync(editingContact.deviceContactId);
                } catch (deviceErr) {
                  console.warn('[Contacts] Failed to remove from device:', deviceErr);
                }
              }

              // 2. 写入 deleted_contacts 表（回收站）
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                for (const phone of editingContact.phoneNumbers) {
                  try {
                    await supabase.from('deleted_contacts').upsert({
                      user_id: user.id,
                      phone: phone,
                      name: editingContact.name,
                      deleted_at: new Date().toISOString(),
                    });
                  } catch (dbErr) {
                    console.warn('[Contacts] Failed to write to deleted_contacts:', dbErr);
                  }
                }
              }

              // 3. 清除本地头像缓存
              if (editingContact.phone && contactAvatars[editingContact.phone]) {
                const newAvatars = { ...contactAvatars };
                delete newAvatars[editingContact.phone];
                setContactAvatars(newAvatars);
              }
              // 4. 从列表移除
              setContacts(prev => prev.filter(c => c.id !== editingContact.id));
              setEditModalVisible(false);
              setEditingContact(null);
              Alert.alert('已删除', '联系人已移入回收站，可在回收站中恢复');
            } catch (error) {
              console.error('Delete contact error:', error);
              Alert.alert('删除失败', '无法删除联系人，请重试');
            }
          },
        },
      ]
    );
  };

  // ========== 批量管理功能 ==========
  const toggleBatchSelection = (contactId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) {
        next.delete(contactId);
      } else {
        next.add(contactId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredContacts.map(c => c.id)));
    }
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    Alert.alert(
      '删除联系人',
      `是否确认删除选中的 ${count} 个联系人？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            try {
              const selectedContacts = contacts.filter(c => selectedIds.has(c.id));
              // Write to deleted_contacts for cloud sync (recycle bin)
              const deleteRecords = selectedContacts
                .filter(c => c.phone)
                .map(c => ({
                  user_id: userId,
                  phone: c.phone || '',
                  name: c.name || '',
                  deleted_at: new Date().toISOString(),
                }));
              if (deleteRecords.length > 0) {
                await supabase.from('deleted_contacts').upsert(deleteRecords, { onConflict: 'user_id,phone' });
              }
              // Remove from device
              for (const c of selectedContacts) {
                if (c.deviceContactId) {
                  try { await Contacts.removeContactAsync(c.deviceContactId); } catch {}
                }
              }
              setContacts(prev => prev.filter(c => !selectedIds.has(c.id)));
              Alert.alert('已删除', `${count} 个联系人已移入回收站`);
              exitBatchMode();
            } catch (error) {
              console.error('Batch delete error:', error);
              Alert.alert('删除失败', '无法删除联系人，请重试');
            }
          },
        },
      ]
    );
  };

  /**
   * 自动捕捉系统通讯录删除的号码并保存到回收站
   * 对比当前设备通讯录与上次保存的快照，将消失的号码自动保存到回收站
   */
  const syncContactsSnapshot = async (currentContacts: Contact[], currentUserId: string) => {
    try {
      // 读取上次保存的快照
      const snapshotStr = await AsyncStorage.getItem('@contacts_snapshot');
      const snapshot: Array<{ name: string; phone: string }> = snapshotStr
        ? JSON.parse(snapshotStr)
        : [];

      console.log(`[SyncSnapshot] 快照中有 ${snapshot.length} 个号码，当前通讯录有 ${currentContacts.length} 个号码`);

      // 构建当前通讯录的号码集合（标准化格式）
      const normalizePhone = (phone: string) => {
        const digits = phone.replace(/\D/g, '');
        if (digits.length === 13 && digits.startsWith('86')) {
          return digits.slice(2);
        }
        return digits;
      };
      const currentPhones = new Set(
        currentContacts
          .map(c => normalizePhone(c.phone))
          .filter(p => p.length > 0)
      );

      console.log(`[SyncSnapshot] 当前通讯录标准化后有 ${currentPhones.size} 个号码`);

      // 找出快照中消失的号码
      const disappearedContacts: Array<{ name: string; phone: string }> = [];
      for (const snapContact of snapshot) {
        const snapPhone = normalizePhone(snapContact.phone);
        if (snapPhone.length > 0 && !currentPhones.has(snapPhone)) {
          console.log(`[SyncSnapshot] 发现消失的号码: ${snapContact.name} (${snapContact.phone})`);
          disappearedContacts.push(snapContact);
        }
      }

      // 将消失的号码保存到回收站
      if (disappearedContacts.length > 0) {
        console.log(`[SyncSnapshot] 共发现 ${disappearedContacts.length} 个消失的号码，保存到回收站`);
        for (const contact of disappearedContacts) {
          try {
            const response = await fetch(`${EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/trash`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-user-id': currentUserId,
              },
              body: JSON.stringify({
                name: contact.name,
                phone: contact.phone,
              }),
            });
            const result = await response.json();
            console.log(`[SyncSnapshot] 保存 ${contact.name} 到回收站:`, result);
          } catch (err) {
            console.error(`[SyncSnapshot] 保存 ${contact.name} 到回收站失败:`, err);
          }
        }
      } else {
        console.log(`[SyncSnapshot] 没有发现消失的号码`);
      }

      // 更新快照为当前通讯录
      const newSnapshot = currentContacts
        .filter(c => c.phone && c.phone !== '(无号码)')
        .map(c => ({ name: c.name, phone: c.phone }));
      await AsyncStorage.setItem('@contacts_snapshot', JSON.stringify(newSnapshot));
      console.log(`[SyncSnapshot] 快照已更新，现在有 ${newSnapshot.length} 个号码`);
    } catch (error) {
      console.error('[SyncSnapshot] 同步快照失败:', error);
    }
  };

  const loadContacts = useCallback(async () => {
    if (!userId) return;

    try {
      // hbyun-contacts: pagination loader optimized for 10k+ records
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
        const devicePageSize = 5000;
        let hasMore = true;
        while (hasMore) {
          const { data: deviceContacts } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Image].filter(
              (f) => f != null && f !== undefined
            ) as Contacts.Fields[],
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
          .map(c => {
            // 保留所有有效号码
            const allPhones = (c.phoneNumbers || []).map(p => (p.number || '').trim()).filter(n => n.length > 0);
            const phone = allPhones[0] || '';
            const localData = allLocalContacts?.find((lc: any) => lc.phone === phone && phone.length > 0);
            return {
              id: (c as any).id,
              deviceContactId: (c as any).id,
              name: c.name || '未知联系人',
              phone: phone || '(无号码)',
              phoneNumbers: allPhones,
              status: localData?.status || null,
              lastContactDate: localData?.last_contact_date,
              image: c.image?.uri ? c.image.uri : ((c as any).photo || null),
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

        // 自动捕捉系统通讯录删除的号码并保存到回收站
        await syncContactsSnapshot(mappedContacts, userId);

        setContacts(finalContacts);
        filterContacts(finalContacts, searchText, activeTab);
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
      // Quick check: does device have any contacts at all?
      const { status: permStatus } = await Contacts.requestPermissionsAsync();
      if (permStatus !== 'granted') {
        setCleanupStats({ duplicate: 0, stopped: 0, suspected: 0 });
        return;
      }
      const { data: deviceCheck } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        pageSize: 1,
        pageOffset: 0,
      });
      if (!deviceCheck || deviceCheck.length === 0) {
        setCleanupStats({ duplicate: 0, stopped: 0, suspected: 0 });
        return;
      }

      // If contacts list is empty but device has contacts, use device contacts for calculation
      const contactList = (contacts && contacts.length > 0) ? contacts : [];

      // Build set of current phone numbers for filtering stale AsyncStorage entries
      // Normalize: strip country code (+86 or 86) if present, keep only digits
      const currentPhones = new Set<string>();
      contactList.forEach(c => {
        if (c.phone) {
          const digits = c.phone.replace(/\D/g, '');
          // Remove country code 86 if the number is 13 digits (86 + 11 digits)
          const normalized = (digits.length === 13 && digits.startsWith('86'))
            ? digits.slice(2)
            : digits;
          currentPhones.add(normalized);
        }
      });

      // Count stopped and suspected_stopped from AsyncStorage, but only for phones in current contacts
      const allKeys = await AsyncStorage.getAllKeys();
      const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
      let stopped = 0;
      let suspected = 0;
      if (statusKeys.length > 0) {
        const statusEntries = await AsyncStorage.multiGet(statusKeys);
        for (const [key, value] of statusEntries) {
          const rawPhone = key.replace('@contact_status_', '');
          const digits = rawPhone.replace(/\D/g, '');
          // Remove country code 86 if the number is 13 digits (86 + 11 digits)
          const phone = (digits.length === 13 && digits.startsWith('86'))
            ? digits.slice(2)
            : digits;
          if (currentPhones.has(phone)) {
            if (value === 'stopped') stopped++;
            else if (value === 'suspected_stopped') suspected++;
          }
        }
      }

      // Count potential duplicates by phone number
      const phoneMap = new Map<string, number>();
      contactList.forEach(c => {
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/community-statuses`);
      if (!response.ok) return;
      const json = await response.json();
      const data = json.statuses || [];
      if (!data.length) return;

      // Build a map: normalized phone -> { status, voteCount }
      const markMap = new Map<string, { status: NumberStatus; voteCount: number }>();
      for (const row of data) {
        if (row.vote_count >= CONSENSUS.MIN_MARKS) {
          // Normalize phone to digits without country code
          const digits = (row.phone || '').replace(/\D/g, '');
          const normalizedPhone = (digits.length === 13 && digits.startsWith('86'))
            ? digits.slice(2)
            : digits;
          if (normalizedPhone) {
            markMap.set(normalizedPhone, {
              status: row.status as NumberStatus,
              voteCount: row.vote_count,
            });
          }
        }
      }

      // Build a phone -> community mark map for easy lookup in render
      // Normalize contact phone the same way for matching
      const phoneCommunityMap = new Map<string, { status: NumberStatus; voteCount: number }>();
      for (const contact of contacts) {
        if (contact.phone) {
          const contactDigits = contact.phone.replace(/\D/g, '');
          const normalizedContactPhone = (contactDigits.length === 13 && contactDigits.startsWith('86'))
            ? contactDigits.slice(2)
            : contactDigits;
          const communityMark = markMap.get(normalizedContactPhone);
          if (communityMark) {
            phoneCommunityMap.set(contact.phone, communityMark);
          }
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
      // Always persist to AsyncStorage first for cross-session durability
      await AsyncStorage.setItem(`@contact_status_${contact.phone}`, newStatus);
      
      // Always update local state immediately
      setContacts(prev => prev.map(c => c.phone === contact.phone ? { ...c, status: newStatus } : c));
      
      // Try to update Supabase (may fail due to RLS, but that's okay)
      try {
        const { data: updatedData, error: updateError } = await supabase
          .from('contacts')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('phone', contact.phone)
          .select();

        if (updateError || !updatedData || updatedData.length === 0) {
          // UPDATE failed or matched 0 rows, try INSERT
          await supabase
            .from('contacts')
            .insert({ user_id: userId, name: contact.name, phone: contact.phone, status: newStatus });
        }
      } catch (dbError) {
        // Supabase operation failed, but local state and AsyncStorage are already updated
        console.warn('Supabase operation failed (RLS or other), local state updated:', (dbError as any)?.message);
      }
      
      // 上传投票到社区
      if (newStatus === 'stopped') {
        await uploadVote(contact.phone, 'stopped');
      } else if (newStatus === 'normal') {
        await uploadVote(contact.phone, 'valid');
      }
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
    } else {
      // 通讯录为0时，清除残留的旧统计数据
      setCleanupStats({ duplicate: 0, stopped: 0, suspected: 0 });
    }
  }, [contacts]);

  // 加载联系人列表（仅首次加载，后续依赖下拉刷新）
  useEffect(() => {
    loadContacts();
    loadContactAvatars();
    loadCommunityVotesCache();
    setInitialLoaded(true);
  }, []);

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
        return { bg: '#FEF0F0', text: '#F56C6C', label: '停用' };
      case 'suspected_stopped':
        return { bg: '#FFF8E6', text: '#E6A23C', label: '疑似停用' };
      default:
        return { bg: '#F5F7FA', text: '#909399', label: '未标记' };
    }
  };

  const getCommunityVoteStyle = (communityStatus: string | null) => {
    switch (communityStatus) {
      case 'confirmed_stopped':
        return { bg: '#FEF0F0', text: '#F56C6C', label: '停用' };
      case 'maybe_stopped':
        return { bg: '#FFF8E6', text: '#E6A23C', label: '疑似停用' };
      default:
        return null;
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const statusStyle = getStatusStyle(item.status);
    const communityVote = communityVotes.get(item.phone);
    const communityVoteStyle = communityVote?.communityStatus ? getCommunityVoteStyle(communityVote.communityStatus) : null;
    const customAvatarUri = contactAvatars[item.phone];
    const totalCount = communityVote ? communityVote.stoppedCount : 0;
    const isSelected = selectedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[styles.contactCard, batchMode && isSelected && { backgroundColor: '#E8F0FE' }]}
        onLongPress={batchMode ? undefined : () => setAvatarMenuContact(item)}
        onPress={batchMode ? () => toggleBatchSelection(item.id) : () => {
          setEditingContact(item);
          setEditName(item.name || '');
          setEditPhones(item.phoneNumbers?.length ? item.phoneNumbers : [item.phone || '']);
          setEditEmails(item.emails?.length ? item.emails : ['']);
          setEditCompany(item.company || '');
          setEditJobTitle(item.jobTitle || '');
          setEditNote(item.note || '');
          setEditAvatarUri(customAvatarUri || item.image || null);
          setEditModalVisible(true);
        }}
      >
        {/* Batch mode checkbox */}
        {batchMode && (
          <View style={[styles.batchCheckbox, isSelected && styles.batchCheckboxSelected]}>
            {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
          </View>
        )}
        {customAvatarUri ? (
          <Image source={{ uri: customAvatarUri }} style={styles.customAvatar} />
        ) : item.image ? (
          <DeviceAvatar uri={item.image} name={item.name} size={44} />
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
          {communityVoteStyle ? (
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
              <TouchableOpacity
                style={styles.badgeGroup}
                activeOpacity={0.7}
                onPress={() => {
                  setVotePanelContact(item);
                  setVotePanelVisible(true);
                  // 获取实时社区状态
                  fetchNumberStatus(item.phone);
                }}
              >
                <Text style={styles.badgeLabel}>社区</Text>
                <View style={[styles.statusBadge, { backgroundColor: communityVoteStyle.bg }]}>
                  <Text style={[styles.statusText, { color: communityVoteStyle.text }]}>
                    {totalCount}人标记{communityVoteStyle.label}
                  </Text>
                </View>
              </TouchableOpacity>
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
          {batchMode ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={exitBatchMode} style={{ marginRight: 8 }}>
                  <Ionicons name="close" size={24} color="#4A90D9" />
                </TouchableOpacity>
                <Text style={styles.title}>批量管理</Text>
                <Text style={styles.titleCount}> (已选 {selectedIds.size})</Text>
              </View>
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={styles.syncTextButton}
                  onPress={toggleSelectAll}
                >
                  <Text style={styles.syncTextButtonText}>
                    {selectedIds.size === filteredContacts.length && filteredContacts.length > 0 ? '取消全选' : '全选'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={styles.title}>通讯录</Text>
                <Text style={styles.titleCount}> ({filteredContacts.length})</Text>
              </View>
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={styles.syncTextButton}
                  onPress={() => setBatchMode(true)}
                >
                  <Text style={styles.syncTextButtonText}>批量管理</Text>
                </TouchableOpacity>
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
            </>
          )}
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
          {searchText.length > 0 && (
            <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={18} color="#C0C4CC" />
            </TouchableOpacity>
          )}
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
                onPress={() => router.push('/recycle-bin')}
                activeOpacity={0.8}
                style={styles.recycleBinPillWrapper}
              >
                <Image
                  source={require('@/assets/trash_pill.jpg')}
                  style={styles.recycleBinPillImage}
                  resizeMode="cover"
                />
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
      <Overlay visible={infoModalVisible} onClose={() => setInfoModalVisible(false)}>
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
              <Text style={{ fontWeight: '600' }}>停用</Text>：号码已确认停用或空号
            </Text>
          </View>
          <View style={styles.infoItem}>
            <View style={[styles.infoDot, { backgroundColor: '#E6A23C' }]} />
            <Text style={styles.infoText}>
              <Text style={{ fontWeight: '600' }}>疑似停用</Text>：号码可能已停用，建议核实
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
      </Overlay>

      {/* 状态选择菜单 */}
      <Overlay visible={statusMenuContact !== null} onClose={() => setStatusMenuContact(null)}>
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
            <Text style={[styles.statusMenuOptionText, { color: '#F56C6C' }]}>停用</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statusMenuCancel}
            onPress={() => setStatusMenuContact(null)}
          >
            <Text style={styles.statusMenuCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </Overlay>

      {/* 头像设置菜单 */}
      <Overlay visible={avatarMenuContact !== null} onClose={() => setAvatarMenuContact(null)}>
        <View style={styles.statusMenuCard}>
          <Text style={styles.statusMenuTitle}>
            {contactAvatars[avatarMenuContact?.phone ?? ''] ? '管理头像' : '设置头像'}
          </Text>
          <Text style={styles.statusMenuContactName}>
            {avatarMenuContact?.name} ({avatarMenuContact?.phone})
          </Text>
          <TouchableOpacity
            style={[styles.statusMenuOption, { backgroundColor: '#E8F0FE' }]}
            onPress={() => avatarMenuContact && handleSetAvatar(avatarMenuContact)}
          >
            <Ionicons name="camera" size={20} color="#4A90D9" />
            <Text style={[styles.statusMenuOptionText, { color: '#4A90D9' }]}>
              {contactAvatars[avatarMenuContact?.phone ?? ''] ? '更换头像' : '设置头像'}
            </Text>
          </TouchableOpacity>
          {contactAvatars[avatarMenuContact?.phone ?? ''] && (
            <TouchableOpacity
              style={[styles.statusMenuOption, { backgroundColor: '#FEF0F0' }]}
              onPress={() => avatarMenuContact && handleRemoveAvatar(avatarMenuContact)}
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
      </Overlay>

      {/* 编辑联系人弹窗 */}
      <Overlay visible={editModalVisible} onClose={() => setEditModalVisible(false)}>
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

            {/* 邮箱 */}
            <Text style={[styles.editLabel, { marginTop: 16 }]}>邮箱</Text>
            {editEmails.map((email, index) => (
              <View key={`email-${index}`} style={styles.editPhoneRow}>
                <TextInput
                  style={[styles.editInput, { flex: 1 }]}
                  value={email}
                  onChangeText={(text) => {
                    const updated = [...editEmails];
                    updated[index] = text;
                    setEditEmails(updated);
                  }}
                  placeholder="请输入邮箱"
                  placeholderTextColor="#B2BEC3"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {editEmails.length > 1 && (
                  <TouchableOpacity
                    style={styles.editPhoneDeleteBtn}
                    onPress={() => {
                      const updated = editEmails.filter((_, i) => i !== index);
                      setEditEmails(updated);
                    }}
                  >
                    <Ionicons name="close-circle" size={22} color="#F56C6C" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={styles.editPhoneAddBtn}
              onPress={() => setEditEmails([...editEmails, ''])}
            >
              <Ionicons name="add-circle-outline" size={20} color="#4A90D9" />
              <Text style={styles.editPhoneAddText}>添加邮箱</Text>
            </TouchableOpacity>

            {/* 公司 */}
            <Text style={[styles.editLabel, { marginTop: 16 }]}>公司</Text>
            <TextInput
              style={styles.editInput}
              value={editCompany}
              onChangeText={setEditCompany}
              placeholder="请输入公司名称"
              placeholderTextColor="#B2BEC3"
            />

            {/* 职位 */}
            <Text style={[styles.editLabel, { marginTop: 16 }]}>职位</Text>
            <TextInput
              style={styles.editInput}
              value={editJobTitle}
              onChangeText={setEditJobTitle}
              placeholder="请输入职位"
              placeholderTextColor="#B2BEC3"
            />

            {/* 备注 */}
            <Text style={[styles.editLabel, { marginTop: 16 }]}>备注</Text>
            <TextInput
              style={[styles.editInput, { minHeight: 80, textAlignVertical: 'top' }]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="请输入备注"
              placeholderTextColor="#B2BEC3"
              multiline
            />
          </ScrollView>
          <View style={styles.editModalFooter}>
            {/* 第一行：删除联系人（全宽） */}
            <TouchableOpacity
              style={styles.editDeleteButton}
              onPress={handleDeleteContact}
            >
              <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
              <Text style={styles.editDeleteText}>删除联系人</Text>
            </TouchableOpacity>
            {/* 第二行：取消 + 保存 */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
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
      </Overlay>

      {/* 社区投票面板 */}
      <Overlay visible={votePanelVisible && votePanelContact !== null} onClose={() => setVotePanelVisible(false)}>
        <View style={styles.votePanelCard}>
          <View style={styles.votePanelHeader}>
            <Text style={styles.votePanelTitle}>号码状态投票</Text>
            <TouchableOpacity onPress={() => setVotePanelVisible(false)}>
              <Ionicons name="close" size={24} color="#909399" />
            </TouchableOpacity>
          </View>
          <View style={styles.votePanelInfo}>
            <Text style={styles.votePanelContactName}>{votePanelContact?.name}</Text>
            <Text style={styles.votePanelPhone}>{votePanelContact?.phone}</Text>
          </View>
          {(() => {
            const vote = votePanelContact ? communityVotes.get(votePanelContact.phone) : null;
            if (vote && vote.stoppedCount > 0) {
              const statusLabel = vote.communityStatus === 'stopped' ? '社区判定：已失效'
                : vote.communityStatus === 'suspected' ? '社区判定：疑似停用'
                : '社区判定：正常';
              const statusColor = vote.communityStatus === 'stopped' ? '#F56C6C'
                : vote.communityStatus === 'suspected' ? '#E6A23C'
                : '#67C23A';
              return (
                <View style={styles.votePanelSummary}>
                  <Text style={styles.votePanelSummaryTitle}>社区投票结果</Text>
                  <View style={styles.votePanelSummaryRow}>
                    <Text style={[styles.votePanelSummaryText, { color: '#F56C6C' }]}>
                      标记停用: {vote.stoppedCount}人
                    </Text>
                  </View>
                  <View style={{ marginTop: 6, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: statusColor + '15', borderRadius: 6, alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
                  </View>
                </View>
              );
            }
            return (
              <View style={styles.votePanelSummary}>
                <Text style={[styles.votePanelSummaryText, { color: '#909399', textAlign: 'center' }]}>暂无社区投票数据</Text>
              </View>
            );
          })()}
          <View style={styles.votePanelOptions}>
            <Text style={styles.votePanelOptionsTitle}>你的投票</Text>
            <TouchableOpacity
              style={[styles.votePanelOption, { backgroundColor: '#FEF0F0' }]}
              onPress={async () => {
                if (votePanelContact) {
                  await updateContactStatus(votePanelContact, 'stopped');
                }
                setVotePanelVisible(false);
              }}
            >
              <Ionicons name="close-circle" size={22} color="#F56C6C" />
              <View style={styles.votePanelOptionText}>
                <Text style={[styles.votePanelOptionTitle, { color: '#F56C6C' }]}>停用</Text>
                <Text style={styles.votePanelOptionDesc}>该号码已停用/空号</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.votePanelOption, { backgroundColor: '#E7F7E7' }]}
              onPress={async () => {
                if (votePanelContact) {
                  await updateContactStatus(votePanelContact, 'normal');
                }
                setVotePanelVisible(false);
              }}
            >
              <Ionicons name="checkmark-circle" size={22} color="#67C23A" />
              <View style={styles.votePanelOptionText}>
                <Text style={[styles.votePanelOptionTitle, { color: '#67C23A' }]}>号码有效</Text>
                <Text style={styles.votePanelOptionDesc}>撤回之前的停用标记</Text>
              </View>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.statusMenuCancel}
            onPress={() => setVotePanelVisible(false)}
          >
            <Text style={styles.statusMenuCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </Overlay>

      {/* Batch Mode Action Bar */}
      {batchMode && (
        <View style={styles.batchActionBar}>
          <Text style={styles.batchActionBarCount}>已选 {selectedIds.size} 个</Text>
          <View style={styles.batchActionBarButtons}>
            <TouchableOpacity style={styles.batchActionBarCancelBtn} onPress={exitBatchMode}>
              <Text style={styles.batchActionBarCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.batchActionBarDeleteBtn, selectedIds.size === 0 && { opacity: 0.5 }]}
              onPress={handleBatchDelete}
              disabled={selectedIds.size === 0}
            >
              <Ionicons name="trash" size={18} color="#FFF" />
              <Text style={styles.batchActionBarDeleteText}>删除</Text>
            </TouchableOpacity>
          </View>
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#E8F0FE',
  },
  syncTextButtonText: {
    fontSize: 13,
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
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  editDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F56C6C',
  },
  editDeleteText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 6,
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
    width: 52,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F56C6C',
    shadowColor: '#F56C6C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  // 3D Capsule Recycle Bin Button Styles
  recycleBinPillWrapper: {
    width: 64,
    height: 32,
    borderRadius: 16,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  recycleBinPillImage: {
    width: 64,
    height: 32,
    borderRadius: 16,
  },
  _pillLeft_unused: {
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
  // 投票面板样式
  votePanelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '88%',
    maxWidth: 380,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  votePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  votePanelTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  votePanelInfo: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  votePanelContactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  votePanelPhone: {
    fontSize: 14,
    color: '#606266',
    marginTop: 4,
  },
  votePanelSummary: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
  },
  votePanelSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#606266',
    marginBottom: 8,
  },
  votePanelSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  votePanelSummaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  votePanelOptions: {
    marginBottom: 12,
  },
  votePanelOptionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#606266',
    marginBottom: 10,
  },
  votePanelOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  votePanelOptionText: {
    marginLeft: 12,
    flex: 1,
  },
  votePanelOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  votePanelOptionDesc: {
    fontSize: 12,
    color: '#909399',
    marginTop: 2,
  },
  // Batch Mode
  batchCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#DCDFE6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  batchCheckboxSelected: {
    backgroundColor: '#409EFF',
    borderColor: '#409EFF',
  },
  batchActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEEF5',
    paddingBottom: 34,
  },
  batchActionBarCount: {
    fontSize: 15,
    color: '#303133',
    fontWeight: '500',
  },
  batchActionBarButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  batchActionBarCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
  },
  batchActionBarCancelText: {
    fontSize: 14,
    color: '#606266',
  },
  batchActionBarDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F56C6C',
    gap: 4,
  },
  batchActionBarDeleteText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
});
