import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getBackendBaseUrl } from '@/utils';

interface StoppedContact {
  id: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  label: string;
  authenticatedName?: string;
}

const STATUS_LABELS: Record<string, string> = {
  stopped: '确认失效',
  suspected_stopped: '可能失效',
};

const STATUS_COLORS: Record<string, string> = {
  stopped: '#EF4444',
  suspected_stopped: '#F97316',
};

// Normalize phone to digits without country code
const normalizePhone = (rawPhone: string): string => {
  const digits = rawPhone.replace(/\D/g, '');
  return (digits.length === 13 && digits.startsWith('86')) ? digits.slice(2) : digits;
};

export default function StoppedContactsScreen() {
  const router = useSafeRouter();
  const { status } = useSafeSearchParams<{ status: string }>();
  const { user } = useAuth();
  const [contacts, setContacts] = useState<StoppedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // 号码状态对话框状态
  const [statusDialogVisible, setStatusDialogVisible] = useState(false);
  const [statusDialogPhone, setStatusDialogPhone] = useState('');
  const [statusDialogData, setStatusDialogData] = useState<{
    phone: string;
    name?: string;
    status: string;
    stopped_votes: number;
    normal_votes: number;
    authenticated_name?: string;
    authenticated_at?: string;
    expires_at?: string;
    is_authenticated: boolean;
  } | null>(null);
  const [statusDialogLoading, setStatusDialogLoading] = useState(false);

  // Safely resolve status - default to 'stopped' if invalid
  const validStatus = (status === 'stopped' || status === 'suspected_stopped') ? status : 'stopped';
  const label = STATUS_LABELS[validStatus] || '失效';
  const color = STATUS_COLORS[validStatus] || '#6B7280';
  const isPossiblyInvalid = validStatus === 'suspected_stopped';

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

      // Fetch community statuses from backend API (same source as fetchCleanupStats count)
      const communityStatusMap = new Map<string, string>();
      const communityNameMap = new Map<string, string>();
      const authenticatedPhones = new Set<string>();
      try {
        const response = await fetch(`${getBackendBaseUrl()}/api/v1/community-statuses`);
        if (response.ok) {
          const json = await response.json();
          const statuses = json.statuses || [];
          for (const row of statuses) {
            const normalized = normalizePhone(row.phone || '');
            if (normalized) {
              // Skip authenticated numbers - they should not appear in possibly-invalid list
              if (row.authenticated_name) {
                authenticatedPhones.add(normalized);
                communityNameMap.set(normalized, row.authenticated_name);
                continue; // Don't add to communityStatusMap
              }
              if (row.status === 'confirmed_invalid') {
                communityStatusMap.set(normalized, 'stopped');
              } else if (row.status === 'possibly_invalid') {
                communityStatusMap.set(normalized, 'suspected_stopped');
              }
            }
          }
        }
      } catch (apiError) {
        console.warn('Failed to fetch community statuses:', apiError);
      }

      const result: StoppedContact[] = [];
      for (const contact of allContacts) {
        if (!contact.phoneNumbers || contact.phoneNumbers.length === 0) continue;
        const rawPhone = contact.phoneNumbers[0].number || '';
        if (!rawPhone) continue;

        const normalized = normalizePhone(rawPhone);

        try {
          // Check AsyncStorage first (using both raw phone and normalized phone)
          let storedLabel = await AsyncStorage.getItem(`@contact_status_${rawPhone}`);
          if (!storedLabel && normalized && normalized !== rawPhone) {
            storedLabel = await AsyncStorage.getItem(`@contact_status_${normalized}`);
          }
          // Fall back to community status if no local status
          const finalLabel = storedLabel || (normalized ? communityStatusMap.get(normalized) : null);

          // Skip authenticated numbers from possibly-invalid list (Fix 1)
          const isAuth = normalized && authenticatedPhones.has(normalized);
          if (finalLabel === validStatus && !(validStatus === 'suspected_stopped' && isAuth)) {
            result.push({
              id: contact.id || normalized || rawPhone,
              name: contact.name || '未知联系人',
              phone: rawPhone,
              normalizedPhone: normalized,
              label: finalLabel,
              authenticatedName: normalized ? communityNameMap.get(normalized) : undefined,
            });
          }
        } catch (storageError) {
          console.warn('AsyncStorage read failed for', rawPhone, storageError);
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

  /**
   * 确认停用：投一票 stopped，本地状态改为 stopped，从可能失效列表移除
   * 服务端文件：server/src/routes/votes.ts
   * 接口：POST /api/v1/votes
   * Body 参数：phone: string, vote_type: 'stopped' | 'suspected_stopped'
   */
  const handleConfirmStopped = useCallback(async (item: StoppedContact) => {
    Alert.alert(
      '确认停用',
      `确认将 ${item.name}（${item.phone}）标记为「确认失效」？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认停用',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(item.id);
            try {
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (user?.id) headers['x-user-id'] = user.id;

              // Vote stopped via backend API
              await fetch(`${getBackendBaseUrl()}/api/v1/votes`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ phone: item.normalizedPhone, vote_type: 'stopped' }),
              }).catch(() => { /* Silently fail if backend is unavailable */ });

              // Update local status to stopped
              await AsyncStorage.setItem(`@contact_status_${item.normalizedPhone}`, 'stopped');

              // Remove from current list
              setContacts(prev => prev.filter(c => c.id !== item.id));
              Alert.alert('已标记', `${item.name} 已标记为「确认失效」`);
            } catch (error) {
              console.error('Failed to confirm stopped:', error);
              Alert.alert('错误', '操作失败，请重试');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ]
    );
  }, [user]);

  /**
   * 换机主：跳转到认证页面
   */
  const handleChangeOwner = useCallback((item: StoppedContact) => {
    router.push('/number-authenticate', {
      phone: item.normalizedPhone,
      name: item.name,
      displayPhone: item.phone,
    });
  }, [router]);

  /**
   * 显示号码状态对话框
   * 服务端文件：server/src/routes/number-status.ts
   * 接口：GET /api/v1/number-status/:phone
   */
  const handleShowNumberStatus = useCallback(async (item: StoppedContact) => {
    setStatusDialogPhone(item.phone);
    setStatusDialogData(null);
    setStatusDialogVisible(true);
    setStatusDialogLoading(true);
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/number-status/${encodeURIComponent(item.normalizedPhone)}`);
      if (response.ok) {
        const json = await response.json();
        setStatusDialogData({
          phone: json.phone || item.phone,
          name: json.name || item.name,
          status: json.status || 'unknown',
          stopped_votes: json.stopped_count ?? 0,
          normal_votes: json.normal_count ?? 0,
          authenticated_name: json.authenticated_name || undefined,
          authenticated_at: json.authenticated_at || undefined,
          expires_at: json.expires_at || undefined,
          is_authenticated: json.is_authenticated ?? false,
        });
      } else {
        setStatusDialogData({
          phone: item.phone,
          name: item.name,
          status: 'unknown',
          stopped_votes: 0,
          normal_votes: 0,
          is_authenticated: false,
        });
      }
    } catch (error) {
      console.error('Failed to fetch number status:', error);
      setStatusDialogData({
        phone: item.phone,
        name: item.name,
        status: 'error',
        stopped_votes: 0,
        normal_votes: 0,
        is_authenticated: false,
      });
    } finally {
      setStatusDialogLoading(false);
    }
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const unselectedCount = contacts.length - selectedIds.size;
    if (unselectedCount === 0) {
      Alert.alert('提示', '所有号码都已选中保留，没有要删除的号码');
      return;
    }

    Alert.alert(
      '确认删除',
      `将保留 ${selectedIds.size} 个号码，删除其余 ${unselectedCount} 个${label}号码？此操作不可撤销。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确认删除',
          style: 'destructive',
          onPress: async () => {
            try {
              const toDelete = contacts.filter(c => !selectedIds.has(c.id));
              let successCount = 0;
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (user?.id) headers['x-user-id'] = user.id;

              if (user?.id && toDelete.length > 0) {
                const phones = toDelete.map(c => c.phone).filter(Boolean);
                const names = toDelete.map(c => c.name || '');
                if (phones.length > 0) {
                  await fetch(`${getBackendBaseUrl()}/api/v1/contacts/batch-delete`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ phones, names }),
                  }).catch(() => { /* Silently fail */ });
                }
              }

              for (const contact of toDelete) {
                try {
                  if (contact.id && !contact.id.startsWith('@')) {
                    await Contacts.removeContactAsync(contact.id).catch(() => { /* skip */ });
                  }
                  await AsyncStorage.removeItem(`@contact_status_${contact.phone}`);
                  await AsyncStorage.removeItem(`@contact_status_${contact.normalizedPhone}`);
                  successCount++;
                } catch (itemError) {
                  console.warn('Failed to delete contact:', contact.name, itemError);
                }
              }
              Alert.alert('完成', `已保留 ${selectedIds.size} 个，删除 ${successCount} 个${label}号码`);
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
  }, [contacts, selectedIds, label, user, loadContacts]);

  const renderItem = ({ item }: { item: StoppedContact }) => {
    const isSelected = selectedIds.has(item.id);
    const isLoading = actionLoading === item.id;

    return (
      <View style={[styles.card, isSelected && { backgroundColor: '#FEF2F2' }]}>
        {/* 只有点击复选框才能选中 */}
        <TouchableOpacity
          style={styles.cardLeft}
          onPress={() => toggleSelect(item.id)}
          activeOpacity={0.7}
        >
          <View style={[styles.checkbox, isSelected && { backgroundColor: color, borderColor: color }]}>
            {isSelected && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>

        {/* 姓名/号码区域不触发选中 */}
        <View style={styles.cardContent}>
          <View style={styles.cardNameRow}>
            <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
            {item.authenticatedName ? (
              <View style={styles.authBadge}>
                <Ionicons name="person-outline" size={10} color="#6366F1" />
                <Text style={styles.authBadgeText}>{item.authenticatedName}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardPhone}>{item.phone}</Text>

          {/* Action buttons for possibly invalid numbers - 3 buttons evenly distributed */}
          {isPossiblyInvalid && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonFlex, styles.confirmBtn]}
                onPress={() => handleConfirmStopped(item)}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Ionicons name="alert-circle-outline" size={12} color="#EF4444" />
                    <Text style={styles.confirmBtnText} numberOfLines={1}>确认停用</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonFlex, styles.changeOwnerBtn]}
                onPress={() => handleChangeOwner(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-circle-outline" size={12} color="#6366F1" />
                <Text style={styles.changeOwnerBtnText} numberOfLines={1}>已换机主</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonFlex, styles.statusBtn]}
                onPress={() => handleShowNumberStatus(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={12} color="#10B981" />
                <Text style={styles.statusBtnText} numberOfLines={1}>号码状态</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.statusBadge, { backgroundColor: `${color}18` }]}>
          <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{label}号码</Text>
        <View style={styles.headerRight}>
          {isPossiblyInvalid && (
            <TouchableOpacity onPress={() => router.push('/authenticated-numbers')} style={styles.authLinkBtn}>
              <Ionicons name="shield-checkmark-outline" size={18} color="#10B981" />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
            <Text style={styles.selectAllText}>
              {selectedIds.size === contacts.length && contacts.length > 0 ? '取消全选' : '全选'}
            </Text>
          </TouchableOpacity>
        </View>
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
          <View style={styles.bottomBarButtons}>
            {/* Batch delete selected */}
            <TouchableOpacity
              style={[styles.batchBtn, { backgroundColor: color }]}
              onPress={() => {
                const selectedCount = selectedIds.size;
                Alert.alert(
                  '批量删除',
                  `确认从通讯录中删除选中的 ${selectedCount} 个号码？`,
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '确认删除',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const toDelete = contacts.filter(c => selectedIds.has(c.id));
                          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
                          if (user?.id) headers['x-user-id'] = user.id;

                          if (user?.id && toDelete.length > 0) {
                            const phones = toDelete.map(c => c.phone).filter(Boolean);
                            const names = toDelete.map(c => c.name || '');
                            if (phones.length > 0) {
                              await fetch(`${getBackendBaseUrl()}/api/v1/contacts/batch-delete`, {
                                method: 'POST',
                                headers,
                                body: JSON.stringify({ phones, names }),
                              }).catch(() => { /* Silently fail */ });
                            }
                          }

                          for (const contact of toDelete) {
                            try {
                              if (contact.id && !contact.id.startsWith('@')) {
                                await Contacts.removeContactAsync(contact.id).catch(() => { /* skip */ });
                              }
                              await AsyncStorage.removeItem(`@contact_status_${contact.phone}`);
                              await AsyncStorage.removeItem(`@contact_status_${contact.normalizedPhone}`);
                            } catch {}
                          }
                          setSelectedIds(new Set());
                          loadContacts();
                        } catch (error) {
                          Alert.alert('错误', '删除失败');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.batchBtnText}>删除选中 ({selectedIds.size})</Text>
            </TouchableOpacity>

            {/* Batch restore selected */}
            <TouchableOpacity
              style={[styles.batchBtn, { backgroundColor: '#10B981' }]}
              onPress={() => {
                const selectedCount = selectedIds.size;
                Alert.alert(
                  '批量恢复',
                  `确认将选中的 ${selectedCount} 个号码恢复正常状态？将清除本地标记。`,
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '确认恢复',
                      onPress: async () => {
                        try {
                          const toRestore = contacts.filter(c => selectedIds.has(c.id));
                          for (const contact of toRestore) {
                            await AsyncStorage.removeItem(`@contact_status_${contact.phone}`);
                            await AsyncStorage.removeItem(`@contact_status_${contact.normalizedPhone}`);
                          }
                          setSelectedIds(new Set());
                          loadContacts();
                        } catch (error) {
                          Alert.alert('错误', '恢复失败');
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Ionicons name="refresh-outline" size={16} color="#fff" />
              <Text style={styles.batchBtnText}>恢复选中 ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>

          {/* Delete unselected - only for possibly-invalid list (Fix 4) */}
          {validStatus === 'suspected_stopped' && contacts.length - selectedIds.size > 0 && (
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: '#6B7280' }]} onPress={handleDeleteSelected}>
              <Ionicons name="close-circle-outline" size={16} color="#fff" />
              <Text style={styles.deleteBtnText}>删除未选中 ({contacts.length - selectedIds.size})</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Status Dialog */}
      {statusDialogVisible && (
        <View style={styles.statusDialogOverlay}>
          <View style={styles.statusDialogContent}>
            <View style={styles.statusDialogHeader}>
              <Text style={styles.statusDialogTitle}>号码状态</Text>
              <TouchableOpacity onPress={() => setStatusDialogVisible(false)} style={styles.statusDialogClose}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {statusDialogLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={{ marginTop: 10, color: '#6B7280', fontSize: 13 }}>查询中...</Text>
              </View>
            ) : statusDialogData ? (
              <View>
                <View style={styles.statusDialogRow}>
                  <Text style={styles.statusDialogLabel}>号码</Text>
                  <Text style={styles.statusDialogValue}>{statusDialogData.phone}</Text>
                </View>
                <View style={styles.statusDialogRow}>
                  <Text style={styles.statusDialogLabel}>姓名</Text>
                  <Text style={styles.statusDialogValue}>{statusDialogData.name || '-'}</Text>
                </View>
                <View style={styles.statusDialogRow}>
                  <Text style={styles.statusDialogLabel}>社区状态</Text>
                  <Text style={styles.statusDialogValue}>
                    {statusDialogData.status === 'possibly_invalid' ? '可能失效' :
                     statusDialogData.status === 'stopped' ? '已确认停用' :
                     statusDialogData.status === 'normal' ? '正常' :
                     statusDialogData.status === 'error' ? '查询失败' : '未知'}
                  </Text>
                </View>
                <View style={styles.statusDialogRow}>
                  <Text style={styles.statusDialogLabel}>投票停用</Text>
                  <Text style={styles.statusDialogValueStopped}>{statusDialogData.stopped_votes} 人</Text>
                </View>
                <View style={styles.statusDialogRow}>
                  <Text style={styles.statusDialogLabel}>投票正常</Text>
                  <Text style={styles.statusDialogValueNormal}>{statusDialogData.normal_votes} 人</Text>
                </View>
                {statusDialogData.is_authenticated && (
                  <View style={styles.statusDialogRow}>
                    <Text style={styles.statusDialogLabel}>认证状态</Text>
                    <Text style={styles.statusDialogValueNormal}>已认证</Text>
                  </View>
                )}
                {statusDialogData.authenticated_name && (
                  <View style={styles.statusDialogRow}>
                    <Text style={styles.statusDialogLabel}>认证人</Text>
                    <Text style={styles.statusDialogValue}>{statusDialogData.authenticated_name}</Text>
                  </View>
                )}
                {statusDialogData.authenticated_at && (
                  <View style={styles.statusDialogRow}>
                    <Text style={styles.statusDialogLabel}>认证时间</Text>
                    <Text style={styles.statusDialogValue}>
                      {new Date(statusDialogData.authenticated_at).toLocaleDateString('zh-CN')}
                    </Text>
                  </View>
                )}
                {statusDialogData.expires_at && (
                  <View style={styles.statusDialogRow}>
                    <Text style={styles.statusDialogLabel}>有效期至</Text>
                    <Text style={styles.statusDialogValue}>
                      {new Date(statusDialogData.expires_at).toLocaleDateString('zh-CN')}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  authLinkBtn: { padding: 4 },
  selectAllBtn: { padding: 4 },
  selectAllText: { fontSize: 14, color: '#636E72', fontWeight: '500' },
  summaryBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderRadius: 12 },
  summaryDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  summaryText: { fontSize: 13, color: '#6B7280' },
  centerState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  centerText: { fontSize: 14, color: '#6B7280', marginTop: 12 },
  card: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  cardLeft: { paddingTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  cardContent: { flex: 1, marginLeft: 12 },
  cardNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2, gap: 6 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  authBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, gap: 3 },
  authBadgeText: { fontSize: 11, color: '#6366F1', fontWeight: '500' },
  cardPhone: { fontSize: 13, color: '#6B7280' },
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6, borderRadius: 8, gap: 3 },
  actionButtonFlex: { flex: 1 },
  confirmBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  confirmBtnText: { fontSize: 11, fontWeight: '600', color: '#EF4444' },
  changeOwnerBtn: { backgroundColor: '#EEF2FF', borderWidth: 1, borderColor: '#C7D2FE' },
  changeOwnerBtnText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
  statusBtn: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' },
  statusBtnText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginLeft: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  // Status dialog styles
  statusDialogOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  statusDialogContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginHorizontal: 32, minWidth: 280, maxWidth: 340 },
  statusDialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  statusDialogTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  statusDialogClose: { padding: 4 },
  statusDialogRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  statusDialogLabel: { fontSize: 13, color: '#6B7280' },
  statusDialogValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  statusDialogValueStopped: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  statusDialogValueNormal: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 16, paddingBottom: 32 },
  bottomBarButtons: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  batchBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  batchBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  deleteBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
});
