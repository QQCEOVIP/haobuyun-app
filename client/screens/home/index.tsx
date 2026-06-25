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
  const [cloudBackupVisible, setCloudBackupVisible] = useState(false);
  const [cloudBackupTab, setCloudBackupTab] = useState<'backup' | 'restore' | 'records' | 'analysis'>('backup');
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

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

  // 云端备份相关函数
  const handleBackup = async () => {
    if (!session?.access_token) {
      Alert.alert('提示', '请先登录');
      return;
    }
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session': session.access_token,
        },
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('成功', `已备份 ${data.data.contact_count} 个联系人到云端`);
        fetchBackupList();
      } else {
        Alert.alert('错误', data.error || '备份失败');
      }
    } catch (error) {
      console.error('备份失败:', error);
      Alert.alert('错误', '备份失败，请重试');
    }
  };

  const fetchBackupList = async () => {
    if (!session?.access_token) return;
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/backups/list`, {
        headers: { 'x-session': session.access_token },
      });
      const data = await response.json();
      if (data.success) {
        setBackupList(data.data || []);
      }
    } catch (error) {
      console.error('获取备份列表失败:', error);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!session?.access_token) return;
    Alert.alert(
      '确认恢复',
      '恢复通讯录将合并云端数据到本地，是否继续？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '恢复',
          onPress: async () => {
            try {
              const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/contacts/restore`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-session': session.access_token,
                },
                body: JSON.stringify({ backup_id: backupId, mode: 'merge' }),
              });
              const data = await response.json();
              if (data.success) {
                Alert.alert('成功', data.message || '恢复成功');
                fetchStats();
              } else {
                Alert.alert('错误', data.error || '恢复失败');
              }
            } catch (error) {
              console.error('恢复失败:', error);
              Alert.alert('错误', '恢复失败，请重试');
            }
          },
        },
      ]
    );
  };

  const analyzeBackups = () => {
    if (backupList.length < 2) {
      setAnalysisResult({ error: '至少需要2次备份才能进行对比分析' });
      return;
    }
    const latest = backupList[0]?.metadata?.contacts || [];
    const previous = backupList[1]?.metadata?.contacts || [];
    
    const latestPhones = new Set(latest.map((c: any) => c.phone));
    const previousPhones = new Set(previous.map((c: any) => c.phone));
    
    const added = latest.filter((c: any) => !previousPhones.has(c.phone));
    const deleted = previous.filter((c: any) => !latestPhones.has(c.phone));
    
    // 找出修改的联系人（相同号码但其他信息变化）
    const modified: any[] = [];
    latest.forEach((c: any) => {
      const prev = previous.find((p: any) => p.phone === c.phone);
      if (prev && (prev.name !== c.name || prev.status !== c.status)) {
        modified.push({ phone: c.phone, oldName: prev.name, newName: c.name, oldStatus: prev.status, newStatus: c.status });
      }
    });
    
    setAnalysisResult({
      latestDate: backupList[0].created_at,
      previousDate: backupList[1].created_at,
      added: added.length,
      deleted: deleted.length,
      modified: modified.length,
      details: { added, deleted, modified },
    });
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
          <TouchableOpacity style={styles.actionCard} onPress={() => setCloudBackupVisible(true)}>
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

      {/* 云端备份模态框 */}
      <Modal
        visible={cloudBackupVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCloudBackupVisible(false)}
      >
        <View style={styles.cloudModalOverlay}>
          <View style={styles.cloudModalContent}>
            <View style={styles.cloudModalHeader}>
              <Text style={styles.cloudModalTitle}>云端备份</Text>
              <TouchableOpacity onPress={() => setCloudBackupVisible(false)}>
                <Ionicons name="close" size={24} color="#909399" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.cloudModalBody}>
              {/* 备份通讯录 */}
              <View style={styles.cloudSection}>
                <View style={[styles.cloudIconContainer, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
                  <Ionicons name="cloud-upload" size={24} color="#4A90D9" />
                </View>
                <Text style={styles.cloudSectionTitle}>备份通讯录</Text>
                <Text style={styles.cloudSectionDesc}>将当前通讯录备份到云端</Text>
                <TouchableOpacity
                  style={styles.cloudButton}
                  onPress={handleBackup}
                  disabled={backupLoading}
                >
                  <Text style={styles.cloudButtonText}>
                    {backupLoading ? '备份中...' : '立即备份'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 恢复通讯录 */}
              <View style={styles.cloudSection}>
                <View style={[styles.cloudIconContainer, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
                  <Ionicons name="cloud-download" size={24} color="#67C23A" />
                </View>
                <Text style={styles.cloudSectionTitle}>恢复通讯录</Text>
                <Text style={styles.cloudSectionDesc}>从云端恢复通讯录数据</Text>
                <TouchableOpacity
                  style={styles.cloudButton}
                  onPress={handleRestore}
                  disabled={backupLoading}
                >
                  <Text style={styles.cloudButtonText}>
                    {backupLoading ? '恢复中...' : '立即恢复'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 备份记录 */}
              <View style={styles.cloudSection}>
                <View style={[styles.cloudIconContainer, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
                  <Ionicons name="time" size={24} color="#E6A23C" />
                </View>
                <Text style={styles.cloudSectionTitle}>备份记录</Text>
                {backupList.length > 0 ? (
                  backupList.slice(0, 3).map((backup, index) => (
                    <View key={index} style={styles.backupRecord}>
                      <Text style={styles.backupRecordText}>
                        {new Date(backup.created_at).toLocaleString()}
                      </Text>
                      <Text style={styles.backupRecordCount}>
                        {backup.contact_count} 个联系人
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.noBackupText}>暂无备份记录</Text>
                )}
              </View>

              {/* 数据分析 */}
              <View style={styles.cloudSection}>
                <View style={[styles.cloudIconContainer, { backgroundColor: 'rgba(144, 105, 217, 0.12)' }]}>
                  <Ionicons name="analytics" size={24} color="#9069D9" />
                </View>
                <Text style={styles.cloudSectionTitle}>数据分析</Text>
                {backupAnalysis ? (
                  <View style={styles.analysisResult}>
                    <View style={styles.analysisRow}>
                      <Text style={styles.analysisLabel}>新增联系人</Text>
                      <Text style={[styles.analysisValue, { color: '#67C23A' }]}>
                        +{backupAnalysis.added}
                      </Text>
                    </View>
                    <View style={styles.analysisRow}>
                      <Text style={styles.analysisLabel}>删除联系人</Text>
                      <Text style={[styles.analysisValue, { color: '#F56C6C' }]}>
                        -{backupAnalysis.deleted}
                      </Text>
                    </View>
                    <View style={styles.analysisRow}>
                      <Text style={styles.analysisLabel}>修改联系人</Text>
                      <Text style={[styles.analysisValue, { color: '#E6A23C' }]}>
                        ~{backupAnalysis.modified}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.noBackupText}>需要至少两次备份才能分析</Text>
                )}
                <TouchableOpacity
                  style={[styles.cloudButton, { backgroundColor: '#9069D9' }]}
                  onPress={handleAnalysis}
                >
                  <Text style={styles.cloudButtonText}>分析数据</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
  // Cloud Backup Modal Styles
  cloudModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '80%',
  },
  cloudModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cloudModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
  },
  cloudTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cloudTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cloudTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4A90D9',
  },
  cloudTabText: {
    fontSize: 14,
    color: '#909399',
  },
  cloudTabTextActive: {
    color: '#4A90D9',
    fontWeight: '600',
  },
  cloudActionCard: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cloudActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
    marginBottom: 8,
  },
  cloudActionDesc: {
    fontSize: 13,
    color: '#909399',
    marginBottom: 12,
  },
  cloudActionButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cloudActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  backupItem: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backupInfo: {
    flex: 1,
  },
  backupDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303133',
  },
  backupCount: {
    fontSize: 12,
    color: '#909399',
    marginTop: 4,
  },
  restoreButton: {
    backgroundColor: '#67C23A',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  analysisCard: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8EB',
  },
  analysisLabel: {
    fontSize: 14,
    color: '#606266',
  },
  analysisValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303133',
  },
  analysisValueGreen: {
    color: '#67C23A',
  },
  analysisValueRed: {
    color: '#F56C6C',
  },
  analysisValueOrange: {
    color: '#E6A23C',
  },
});
