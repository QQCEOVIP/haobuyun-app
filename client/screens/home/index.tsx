import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import * as Contacts from 'expo-contacts';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as FileSystem from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import Constants from 'expo-constants';

// 替代 Modal 的轻量级遮罩组件，避免 Modal 原生行为导致的闪屏
const Overlay = ({ visible, children, onClose }: { visible: boolean; children: React.ReactNode; onClose?: () => void }) => {
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose} disabled={!onClose}>
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
          }}
        />
      </TouchableWithoutFeedback>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }} pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
};

// Force production URL - do not use environment variable
const getBackendBaseUrl = () => {
  return 'https://kdsf38dsn9.coze.site';
};



import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  const router = useSafeRouter();
  const { user, session, avatarUrl: contextAvatarUrl } = useAuth();
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const displayAvatarUrl = contextAvatarUrl || localAvatarUrl;
  console.log('[Home] avatarUrl from context:', contextAvatarUrl, 'local:', localAvatarUrl);
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
  const [suspectedCount, setSuspectedCount] = useState(0);

  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [customFileName, setCustomFileName] = useState('');
  const [fileNameModalVisible, setFileNameModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  // ========== Cloud backup/restore state ==========
  const [cloudBackups, setCloudBackups] = useState<any[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudProgress, setCloudProgress] = useState('');
  const [cloudBackupLoading, setCloudBackupLoading] = useState<'uploading' | 'downloading' | null>(null);
  const [restoreSelectVisible, setRestoreSelectVisible] = useState(false);
  const [backupRecordsVisible, setBackupRecordsVisible] = useState(false);

  // Progress modal state
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressText, setProgressText] = useState('请勿离开，即将完成！');
  const [progressPercent, setProgressPercent] = useState(0);

  // Scan local files state
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<Array<{ name: string; path: string; size: number; modified: string }>>([]);
  const [scanLoading, setScanLoading] = useState(false);

  const userId = (user as any)?.id;
  const userEmail = (user as any)?.email || '';

  // 首次加载：使用 useEffect 只在挂载时执行
  useEffect(() => {
    if (!initialLoaded) {
      fetchStats();
      // 加载疑似停机数量
      AsyncStorage.getItem('@suspected_phones').then((json) => {
        if (json) {
          try {
            const data = JSON.parse(json);
            setSuspectedCount(data.length || 0);
          } catch { /* ignore */ }
        }
      });
      setInitialLoaded(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load avatar from AsyncStorage as fallback and listen for avatar updates
  // Also reset any stuck modal states to prevent screen darkening
  useFocusEffect(
    useCallback(() => {
      // 页面获得焦点时重置所有可能卡住的Modal状态
      setProgressVisible(false);
      setScanModalVisible(false);
      setCloudBackupVisible(false);
      setRestoreSelectVisible(false);
      setBackupRecordsVisible(false);
      setFileNameModalVisible(false);
      setDetectionResult(null);

      (async () => {
        try {
          const cached = await AsyncStorage.getItem('@user_avatar');
          if (cached) {
            setLocalAvatarUrl(cached);
          }
        } catch (e) {
          // ignore
        }
      })();

      // 页面失焦时也重置，防止Modal遮罩卡在原生层
      return () => {
        setProgressVisible(false);
        setScanModalVisible(false);
        setCloudBackupVisible(false);
        setRestoreSelectVisible(false);
        setBackupRecordsVisible(false);
        setFileNameModalVisible(false);
        setDetectionResult(null);
      };
    }, [])
  );

  // Listen for avatar-updated events from other screens
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('avatar-updated', (event: { uri: string }) => {
      if (event?.uri) {
        setLocalAvatarUrl(event.uri);
      }
    });
    return () => {
      subscription.remove();
    };
  }, []);

  // Lightweight refresh: only re-read AsyncStorage status counts when page gains focus
  // This avoids the heavy device contacts read that caused black screen issues
  useFocusEffect(
    useCallback(() => {
      if (!initialLoaded || !userId) return;
      // Only refresh status counts, not device contacts
      (async () => {
        try {
          // If total is 0 (no contacts on device), skip AsyncStorage read and keep all stats at 0
          if (stats.total === 0) {
            setStats({ total: 0, active: 0, maybeInvalid: 0, invalid: 0, unknown: 0 });
            return;
          }
          const allKeys = await AsyncStorage.getAllKeys();
          const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
          
          // Get current total from existing stats
          const currentTotal = stats.total;
          
          const contactStats: ContactStats = {
            total: currentTotal, // Keep total from initial load
            active: 0,
            maybeInvalid: 0,
            invalid: 0,
            unknown: Math.max(0, currentTotal - statusKeys.length),
          };

          if (statusKeys.length > 0) {
            const statusEntries = await AsyncStorage.multiGet(statusKeys);
            for (const [, value] of statusEntries) {
              switch (value) {
                case 'normal':
                  contactStats.active++;
                  contactStats.unknown = Math.max(0, contactStats.unknown - 1);
                  break;
                case 'suspected_stopped':
                  contactStats.maybeInvalid++;
                  contactStats.unknown = Math.max(0, contactStats.unknown - 1);
                  break;
                case 'stopped':
                  contactStats.invalid++;
                  contactStats.unknown = Math.max(0, contactStats.unknown - 1);
                  break;
                default:
                  break;
              }
            }
          }

          setStats(contactStats);
        } catch (error) {
          console.warn('[Home] Failed to refresh status counts:', error);
        }
      })();
    }, [initialLoaded, userId, stats.total])
  );

  // 获取所有设备联系人（分页获取，与通讯录页面使用相同方法确保一致性）
  const getAllDeviceContacts = async (fields: Contacts.Fields[]) => {
    const safeFields = fields.filter((f) => f != null && f !== undefined) as Contacts.Fields[];
    if (safeFields.length === 0) return [];

    // 使用分页 getContactsAsync（与通讯录页面 loadContacts 一致的方法）
    try {
      console.log('[Home] Fetching contacts with getContactsAsync pagination...');
      let allContacts: any[] = [];
      let pageOffset = 0;
      const pageSize = 500;
      while (true) {
        const result = await Contacts.getContactsAsync({
          fields: safeFields,
          pageSize,
          pageOffset,
        });
        const pageContacts = result?.data || [];
        console.log('[Home] Page offset:', pageOffset, 'got:', pageContacts.length, 'contacts');
        if (pageContacts.length === 0) break;
        allContacts = allContacts.concat(pageContacts);
        pageOffset += pageContacts.length;
        if (pageContacts.length < pageSize) break;
      }
      console.log('[Home] Total contacts fetched via pagination:', allContacts.length);
      return allContacts;
    } catch (error) {
      console.error('[Home] getContactsAsync pagination failed:', error);
      // Last resort fallback: try getContactsAsync
      try {
        console.log('[Home] Last resort: trying getContactsAsync...');
        const result = await Contacts.getContactsAsync({ fields: safeFields });
        if (Array.isArray(result)) return result;
        if ((result as any)?.data) return (result as any).data;
        return [];
      } catch (error2) {
        console.error('[Home] getContactsAsync also failed:', error2);
        return [];
      }
    }
  };

  // 阈值配置（与服务端保持一致）
  const CONFIRMED_THRESHOLD = 5;
  const MAYBE_THRESHOLD = 1;

  // 一键检测功能 - 使用服务端聚合API
  const runDetection = async () => {
    if (detecting) return;
    
    setDetecting(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限才能进行检测');
        setDetecting(false);
        return;
      }

      // 分页获取所有设备通讯录
      const deviceContacts = await getAllDeviceContacts([
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Name,
      ]);

      if (!deviceContacts || deviceContacts.length === 0) {
        Alert.alert('提示', '未找到通讯录联系人');
        setDetecting(false);
        return;
      }

      // 收集所有电话号码
      const allPhones = deviceContacts
        .map(c => c.phoneNumbers?.[0]?.number || '')
        .filter(p => p.length > 0);

      if (allPhones.length === 0) {
        Alert.alert('提示', '未找到有效的电话号码');
        setDetecting(false);
        return;
      }

      // 调用服务端一键检测API
      const baseUrl = getBackendBaseUrl();
      const response = await fetch(`${baseUrl}/api/v1/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId || 'anonymous',
        },
        body: JSON.stringify({ phones: allPhones }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.results) {
        throw new Error('检测失败');
      }

      // 缓存社区投票结果
      await AsyncStorage.setItem('@community_votes_cache', JSON.stringify(data.results));

      // 统计检测结果
      const result = {
        total: data.results.length,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: 0,
      };

      // 保存疑似停机号码列表（供"可能失效"页面使用）
      const suspectedPhones: Array<{ phone: string; name: string; votes: any; authenticated: any }> = [];

      for (const item of data.results) {
        // 找到对应的联系人姓名
        const contact = deviceContacts.find(c => c.phoneNumbers?.[0]?.number === item.phone);
        const contactName = contact?.displayName || contact?.name || '';

        switch (item.status) {
          case 'normal':
            result.active++;
            break;
          case 'suspected_stopped':
            result.maybeInvalid++;
            suspectedPhones.push({
              phone: item.phone,
              name: contactName,
              votes: item.votes,
              authenticated: item.authenticated,
            });
            break;
          case 'stopped':
            result.invalid++;
            break;
          default:
            result.unknown++;
        }
      }

      // 保存疑似停机列表到 AsyncStorage
      await AsyncStorage.setItem('@suspected_phones', JSON.stringify(suspectedPhones));
      setSuspectedCount(suspectedPhones.length);

      // 更新统计
      setStats({
        total: result.total,
        active: result.active,
        maybeInvalid: result.maybeInvalid,
        invalid: result.invalid,
        unknown: result.unknown,
      });

      // 保存检测结果（包含详细列表）
      setDetectionResult({ ...result, suspectedPhones });
    } catch (error) {
      console.error('检测失败:', error);
      Alert.alert('错误', '检测过程中发生错误，请重试');
    } finally {
      setDetecting(false);
    }
  };

  const handleImport = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("权限不足", "需要通讯录权限才能导入");
        return;
      }
      
      // Show two options: DocumentPicker or Scan Local Files
      Alert.alert(
        '选择导入方式',
        '请选择如何导入通讯录备份文件：',
        [
          {
            text: '从文件选择器选择',
            onPress: () => handleImportFromPicker(),
          },
          {
            text: '扫描本地文件',
            onPress: () => handleScanLocalFiles(),
          },
          { text: '取消', style: 'cancel' },
        ]
      );
    } catch (error) {
      setProgressVisible(false);
      const errMsg = (error as any)?.message || '';
      if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('canceled') || errMsg.includes('User canceled')) {
        return;
      }
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + (errMsg || '请重试'));
    }
  };

  // Import from system file picker
  const handleImportFromPicker = async () => {
    try {
      if (!DocumentPicker) {
        Alert.alert('提示', '当前环境不支持文件选择器，请使用"扫描本地文件"方式');
        return;
      }
      const result = await (DocumentPicker as any).getDocumentAsync({
        type: ['text/vcard', 'application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const file = result.assets[0];
      if (!file) return;
      
      const fileName = file.name || '';
      const fileUri = file.uri;
      const content = await FileSystemLegacy.readAsStringAsync(fileUri);
      
      if (fileName.endsWith('.json') || fileName.endsWith('.hbyun') || fileName.endsWith('.vcf')) {
        setProgressVisible(true);
        setProgressPercent(0);
        setProgressText('正在导入，请稍后...');
        await importFromContent(content, fileName, (percent) => {
          setProgressPercent(percent);
          setProgressText(`正在导入... ${percent}%`);
        });
        setProgressVisible(false);
      } else {
        Alert.alert("提示", "请选择 .vcf、.json 或 .hbyun 格式的文件");
      }
    } catch (error) {
      setProgressVisible(false);
      const errMsg = (error as any)?.message || '';
      if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('canceled') || errMsg.includes('User canceled')) {
        return;
      }
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + (errMsg || '请重试'));
    }
  };

  // Scan local directories for backup files
  const handleScanLocalFiles = async () => {
    setScanLoading(true);
    setScannedFiles([]);
    setScanModalVisible(true);

    try {
      const foundFiles: Array<{ name: string; path: string; size: number; modified: string }> = [];
      
      // Directories to scan - prioritize app-owned directories that are always accessible
      const scanDirs = [
        FileSystemLegacy.documentDirectory,
        FileSystemLegacy.cacheDirectory,
        FileSystemLegacy.externalFilesDirectory,
        // Try common shared directories (may fail on Android 11+ due to scoped storage)
        '/storage/emulated/0/Download',
        '/storage/emulated/0/Documents',
      ].filter(Boolean) as string[];

      for (const dir of scanDirs) {
        try {
          const dirInfo = await FileSystemLegacy.getInfoAsync(dir).catch(() => null);
          if (!dirInfo?.exists) continue;
          
          const files = await FileSystemLegacy.readDirectoryAsync(dir).catch(() => []);
          for (const fileName of files) {
            if (fileName.endsWith('.json') || fileName.endsWith('.hbyun') || fileName.endsWith('.vcf')) {
              const filePath = dir.endsWith('/') ? `${dir}${fileName}` : `${dir}/${fileName}`;
              try {
                const fileInfo = await FileSystemLegacy.getInfoAsync(filePath);
                // Only include files > 100 bytes (skip empty/tiny files)
                if (fileInfo.size && fileInfo.size > 100) {
                  foundFiles.push({
                    name: fileName,
                    path: filePath,
                    size: fileInfo.size || 0,
                    modified: fileInfo.modificationTime ? new Date(fileInfo.modificationTime * 1000).toLocaleString() : '',
                  });
                }
              } catch {}
            }
          }
        } catch {
          // Directory not accessible (scoped storage), skip silently
        }
      }

      // Also scan app's own backups directory
      const backupsDir = (FileSystemLegacy.documentDirectory || '') + 'backups/';
      try {
        const dirInfo = await FileSystemLegacy.getInfoAsync(backupsDir).catch(() => null);
        if (dirInfo?.exists) {
          const files = await FileSystemLegacy.readDirectoryAsync(backupsDir).catch(() => []);
          for (const fileName of files) {
            if (fileName.endsWith('.json') || fileName.endsWith('.hbyun') || fileName.endsWith('.vcf')) {
              const filePath = backupsDir.endsWith('/') ? `${backupsDir}${fileName}` : `${backupsDir}/${fileName}`;
              try {
                const fileInfo = await FileSystemLegacy.getInfoAsync(filePath);
                if (fileInfo.size && fileInfo.size > 100) {
                  // Avoid duplicates
                  if (!foundFiles.some(f => f.name === fileName)) {
                    foundFiles.push({
                      name: fileName,
                      path: filePath,
                      size: fileInfo.size || 0,
                      modified: fileInfo.modificationTime ? new Date(fileInfo.modificationTime * 1000).toLocaleString() : '',
                    });
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}

      // Sort by modification time (newest first)
      foundFiles.sort((a, b) => b.modified.localeCompare(a.modified));
      setScannedFiles(foundFiles);
    } catch (error) {
      console.error('扫描失败:', error);
    } finally {
      setScanLoading(false);
    }
  };

  // Import from scanned file
  const handleImportFromScannedFile = async (filePath: string, fileName: string) => {
    setScanModalVisible(false);
    try {
      const content = await FileSystemLegacy.readAsStringAsync(filePath);
      setProgressVisible(true);
      setProgressPercent(0);
      setProgressText('正在解析文件...');
      await importFromContent(content, fileName, (percent) => {
        setProgressPercent(percent);
        setProgressText(`正在导入... ${percent}%`);
      });
      setProgressVisible(false);
    } catch (error) {
      setProgressVisible(false);
      console.error('导入失败:', error);
      Alert.alert('错误', '导入失败: ' + ((error as any)?.message || '请重试'));
    }
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const importFromContent = async (content: string, fileName: string, onProgress?: (percent: number) => void) => {
    try {
      let contacts: Array<any> = [];
      if (fileName.endsWith(".json") || fileName.endsWith(".hbyun")) {
        const parsed = JSON.parse(content);
        // 支持号簿云备份格式 (HAOBUYUN_BACKUP)
        if (parsed.format === 'HAOBUYUN_BACKUP' && Array.isArray(parsed.contacts)) {
          contacts = parsed.contacts.map((c: any) => ({
            name: c.name || '',
            firstName: c.firstName || c.name || '',
            lastName: c.lastName || '',
            phones: c.phones || (c.phone ? [{ number: c.phone, label: 'mobile' }] : []),
            emails: c.emails || (c.email ? [{ email: c.email, label: 'home' }] : []),
            addresses: c.addresses || [],
            company: c.company || undefined,
            jobTitle: c.jobTitle || undefined,
            note: c.note || undefined,
            avatar: c.avatar || undefined,
          }));
        } else if (Array.isArray(parsed)) {
          // 兼容旧格式：直接是联系人数组
          contacts = parsed;
        }
      } else if (fileName.endsWith(".vcf")) {
        const vcardBlocks = content.split("BEGIN:VCARD");
        for (const block of vcardBlocks) {
          if (!block.includes("END:VCARD")) continue;
          const fnMatch = block.match(/FN:(.*)/);
          const telMatches = [...block.matchAll(/TEL[^:]*:(.*)/g)];
          const emailMatches = [...block.matchAll(/EMAIL[^:]*:(.*)/g)];
          const orgMatch = block.match(/ORG:(.*)/);
          const titleMatch = block.match(/TITLE:(.*)/);
          const noteMatch = block.match(/NOTE:(.*)/);
          if (telMatches.length > 0) {
            contacts.push({
              name: fnMatch ? fnMatch[1].trim() : "",
              phone: telMatches[0][1].trim(),
              email: emailMatches.length > 0 ? emailMatches[0][1].trim() : undefined,
              company: orgMatch ? orgMatch[1].trim() : undefined,
              jobTitle: titleMatch ? titleMatch[1].trim() : undefined,
              note: noteMatch ? noteMatch[1].trim() : undefined,
            });
          }
        }
      }
      if (contacts.length === 0) {
        Alert.alert("提示", "文件中没有找到有效的联系人数据");
        return;
      }
      let successCount = 0;
      let failCount = 0;
      const totalCount = contacts.length;

      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        try {
          const phone = contact.phone || contact.phones?.[0]?.number || '';

          const contactData: any = {
            name: contact.name || '',
            firstName: contact.firstName || contact.name || '',
            lastName: contact.lastName || '',
            phoneNumbers: contact.phones?.map((p: any) => ({
              number: p.number,
              label: (p.label && p.label !== 'null' && p.label !== 'undefined') ? p.label : 'mobile',
            })) || (phone ? [{ number: phone, label: 'mobile' }] : [{ number: '00000000000', label: 'mobile' }]),
          };
          // emails: 优先使用 phones 格式，兼容旧格式
          if (contact.emails?.length) {
            contactData.emails = contact.emails.map((e: any) => ({
              email: e.email,
              label: (e.label && e.label !== 'null' && e.label !== 'undefined') ? e.label : 'home',
            }));
          } else if (contact.email) {
            contactData.emails = [{ email: contact.email, label: 'home' }];
          }
          // addresses
          if (contact.addresses?.length) {
            contactData.postalAddresses = contact.addresses.map((a: any) => ({
              street: a.street || '', city: a.city || '', region: a.region || '',
              postalCode: a.postalCode || '', country: a.country || '',
            }));
          }
          if (contact.company) contactData.company = contact.company;
          if (contact.jobTitle) contactData.jobTitle = contact.jobTitle;
          if (contact.note) contactData.note = contact.note;
          // 写入头像：将base64数据写入临时文件，设置image字段
          if (contact.avatar && typeof contact.avatar === 'string' && contact.avatar.length > 100) {
            try {
              const base64Data = contact.avatar.replace(/^data:image\/\w+;base64,/, '');
              const avatarPath = FileSystemLegacy.cacheDirectory + `avatar_import_${i}_${Date.now()}.jpg`;
              await FileSystemLegacy.writeAsStringAsync(avatarPath, base64Data, {
                encoding: FileSystemLegacy.EncodingType.Base64,
              });
              contactData.image = { uri: avatarPath };
              if (i < 3 || i % 50 === 0) {
                console.log(`[Restore] Writing avatar for contact ${i}: ${contact.name}, path: ${avatarPath}`);
              }
            } catch (avatarErr) {
              console.warn(`[Restore] Avatar write failed for contact ${i}:`, avatarErr);
            }
          }
          await Contacts.addContactAsync(contactData);
          successCount++;
        } catch (e: any) {
          failCount++;
          if (failCount <= 3) {
            console.error(`[Restore] Failed to add contact ${i}: ${contact.name}`, e?.message || e);
          }
        }
        // Update progress
        if (onProgress) {
          onProgress(Math.round(((i + 1) / totalCount) * 100));
        }
      }
      let msg = `成功导入 ${successCount} 个联系人`;
      if (failCount > 0) msg += `，${failCount} 个失败`;
      const withAvatar = contacts.filter((c: any) => c.avatar).length;
      console.log(`[Restore] Import complete. Total: ${totalCount}, Success: ${successCount}, Failed: ${failCount}, With avatar: ${withAvatar}`);
      fetchStats();
      Alert.alert("导入完成", msg);
    } catch (error) {
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + ((error as any)?.message || '请重试'));
    }
  };

  const importFromFile = async (fileName: string) => {
    try {
      const filePath = FileSystemLegacy.documentDirectory + fileName;
      const content = await FileSystemLegacy.readAsStringAsync(filePath);
      let contacts: Array<{ name: string; phone: string; email?: string; company?: string; jobTitle?: string; note?: string }> = [];
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          contacts = parsed;
        } else if (parsed && parsed.format === 'HAOBUYUN_BACKUP' && Array.isArray(parsed.contacts)) {
          // 处理 HAOBUYUN_BACKUP 格式
          contacts = parsed.contacts.map((c: any) => ({
            name: c.name || '',
            phone: c.phones?.[0]?.number || c.phone || '',
            email: c.emails?.[0]?.email || c.email || undefined,
            company: c.company || undefined,
            jobTitle: c.jobTitle || undefined,
            note: c.note || undefined,
            avatar: c.avatar || undefined,
          }));
        } else {
          contacts = [];
        }
      } else if (fileName.endsWith(".vcf")) {
        const vcardBlocks = content.split("BEGIN:VCARD");
        for (const block of vcardBlocks) {
          if (!block.includes("END:VCARD")) continue;
          const fnMatch = block.match(/FN:(.*)/);
          const telMatches = [...block.matchAll(/TEL[^:]*:(.*)/g)];
          const emailMatches = [...block.matchAll(/EMAIL[^:]*:(.*)/g)];
          const orgMatch = block.match(/ORG:(.*)/);
          const titleMatch = block.match(/TITLE:(.*)/);
          const noteMatch = block.match(/NOTE:(.*)/);
          if (telMatches.length > 0) {
            contacts.push({
              name: fnMatch ? fnMatch[1].trim() : "",
              phone: telMatches[0][1].trim(),
              email: emailMatches.length > 0 ? emailMatches[0][1].trim() : undefined,
              company: orgMatch ? orgMatch[1].trim() : undefined,
              jobTitle: titleMatch ? titleMatch[1].trim() : undefined,
              note: noteMatch ? noteMatch[1].trim() : undefined,
            });
          }
        }
      }
      if (contacts.length === 0) {
        Alert.alert("提示", "文件中没有找到有效的联系人数据");
        return;
      }
      let successCount = 0;
      let failCount = 0;
      for (const contact of contacts) {
        try {
          const contactData: any = {
            name: contact.name,
            phoneNumbers: [{ number: contact.phone }],
          };
          if (contact.email) contactData.emails = [{ email: contact.email }];
          if (contact.company) contactData.company = contact.company;
          if (contact.jobTitle) contactData.jobTitle = contact.jobTitle;
          if (contact.note) contactData.note = contact.note;
          // 写入头像：将base64数据写入临时文件
          if (contact.avatar && typeof contact.avatar === 'string' && contact.avatar.length > 100) {
            try {
              const base64Data = contact.avatar.replace(/^data:image\/\w+;base64,/, '');
              const avatarPath = FileSystemLegacy.cacheDirectory + `avatar_file_${Date.now()}.jpg`;
              await FileSystemLegacy.writeAsStringAsync(avatarPath, base64Data, {
                encoding: FileSystemLegacy.EncodingType.Base64,
              });
              contactData.image = { uri: avatarPath };
            } catch (avatarErr) {
              console.warn(`[Restore] Avatar write failed:`, avatarErr);
            }
          }
          await Contacts.addContactAsync(contactData);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      Alert.alert("导入完成", `成功导入 ${successCount} 个联系人${failCount > 0 ? "，失败 " + failCount + " 个" : ""}`);
      fetchStats();
    } catch (error) {
      console.error("导入文件失败:", error);
      Alert.alert("错误", "导入文件失败，请重试");
    }
  };

  const handleExport = async () => {
    try {
      setProgressVisible(true);
      setProgressPercent(0);
      setProgressText('正在导出，请稍后...');
      // 直接使用 generateBackupData 确保格式与云端备份完全一致
      const backupData = await generateBackupData();
      const contactCount = backupData.contacts.length;
      const defaultFileName = formatBackupFileName(contactCount, getDeviceModel());
      const backupContent = JSON.stringify(backupData, null, 2);
      setProgressPercent(50);
      setProgressText('正在写入文件...');

      // Android: Use StorageAccessFramework to let user choose save location (shows system save dialog, NOT share sheet)
      if (Platform.OS === 'android') {
        const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          setProgressVisible(false);
          return; // User cancelled directory selection
        }
        const fileUri = await StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          defaultFileName,
          'application/json'
        );
        await FileSystemLegacy.writeAsStringAsync(fileUri, backupContent, { encoding: FileSystemLegacy.EncodingType.UTF8 });
        setProgressPercent(100);
        setProgressText('导出完成！');
        Alert.alert('导出成功', `已导出 ${contactCount} 个联系人（含标签状态）\n仅号簿云可恢复此格式`);
      } else {
        // iOS: use cache directory + Sharing (iOS share sheet is the standard way to save files)
        const fileUri = FileSystemLegacy.cacheDirectory + defaultFileName;
        await FileSystemLegacy.writeAsStringAsync(fileUri, backupContent, { encoding: FileSystemLegacy.EncodingType.UTF8 });
        setProgressPercent(100);
        setProgressText('导出完成！');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: '号簿云备份',
          });
        }
        Alert.alert('导出成功', `已导出 ${contactCount} 个联系人（含标签状态）`);
      }
    } catch (error) {
      // User canceled - don't show error
      const errMsg = (error as any)?.message || '';
      if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('canceled') || errMsg.includes('User canceled')) {
        setProgressVisible(false);
        return;
      }
      console.error("导出失败:", error);
      Alert.alert("错误", "导出失败: " + (errMsg || '请重试'));
    } finally {
      setProgressVisible(false);
    }
  };

  // 本地备份相关函数
  const handleBackup = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限才能备份');
        return;
      }

      setBackupLoading(true);

      const allContacts = await getAllDeviceContacts([
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Name,
        Contacts.Fields.Emails,
        Contacts.Fields.PostalAddresses,
        Contacts.Fields.JobTitle,
        Contacts.Fields.Company,
        Contacts.Fields.Note,
      ]);

      if (!allContacts || allContacts.length === 0) {
        Alert.alert('提示', '未找到通讯录联系人');
        setBackupLoading(false);
        return;
      }

      // 生成 vCard 3.0 格式内容
      const vcardLines: string[] = [];
      for (const c of allContacts) {
        if (!c.phoneNumbers || c.phoneNumbers.length === 0) continue;
        
        vcardLines.push('BEGIN:VCARD');
        vcardLines.push('VERSION:3.0');
        vcardLines.push(`FN:${c.name || ''}`);
        
        const nameParts = (c.name || '').split('');
        const lastName = nameParts.length > 1 ? nameParts[0] : '';
        const firstName = nameParts.length > 1 ? nameParts.slice(1).join('') : (c.name || '');
        vcardLines.push(`N:${lastName};${firstName};;;`);
        
        for (const phone of c.phoneNumbers) {
          const rawLabel = phone.label;
          const label = (rawLabel && rawLabel !== 'null' && rawLabel !== 'undefined') ? rawLabel : 'CELL';
          const typeMap: Record<string, string> = {
            'mobile': 'CELL',
            'home': 'HOME',
            'work': 'WORK',
            'iPhone': 'CELL',
          };
          const telType = typeMap[label] || 'CELL';
          vcardLines.push(`TEL;TYPE=${telType}:${phone.number || ''}`);
        }
        
        if (c.emails) {
          for (const email of c.emails) {
            vcardLines.push(`EMAIL;TYPE=INTERNET:${email.email || ''}`);
          }
        }
        
        if (c.postalAddresses && c.postalAddresses.length > 0) {
          for (const addr of c.postalAddresses) {
            vcardLines.push(`ADR;TYPE=HOME:;;${addr.street || ''};${addr.city || ''};${addr.region || ''};${addr.postalCode || ''};${addr.country || ''}`);
          }
        }
        
        if (c.company) vcardLines.push(`ORG:${c.company}`);
        if (c.jobTitle) vcardLines.push(`TITLE:${c.jobTitle}`);
        if (c.note) vcardLines.push(`NOTE:${c.note}`);
        
        vcardLines.push('END:VCARD');
      }

      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0');
      const defaultFileName = `通讯录备份_${dateStr}.vcf`;

      // 保存待写入的内容
      const vcardContent = vcardLines.join('\n');
      const contactCount = vcardLines.filter(l => l === 'BEGIN:VCARD').length;

      // Always use cache directory + sharing approach to avoid Android SAF filename issues
      const fileUri = FileSystemLegacy.cacheDirectory + defaultFileName;
      await FileSystemLegacy.writeAsStringAsync(fileUri, vcardContent, { encoding: FileSystemLegacy.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/vcard',
          dialogTitle: '通讯录备份',
        });
        Alert.alert('备份成功', `已备份 ${contactCount} 个联系人`);
        setBackupLoading(false);
      } else {
        // Fallback: save to document directory via filename modal
        (global as any).__pendingBackupVcard = vcardContent;
        (global as any).__pendingBackupCount = contactCount;

        // 弹出文件名输入框
        setCustomFileName(defaultFileName);
        setFileNameModalVisible(true);
        
        // 标记为备份模式
        (global as any).__pendingBackupMode = true;
      }
    } catch (error) {
      console.error('备份失败:', error);
      Alert.alert('错误', '备份失败，请重试');
      setBackupLoading(false);
    }
  };

  // 确认备份/导出文件名并保存
  const confirmFileSave = async () => {
    const isBackupMode = (global as any).__pendingBackupMode;
    const vcardContent = isBackupMode ? (global as any).__pendingBackupVcard : (global as any).__pendingVcard;
    const contactCount = isBackupMode ? (global as any).__pendingBackupCount : (global as any).__pendingVcardCount || 0;
    // 根据模式选择正确的文件扩展名
    const expectedExt = isBackupMode ? '.vcf' : '.json';
    const safeFileName = customFileName.trim().endsWith(expectedExt) 
      ? customFileName.trim() 
      : `${customFileName.trim()}${expectedExt}`;
    const filePath = `${FileSystemLegacy.documentDirectory}${safeFileName}`;
    
    try {
      await FileSystemLegacy.writeAsStringAsync(filePath, vcardContent);
      Alert.alert(isBackupMode ? '备份成功' : '导出成功', `已${isBackupMode ? '备份' : '导出'} ${contactCount} 个联系人\n文件：${safeFileName}`);
      if (isBackupMode) fetchBackupList();
    } catch (error) {
      console.error('写入文件失败:', error);
      Alert.alert('错误', `${isBackupMode ? '备份' : '导出'}失败，请重试`);
    }
    
    setFileNameModalVisible(false);
    setBackupLoading(false);
    (global as any).__pendingVcard = null;
    (global as any).__pendingVcardCount = null;
    (global as any).__pendingBackupVcard = null;
    (global as any).__pendingBackupCount = null;
    (global as any).__pendingBackupMode = null;
  };

  const fetchBackupList = async () => {
    try {
      // Read from LOCAL_BACKUP_DIR (backups/ subdirectory)
      const backupDir = LOCAL_BACKUP_DIR;
      const dirInfo = await FileSystemLegacy.getInfoAsync(backupDir).catch(() => null);
      let backupFiles: string[] = [];
      
      if (dirInfo?.exists) {
        const files = await FileSystemLegacy.readDirectoryAsync(backupDir);
        backupFiles = files
          .filter(f => (f.startsWith('contacts_backup_') && f.endsWith('.json')) || (f.startsWith('通讯录备份_') && f.endsWith('.vcf')))
          .sort()
          .reverse();
      }
      
      // Also check documentDirectory root for legacy backups
      const rootFiles = await FileSystemLegacy.readDirectoryAsync(FileSystemLegacy.documentDirectory || '');
      const rootBackupFiles = rootFiles
        .filter(f => (f.startsWith('contacts_backup_') && f.endsWith('.json')) || (f.startsWith('通讯录备份_') && f.endsWith('.vcf')))
        .sort()
        .reverse();
      
      // Combine both sources
      const allBackupFiles = [...new Set([...backupFiles, ...rootBackupFiles])];

      const backupList = await Promise.all(
        allBackupFiles.map(async (fileName) => {
          // Try LOCAL_BACKUP_DIR first, then documentDirectory root
          let filePath = `${backupDir}${fileName}`;
          const fileInfo = await FileSystemLegacy.getInfoAsync(filePath).catch(() => null);
          if (!fileInfo?.exists) {
            filePath = `${FileSystemLegacy.documentDirectory}${fileName}`;
          }
          const content = await FileSystemLegacy.readAsStringAsync(filePath);
          
          let contactCount = 0;
          let contacts: any[] = [];
          
          if (fileName.endsWith('.json')) {
            const parsed = JSON.parse(content);
            // Handle HAOBUYUN_BACKUP format: { format: 'HAOBUYUN_BACKUP', contacts: [...] }
            if (parsed.format === 'HAOBUYUN_BACKUP' && Array.isArray(parsed.contacts)) {
              contacts = parsed.contacts.map((c: any) => ({
                name: c.name || '',
                phone: c.phones?.[0]?.number || c.phone || '',
                email: c.emails?.[0]?.email || c.email || '',
                company: c.company || '',
                jobTitle: c.jobTitle || '',
                note: c.note || '',
              }));
            } else if (Array.isArray(parsed)) {
              contacts = parsed;
            } else {
              contacts = [];
            }
            contactCount = contacts.length;
            const timestamp = fileName.replace('contacts_backup_', '').replace('.json', '');
            const date = new Date(
              parseInt(timestamp.substring(0, 4)),
              parseInt(timestamp.substring(4, 6)) - 1,
              parseInt(timestamp.substring(6, 8)),
              parseInt(timestamp.substring(9, 11)),
              parseInt(timestamp.substring(11, 13)),
              parseInt(timestamp.substring(13, 15))
            );
            return { fileName, filePath, created_at: date.toISOString(), contact_count: contactCount, contacts };
          } else {
            // vcf file
            contactCount = (content.match(/BEGIN:VCARD/g) || []).length;
            const vcardBlocks = content.split('BEGIN:VCARD');
            for (const block of vcardBlocks) {
              if (!block.includes('END:VCARD')) continue;
              const fnMatch = block.match(/FN:(.*)/);
              const telMatches = [...block.matchAll(/TEL[^:]*:(.*)/g)];
              const emailMatches = [...block.matchAll(/EMAIL[^:]*:(.*)/g)];
              const orgMatch = block.match(/ORG:(.*)/);
              const titleMatch = block.match(/TITLE:(.*)/);
              const noteMatch = block.match(/NOTE:(.*)/);
              
              if (telMatches.length > 0) {
                contacts.push({
                  name: fnMatch ? fnMatch[1].trim() : '',
                  phone: telMatches[0][1].trim(),
                  email: emailMatches.length > 0 ? emailMatches[0][1].trim() : '',
                  company: orgMatch ? orgMatch[1].trim() : '',
                  jobTitle: titleMatch ? titleMatch[1].trim() : '',
                  note: noteMatch ? noteMatch[1].trim() : '',
                });
              }
            }
            
            const dateStr = fileName.replace('通讯录备份_', '').replace('.vcf', '');
            const date = new Date(
              parseInt(dateStr.substring(0, 4)),
              parseInt(dateStr.substring(4, 6)) - 1,
              parseInt(dateStr.substring(6, 8))
            );
            return { fileName, filePath, created_at: date.toISOString(), contact_count: contactCount, contacts };
          }
        })
      );

      // If no local backups, fall back to cloud backups
      if (backupList.length === 0 && user?.id) {
        try {
          const response = await fetch(`${getBackendBaseUrl()}/api/v1/backups`, {
            headers: { 'x-user-id': user.id },
          });
          if (response.ok) {
            const cloudBackups = await response.json();
            // Take the 2 most recent cloud backups
            const recentCloudBackups = (cloudBackups || []).slice(0, 2).map((b: any) => ({
              fileName: b.name || b.fileName || 'cloud_backup',
              filePath: '',
              created_at: b.created_at || new Date().toISOString(),
              contact_count: b.metadata?.contact_count || 0,
              contacts: [],
              isCloud: true,
              cloudKey: b.name || b.key,
            }));
            setBackups(recentCloudBackups);
            return;
          }
        } catch (cloudErr) {
          console.warn('Failed to fetch cloud backups:', cloudErr);
        }
      }

      setBackups(backupList);
    } catch (error) {
      console.error('获取备份列表失败:', error);
    }
  };

  const handleRestore = async (backup?: any) => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('权限不足', '需要通讯录权限才能恢复');
        return;
      }

      setBackupLoading(true);

      let backupData = backup?.contacts;
      if (!backupData) {
        if (backups.length === 0) {
          Alert.alert('提示', '没有找到备份文件');
          setBackupLoading(false);
          return;
        }
        backupData = backups[0].contacts;
      }

      let successCount = 0;
      let failCount = 0;
      let skipCount = 0;

      // 先加载设备上已有的联系人，用于去重
      const existingPhones = new Set<string>();
      try {
        const existing = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 9999,
        });
        for (const c of existing.data) {
          if (c.phoneNumbers) {
            for (const p of c.phoneNumbers) {
              if (p.number) {
                existingPhones.add(p.number.replace(/\D/g, ''));
              }
            }
          }
        }
      } catch (e) {
        // 如果获取失败，继续恢复但不去重
        console.warn('获取已有联系人失败，跳过去重:', e);
      }

      for (const contact of backupData) {
        try {
          // Support both { phone: '...' } and { phones: [{ number: '...' }] } formats
          const phoneNumber = contact.phone || contact.phones?.[0]?.number || '';
          if (!phoneNumber) { failCount++; continue; }

          // 去重检查：如果设备上已有相同号码，跳过
          const normalizedPhone = phoneNumber.replace(/\D/g, '');
          if (existingPhones.has(normalizedPhone)) {
            skipCount++;
            continue;
          }

          const contactData: any = {
            name: contact.name || '',
            phoneNumbers: [{ number: phoneNumber }],
          };
          if (contact.email) contactData.emails = [{ email: contact.email }];
          if (contact.company) contactData.company = contact.company;
          if (contact.jobTitle) contactData.jobTitle = contact.jobTitle;
          if (contact.note) contactData.note = contact.note;
          await Contacts.addContactAsync(contactData);
          existingPhones.add(normalizedPhone); // 防止备份中有重复号码
          successCount++;
        } catch (e) {
          failCount++;
        }
      }

      let msg = `成功导入 ${successCount} 个联系人`;
      if (skipCount > 0) msg += `，跳过 ${skipCount} 个已存在`;
      if (failCount > 0) msg += `，失败 ${failCount} 个`;
      Alert.alert('恢复完成', msg);
      fetchStats();
    } catch (error) {
      console.error('恢复失败:', error);
      Alert.alert('错误', '恢复失败，请重试');
    } finally {
      setBackupLoading(false);
    }
  };

  // ========== Supabase Storage 云端备份/恢复 ==========

  // ========== Helper functions for backup ==========
  const getDeviceModel = (): string => {
    if (Constants.deviceName) return Constants.deviceName.replace(/[^a-z0-9\-]/gi, '-').substring(0, 20);
    const brand = (Platform as any).constants?.Brand || '';
    const model = (Platform as any).constants?.Model || '';
    const deviceStr = (brand + ' ' + model).trim() || 'Unknown';
    return deviceStr.replace(/[^a-z0-9\-]/gi, '-').substring(0, 20);
  };

  const formatBackupFileName = (count: number = 0, deviceName: string = ''): string => {
    const now = new Date();
    const dateStr = now.getFullYear().toString() + '-' +
      (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
      now.getDate().toString().padStart(2, '0');
    const timeStr = now.getHours().toString().padStart(2, '0') + '-' +
      now.getMinutes().toString().padStart(2, '0') + '-' +
      now.getSeconds().toString().padStart(2, '0');
    const safeDevice = (deviceName || 'Unknown').replace(/[^a-z0-9\-]/gi, '-').substring(0, 20);
    return '号簿云备份_' + safeDevice + '_' + count + '个号码_' + dateStr + '_' + timeStr + '.json';
  };

  const parseBackupFilename = (fileName: string): { displayTime: string; device: string; count: number } => {
    const base = fileName.replace('.json', '');
    let displayTime = fileName;
    let device = '';
    let count = 0;

    // Format 0: 号簿云备份_Device_Count个号码_YYYY-MM-DD_HH-mm-ss (newest)
    const deviceCountMatch = base.match(/^号簿云备份_(.+?)_(\d+)个号码_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/);
    if (deviceCountMatch) {
      device = deviceCountMatch[1];
      count = parseInt(deviceCountMatch[2], 10);
      displayTime = `${deviceCountMatch[3]} ${deviceCountMatch[4].replace(/-/g, ':')}`;
      return { displayTime, device, count };
    }

    // Format 0b: 号簿云备份_Count个号码_YYYY-MM-DD_HH-mm-ss (no device)
    const countMatch = base.match(/^号簿云备份_(\d+)个号码_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/);
    if (countMatch) {
      count = parseInt(countMatch[1], 10);
      displayTime = `${countMatch[2]} ${countMatch[3].replace(/-/g, ':')}`;
      return { displayTime, device, count };
    }

    // Format 0b: 号簿云备份YYYY-MM-DD_HH-mm-ss (no count, legacy)
    const newMatch = base.match(/^号簿云备份(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})$/);
    if (newMatch) {
      displayTime = `${newMatch[1]} ${newMatch[2].replace(/-/g, ':')}`;
      return { displayTime, device, count };
    }

    // Format 1: 号簿云备份_Device_Count个号码_YYYYMMDD_HHmmss (old)
    const fullMatch = base.match(/^号簿云备份_(.+)_(\d+)个号码_(\d{8})_(\d{6})$/);
    if (fullMatch) {
      device = fullMatch[1];
      count = parseInt(fullMatch[2], 10);
      const dateStr = fullMatch[3];
      const timeStr = fullMatch[4];
      displayTime = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
      return { displayTime, device, count };
    }

    // Format 2: 号簿云备份_YYYYMMDD_HHmmss (simple)
    const simpleMatch = base.match(/^号簿云备份_(\d{8})_(\d{6})$/);
    if (simpleMatch) {
      const dateStr = simpleMatch[1];
      const timeStr = simpleMatch[2];
      displayTime = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
      return { displayTime, device, count };
    }

    // Format 3: 号簿云备份_YYYYMMDD_HHmmss_Device_Count (legacy)
    const legacyMatch = base.match(/^号簿云备份_(\d{8})_(\d{6})_(.*)$/);
    if (legacyMatch) {
      const dateStr = legacyMatch[1];
      const timeStr = legacyMatch[2];
      const rest = legacyMatch[3];
      displayTime = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)} ${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}`;
      const restParts = rest.split('_');
      const lastPart = restParts[restParts.length - 1];
      if (/^\d+$/.test(lastPart) && restParts.length > 1) {
        count = parseInt(lastPart, 10);
        device = restParts.slice(0, -1).join('_');
      } else {
        device = rest;
      }
      return { displayTime, device, count };
    }
    const parts = base.split('_');
    if (parts.length >= 2) {
      const datePart = parts[0];
      const timePart = parts[1];
      displayTime = `${datePart} ${timePart.replace(/-/g, ':')}`;
    }

    // Last part might be count
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      count = parseInt(lastPart, 10);
      if (parts.length >= 4) {
        device = parts.slice(2, -1).join('_');
      }
    } else {
      if (parts.length >= 3) {
        device = parts.slice(2).join('_');
      }
    }

    return { displayTime, device, count };
  };

  const LOCAL_BACKUP_DIR = (FileSystemLegacy.documentDirectory || '') + 'backups/';

  const saveLocalBackup = async (fileName: string, content: string) => {
    try {
      const dirInfo = await FileSystemLegacy.getInfoAsync(LOCAL_BACKUP_DIR).catch(() => null);
      if (!dirInfo?.exists) {
        await FileSystemLegacy.makeDirectoryAsync(LOCAL_BACKUP_DIR, { intermediates: true });
      }
      await FileSystemLegacy.writeAsStringAsync(LOCAL_BACKUP_DIR + fileName, content);
    } catch (err) {
      console.warn('Failed to save local backup:', err);
    }
  };

  const cleanupOldLocalBackups = async (keepCount: number = 10) => {
    try {
      const files = await FileSystemLegacy.readDirectoryAsync(LOCAL_BACKUP_DIR);
      if (!files || files.length <= keepCount) return;
      const sorted = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
      const toDelete = sorted.slice(keepCount);
      for (const file of toDelete) {
        await FileSystemLegacy.deleteAsync(LOCAL_BACKUP_DIR + file, { idempotent: true });
      }
    } catch (err) {
      console.warn('Failed to cleanup old backups:', err);
    }
  };

  const processAvatar = async (imageUri: string | null | undefined): Promise<string | null> => {
    if (!imageUri) return null;
    try {
      let base64: string | null = null;

      if (imageUri.startsWith('content://')) {
        // Android content URI — cannot read directly with file:// prefix
        // Copy to a temp file first, then read as base64
        const tempPath = FileSystemLegacy.cacheDirectory + `avatar_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        console.log('[Backup] Android content URI detected, copying to temp:', tempPath);
        await FileSystemLegacy.copyAsync({
          from: imageUri,
          to: tempPath,
        });
        const fileUri = tempPath.startsWith('file://') ? tempPath : 'file://' + tempPath;
        base64 = await FileSystemLegacy.readAsStringAsync(fileUri, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
        // Clean up temp file (best effort)
        try { await FileSystemLegacy.deleteAsync(fileUri, { idempotent: true }); } catch (_) { /* ignore */ }
      } else {
        // iOS file path or already has file:// prefix
        const normalizedUri = imageUri.startsWith('file://') ? imageUri : 'file://' + imageUri;
        base64 = await FileSystemLegacy.readAsStringAsync(normalizedUri, {
          encoding: FileSystemLegacy.EncodingType.Base64,
        });
      }

      if (base64 && base64.length > 0) {
        console.log('[Backup] Avatar base64 length:', base64.length, 'from:', imageUri.substring(0, 60));
        return 'data:image/jpeg;base64,' + base64;
      }
      return null;
    } catch (e: any) {
      console.log('[Backup] Avatar read failed:', imageUri, (e as any)?.message || e);
      return null;
    }
  };

  // 生成备份数据（复用现有逻辑）
  // hbyun-backup: data serialization engine, format v1.0
  const generateBackupData = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') throw new Error('需要通讯录权限');

    const allContacts = await getAllDeviceContacts([
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Name,
      Contacts.Fields.Emails,
      Contacts.Fields.PostalAddresses,
      Contacts.Fields.JobTitle,
      Contacts.Fields.Company,
      Contacts.Fields.Note,
      Contacts.Fields.Image,
      Contacts.Fields.RawImage,
    ]);
    if (!allContacts || allContacts.length === 0) throw new Error('通讯录中没有联系人');
    console.log("[Backup] Reading contacts... Found:", allContacts.length);

    // Debug: log first 5 contacts' image fields to diagnose avatar issues
    const imageAvailableCount = allContacts.filter(c => c.imageAvailable || c.image?.uri || (c as any).rawImage?.uri).length;
    console.log(`[Backup] Contacts with imageAvailable/image/rawImage: ${imageAvailableCount}/${allContacts.length}`);
    allContacts.slice(0, 5).forEach((c, i) => {
      const thumbUri = c.image?.uri || null;
      const rawUri = (c as any).rawImage?.uri || null;
      const imgAvail = c.imageAvailable;
      console.log(`[Backup] Contact[${i}] "${c.name || c.firstName || '?'}" imageAvailable=${imgAvail}, thumbUri=${thumbUri ? thumbUri.substring(0, 60) : 'null'}, rawUri=${rawUri ? rawUri.substring(0, 60) : 'null'}`);
    });

    const phoneKeys = allContacts
      .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
      .map(c => `@contact_status_${c.phoneNumbers[0].number}`);
    const statusEntries = phoneKeys.length > 0 ? await AsyncStorage.multiGet(phoneKeys) : [];
    const statusMap = new Map<string, string>();
    statusEntries.forEach(([key, value]) => {
      if (value) statusMap.set(key.replace('@contact_status_', ''), value);
    });

    const contactsData = await Promise.all(allContacts.map(async c => {
        const fullName = c.name && c.name.length > 1
          ? c.name
          : ((c.firstName || '') + ' ' + (c.lastName || '')).trim() || c.name || '';
        const avatarBase64 = await processAvatar(
          (c as any).rawImage?.uri || c.image?.uri || null
        );
        return {
          // 姓名全量字段
          name: fullName,
          firstName: c.firstName || '',
          lastName: c.lastName || '',
          // 头像
          avatar: avatarBase64,
          imageAvailable: !!c.imageAvailable,
          // 电话（含label）
          phones: (c.phoneNumbers || []).map(p => ({
            number: p.number || '',
            label: (p.label && p.label !== 'null' && p.label !== 'undefined') ? p.label : 'mobile',
            status: statusMap.get(p.number || '') || null,
          })),
          // 邮箱（含label）
          emails: (c.emails || []).map(e => ({ email: e.email || '', label: e.label || '' })),
          // 地址
          addresses: (c.addresses || []).map(a => ({
            street: a.street || '', city: a.city || '', region: a.region || '',
            postalCode: a.postalCode || '', country: a.country || '', label: a.label || '',
          })),
          // 组织与职位
          company: c.company || '',
          jobTitle: c.jobTitle || '',
          // 备注
          note: c.note || '',
        };
      }));
    const withAvatar = contactsData.filter(c => c.avatar !== null).length;
    const withoutAvatar = contactsData.length - withAvatar;
    console.log("[Backup] Total contacts:", contactsData.length, ", with avatar:", withAvatar, ", without avatar:", withoutAvatar);
    // 计算备份数据大小
    const backupJson = JSON.stringify({
      format: 'HAOBUYUN_BACKUP',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      device: 'mobile',
      device_model: Constants.deviceName || ((Platform as any).constants?.Brand || '') + ' ' + ((Platform as any).constants?.Model || '') || 'Unknown',
      contacts: contactsData,
    });
    const sizeKB = Math.round(backupJson.length / 1024);
    console.log(`[Backup] Backup data size: ${sizeKB}KB (${backupJson.length} bytes)`);
    if (withAvatar > 0) {
      const avatarSizes = contactsData.filter(c => c.avatar).map(c => (c.avatar as string).length);
      const avgAvatarSize = Math.round(avatarSizes.reduce((a, b) => a + b, 0) / avatarSizes.length / 1024);
      console.log(`[Backup] Avatar stats: count=${avatarSizes.length}, avgSize=${avgAvatarSize}KB`);
    }

    return {
      format: 'HAOBUYUN_BACKUP',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      device: 'mobile',
      device_model: Constants.deviceName || ((Platform as any).constants?.Brand || '') + ' ' + ((Platform as any).constants?.Model || '') || 'Unknown',
      contacts: contactsData,
    };
  };

  // 云端备份到 Supabase Storage
  const handleCloudBackup = async () => {
    if (!userId) {
      Alert.alert('提示', '请先登录');
      return;
    }
    Alert.alert(
      '确认云端备份',
      '确定要将当前通讯录备份到云端吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定备份',
          onPress: () => executeCloudBackup(),
        },
      ]
    );
  };

  const executeCloudBackup = async () => {
    console.log("[Backup] Starting full backup...");
    setCloudLoading(true);
    setCloudBackupLoading('uploading');
    setProgressVisible(true);
    setProgressPercent(0);
    setProgressText('正在备份，请稍后...');
    try {
      const backupData = await generateBackupData();
      const contactCount = backupData.contacts?.length || 0;
      
      if (contactCount === 0) {
        Alert.alert('提示', '通讯录中没有联系人，无法备份');
        return;
      }
      
      const content = JSON.stringify(backupData, null, 2);
      const fileName = formatBackupFileName(contactCount, getDeviceModel());

      // Log for debugging 0KB issue
      console.log(`[CloudBackup] fileName=${fileName}, contactCount=${contactCount}, contentLength=${content.length}`);

      if (content.length < 100) {
        console.error('[CloudBackup] Content too short, possible empty backup');
        Alert.alert('备份失败', '备份数据异常，请检查通讯录权限');
        return;
      }

      // Save local backup copy
      setProgressPercent(30);
      setProgressText('正在保存本地副本...');
      await saveLocalBackup(fileName, content);
      await cleanupOldLocalBackups(10);

      setProgressPercent(50);
      setProgressText('正在上传到云端...');
      console.log("[Backup] Content length:", content.length, "bytes");
      /**
       * 服务端文件：server/src/routes/backup.ts
       * 接口：POST /api/v1/backup/cloud
       * Headers: x-user-id: string
       * Body: { fileName: string, content: string }
       */
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/backup/cloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ fileName, content }),
      });

      const result = await response.json();
      console.log(`[CloudBackup] Server response: ok=${response.ok}, fileName=${result.fileName}`);
      
      if (!response.ok) throw new Error(result.error || '上传失败');
      if (!result.success || result.fileName !== fileName) {
        console.warn(`[CloudBackup] Unexpected response: expected fileName=${fileName}, got=${result.fileName}`);
      }

      setProgressPercent(100);
      setProgressText('备份完成！');
      Alert.alert('云端备份成功', `已备份 ${contactCount} 个联系人到云端`);
      loadCloudBackups();
    } catch (err: any) {
      console.error('Cloud backup error:', err);
      const msg = err?.message || '请检查网络后重试';
      Alert.alert('云端备份失败', msg);
    } finally {
      setCloudLoading(false);
      setCloudBackupLoading(null);
      setCloudProgress('');
      setProgressVisible(false);
    }
  };

  // 加载云端备份列表
  const loadCloudBackups = async () => {
    if (!userId) return;
    try {
      /**
       * 服务端文件：server/src/routes/backup.ts
       * 接口：GET /api/v1/backup/cloud
       * Headers: x-user-id: string
       */
      const response = await fetch(`${getBackendBaseUrl()}/api/v1/backup/cloud`, {
        headers: { 'x-user-id': userId },
      });
      const result = await response.json();
      if (result.success) {
        setCloudBackups(result.files || []);
      } else {
        setCloudBackups([]);
      }
    } catch (err: any) {
      console.warn('Load cloud backups error:', err?.message);
      setCloudBackups([]);
    }
  };

  // 删除云端备份
  const handleDeleteBackup = (fileName: string) => {
    Alert.alert('确认删除', '确定删除此备份记录？删除后不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            /**
             * 服务端文件：server/src/routes/backup.ts
             * 接口：DELETE /api/v1/backup/cloud
             * Headers: x-user-id: string
             * Body: { fileName: string }
             */
            const response = await fetch(`${getBackendBaseUrl()}/api/v1/backup/cloud`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json', 'x-user-id': userId || '' },
              body: JSON.stringify({ fileName }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || '删除失败');

            // Also delete local file if exists
            try {
              const backupsDir = `${FileSystemLegacy.documentDirectory}backups/`;
              await FileSystemLegacy.deleteAsync(`${backupsDir}${fileName}`, { idempotent: true });
            } catch (_e) { /* ignore local delete error */ }

            Alert.alert('成功', '备份已删除');
            loadCloudBackups();
          } catch (err: any) {
            console.error('Delete backup error:', err);
            Alert.alert('错误', err?.message || '删除失败');
          }
        },
      },
    ]);
  };

  // 从云端恢复
  const handleCloudRestore = async (fileName: string) => {
    if (!userId) return;
    Alert.alert('确认恢复', '恢复将替换当前所有通讯录数据（先清空再导入），确定继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定恢复',
        style: 'destructive',
        onPress: async () => {
          setCloudLoading(true);
          setCloudBackupLoading('downloading');
          setProgressVisible(true);
          setProgressPercent(0);
          setProgressText('正在恢复，请稍后...');
          try {
            /**
             * 服务端文件：server/src/routes/backup.ts
             * 接口：GET /api/v1/backup/cloud/download?fileName=xxx
             * Headers: x-user-id: string
             */
            const response = await fetch(
              `${getBackendBaseUrl()}/api/v1/backup/cloud/download?fileName=${encodeURIComponent(fileName)}`,
              { headers: { 'x-user-id': userId } }
            );
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || '下载失败');

            setProgressPercent(20);
            setProgressText('正在解析数据...');
            const backupData = JSON.parse(result.content);

            if (!backupData.contacts || backupData.contacts.length === 0) {
              Alert.alert('提示', '备份文件中没有联系人数据');
              setCloudLoading(false);
              setCloudBackupLoading(null);
              setProgressVisible(false);
              return;
            }

            // Step 1: Delete ALL existing contacts from device
            setProgressPercent(30);
            setProgressText('正在清空当前通讯录...');
            try {
              const { data: existingContacts } = await Contacts.getContactsAsync({
                fields: [Contacts.Fields.PhoneNumbers],
              });
              if (existingContacts) {
                let deletedCount = 0;
                for (const contact of existingContacts) {
                  try {
                    await Contacts.removeContactAsync(contact.id);
                    deletedCount++;
                  } catch (_e) { /* skip individual delete failures */ }
                }
                console.log(`Deleted ${deletedCount} existing contacts`);
              }
            } catch (clearErr) {
              console.warn('Failed to clear contacts:', clearErr);
              // Continue anyway - try to add restored contacts
            }

            // Step 2: Add restored contacts
            const totalContacts = backupData.contacts.length;
            let successCount = 0;
            for (let i = 0; i < backupData.contacts.length; i++) {
              const contact = backupData.contacts[i];
              try {
                const contactName = contact.name || '';
                const contactFirstName = contact.firstName || contactName;
                const contactLastName = contact.lastName || '';
                const contactData: any = {
                  // 同时设置 name 和 firstName 兼容双平台
                  // Android 使用 name，iOS 使用 firstName/lastName
                  name: contactName,
                  firstName: contactFirstName,
                  lastName: contactLastName,
                  phoneNumbers: contact.phones?.map((p: any) => ({ number: p.number, label: (p.label && p.label !== 'null' && p.label !== 'undefined') ? p.label : 'mobile' })) || [{ number: '', label: 'mobile' }],
                };
                if (contact.emails?.length) {
                  contactData.emails = contact.emails.map((e: any) => ({ email: e.email, label: (e.label && e.label !== 'null' && e.label !== 'undefined') ? e.label : 'home' }));
                }
                if (contact.addresses?.length) {
                  contactData.postalAddresses = contact.addresses.map((a: any) => ({
                    street: a.street || '', city: a.city || '', region: a.region || '',
                    postalCode: a.postalCode || '', country: a.country || '',
                  }));
                }
                if (contact.company) contactData.company = contact.company;
                if (contact.jobTitle) contactData.jobTitle = contact.jobTitle;
                if (contact.note) contactData.note = contact.note;

                // 恢复头像：将base64写入临时文件，设置image字段
                if (contact.avatar) {
                  try {
                    const base64Data = contact.avatar.replace(/^data:image\/\w+;base64,/, '');
                    const avatarPath = FileSystemLegacy.cacheDirectory + `avatar_${Date.now()}_${i}.jpg`;
                    await FileSystemLegacy.writeAsStringAsync(avatarPath, base64Data, {
                      encoding: FileSystemLegacy.EncodingType.Base64,
                    });
                    contactData.image = { uri: avatarPath };
                  } catch (avatarErr) {
                    console.warn(`[Restore] Avatar failed for ${contactName}:`, avatarErr);
                  }
                }

                await Contacts.addContactAsync(contactData);
                successCount++;
                // Restore status tags to AsyncStorage
                for (const phone of contact.phones || []) {
                  if (phone.status && phone.number) {
                    await AsyncStorage.setItem('@contact_status_' + phone.number, phone.status);
                  }
                }
              } catch (_e) { /* skip failed contact */ }
              // Update progress (30% to 100%)
              setProgressPercent(30 + Math.round(((i + 1) / totalContacts) * 70));
              setProgressText(`正在恢复... ${i + 1}/${totalContacts}`);
            }

            setProgressPercent(100);
            setProgressText('恢复完成！');
            Alert.alert('恢复成功', `已替换通讯录，恢复 ${successCount} 个联系人`);
            loadCloudBackups();
          } catch (err: any) {
            console.error('Cloud restore error:', err);
            Alert.alert('恢复失败', err?.message || '请重试');
          } finally {
            setCloudLoading(false);
            setCloudBackupLoading(null);
            setCloudProgress('');
            setProgressVisible(false);
          }
        },
      },
    ]);
  };

  // 打开云端备份弹窗时加载列表
  const openCloudBackupModal = () => {
    setCloudBackupVisible(true);
    loadCloudBackups();
  };

  // 分享备份文件
  const handleShareBackup = async () => {
    try {
      setProgressVisible(true);
      setProgressPercent(0);
      setProgressText('正在生成备份数据...');
      const backupData = await generateBackupData();
      const contactCount = backupData.contacts.length;
      const defaultFileName = formatBackupFileName(contactCount, getDeviceModel());
      const backupContent = JSON.stringify(backupData, null, 2);

      setProgressPercent(60);
      setProgressText('正在准备分享...');
      const fileUri = FileSystemLegacy.cacheDirectory + defaultFileName;
      await FileSystemLegacy.writeAsStringAsync(fileUri, backupContent, { encoding: FileSystemLegacy.EncodingType.UTF8 });

      setProgressPercent(100);
      setProgressText('正在调起分享...');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '号簿云备份',
        });
      } else {
        Alert.alert('提示', '当前设备不支持分享功能');
      }
    } catch (error) {
      console.error('分享备份失败:', error);
      Alert.alert('错误', '分享备份失败: ' + ((error as any)?.message || '请重试'));
    } finally {
      setProgressVisible(false);
    }
  };

  const fetchStats = async () => {
    if (!userId) return;

    try {
      // 1. 获取设备联系人数量
      let deviceContactsCount = 0;
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('[Home] Contacts permission status:', status);
      
      let allDeviceContacts: any[] = [];
      if (status === 'granted') {
        allDeviceContacts = await getAllDeviceContacts([Contacts.Fields.PhoneNumbers]);
        console.log('[Home] Total device contacts fetched:', allDeviceContacts.length);
        
        // Count ALL contacts (including those without phone numbers)
        deviceContactsCount = allDeviceContacts.length;
        console.log('[Home] Total contacts (all):', allDeviceContacts.length);
        
        // 调试：打印前3个联系人的结构
        if (allDeviceContacts.length > 0) {
          console.log('[Home] Sample contact structure:', JSON.stringify(allDeviceContacts[0], null, 2));
        }
      } else {
        console.warn('[Home] Contacts permission not granted:', status);
      }

      // Bug 5 fix: If no contacts, reset all stats to 0
      if (deviceContactsCount === 0) {
        console.log('[Home] No contacts found, resetting stats to 0');
        setStats({
          total: 0,
          active: 0,
          maybeInvalid: 0,
          invalid: 0,
          unknown: 0,
        });
        return;
      }

      // 2. 从 AsyncStorage 读取状态分布（真正的标签数据源）
      // 只统计当前设备联系人中存在的号码，忽略过期的 AsyncStorage 条目
      const allKeys = await AsyncStorage.getAllKeys();
      const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
      
      // 构建当前设备联系人电话号码集合（用于过滤过期条目）
      const currentPhoneSet = new Set<string>();
      allDeviceContacts.forEach(c => {
        (c.phoneNumbers || []).forEach((p: any) => {
          const num = (p.number || '').replace(/\D/g, '');
          if (num.length >= 7) currentPhoneSet.add(num);
        });
      });
      
      const contactStats: ContactStats = {
        total: deviceContactsCount,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: 0,
      };

      if (statusKeys.length > 0) {
        const statusEntries = await AsyncStorage.multiGet(statusKeys);
        let matchedCount = 0;
        for (const [key, value] of statusEntries) {
          if (!value) continue;
          // 检查该条目对应的电话号码是否仍在设备联系人中
          const phone = key.replace('@contact_status_', '').replace(/\D/g, '');
          if (currentPhoneSet.size > 0 && !currentPhoneSet.has(phone)) {
            continue; // 跳过过期的条目
          }
          matchedCount++;
          switch (value) {
            case 'normal':
              contactStats.active++;
              break;
            case 'suspected_stopped':
              contactStats.maybeInvalid++;
              break;
            case 'stopped':
              contactStats.invalid++;
              break;
            default:
              break;
          }
        }
        contactStats.unknown = Math.max(0, deviceContactsCount - matchedCount);
      } else {
        contactStats.unknown = deviceContactsCount;
      }

      console.log('[Home] Final stats:', JSON.stringify(contactStats));
      setStats(contactStats);
    } catch (error) {
      console.error('[Home] Failed to fetch stats:', error);
      // 即使出错也设置一个基本的 stats，避免 UI 显示异常
      setStats(prev => prev);
    }
  };

  // 下拉刷新处理函数
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStats();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // 健康度 = (总号码 - 确认失效 - 可能失效) / 总号码 × 100%
  const healthPercentage = stats.total > 0
    ? Number((((stats.total - stats.invalid - stats.maybeInvalid) / stats.total) * 100).toFixed(2))
    : 100;

  // Debug logging for health percentage
  console.log('[Health] Stats:', JSON.stringify(stats));
  console.log('[Health] Calculation: total=', stats.total, 'invalid=', stats.invalid, 'maybeInvalid=', stats.maybeInvalid);
  console.log('[Health] Percentage:', healthPercentage);
  console.log('[Health] Will render:', `${healthPercentage}%`);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F5F7FA' }]}>
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 疑似停机提示条 */}
        {suspectedCount > 0 && (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => router.push('/suspected-contacts')}
          >
            <View style={styles.warningBannerLeft}>
              <Ionicons name="warning" size={20} color="#E6A23C" />
              <Text style={styles.warningBannerText}>
                {suspectedCount} 个号码疑似停机，点击查看详情
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#E6A23C" />
          </TouchableOpacity>
        )}

        {/* 健康度仪表盘 */}
        <View style={styles.dashboardCard}>
          {/* 用户头像在左上角 */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {displayAvatarUrl ? (
                <Image source={{ uri: displayAvatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>
                  {userEmail.split('@')[0]?.[0]?.toUpperCase() || 'U'}
                </Text>
              )}
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
          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => router.push('/suspected-contacts')}
          >
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
              <Ionicons name="alert-circle" size={24} color="#E6A23C" />
              {suspectedCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{suspectedCount}</Text>
                </View>
              )}
            </View>
            <Text style={styles.actionText}>可能失效</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={() => openCloudBackupModal()}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
              <Ionicons name="cloud" size={24} color="#67C23A" />
            </View>
            <Text style={styles.actionText}>云端备份</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={handleImport}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(144, 105, 217, 0.12)' }]}>
              <Ionicons name="download" size={24} color="#9069D9" />
            </View>
            <Text style={styles.actionText}>导入通讯录</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={handleExport}>
            <View style={[styles.actionIcon, { backgroundColor: 'rgba(245, 108, 108, 0.12)' }]}>
              <Ionicons name="share-outline" size={24} color="#F56C6C" />
            </View>
            <Text style={styles.actionText}>导出通讯录</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 检测结果 Modal */}
      <Overlay visible={detectionResult !== null} onClose={() => setDetectionResult(null)}>
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
          {detectionResult && detectionResult.maybeInvalid > 0 && (
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#E6A23C' }]}
              onPress={() => {
                setDetectionResult(null);
                router.push('/suspected-contacts');
              }}
            >
              <Text style={styles.modalButtonText}>查看可能失效号码</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.modalButton}
            onPress={() => setDetectionResult(null)}
          >
            <Text style={styles.modalButtonText}>知道了</Text>
          </TouchableOpacity>
        </View>
      </Overlay>

      {/* 本地备份模态框 */}
      <Overlay visible={cloudBackupVisible} onClose={() => setCloudBackupVisible(false)}>
        <View style={styles.cloudModalContent}>
            <View style={styles.cloudModalHeader}>
              <Text style={styles.cloudModalTitle}>云端备份</Text>
              <TouchableOpacity onPress={() => setCloudBackupVisible(false)}>
                <Ionicons name="close" size={24} color="#909399" />
              </TouchableOpacity>
            </View>

            <View style={styles.cloudModalBody}>
              <View style={styles.cloudListContainer}>
                {/* 云端备份 */}
                <TouchableOpacity
                  style={styles.cloudListItem}
                  onPress={handleCloudBackup}
                  disabled={cloudBackupLoading !== null}
                >
                  <View style={[styles.cloudListIcon, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
                    <Ionicons name="cloud-upload" size={22} color="#4A90D9" />
                  </View>
                  <Text style={styles.cloudListText}>
                    {cloudBackupLoading === 'uploading' ? '上传中...' : '云端备份'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#C0C4CC" />
                </TouchableOpacity>

                {/* 云端恢复 */}
                <TouchableOpacity
                  style={styles.cloudListItem}
                  onPress={() => {
                    loadCloudBackups();
                    setRestoreSelectVisible(true);
                  }}
                  disabled={cloudBackupLoading !== null}
                >
                  <View style={[styles.cloudListIcon, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
                    <Ionicons name="cloud-download" size={22} color="#67C23A" />
                  </View>
                  <Text style={styles.cloudListText}>
                    {cloudBackupLoading === 'downloading' ? '下载中...' : '云端恢复'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#C0C4CC" />
                </TouchableOpacity>

                {/* 备份记录 */}
                <TouchableOpacity
                  style={styles.cloudListItem}
                  onPress={() => { loadCloudBackups(); setBackupRecordsVisible(true); }}
                >
                  <View style={[styles.cloudListIcon, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
                    <Ionicons name="time" size={22} color="#E6A23C" />
                  </View>
                  <Text style={styles.cloudListText}>备份记录</Text>
                  <Ionicons name="chevron-forward" size={18} color="#C0C4CC" />
                </TouchableOpacity>

                {/* 分享备份 */}
                <TouchableOpacity
                  style={[styles.cloudListItem, { borderBottomWidth: 0 }]}
                  onPress={handleShareBackup}
                  disabled={cloudBackupLoading !== null}
                >
                  <View style={[styles.cloudListIcon, { backgroundColor: 'rgba(144, 147, 153, 0.12)' }]}>
                    <Ionicons name="share-outline" size={22} color="#909399" />
                  </View>
                  <Text style={styles.cloudListText}>分享备份</Text>
                  <Ionicons name="chevron-forward" size={18} color="#C0C4CC" />
                </TouchableOpacity>
              </View>
            </View>
        </View>
      </Overlay>

      {/* 恢复选择弹窗 */}
      <Overlay visible={restoreSelectVisible} onClose={() => setRestoreSelectVisible(false)}>
        <View style={[styles.cloudModalContent, { maxHeight: '70%' }]}>
          <View style={styles.cloudModalHeader}>
            <Text style={styles.cloudModalTitle}>请选择要恢复的数据</Text>
            <TouchableOpacity onPress={() => setRestoreSelectVisible(false)}>
              <Ionicons name="close" size={24} color="#909399" />
            </TouchableOpacity>
          </View>

          <View style={styles.cloudModalBody}>
            {cloudBackups.length > 0 ? (
              cloudBackups.map((backup, index) => {
                const parsed = parseBackupFilename(backup.name);
                return (
                  <TouchableOpacity
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 16,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: '#EBEEF5',
                    }}
                    onPress={() => {
                      setRestoreSelectVisible(false);
                      handleCloudRestore(backup.name);
                    }}
                    disabled={cloudBackupLoading !== null}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, color: '#303133', fontWeight: '500' }}>
                        {parsed.displayTime}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#909399', marginTop: 4 }}>
                        {parsed.device ? `设备：${parsed.device} — ` : ''}{parsed.count}个号码
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#C0C4CC" />
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="cloud-outline" size={48} color="#C0C4CC" />
                <Text style={{ fontSize: 14, color: '#909399', marginTop: 12 }}>暂无云端备份记录</Text>
              </View>
            )}

            <TouchableOpacity
              style={{
                marginTop: 16,
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: '#F2F6FC',
                alignItems: 'center',
              }}
              onPress={() => setRestoreSelectVisible(false)}
            >
              <Text style={{ fontSize: 15, color: '#909399', fontWeight: '500' }}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Overlay>

      {/* 备份记录弹窗 */}
      <Overlay visible={backupRecordsVisible} onClose={() => setBackupRecordsVisible(false)}>
        <View style={[styles.cloudModalContent, { maxHeight: '70%' }]}>
          <View style={styles.cloudModalHeader}>
            <Text style={styles.cloudModalTitle}>备份记录</Text>
            <TouchableOpacity onPress={() => setBackupRecordsVisible(false)}>
              <Ionicons name="close" size={24} color="#909399" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
            {cloudBackups.length > 0 ? (
              <View style={{ padding: 16, gap: 12 }}>
                {cloudBackups.map((backup, index) => {
                  const parsed = parseBackupFilename(backup.name);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        padding: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onLongPress={() => handleDeleteBackup(backup.name)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#303133' }}>
                          {parsed.displayTime}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#909399', marginTop: 4 }}>
                          {parsed.device ? `设备：${parsed.device} — ` : ''}{parsed.count}个号码
                          {'  '}({Math.round((backup.metadata?.size || 0) / 1024)}KB)
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() => handleDeleteBackup(backup.name)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#F56C6C" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="cloud-outline" size={48} color="#DCDFE6" />
                <Text style={{ fontSize: 14, color: '#909399', marginTop: 12 }}>暂无云端备份记录</Text>
                <Text style={{ fontSize: 12, color: '#C0C4CC', marginTop: 4 }}>长按记录可删除</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Overlay>

      {/* 文件名输入弹窗 */}
      <Overlay visible={fileNameModalVisible} onClose={() => { setFileNameModalVisible(false); setBackupLoading(false); }}>
        <View style={styles.fileNameModalContent}>
          <Text style={styles.modalTitle}>自定义文件名</Text>
          <TextInput
            style={styles.fileNameInput}
            value={customFileName}
            onChangeText={setCustomFileName}
            placeholder="输入文件名"
            placeholderTextColor="#909399"
            autoFocus
          />
          <View style={styles.fileNameButtons}>
            <TouchableOpacity
              style={[styles.fileNameButton, { backgroundColor: '#909399' }]}
              onPress={() => {
                setFileNameModalVisible(false);
                setBackupLoading(false);
              }}
            >
              <Text style={styles.fileNameButtonText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.fileNameButton, { backgroundColor: '#4A90D9' }]}
              onPress={confirmFileSave}
            >
              <Text style={styles.fileNameButtonText}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Overlay>

      {/* 操作进度弹窗 */}
      <Overlay visible={progressVisible}>
        <View style={styles.progressCard}>
          <ActivityIndicator size="large" color="#4A90D9" />
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${Math.min(Math.max(progressPercent, 0), 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progressText}</Text>
        </View>
      </Overlay>

      {/* Scan Local Files Modal */}
      <Overlay visible={scanModalVisible} onClose={scanLoading ? undefined : () => setScanModalVisible(false)}>
        <View style={styles.scanCard}>
          {/* Header */}
          <View style={styles.scanHeader}>
            <Text style={styles.scanTitle}>扫描到的备份文件</Text>
            <TouchableOpacity onPress={() => setScanModalVisible(false)}>
              <Ionicons name="close" size={24} color="#606266" />
            </TouchableOpacity>
          </View>

          {/* Content */}
          {scanLoading ? (
            <View style={styles.scanLoadingContainer}>
              <ActivityIndicator size="large" color="#4A90D9" />
              <Text style={styles.scanLoadingText}>正在扫描本地文件...</Text>
            </View>
          ) : scannedFiles.length === 0 ? (
            <View style={styles.scanEmptyContainer}>
              <Ionicons name="folder-open-outline" size={48} color="#C0C4CC" />
              <Text style={styles.scanEmptyText}>未找到备份文件</Text>
              <Text style={styles.scanEmptyHint}>将备份文件(.json/.hbyun)放入 Download 或 Documents 目录，或使用系统文件选择器</Text>
              <TouchableOpacity
                style={styles.scanPickerButton}
                onPress={async () => {
                  setScanModalVisible(false);
                  try {
                    const result = await DocumentPicker.getDocumentAsync({
                      type: ['application/json', 'text/plain', '*/*'],
                      copyToCacheDirectory: true,
                    });
                    if (result.canceled || !result.assets?.length) return;
                    const file = result.assets[0];
                    const content = await FileSystemLegacy.readAsStringAsync(file.uri);
                    setProgressVisible(true);
                    setProgressPercent(0);
                    setProgressText('正在解析文件...');
                    await importFromContent(content, file.name, (percent) => {
                      setProgressPercent(percent);
                      setProgressText(`正在导入... ${percent}%`);
                    });
                    setProgressVisible(false);
                  } catch (error) {
                    setProgressVisible(false);
                    Alert.alert('错误', '导入失败: ' + ((error as any)?.message || '请重试'));
                  }
                }}
              >
                <Ionicons name="folder-open" size={16} color="#4A90D9" />
                <Text style={styles.scanPickerButtonText}>使用系统文件选择器</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.scanList} showsVerticalScrollIndicator={false}>
              {scannedFiles.map((file, index) => (
                <TouchableOpacity
                  key={`${file.name}-${index}`}
                  style={styles.scanFileItem}
                  onPress={() => handleImportFromScannedFile(file.path, file.name)}
                >
                  <View style={styles.scanFileIcon}>
                    <Ionicons name="document-text" size={24} color="#4A90D9" />
                  </View>
                  <View style={styles.scanFileInfo}>
                    <Text style={styles.scanFileName} numberOfLines={1}>{file.name}</Text>
                    <Text style={styles.scanFileMeta}>
                      {formatFileSize(file.size)}{file.modified ? ` · ${file.modified}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#C0C4CC" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Footer */}
          <View style={styles.scanFooterRow}>
            <TouchableOpacity
              style={styles.scanRescanButton}
              onPress={handleScanLocalFiles}
              disabled={scanLoading}
            >
              <Ionicons name="refresh" size={16} color="#4A90D9" />
              <Text style={styles.scanRescanText}>重新扫描</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scanRescanButton}
              onPress={async () => {
                setScanModalVisible(false);
                try {
                  const result = await DocumentPicker.getDocumentAsync({
                    type: ['application/json', 'text/plain', '*/*'],
                    copyToCacheDirectory: true,
                  });
                  if (result.canceled || !result.assets?.length) return;
                  const file = result.assets[0];
                  const content = await FileSystemLegacy.readAsStringAsync(file.uri);
                  setProgressVisible(true);
                  setProgressPercent(0);
                  setProgressText('正在解析文件...');
                  await importFromContent(content, file.name, (percent) => {
                    setProgressPercent(percent);
                    setProgressText(`正在导入... ${percent}%`);
                  });
                  setProgressVisible(false);
                } catch (error) {
                  setProgressVisible(false);
                  Alert.alert('错误', '导入失败: ' + ((error as any)?.message || '请重试'));
                }
              }}
            >
              <Ionicons name="folder-open" size={16} color="#4A90D9" />
              <Text style={styles.scanRescanText}>文件选择器</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Overlay>
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
  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF8E6',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F5D9A0',
  },
  warningBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  warningBannerText: {
    fontSize: 14,
    color: '#E6A23C',
    fontWeight: '500',
    marginLeft: 8,
  },
  // Badge
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#F56C6C',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '700',
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
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  cloudModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 60,
  },
  cloudModalBody: {
    marginTop: 4,
  },
  cloudModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 360,
  },
  cloudModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cloudModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
  },
  cloudListContainer: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 4,
  },
  cloudListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
    backgroundColor: '#FFFFFF',
  },
  cloudListIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cloudListText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#303133',
  },
  recordsContainer: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
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
  backupRecord: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  backupRecordText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303133',
  },
  backupRecordCount: {
    fontSize: 12,
    color: '#909399',
    marginTop: 4,
  },
  noBackupText: {
    fontSize: 14,
    color: '#909399',
    textAlign: 'center',
    paddingVertical: 20,
  },
  // File name modal styles
  fileNameModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 360,
  },
  fileNameInput: {
    backgroundColor: '#F5F7FA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#303133',
    marginBottom: 20,
  },
  fileNameButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fileNameButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  fileNameButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 28,
    width: 260,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4A90D9',
    borderRadius: 3,
  },
  progressText: {
    marginTop: 14,
    fontSize: 14,
    color: '#606266',
    textAlign: 'center',
  },
  // Scan Local Files Modal
  scanOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  scanCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBEEF5',
  },
  scanTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
  },
  scanLoadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  scanLoadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#909399',
  },
  scanEmptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  scanEmptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#606266',
  },
  scanEmptyHint: {
    marginTop: 8,
    fontSize: 13,
    color: '#909399',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scanPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(74,144,217,0.1)',
  },
  scanPickerButtonText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#4A90D9',
    fontWeight: '500',
  },
  scanList: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
  scanFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F6FC',
  },
  scanFileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(74,144,217,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  scanFileInfo: {
    flex: 1,
  },
  scanFileName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#303133',
  },
  scanFileMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#909399',
  },
  scanRescanButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(74,144,217,0.08)',
  },
  scanRescanText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#4A90D9',
    fontWeight: '500',
  },
  scanFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 20,
    gap: 12,
  },
});
