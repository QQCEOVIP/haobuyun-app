import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

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
  const router = useRouter();
  const { user, signOut, session } = useAuth();
  const [points, setPoints] = useState(0);
  const [medalCount, setMedalCount] = useState(0);

  // 获取积分和勋章数量
  const fetchStats = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const [pointsRes, medalsRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/balance`, {
          headers: { "x-session": session.access_token }
        }),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/medals/mine`, {
          headers: { "x-session": session.access_token }
        })
      ]);
      const pointsData = await pointsRes.json();
      const medalsData = await medalsRes.json();
      setPoints(pointsData.balance || 0);
      setMedalCount(medalsData.medals?.length || 0);
    } catch (error) {
      console.error('获取数据失败:', error);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [fetchStats])
  );

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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>我的</Text>
        </View>

        {/* 用户信息 */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userEmail[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{userName}</Text>
            <Text style={styles.userEmail}>{userEmail}</Text>
          </View>
        </View>

        {/* 积分卡片 */}
        <View style={styles.pointsCard}>
          <TouchableOpacity style={styles.pointsItem} onPress={() => Alert.alert('提示', '积分商城开发中')}>
            <Text style={styles.pointsValue}>{points}</Text>
            <Text style={styles.pointsLabel}>我的积分</Text>
          </TouchableOpacity>
          <View style={styles.pointsDivider} />
          <TouchableOpacity style={styles.pointsItem} onPress={() => Alert.alert('提示', '勋章墙开发中')}>
            <Text style={styles.pointsValue}>{medalCount}</Text>
            <Text style={styles.pointsLabel}>已获勋章</Text>
          </TouchableOpacity>
        </View>

        {/* 功能菜单 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>积分激励</Text>
          <View style={styles.menuCard}>
            <MenuItem
              name="gift"
              color="#FA8C16"
              title="积分商城"
              subtitle="积分兑换好礼"
              onPress={() => Alert.alert('提示', '积分商城开发中')}
            />
            <MenuItem
              name="podium"
              color="#4A90D9"
              title="排行榜"
              subtitle="周榜/月榜Top10奖励"
              onPress={() => Alert.alert('提示', '排行榜开发中')}
            />
            <MenuItem
              name="ribbon"
              color="#F56C6C"
              title="勋章墙"
              subtitle="查看已获得勋章"
              onPress={() => Alert.alert('提示', '勋章墙开发中')}
            />
            <MenuItem
              name="game-controller"
              color="#9C27B0"
              title="推广中心"
              subtitle="看广告/玩游戏赚积分"
              onPress={() => router.push('/promo')}
            />
          </View>
        </View>

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
              name="information-circle"
              color="#909399"
              title="关于我们"
              subtitle="版本 1.0.0"
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
  pointsCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
    marginBottom: 24,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pointsItem: {
    flex: 1,
    alignItems: 'center',
  },
  pointsValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FA8C16',
  },
  pointsLabel: {
    fontSize: 13,
    color: '#909399',
    marginTop: 4,
  },
  pointsDivider: {
    width: 1,
    backgroundColor: '#F0F0F0',
    marginHorizontal: 16,
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
