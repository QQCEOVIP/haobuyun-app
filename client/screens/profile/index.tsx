import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { useSwipeNavigation } from '@/hooks/useSwipeNavigation';
import BackgroundWrapper from '@/components/BackgroundWrapper';

// Force production URL - do not use environment variable
const getBackendBaseUrl = () => {
  return 'https://kdsf38dsn9.coze.site';
};

interface MenuItemProps {
  name: string;
  color: string;
  title: string;
  subtitle?: string;
  badge?: string;
  onPress: () => void;
}

function MenuItem({ name, color, title, subtitle, badge, onPress }: MenuItemProps) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={[styles.menuIconContainer, { backgroundColor: `${color}20` }]}>
        <Ionicons name={name as any} size={22} color={color} />
      </View>
      <View style={styles.menuTextContainer}>
        <Text style={styles.menuTitle}>{title}</Text>
        {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
      </View>
      {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      <Ionicons name="chevron-forward" size={20} color="#C0C4CC" />
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const router = useSafeRouter();
  const { user, signOut, avatarUrl: contextAvatarUrl, setAvatarUrl: setContextAvatarUrl, refreshAvatar } = useAuth();
  const { onTouchStart, onTouchEnd } = useSwipeNavigation();
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [nicknameUpdatedAt, setNicknameUpdatedAt] = useState<string | null>(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

  // 检查新版本
  useEffect(() => {
    checkForNewVersion();
  }, []);

  const checkForNewVersion = async () => {
    try {
      const res = await fetch(`${getBackendBaseUrl()}/version.json`);
      if (!res.ok) return;
      const data = await res.json();
      const localVersion = Constants.expoConfig?.version || '1.0.5';
      const localCode = parseVersionCode(localVersion);
      if (data.version_code > localCode) {
        setHasNewVersion(true);
      }
    } catch {
      // 静默失败
    }
  };

  const parseVersionCode = (version: string): number => {
    const parts = version.split('.').map(Number);
    return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
  };

  // Use context avatarUrl as primary source, fallback to local state
  const avatarUrl = contextAvatarUrl || localAvatarUrl;

  // 加载昵称 - 定义在 useEffect 之前
  const loadNickname = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/v1/users/profile`, {
        headers: { 'x-session': user.id },
      });
      if (res.ok) {
        const result = await res.json();
        // API 返回格式: { success: true, data: { nickname, nickname_updated_at, ... } }
        const profileData = result.data || result;
        setNickname(profileData.nickname || null);
        setNicknameUpdatedAt(profileData.nickname_updated_at || null);
      }
    } catch (error) {
      console.error('Load nickname error:', error);
    }
  };

  // 加载用户资料 - 定义在 useEffect 之前
  const loadProfile = async () => {
    if (!user?.id) return;
    try {
      // First check AsyncStorage for cached avatar (fallback if context is empty)
      if (!contextAvatarUrl) {
        const cachedAvatar = await AsyncStorage.getItem('@user_avatar');
        if (cachedAvatar) {
          setLocalAvatarUrl(cachedAvatar);
        }
      }

      // Then try to fetch from backend to get fresh URL
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user.id) headers['x-user-id'] = user.id;
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/profile`, { headers });
      if (response.ok) {
        const result = await response.json();
        if (result.profile?.avatar_url) {
          setLocalAvatarUrl(result.profile.avatar_url);
          // Also update context for other screens
          setContextAvatarUrl(result.profile.avatar_url);
          // Cache to AsyncStorage
          await AsyncStorage.setItem('@user_avatar', result.profile.avatar_url);
        }
      }
    } catch (error) {
      console.error('Load profile error:', error);
    }
  };

  // Load profile on focus
  // 初始加载（仅挂载时，Tab切换不重新加载以避免闪屏）
  useEffect(() => {
    loadProfile();
    loadNickname();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handlePickAvatar = async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要相册权限才能选择头像');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadAvatar(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string) => {
    if (!user?.id) return;
    setUploading(true);
    try {
      // Read file as base64 for FormData
      const filename = uri.split('/').pop() || 'avatar.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : 'image/jpeg';

      const formData = new FormData();
      formData.append('avatar', {
        uri,
        name: filename,
        type,
      } as any);

      /**
       * 服务端文件：server/src/routes/profile.ts
       * 接口：POST /api/v1/profile/avatar
       * Headers: x-user-id: string
       * Body: FormData with 'avatar' field
       */
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/profile/avatar`, {
        method: 'POST',
        headers: {
          'x-user-id': user.id,
        },
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');
      const result = await response.json();
      if (result.avatarUrl) {
        // Directly set avatar with cache-busting to force Image refresh
        const newUrl = result.avatarUrl + (result.avatarUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
        setContextAvatarUrl(newUrl);
        setLocalAvatarUrl(newUrl);
        await AsyncStorage.setItem('@user_avatar', newUrl);

        // Also call refreshAvatar as backup to get fresh presigned URL
        await refreshAvatar();

        // Notify other screens (e.g. home) to refresh avatar
        DeviceEventEmitter.emit('avatar-updated');

        Alert.alert('成功', '头像已更新');
      }
    } catch (error) {
      console.error('Upload avatar error:', error);
      Alert.alert('错误', '上传头像失败');
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          style: 'destructive',
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  // 保存昵称
  const handleSaveNickname = async () => {
    if (!user?.id) return;
    const trimmed = nicknameInput.trim();
    if (!trimmed) {
      Alert.alert('提示', '昵称不能为空');
      return;
    }
    if (trimmed.length > 20) {
      Alert.alert('提示', '昵称不能超过20个字符');
      return;
    }
    try {
      const res = await fetch(`${getBackendBaseUrl()}/api/v1/users/nickname`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-session': user.id,
        },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setNickname(trimmed);
        setNicknameUpdatedAt(new Date().toISOString());
        setShowNicknameModal(false);
        Alert.alert('成功', '昵称已更新');
      } else {
        Alert.alert('失败', data.error || '修改昵称失败');
      }
    } catch (error) {
      console.error('Save nickname error:', error);
      Alert.alert('错误', '网络错误，请稍后重试');
    }
  };

  // 计算剩余可修改天数
  const getRemainingDays = (): number | null => {
    if (!nicknameUpdatedAt) return null;
    const updatedAt = new Date(nicknameUpdatedAt);
    const now = new Date();
    const diffMs = now.getTime() - updatedAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const remaining = 30 - diffDays;
    return remaining > 0 ? remaining : 0;
  };

  // 打开昵称编辑弹窗
  const openNicknameModal = () => {
    const remaining = getRemainingDays();
    if (remaining !== null && remaining > 0) {
      Alert.alert('提示', `昵称修改间隔为30天，还需等待${remaining}天`);
      return;
    }
    setNicknameInput(nickname || '');
    setShowNicknameModal(true);
  };

  const userEmail = (user as any)?.email || '';
  const userName = userEmail.split('@')[0] || '用户';

  return (
    <BackgroundWrapper>
    <View style={{ flex: 1 }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>我的</Text>
        </View>

        {/* 用户信息 */}
        <View style={styles.userCard}>
          <TouchableOpacity style={styles.avatar} onPress={handlePickAvatar} disabled={uploading}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {userEmail[0]?.toUpperCase() || '?'}
              </Text>
            )}
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#FFF" />
              </View>
            )}
            <View style={styles.avatarEditIcon}>
              <Ionicons name="camera" size={12} color="#FFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <TouchableOpacity onPress={openNicknameModal}>
              {/* 有昵称时显示昵称，无昵称时显示手机号 */}
              <Text style={styles.userName}>{nickname || userName}</Text>
              <Text style={styles.userEmail}>{userEmail}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 功能菜单 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>设置</Text>
          <View style={styles.menuCard}>
            <MenuItem
              name="notifications"
              color="#F56C6C"
              title="通知设置"
              subtitle="检测结果通知"
              onPress={() => router.push('/notification')}
            />
            <MenuItem
              name="lock-closed"
              color="#909399"
              title="隐私设置"
              subtitle="数据共享与权限"
              onPress={() => router.push('/privacy-settings')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>关于</Text>
          <View style={styles.menuCard}>
            <MenuItem
              name="document-text"
              color="#4A90D9"
              title="用户协议"
              onPress={() => router.push('/agreement')}
            />
            <MenuItem
              name="shield-checkmark"
              color="#67C23A"
              title="隐私政策"
              onPress={() => router.push('/privacy')}
            />
            <MenuItem
              name="chatbubble-ellipses"
              color="#E6A23C"
              title="意见反馈"
              onPress={() => router.push('/feedback')}
            />
            <MenuItem
              name="information-circle"
              color="#909399"
              title="关于我们"
              subtitle={`内测版本 ${Constants.expoConfig?.version || '1.0.5'}`}
              badge={hasNewVersion ? '有新版本' : undefined}
              onPress={() => router.push('/about')}
            />
          </View>
        </View>

        {/* 退出登录 */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* 昵称设置弹窗 */}
      <Modal
        visible={showNicknameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNicknameModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>设置昵称</Text>
            <Text style={styles.modalLabel}>昵称（2-20字符）</Text>
            <TextInput
              style={styles.modalInput}
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="请输入昵称"
              maxLength={20}
            />
            {getRemainingDays() !== null && getRemainingDays()! > 0 && (
              <Text style={styles.cooldownText}>
                修改间隔：还需等待 {getRemainingDays()} 天
              </Text>
            )}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowNicknameModal(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSaveNickname}
                disabled={getRemainingDays() !== null && getRemainingDays()! > 0}
              >
                <Text style={styles.confirmButtonText}>
                  保存
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </View>
    </BackgroundWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingBottom: 120,
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEditIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  userInfo: {
    flex: 1,
    marginLeft: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
  },
  userEmail: {
    fontSize: 13,
    color: '#909399',
    marginTop: 4,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#909399',
    marginLeft: 20,
    marginBottom: 8,
  },
  menuCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F7FA',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#303133',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#909399',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#FA8C16',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 8,
  },
  badgeText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#F5F7FA',
    marginHorizontal: 20,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F56C6C',
  },
  nicknameModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  nicknameModalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
  },
  nicknameModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
  },
  nicknameInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#303133',
    marginBottom: 8,
  },
  nicknameHint: {
    fontSize: 12,
    color: '#909399',
    marginBottom: 16,
  },
  nicknameButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  nicknameCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  nicknameCancelText: {
    fontSize: 14,
    color: '#909399',
  },
  nicknameSaveBtn: {
    backgroundColor: '#4A90D9',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  nicknameSaveText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  // 昵称设置 Modal 样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    color: '#606266',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#303133',
    marginBottom: 12,
  },
  cooldownText: {
    fontSize: 12,
    color: '#E6A23C',
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F5F7FA',
  },
  cancelButtonText: {
    fontSize: 14,
    color: '#606266',
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: '#4A90D9',
  },
  confirmButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
