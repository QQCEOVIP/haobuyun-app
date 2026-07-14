import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { getBackendBaseUrl } from '@/utils';
import Logo from '@/components/Logo';

interface UpdateInfo {
  version_code: number;
  version_name: string;
  download_url: string;
  release_notes: string;
  force_update: boolean;
  updated_at?: string;
}

export default function AboutScreen() {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      let versionCode = 1;
      try {
        versionCode = (Constants.expoConfig?.version ?? '1.0.1').split('.').reduce((acc, val) => acc * 100 + parseInt(val), 0);
      } catch {}

      // 从静态JSON文件获取版本信息（Coze Site不支持Express后端）
      const response = await fetch(`${getBackendBaseUrl()}/version.json`);
      if (!response.ok) throw new Error('Network error');

      const data: UpdateInfo = await response.json();

      // 比较版本号
      const updateAvailable = data.version_code > versionCode;

      if (!updateAvailable) {
        const versionName = Constants.expoConfig?.version || '1.0.1';
        Alert.alert('当前已是最新版本', `内测版本${versionName}`, [{ text: '确定' }]);
      } else {
        setUpdateInfo(data);
        setShowUpdateModal(true);
      }
    } catch {
      Alert.alert('检查失败', '无法检查更新，请检查网络连接后重试');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleDownload = async () => {
    if (!updateInfo?.download_url) return;

    setDownloading(true);
    setDownloadProgress(0);

    // 方案1：使用 expo-file-system 下载 APK（带进度）
    if (Platform.OS === 'android') {
      try {
        const downloadPath = `${FileSystem.cacheDirectory}haobuyun-update.apk`;

        // 如果已存在旧文件先删除
        const fileInfo = await (FileSystem as any).getInfoAsync(downloadPath);
        if (fileInfo.exists) {
          await (FileSystem as any).deleteAsync(downloadPath);
        }

        const downloadResumable = (FileSystem as any).createDownloadResumable(
          updateInfo.download_url,
          downloadPath,
          {},
          (downloadProgress: any) => {
            if (downloadProgress.totalBytesExpectedToWrite > 0) {
              const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
              setDownloadProgress(Math.round(progress * 100));
            }
          }
        );

        const result = await downloadResumable.downloadAsync();

        if (result && result.uri) {
          setDownloadProgress(100);
          
          // APK 文件验证：检查文件是否存在且大小合理
          const downloadedFileInfo = await (FileSystem as any).getInfoAsync(result.uri);
          if (!downloadedFileInfo.exists || downloadedFileInfo.size < 1000000) {
            // 文件太小（<1MB），可能不是有效的 APK
            Alert.alert(
              '文件验证失败',
              '下载的 APK 文件可能不完整，请使用浏览器重新下载',
              [{ text: '使用浏览器下载', onPress: () => Linking.openURL(updateInfo.download_url) }]
            );
            setDownloading(false);
            return;
          }

          // 使用 IntentLauncher 直接调起 APK 安装器
          try {
            await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
              data: result.uri,
              type: 'application/vnd.android.package-archive',
              flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
            });
            setShowUpdateModal(false);
          } catch (installError) {
            console.warn('[About] IntentLauncher failed:', installError);
            Alert.alert(
              '安装失败',
              '无法调起安装程序，请前往文件管理器找到 haobuyun-update.apk 进行安装'
            );
          }
          return;
        }
      } catch (fsError) {
        console.warn('[About] FileSystem download failed:', fsError);
      }
    }

    // 方案2：回退到浏览器下载
    try {
      const supported = await Linking.canOpenURL(updateInfo.download_url);
      if (supported) {
        await Linking.openURL(updateInfo.download_url);
        Alert.alert('提示', '正在浏览器中下载更新包，下载完成后请点击安装');
      } else {
        Alert.alert('下载失败', '无法打开下载链接，请联系客服获取更新包');
      }
    } catch (linkError) {
      console.error('[About] Failed to open download URL:', linkError);
      Alert.alert('下载失败', '请检查网络连接后重试，或联系客服获取更新包');
    } finally {
      setDownloading(false);
      setShowUpdateModal(false);
    }
  };

  const handleInstall = async () => {
    if (!updateInfo?.download_url) return;
    try {
      // 尝试从本地文件安装
      const localUri = `${(FileSystem as any).documentDirectory}haobuyun-update.apk`;
      const fileInfo = await (FileSystem as any).getInfoAsync(localUri);
      if (fileInfo.exists) {
        await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data: localUri,
          type: 'application/vnd.android.package-archive',
          flags: 1,
        });
      } else {
        // 本地文件不存在，回退到浏览器下载
        await Linking.openURL(updateInfo.download_url);
      }
    } catch {
      Alert.alert('安装失败', '无法调起安装程序，请手动安装下载的 APK');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.logoContainer}>
          <Logo size={80} />
          <Text style={styles.appName}>号簿云</Text>
          <Text style={styles.version}>内测版本 {Constants.expoConfig?.version || '1.0.5'}</Text>
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
        <Text style={styles.paragraph}>2. 号码检测：智能检测通讯录中联系人号码的状态，标识正常、停用、疑似停用等状态。</Text>
        <Text style={styles.paragraph}>3. 导入导出：支持VCF格式通讯录的批量导入与导出，方便数据迁移。</Text>
        <Text style={styles.paragraph}>4. 状态管理：为联系人添加状态标签，快速筛选和管理联系人。</Text>

        <Text style={styles.sectionTitle}>联系我们</Text>
        <Text style={styles.paragraph}>如您在使用过程中遇到任何问题，欢迎通过以下方式联系我们：</Text>
        <Text style={styles.paragraph}>联系邮箱：vip2012@vip.qq.com</Text>
        <Text style={styles.paragraph}>我们将在收到反馈后尽快为您解决。</Text>

        <Text style={styles.sectionTitle}>版权声明</Text>
        <Text style={styles.paragraph}>号簿云应用的所有内容，包括但不限于软件代码、界面设计、图标、文字等，均受版权法保护。未经授权不得转载或使用。</Text>

        <Text style={styles.copyright}>Copyright 2026 号簿云团队</Text>
      </ScrollView>

      {/* Update Modal */}
      <Modal visible={showUpdateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              发现新版本 v{updateInfo?.version_name}
            </Text>
            <ScrollView style={styles.releaseNotes}>
              <Text style={styles.releaseNotesText}>
                {updateInfo?.release_notes?.split('\\n').join('\n') || '无更新说明'}
              </Text>
            </ScrollView>

            {downloading && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${downloadProgress}%` }]} />
                </View>
                <Text style={styles.progressText}>{downloadProgress}%</Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              {downloading ? (
                <TouchableOpacity style={styles.modalBtnPrimary} disabled>
                  <Text style={styles.modalBtnPrimaryText}>下载中...</Text>
                </TouchableOpacity>
              ) : downloadProgress >= 100 ? (
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={async () => {
                  try {
                    // 尝试从本地文件安装
                    const localUri = `${(FileSystem as any).documentDirectory}haobuyun-update.apk`;
                    const fileInfo = await (FileSystem as any).getInfoAsync(localUri);
                    if (fileInfo.exists) {
                      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                        data: localUri,
                        type: 'application/vnd.android.package-archive',
                        flags: 1,
                      });
                    } else {
                      // 本地文件不存在，回退到浏览器下载
                      await Linking.openURL(updateInfo!.download_url);
                    }
                  } catch {
                    Alert.alert('提示', '请前往浏览器下载并安装最新版本');
                  }
                  setShowUpdateModal(false);
                }}>
                  <Text style={styles.modalBtnPrimaryText}>立即安装</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.modalBtnSecondary}
                    onPress={() => { setShowUpdateModal(false); setDownloadProgress(0); }}
                  >
                    <Text style={styles.modalBtnSecondaryText}>稍后再说</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleDownload}>
                    <Text style={styles.modalBtnPrimaryText}>立即更新</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
    textAlign: 'center',
  },
  releaseNotes: {
    maxHeight: 200,
    marginBottom: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
  },
  releaseNotesText: {
    fontSize: 14,
    color: '#606266',
    lineHeight: 22,
  },
  progressContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E8E8E8',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4A90D9',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: '#909399',
    marginTop: 6,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  modalBtnPrimary: {
    flex: 1,
    backgroundColor: '#4A90D9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalBtnSecondary: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#606266',
  },
});
