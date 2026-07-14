import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';

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
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hasNewVersion, setHasNewVersion] = useState(false);

  // 检查新版本
  useEffect(() => {
    checkForNewVersion();
  }, []);

  const checkForNewVersion = async () => {
    try {
      const res = await fetch(`${getBackendBaseUrl()}/version.json`);
      if (!res.ok) return;
      const data = await res.json();
      const localVersion = Constants.expoConfig?.version || '1.0.3';
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

  // Load profile on focus
  // 初始加载（仅挂载时，Tab切换不重新加载以避免闪屏）
  useEffect(() => {
    loadProfile();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

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

  const userEmail = (user as any)?.email || '';
  const userName = userEmail.split('@')[0] || '用户';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F5F7FA' }]}>
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
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userEmail}>{userEmail}</Text>
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
              subtitle={`内测版本 ${Constants.expoConfig?.version || '1.0.3'}`}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
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
    backgroundColor: '#FFFFFF',
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
});
