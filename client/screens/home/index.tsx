import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
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
  const [detecting, setDetecting] = useState(false);
  const [detectionResult, setDetectionResult] = useState<any>(null);

  const userId = (user as any)?.id;
  const userEmail = (user as any)?.email || '';

  // 一键检测功能
  const runDetection = async () => {
    if (detecting) return;
    
    setDetecting(true);
    try {
      // 请求通讯录权限
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限才能进行检测');
        setDetecting(false);
        return;
      }

      // 获取设备通讯录
      const { data: deviceContacts } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        pageSize: 1000,
      });

      if (!deviceContacts || deviceContacts.length === 0) {
        Alert.alert('提示', '未找到通讯录联系人');
        setDetecting(false);
        return;
      }

      // 获取本地已存储的联系人状态
      const { data: localContacts } = await supabase
        .from('contacts')
        .select('phone, status')
        .eq('user_id', userId);

      // 统计检测结果
      const result = {
        total: deviceContacts.length,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: 0,
      };

      deviceContacts.forEach(contact => {
        const phone = contact.phoneNumbers?.[0]?.number || '';
        const localData = localContacts?.find((lc: any) => lc.phone === phone);
        
        switch (localData?.status) {
          case 'active':
            result.active++;
            break;
          case 'maybe_invalid':
            result.maybeInvalid++;
            break;
          case 'invalid':
            result.invalid++;
            break;
          default:
            result.unknown++;
        }
      });

      // 更新统计
      setStats({
        total: result.total,
        active: result.active,
        maybeInvalid: result.maybeInvalid,
        invalid: result.invalid,
        unknown: result.unknown,
      });

      // 保存检测结果
      setDetectionResult(result);
    } catch (error) {
      console.error('检测失败:', error);
      Alert.alert('错误', '检测过程中发生错误，请重试');
    } finally {
      setDetecting(false);
    }
  };

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
          <TouchableOpacity 
            style={[styles.actionCard, detecting && { opacity: 0.6 }]} 
            onPress={runDetection}
            disabled={detecting}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
              {detecting ? (
                <Ionicons name="hourglass" size={24} color="#4A90D9" />
              ) : (
                <Ionicons name="search" size={24} color="#4A90D9" />
              )}
            </View>
            <Text style={styles.actionText}>{detecting ? '检测中...' : '一键检测'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/profile')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
              <Ionicons name="cloud" size={24} color="#67C23A" />
            </View>
            <Text style={styles.actionText}>云端备份</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/cleanup')}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(144, 105, 217, 0.12)' }]}>
              <Ionicons name="download" size={24} color="#9069D9" />
            </View>
            <Text style={styles.actionText}>导入通讯录</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 108, 108, 0.12)' }]}>
              <Ionicons name="share-outline" size={24} color="#F56C6C" />
            </View>
            <Text style={styles.actionText}>导出通讯录</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 检测结果 Modal */}
      <Modal
        visible={detectionResult !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDetectionResult(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>检测结果</Text>
            {detectionResult && (
              <>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>检测总数</Text>
                  <Text style={styles.modalValue}>{detectionResult.total}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>活跃号码</Text>
                  <Text style={[styles.modalValue, { color: '#67C23A' }]}>{detectionResult.active}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>可能失效</Text>
                  <Text style={[styles.modalValue, { color: '#E6A23C' }]}>{detectionResult.maybeInvalid}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>确定失效</Text>
                  <Text style={[styles.modalValue, { color: '#F56C6C' }]}>{detectionResult.invalid}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>未知状态</Text>
                  <Text style={[styles.modalValue, { color: '#909399' }]}>{detectionResult.unknown}</Text>
                </View>
              </>
            )}
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setDetectionResult(null)}
            >
              <Text style={styles.modalButtonText}>知道了</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 320,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F7FA',
  },
  modalLabel: {
    fontSize: 14,
    color: '#606266',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#303133',
  },
  modalButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  modalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
