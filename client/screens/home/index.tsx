import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';

interface ContactStats {
  total: number;
  active: number;
  maybeInvalid: number;
  invalid: number;
  unknown: number;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ContactStats>({
    total: 0,
    active: 0,
    maybeInvalid: 0,
    invalid: 0,
    unknown: 0,
  });

  const userId = (user as any)?.id;
  const userEmail = (user as any)?.email || '';

  const fetchStats = async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('status')
        .eq('user_id', userId);

      if (error) throw error;

      const contactStats: ContactStats = {
        total: data?.length || 0,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: 0,
      };

      data?.forEach((contact: any) => {
        switch (contact.status) {
          case 'active':
            contactStats.active++;
            break;
          case 'maybe_invalid':
            contactStats.maybeInvalid++;
            break;
          case 'invalid':
            contactStats.invalid++;
            break;
          default:
            contactStats.unknown++;
        }
      });

      setStats(contactStats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [userId])
  );

  const healthPercentage = stats.total > 0
    ? Math.round((stats.active / stats.total) * 100)
    : 100;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* 健康度仪表盘 */}
        <View style={styles.dashboardCard}>
          {/* 用户头像在左上角 */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {userEmail.split('@')[0]?.[0]?.toUpperCase() || 'U'}
              </Text>
            </View>
          </View>

          <View style={styles.gaugeContainer}>
            <Svg width={140} height={140}>
              <Circle
                cx={70}
                cy={70}
                r={60}
                stroke="#E6E8EB"
                strokeWidth={10}
                fill="none"
              />
              <Circle
                cx={70}
                cy={70}
                r={60}
                stroke={healthPercentage >= 80 ? '#67C23A' : healthPercentage >= 50 ? '#E6A23C' : '#F56C6C'}
                strokeWidth={10}
                fill="none"
                strokeDasharray={`${(healthPercentage / 100) * 377} 377`}
                strokeLinecap="round"
                rotation="-90"
                origin="70, 70"
              />
            </Svg>
            <View style={styles.gaugeCenter}>
              <Text style={styles.gaugeValue}>{healthPercentage}%</Text>
              <Text style={styles.gaugeLabel}>健康度</Text>
            </View>
          </View>

          <Text style={styles.healthDesc}>
            {healthPercentage >= 80 ? '您的通讯录非常健康' :
             healthPercentage >= 50 ? '部分号码可能需要关注' : '建议清理失效号码'}
          </Text>
        </View>

        {/* 统计数据 */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>总号码</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E7F7E7' }]}>
            <Text style={[styles.statValue, { color: '#67C23A' }]}>{stats.active}</Text>
            <Text style={styles.statLabel}>活跃</Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FFF8E6' }]}>
            <Text style={[styles.statValue, { color: '#E6A23C' }]}>{stats.maybeInvalid}</Text>
            <Text style={styles.statLabel}>可能失效</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEF0F0' }]}>
            <Text style={[styles.statValue, { color: '#F56C6C' }]}>{stats.invalid}</Text>
            <Text style={styles.statLabel}>确定失效</Text>
          </View>
        </View>

        {/* 基础功能 */}
        <Text style={styles.sectionTitle}>基础功能</Text>
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/onboarding')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
              <Ionicons name="search" size={24} color="#4A90D9" />
            </View>
            <Text style={styles.actionText}>一键检测</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/cleanup')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
              <Ionicons name="brush" size={24} color="#E6A23C" />
            </View>
            <Text style={styles.actionText}>批量清理</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/profile')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
              <Ionicons name="cloud" size={24} color="#67C23A" />
            </View>
            <Text style={styles.actionText}>云端备份</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 108, 108, 0.12)' }]}>
              <Ionicons name="share-outline" size={24} color="#F56C6C" />
            </View>
            <Text style={styles.actionText}>导出通讯录</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 100,
  },
  dashboardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarContainer: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gaugeContainer: {
    position: 'relative',
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gaugeCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  gaugeValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#303133',
  },
  gaugeLabel: {
    fontSize: 14,
    color: '#909399',
  },
  healthDesc: {
    fontSize: 14,
    color: '#909399',
    marginTop: 12,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#303133',
  },
  statLabel: {
    fontSize: 12,
    color: '#909399',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginTop: 16,
    marginBottom: 12,
  },
  actionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303133',
  },
});
