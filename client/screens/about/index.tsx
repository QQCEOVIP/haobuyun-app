import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Logo from '@/components/Logo';

export default function AboutScreen() {
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      Alert.alert(
        '当前已是最新版本',
        '版本号：1.0.0\n暂无可用更新',
        [{ text: '确定', style: 'default' }]
      );
    } catch {
      Alert.alert('检查失败', '无法检查更新，请稍后重试');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.logoContainer}>
          <Logo size={80} />
          <Text style={styles.appName}>号簿云</Text>
          <Text style={styles.version}>版本 1.0.0</Text>
          <TouchableOpacity
            style={styles.updateButton}
            onPress={handleCheckUpdate}
            disabled={checkingUpdate}
            activeOpacity={0.7}
          >
            <Text style={styles.updateButtonText}>
              {checkingUpdate ? '检查中...' : '检查更新'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>应用简介</Text>
        <Text style={styles.paragraph}>号簿云是一款专业的通讯录管理工具，致力于帮助用户高效管理通讯录联系人信息。</Text>
        <Text style={styles.paragraph}>核心功能包括：通讯录云端备份与恢复、号码状态检测、通讯录导入导出、智能标签管理等。</Text>

        <Text style={styles.sectionTitle}>核心功能</Text>
        <Text style={styles.paragraph}>1. 云端备份：将通讯录数据安全备份至云端，支持跨设备恢复，防止数据丢失。</Text>
        <Text style={styles.paragraph}>2. 号码检测：智能检测通讯录中联系人号码的状态，标识正常、停机、疑似停机等状态。</Text>
        <Text style={styles.paragraph}>3. 导入导出：支持VCF格式通讯录的批量导入与导出，方便数据迁移。</Text>
        <Text style={styles.paragraph}>4. 状态管理：为联系人添加状态标签，快速筛选和管理联系人。</Text>

        <Text style={styles.sectionTitle}>技术支持</Text>
        <Text style={styles.paragraph}>如您在使用过程中遇到任何问题，欢迎通过应用内反馈功能联系我们，我们将尽快为您解决。</Text>

        <Text style={styles.sectionTitle}>版权声明</Text>
        <Text style={styles.paragraph}>号簿云应用的所有内容，包括但不限于软件代码、界面设计、图标、文字等，均受版权法保护。未经授权不得转载或使用。</Text>

        <Text style={styles.copyright}>Copyright 2026 号簿云团队</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  appName: { fontSize: 22, fontWeight: '700', color: '#303133', marginTop: 12, marginBottom: 4 },
  version: { fontSize: 14, color: '#909399' },
  updateButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F0F7FF',
    borderWidth: 1,
    borderColor: '#D4E8FC',
  },
  updateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A90D9',
  },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#303133', marginTop: 20, marginBottom: 10 },
  paragraph: { fontSize: 15, color: '#606266', lineHeight: 24, marginBottom: 8 },
  copyright: { fontSize: 13, color: '#C0C4CC', textAlign: 'center', marginTop: 40 },
});
