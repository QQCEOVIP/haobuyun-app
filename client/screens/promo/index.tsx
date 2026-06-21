/**
 * 推广中心占位页
 * 
 * TODO: 未来实现
 * - 广告列表展示
 * - 小游戏列表展示
 * - 推广任务列表
 * - 积分奖励领取
 */

import { View, Text, StyleSheet } from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';

export default function PromoScreen() {
  const router = useSafeRouter();

  return (
    <Screen>
      <View style={styles.container}>
        {/* 顶部图标区 */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>Coming Soon</Text>
          </View>
        </View>

        {/* 标题 */}
        <Text style={styles.title}>推广中心</Text>
        <Text style={styles.subtitle}>即将上线</Text>

        {/* 功能预告 */}
        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>广告</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>激励广告</Text>
              <Text style={styles.featureDesc}>观看广告获取积分奖励</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>游戏</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>趣味小游戏</Text>
              <Text style={styles.featureDesc}>玩小游戏赢取积分奖励</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>任务</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>推广任务</Text>
              <Text style={styles.featureDesc}>邀请好友完成挑战获得奖励</Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={styles.featureIcon}>
              <Text style={styles.featureIconText}>活动</Text>
            </View>
            <View style={styles.featureContent}>
              <Text style={styles.featureTitle}>限时活动</Text>
              <Text style={styles.featureDesc}>参与节日活动赢取专属奖励</Text>
            </View>
          </View>
        </View>

        {/* 敬请期待提示 */}
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            功能正在开发中，敬请期待...
          </Text>
        </View>

        {/* 返回按钮 */}
        <View style={styles.backButton}>
          <Text
            style={styles.backButtonText}
            onPress={() => router.back()}
          >
            返回
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  iconContainer: {
    marginTop: 60,
    marginBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.9,
  },
  iconText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 40,
  },
  featureList: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  featureIconText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: '#64748B',
  },
  notice: {
    marginTop: 40,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#92400E',
  },
  backButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '500',
  },
});
