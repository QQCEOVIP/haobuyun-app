import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { Ionicons } from '@expo/vector-icons';

const APP_ICON_URL = 'https://coze-coding-project.tos.coze.site/gen_project_icon/2026-06-21/7653829780214923264_1782049086.png?sign=4904113271-3a7575ab72-0-8d0b9c7afcfc0d6e4e3ccdc6007a756bb644412d3055ab740ff143aa38d40b1e';

export default function OnboardingScreen() {
  const router = useRouter();

  const handleAuthorize = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status === 'granted') {
      router.replace('/(tabs)');
    }
  };

  const handleSkip = () => {
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Image source={{ uri: APP_ICON_URL }} style={styles.icon} />
        <Text style={styles.title}>云号簿</Text>
        <Text style={styles.subtitle}>
          帮您检测通讯录中的失效号码
        </Text>

        <View style={styles.featureList}>
          <View style={styles.featureItem}>
            <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
              <Ionicons name="search" size={24} color="#4A90D9" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>智能检测</Text>
              <Text style={styles.featureDesc}>
                多维度分析号码状态，找出可能失效的联系人
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
              <Ionicons name="cloud" size={24} color="#67C23A" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>云端备份</Text>
              <Text style={styles.featureDesc}>
                一键备份通讯录，换手机也不怕丢失
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIconContainer, { backgroundColor: 'rgba(144, 105, 217, 0.12)' }]}>
              <Ionicons name="lock-closed" size={24} color="#9069D9" />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>隐私优先</Text>
              <Text style={styles.featureDesc}>
                所有检测在本地完成，只上传脱敏的标记数据
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>需要您的授权</Text>
          <Text style={styles.permissionText}>
            云号簿需要访问您的通讯录，以便检测失效号码和备份联系人信息。我们承诺：
          </Text>
          <View style={styles.promiseList}>
            <Text style={styles.promiseItem}>- 不会上传您的通讯录到服务器</Text>
            <Text style={styles.promiseItem}>- 不会向您的联系人发送任何消息</Text>
            <Text style={styles.promiseItem}>- 不会拨打或发送短信给任何人</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.authorizeButton}
          onPress={handleAuthorize}
        >
          <Text style={styles.authorizeButtonText}>授权通讯录</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipButtonText}>暂不授权</Text>
        </TouchableOpacity>
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
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#303133',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#909399',
    textAlign: 'center',
    marginBottom: 32,
  },
  featureList: {
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: '#909399',
    lineHeight: 20,
  },
  permissionCard: {
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    padding: 16,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4A90D9',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 13,
    color: '#909399',
    lineHeight: 20,
    marginBottom: 12,
  },
  promiseList: {},
  promiseItem: {
    fontSize: 13,
    color: '#67C23A',
    lineHeight: 22,
  },
  footer: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    paddingBottom: 40,
  },
  authorizeButton: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  authorizeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipButtonText: {
    color: '#909399',
    fontSize: 14,
  },
});
