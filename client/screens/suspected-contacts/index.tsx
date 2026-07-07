import React, { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { getBackendBaseUrl } from '@/utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { maskName } from '@/utils/name-mask';
import ContactAvatar from '@/components/ContactAvatar';

interface SuspectedContact {
  id: string;
  name: string;
  phone: string;
  stoppedCount: number;
  communityStatus: string;
}

export default function SuspectedContactsScreen() {
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const [contacts, setContacts] = useState<SuspectedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Authenticate modal state
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authContact, setAuthContact] = useState<SuspectedContact | null>(null);
  const [authName, setAuthName] = useState('');
  const [authSaving, setAuthSaving] = useState(false);

  const fetchSuspectedContacts = useCallback(async () => {
    try {
      // Read community votes cache
      const json = await AsyncStorage.getItem('@community_votes_cache');
      if (!json) {
        setContacts([]);
        setLoading(false);
        return;
      }

      const data = JSON.parse(json);
      const suspected: SuspectedContact[] = [];

      for (const item of data) {
        if (item.stopped_count > 0 && (item.community_status === 'maybe_stopped' || item.community_status === 'confirmed_stopped')) {
          // Try to find contact name from local cache
          const contactNameMap = await AsyncStorage.getItem('@contact_name_map');
          let name = '未知';
          if (contactNameMap) {
            const nameMap = JSON.parse(contactNameMap);
            name = nameMap[item.phone] || '未知';
          }

          suspected.push({
            id: `suspected_${item.phone}`,
            name,
            phone: item.phone,
            stoppedCount: item.stopped_count,
            communityStatus: item.community_status,
          });
        }
      }

      // Sort by stopped count descending
      suspected.sort((a, b) => b.stoppedCount - a.stoppedCount);
      setContacts(suspected);
    } catch (error) {
      console.warn('Failed to fetch suspected contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSuspectedContacts();
    }, [fetchSuspectedContacts])
  );

  // Confirm stopped: vote "stopped" via API
  const handleConfirmStopped = async (contact: SuspectedContact) => {
    if (!userId) return;
    try {
      /**
       * 服务端文件：server/src/routes/votes.ts
       * 接口：POST /api/v1/votes
       * Body 参数：phone: string, vote: string ('stopped')
       */
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/votes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ phone: contact.phone, vote: 'stopped' }),
      });

      if (response.ok) {
        await AsyncStorage.setItem(`@contact_status_${contact.phone}`, 'stopped');
        Alert.alert('确认', '已确认该号码已停用');
        fetchSuspectedContacts();
      } else {
        const err = await response.json().catch(() => ({}));
        Alert.alert('错误', (err as any).error || '投票失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络错误，请稍后重试');
    }
  };

  // Authenticate as normal: call authenticate API with masked name
  const handleAuthenticateNormal = (contact: SuspectedContact) => {
    setAuthContact(contact);
    setAuthName('');
    setAuthModalVisible(true);
  };

  const handleAuthSubmit = async () => {
    if (!authContact || !userId) return;
    if (!authName.trim()) {
      Alert.alert('提示', '请输入您的姓名用于验证');
      return;
    }

    setAuthSaving(true);
    try {
      const maskedNameValue = maskName(authName.trim());
      /**
       * 服务端文件：server/src/routes/authenticate.ts
       * 接口：POST /api/v1/authenticate
       * Body 参数：phone: string, user_name: string
       */
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          phone: authContact.phone,
          user_name: maskedNameValue,
        }),
      });

      if (response.ok) {
        await AsyncStorage.setItem(`@contact_status_${authContact.phone}`, 'normal');
        setAuthModalVisible(false);
        Alert.alert('认证成功', '已标记该号码为正常状态');
        fetchSuspectedContacts();
      } else {
        const err = await response.json().catch(() => ({}));
        Alert.alert('错误', (err as any).error || '认证失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setAuthSaving(false);
    }
  };

  const renderContact = ({ item }: { item: SuspectedContact }) => {
    const isConfirmed = item.communityStatus === 'confirmed_stopped';
    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <ContactAvatar name={item.name} size={44} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardPhone}>{item.phone}</Text>
            <View style={styles.cardBadge}>
              <Ionicons
                name={isConfirmed ? 'warning' : 'alert-circle'}
                size={14}
                color={isConfirmed ? '#F56C6C' : '#E6A23C'}
              />
              <Text style={[styles.cardBadgeText, { color: isConfirmed ? '#F56C6C' : '#E6A23C' }]}>
                {item.stoppedCount}人标记{isConfirmed ? '已失效' : '疑似停用'}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.btnConfirm}
            onPress={() => handleConfirmStopped(item)}
          >
            <Text style={styles.btnConfirmText}>确认停用</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.btnAuth}
            onPress={() => handleAuthenticateNormal(item)}
          >
            <Ionicons name="shield-checkmark" size={16} color="#4A90D9" />
            <Text style={styles.btnAuthText}>认证正常</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>可能失效</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4A90D9" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>可能失效</Text>
        <Text style={styles.headerSubtitle}>
          {contacts.length > 0 ? `${contacts.length} 个号码被社区标记` : '暂无疑似失效号码'}
        </Text>
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        renderItem={renderContact}
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          fetchSuspectedContacts();
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#67C23A" />
            <Text style={styles.emptyText}>所有号码状态正常</Text>
            <Text style={styles.emptyHint}>社区未检测到疑似失效号码</Text>
          </View>
        }
      />

      {/* Authenticate Modal */}
      <Modal visible={authModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>认证号码正常</Text>
                <TouchableOpacity onPress={() => setAuthModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#909399" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.authInfoCard}>
                  <Text style={styles.authInfoLabel}>认证号码</Text>
                  <Text style={styles.authInfoValue}>{authContact?.phone}</Text>
                  <Text style={[styles.authInfoLabel, { marginTop: 8 }]}>当前状态</Text>
                  <Text style={styles.authInfoBadge}>
                    {authContact?.stoppedCount}人标记
                    {authContact?.communityStatus === 'confirmed_stopped' ? '已失效' : '疑似停用'}
                  </Text>
                </View>

                <Text style={styles.authDesc}>
                  请输入您的真实姓名进行验证。姓名将被加密显示（如：张*明），用于防止恶意认证。
                </Text>

                <TextInput
                  style={styles.authInput}
                  placeholder="请输入您的姓名"
                  placeholderTextColor="#999"
                  value={authName}
                  onChangeText={setAuthName}
                  autoFocus
                />

                {authName.trim().length > 0 && (
                  <View style={styles.previewCard}>
                    <Text style={styles.previewLabel}>加密后显示为</Text>
                    <Text style={styles.previewValue}>{maskName(authName.trim())}</Text>
                  </View>
                )}
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnCancel]}
                  onPress={() => setAuthModalVisible(false)}
                >
                  <Text style={styles.modalBtnCancelText}>取消</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, styles.modalBtnSubmit, (!authName.trim() || authSaving) && { opacity: 0.5 }]}
                  onPress={handleAuthSubmit}
                  disabled={!authName.trim() || authSaving}
                >
                  {authSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalBtnSubmitText}>确认认证</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
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
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECF0',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#909399',
    marginTop: 4,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  cardPhone: {
    fontSize: 14,
    color: '#606266',
    marginTop: 2,
  },
  cardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  cardBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FEF0F0',
    alignItems: 'center',
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F56C6C',
  },
  btnAuth: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#EBF3FD',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  btnAuthText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90D9',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#67C23A',
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 13,
    color: '#909399',
    marginTop: 6,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E8ECF0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A2E',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  authInfoCard: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  authInfoLabel: {
    fontSize: 12,
    color: '#909399',
  },
  authInfoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A2E',
    marginTop: 2,
  },
  authInfoBadge: {
    fontSize: 14,
    fontWeight: '500',
    color: '#E6A23C',
    marginTop: 2,
  },
  authDesc: {
    fontSize: 13,
    color: '#606266',
    lineHeight: 20,
    marginBottom: 14,
  },
  authInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A2E',
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#EBF3FD',
    borderRadius: 10,
  },
  previewLabel: {
    fontSize: 13,
    color: '#606266',
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4A90D9',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 12,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalBtnCancel: {
    backgroundColor: '#F5F7FA',
  },
  modalBtnCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#606266',
  },
  modalBtnSubmit: {
    backgroundColor: '#4A90D9',
  },
  modalBtnSubmitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
