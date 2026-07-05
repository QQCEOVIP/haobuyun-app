import React, { useState, useCallback } from 'react';
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
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import ContactAvatar from '@/components/ContactAvatar';

const getBackendBaseUrl = () => {
  return process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'https://kdsf38dsn9.coze.site';
};

interface SuspectedPhone {
  phone: string;
  name: string;
  votes: { stopped: number; normal: number; suspected_stopped: number };
  authenticated: { user_name: string; authenticated_at: string; expires_at: string } | null;
}

// 名字脱敏：张*明、李*华
function maskName(name: string): string {
  if (!name || name.length < 2) return name || '***';
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*' + name[name.length - 1];
}

export default function SuspectedContactsScreen() {
  const { user } = useAuth();
  const userId = (user as any)?.id;
  const [suspectedPhones, setSuspectedPhones] = useState<SuspectedPhone[]>([]);
  const [loading, setLoading] = useState(true);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authPhone, setAuthPhone] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadSuspectedPhones = useCallback(async () => {
    try {
      const json = await AsyncStorage.getItem('@suspected_phones');
      if (json) {
        const data = JSON.parse(json);
        setSuspectedPhones(data);
      } else {
        setSuspectedPhones([]);
      }
    } catch {
      setSuspectedPhones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSuspectedPhones();
    }, [loadSuspectedPhones])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSuspectedPhones();
    setRefreshing(false);
  };

  const handleAuthenticate = (phone: string) => {
    setAuthPhone(phone);
    setAuthName('');
    setAuthModalVisible(true);
  };

  const submitAuthentication = async () => {
    if (!authName.trim()) {
      Alert.alert('提示', '请输入号码使用者姓名');
      return;
    }
    if (!userId) {
      Alert.alert('提示', '请先登录');
      return;
    }

    setAuthLoading(true);
    try {
      const baseUrl = getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/authenticate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({
          phone: authPhone,
          user_name: authName.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        Alert.alert('认证成功', data.message || '号码已认证为有效');
        setAuthModalVisible(false);
        // 刷新列表
        await loadSuspectedPhones();
      } else {
        Alert.alert('认证失败', data.error || '请稍后重试');
      }
    } catch (error) {
      console.error('认证失败:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setAuthLoading(false);
    }
  };

  const renderItem = ({ item }: { item: SuspectedPhone }) => {
    const isAuthed = item.authenticated !== null;
    const maskedName = isAuthed ? maskName(item.authenticated.user_name) : null;

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <ContactAvatar name={item.name} size={44} />
          <View style={styles.cardInfo}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardPhone}>{item.phone}</Text>
            <View style={styles.voteInfo}>
              <Text style={styles.voteText}>
                {item.votes.stopped}人标记停机 / {item.votes.suspected_stopped}人疑似
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.cardRight}>
          {isAuthed ? (
            <View style={styles.authedBadge}>
              <Ionicons name="checkmark-circle" size={18} color="#67C23A" />
              <Text style={styles.authedText}>已认证</Text>
              {maskedName && <Text style={styles.maskedName}>{maskedName}</Text>}
            </View>
          ) : (
            <TouchableOpacity
              style={styles.authButton}
              onPress={() => handleAuthenticate(item.phone)}
            >
              <Ionicons name="shield-checkmark" size={18} color="#4A90D9" />
              <Text style={styles.authButtonText}>认证</Text>
            </TouchableOpacity>
          )}
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
        <View style={styles.loadingContainer}>
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
          {suspectedPhones.length} 个号码疑似停机
        </Text>
      </View>

      {suspectedPhones.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={64} color="#67C23A" />
          <Text style={styles.emptyText}>暂无疑似停机号码</Text>
          <Text style={styles.emptySubText}>所有号码状态正常</Text>
        </View>
      ) : (
        <FlatList
          data={suspectedPhones}
          keyExtractor={(item) => item.phone}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* 认证弹窗 */}
      <Modal visible={authModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setAuthModalVisible(false)} disabled={Platform.OS === 'web'}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              style={{ flex: 1 }}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>认证号码</Text>
                  <TouchableOpacity onPress={() => setAuthModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalBody}>
                  <Text style={styles.modalPhone}>{authPhone}</Text>
                  <Text style={styles.modalDesc}>
                    请输入该号码使用者的真实姓名，用于确认号码有效性。
                  </Text>
                  <Text style={styles.modalDescSub}>
                    认证后该号码将标记为有效，姓名将脱敏显示（如：张*明）
                  </Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="请输入使用者姓名"
                    placeholderTextColor="#999"
                    value={authName}
                    onChangeText={setAuthName}
                    autoFocus
                  />
                </View>

                <View style={styles.modalFooter}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setAuthModalVisible(false)}
                  >
                    <Text style={styles.modalCancelText}>取消</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSubmitButton, authLoading && { opacity: 0.6 }]}
                    onPress={submitAuthentication}
                    disabled={authLoading}
                  >
                    {authLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.modalSubmitText}>提交认证</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  listContent: {
    padding: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardInfo: {
    marginLeft: 12,
    flex: 1,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  cardPhone: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  voteInfo: {
    marginTop: 4,
  },
  voteText: {
    fontSize: 11,
    color: '#E6A23C',
  },
  cardRight: {
    marginLeft: 12,
  },
  authButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  authButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A90D9',
    marginLeft: 4,
  },
  authedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E7F7E7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  authedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#67C23A',
    marginLeft: 4,
  },
  maskedName: {
    fontSize: 11,
    color: '#67C23A',
    marginLeft: 6,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  modalPhone: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  modalDesc: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginBottom: 4,
  },
  modalDescSub: {
    fontSize: 12,
    color: '#999',
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1A1A1A',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  modalSubmitButton: {
    flex: 1,
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});
