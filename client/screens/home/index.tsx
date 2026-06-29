import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Alert,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';


import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';

interface ContactStats {
  total: number;
  active: number;
  maybeInvalid: number;
  invalid: number;
  unknown: number;
}

export default function HomeScreen() {
  const { user, session } = useAuth();
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

  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [customFileName, setCustomFileName] = useState('');
  const [fileNameModalVisible, setFileNameModalVisible] = useState(false);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const userId = (user as any)?.id;
  const userEmail = (user as any)?.email || '';

  // Load user avatar from AsyncStorage on mount only
  useEffect(() => {
    (async () => {
      try {
        const savedAvatar = await AsyncStorage.getItem('@user_avatar');
        if (savedAvatar) setUserAvatar(savedAvatar);
      } catch (_e) { /* ignore */ }
    })();
  }, []);

  // 获取所有设备联系人（分页获取，与通讯录页面使用相同方法确保一致性）
  const getAllDeviceContacts = async (fields: Contacts.Field[]) => {
    const safeFields = fields.filter((f): f is Contacts.Field => f != null && f !== undefined);
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
      // Last resort fallback: try getAllContactsAsync
      try {
        console.log('[Home] Last resort: trying getAllContactsAsync...');
        const result = await Contacts.getAllContactsAsync({ fields: safeFields });
        if (Array.isArray(result)) return result;
        if ((result as any)?.data) return (result as any).data;
        return [];
      } catch (error2) {
        console.error('[Home] getAllContactsAsync also failed:', error2);
        return [];
      }
    }
  };

  // 一键检测功能
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

      // 从 Supabase 和 AsyncStorage 读取联系人状态（AsyncStorage 为手动标签的 source of truth）
      let allLocalContacts: any[] = [];
      let page = 0;
      const dbPageSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('contacts')
          .select('phone, status')
          .eq('user_id', userId)
          .range(page * dbPageSize, (page + 1) * dbPageSize - 1);
        if (!data || data.length === 0) break;
        allLocalContacts = allLocalContacts.concat(data);
        if (data.length < dbPageSize) break;
        page++;
      }

      // 读取 AsyncStorage 中的手动标签（覆盖 Supabase 状态）
      const allKeys = await AsyncStorage.getAllKeys();
      const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
      const localStatusMap = new Map<string, string>();
      if (statusKeys.length > 0) {
        const entries = await AsyncStorage.multiGet(statusKeys);
        for (const [key, value] of entries) {
          if (value) localStatusMap.set(key.replace('@contact_status_', ''), value);
        }
      }

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
        const localData = allLocalContacts?.find((lc: any) => lc.phone === phone);
        // AsyncStorage 手动标签优先，其次 Supabase 检测结果
        const status = localStatusMap.get(phone) || localData?.status;
        
        switch (status) {
          case 'normal':
            result.active++;
            break;
          case 'suspected_stopped':
            result.maybeInvalid++;
            break;
          case 'stopped':
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

  const handleImport = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("权限不足", "需要通讯录权限才能导入");
        return;
      }
      
      // Try to use DocumentPicker if available
      if (DocumentPicker) {
        const result = await (DocumentPicker as any).getDocumentAsync({
          type: ['text/vcard', 'application/json', '*/*'],
          copyToCacheDirectory: true,
        });
        // User canceled - just return silently
        if (result.canceled || !result.assets || result.assets.length === 0) return;
        const file = result.assets[0];
        if (!file) return;
        
        // Determine file type by extension
        const fileName = file.name || '';
        const fileUri = file.uri;
        const content = await FileSystemLegacy.readAsStringAsync(fileUri);
        
        if (fileName.endsWith('.json') || fileName.endsWith('.hbyun') || fileName.endsWith('.vcf')) {
          await importFromContent(content, fileName);
        } else {
          Alert.alert("提示", "请选择 .vcf、.json 或 .hbyun 格式的文件");
        }
      } else {
        // Fallback: scan document directory
        const dirInfo = await FileSystemLegacy.readDirectoryAsync(FileSystemLegacy.documentDirectory);
        const importFiles = dirInfo.filter((f: string) => f.endsWith(".vcf") || f.endsWith(".json"));
        if (importFiles.length === 0) {
          Alert.alert("提示", "未找到可导入的通讯录文件（.vcf 或 .json）\n请将文件放入应用文档目录，或升级应用以支持文件选择");
          return;
        }
        Alert.alert(
          "选择导入文件",
          "可用文件：\n" + importFiles.map((f: string, i: number) => `${i + 1}. ${f}`).join("\n"),
          importFiles.map((f: string) => ({
            text: f.length > 20 ? f.substring(0, 17) + "..." : f,
            onPress: () => importFromFile(f),
          })).concat([{ text: "取消", style: "cancel" as const }])
        );
      }
    } catch (error) {
      // User canceled - don't show error
      const errMsg = (error as any)?.message || '';
      if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('canceled') || errMsg.includes('User canceled')) {
        return;
      }
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + (errMsg || '请重试'));
    }
  };

  const importFromContent = async (content: string, fileName: string) => {
    try {
      let contacts: Array<{ name: string; phone: string; email?: string; company?: string; jobTitle?: string; note?: string }> = [];
      if (fileName.endsWith(".json") || fileName.endsWith(".hbyun")) {
        const parsed = JSON.parse(content);
        // 支持号簿云备份格式 (HAOBUYUN_BACKUP)
        if (parsed.format === 'HAOBUYUN_BACKUP' && Array.isArray(parsed.contacts)) {
          contacts = parsed.contacts.map((c: any) => ({
            name: c.name || '',
            phone: c.phones?.[0]?.number || '',
            email: c.emails?.[0]?.email || undefined,
            company: c.company || undefined,
            jobTitle: c.jobTitle || undefined,
            note: c.note || undefined,
          })).filter((c: any) => c.phone);
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
      let skipCount = 0;

      // 加载设备已有联系人用于去重
      const existingPhones = new Set<string>();
      try {
        const existing = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers],
          pageSize: 9999,
        });
        for (const c of existing.data) {
          if (c.phoneNumbers) {
            for (const p of c.phoneNumbers) {
              if (p.number) existingPhones.add(p.number.replace(/\D/g, ''));
            }
          }
        }
      } catch (e) {
        console.warn('获取已有联系人失败:', e);
      }

      for (const contact of contacts) {
        try {
          const phone = contact.phone || contact.phones?.[0]?.number || '';
          if (!phone) { failCount++; continue; }

          // 去重
          const normalized = phone.replace(/\D/g, '');
          if (existingPhones.has(normalized)) { skipCount++; continue; }

          const contactData: any = {
            name: contact.name || '',
            phoneNumbers: [{ number: phone }],
          };
          if (contact.email) contactData.emails = [{ email: contact.email }];
          if (contact.company) contactData.company = contact.company;
          if (contact.jobTitle) contactData.jobTitle = contact.jobTitle;
          if (contact.note) contactData.note = contact.note;
          await Contacts.addContactAsync(contactData);
          existingPhones.add(normalized);
          successCount++;
        } catch (e) {
          failCount++;
        }
      }
      let msg = `成功导入 ${successCount} 个联系人`;
      if (skipCount > 0) msg += `，跳过 ${skipCount} 个已存在`;
      if (failCount > 0) msg += `，${failCount} 个失败`;
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
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("权限不足", "需要通讯录权限才能导出");
        return;
      }
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
        Alert.alert("提示", "通讯录中没有联系人可导出");
        return;
      }

      // 从 AsyncStorage 读取所有标签状态
      const phoneKeys = allContacts
        .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
        .map(c => `@contact_status_${c.phoneNumbers[0].number}`);
      const statusEntries = phoneKeys.length > 0
        ? await AsyncStorage.multiGet(phoneKeys)
        : [];
      const statusMap = new Map<string, string>();
      statusEntries.forEach(([key, value]) => {
        if (value) {
          const phone = key.replace('@contact_status_', '');
          statusMap.set(phone, value);
        }
      });

      // 状态标签映射
      const statusLabelMap: Record<string, string> = {
        normal: '正常',
        stopped: '确认失效',
        suspected_stopped: '可能失效',
      };

      // 生成号簿云专有备份格式（JSON，仅号簿云可恢复）
      const backupData = {
        format: 'HAOBUYUN_BACKUP',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        device: 'mobile',
        contacts: allContacts
          .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
          .map(c => ({
            name: c.name || '',
            phones: (c.phoneNumbers || []).map(p => ({
              number: p.number || '',
              label: p.label || 'mobile',
              status: statusMap.get(p.number || '') || null,
              statusLabel: statusLabelMap[statusMap.get(p.number || '') || ''] || null,
            })),
            emails: (c.emails || []).map(e => ({ email: e.email || '', label: e.label || '' })),
            addresses: (c.postalAddresses || []).map(a => ({
              street: a.street || '', city: a.city || '', region: a.region || '',
              postalCode: a.postalCode || '', country: a.country || '',
            })),
            company: c.company || '',
            jobTitle: c.jobTitle || '',
            note: c.note || '',
          })),
      };

      const now = new Date();
      const dateStr = now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, '0') +
        now.getDate().toString().padStart(2, '0');
      const defaultFileName = `号簿云备份_${dateStr}.hbyun`;
      const backupContent = JSON.stringify(backupData, null, 2);
      const contactCount = backupData.contacts.length;

      // On Android, use StorageAccessFramework to let user pick save location
      if (Platform.OS === 'android') {
        try {
          const SAF = StorageAccessFramework ?? (FileSystemLegacy as any).StorageAccessFramework;
          if (SAF && typeof SAF.requestDirectoryPermissionsAsync === 'function') {
            // 先让用户选择保存目录
            const permission = await SAF.requestDirectoryPermissionsAsync();
            if (permission.granted && permission.directoryUri) {
              // SAF API: createFileAsync(parentUri, fileName, mimeType)
              const fileUri = await SAF.createFileAsync(permission.directoryUri, defaultFileName, 'application/json');
              await SAF.writeAsStringAsync(fileUri, backupContent);
              Alert.alert('导出成功', `已备份 ${contactCount} 个联系人（含标签状态）\n仅号簿云可恢复此格式`);
              return;
            } else {
              // 用户取消了路径选择，直接取消导出
              return;
            }
          }
        } catch (safError) {
          console.warn('SAF export failed, falling back to Sharing:', safError);
        }
      }

      // Fallback: Write to cache and share
      const fileUri = FileSystemLegacy.cacheDirectory + defaultFileName;
      await FileSystemLegacy.writeAsStringAsync(fileUri, backupContent, { encoding: FileSystemLegacy.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '号簿云备份',
        });
        Alert.alert('导出成功', `已备份 ${contactCount} 个联系人（含标签状态）\n仅号簿云可恢复此格式`);
      } else {
        // Fallback: save to document directory and show filename modal
        setCustomFileName(defaultFileName);
        setFileNameModalVisible(true);
        (global as any).__pendingVcard = backupContent;
        (global as any).__pendingVcardCount = contactCount;
        (global as any).__pendingVcardDefaultName = defaultFileName;
      }
    } catch (error) {
      // User canceled - don't show error
      const errMsg = (error as any)?.message || '';
      if (errMsg.includes('cancel') || errMsg.includes('Cancel') || errMsg.includes('canceled') || errMsg.includes('User canceled')) {
        return;
      }
      console.error("导出失败:", error);
      Alert.alert("错误", "导出失败: " + (errMsg || '请重试'));
    }
  };

  // 确认导出文件名并保存
  const confirmExport = async () => {
    const vcardContent = (global as any).__pendingVcard;
    const contactCount = (global as any).__pendingVcardCount || 0;
    const safeFileName = customFileName.trim().endsWith('.hbyun') 
      ? customFileName.trim() 
      : `${customFileName.trim()}.hbyun`;
    const filePath = `${FileSystemLegacy.documentDirectory}${safeFileName}`;
    
    try {
      await FileSystemLegacy.writeAsStringAsync(filePath, vcardContent);
      Alert.alert('备份成功', `已备份 ${contactCount} 个联系人\n文件：${safeFileName}\n仅号簿云可恢复此格式`);
    } catch (error) {
      console.error('导出失败:', error);
      Alert.alert('错误', '导出失败，请重试');
    }
    
    setFileNameModalVisible(false);
    (global as any).__pendingVcard = null;
    (global as any).__pendingVcardCount = null;
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
          const label = phone.label || 'CELL';
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

      // On Android, use StorageAccessFramework to let user pick save location
      if (Platform.OS === 'android') {
        try {
          const SAF = StorageAccessFramework ?? (FileSystemLegacy as any).StorageAccessFramework;
          if (SAF && typeof SAF.requestDirectoryPermissionsAsync === 'function') {
            // 先让用户选择保存目录
            const permission = await SAF.requestDirectoryPermissionsAsync();
            if (permission.granted && permission.directoryUri) {
              // SAF API: createFileAsync(parentUri, fileName, mimeType)
              const fileUri = await SAF.createFileAsync(permission.directoryUri, defaultFileName, 'text/vcard');
              await SAF.writeAsStringAsync(fileUri, vcardContent);
              Alert.alert('备份成功', `已备份 ${contactCount} 个联系人`);
              setBackupLoading(false);
              return;
            } else {
              // 用户取消了路径选择，直接取消导出
              setBackupLoading(false);
              return;
            }
          }
        } catch (safError) {
          console.warn('SAF backup failed, falling back:', safError);
        }
      }

      // Fallback: save to document directory via filename modal
      (global as any).__pendingBackupVcard = vcardContent;
      (global as any).__pendingBackupCount = contactCount;

      // 弹出文件名输入框
      setCustomFileName(defaultFileName);
      setFileNameModalVisible(true);
      
      // 标记为备份模式
      (global as any).__pendingBackupMode = true;
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
    const safeFileName = customFileName.trim().endsWith('.vcf') 
      ? customFileName.trim() 
      : `${customFileName.trim()}.vcf`;
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
      const files = await FileSystemLegacy.readDirectoryAsync(FileSystemLegacy.documentDirectory || '');
      const backupFiles = files
        .filter(f => (f.startsWith('contacts_backup_') && f.endsWith('.json')) || (f.startsWith('通讯录备份_') && f.endsWith('.vcf')))
        .sort()
        .reverse();

      const backupList = await Promise.all(
        backupFiles.map(async (fileName) => {
          const filePath = `${FileSystemLegacy.documentDirectory}${fileName}`;
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
  const [cloudBackups, setCloudBackups] = useState<any[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudProgress, setCloudProgress] = useState('');
  const [cloudBackupLoading, setCloudBackupLoading] = useState<'uploading' | 'downloading' | null>(null);
  const [restoreSelectVisible, setRestoreSelectVisible] = useState(false);
  const [backupRecordsVisible, setBackupRecordsVisible] = useState(false);

  // ========== Helper functions for backup ==========
  const getDeviceModel = (): string => {
    if (Constants.deviceName) return Constants.deviceName.replace(/[^a-z0-9\-]/gi, '-').substring(0, 20);
    const brand = (Platform as any).constants?.Brand || '';
    const model = (Platform as any).constants?.Model || '';
    const deviceStr = (brand + ' ' + model).trim() || 'Unknown';
    return deviceStr.replace(/[^a-z0-9\-]/gi, '-').substring(0, 20);
  };

  const formatBackupFileName = (count: number = 0): string => {
    const now = new Date();
    const ts = now.getFullYear().toString() + '-' +
      (now.getMonth() + 1).toString().padStart(2, '0') + '-' +
      now.getDate().toString().padStart(2, '0') + '_' +
      now.getHours().toString().padStart(2, '0') + '-' +
      now.getMinutes().toString().padStart(2, '0') + '-' +
      now.getSeconds().toString().padStart(2, '0');
    const device = getDeviceModel();
    return `${ts}_${device}_${count}.json`;
  };

  const parseBackupFilename = (fileName: string): { displayTime: string; device: string; count: number } => {
    // Format: 2026-06-28_20-41-46_DeviceModel_1905.json
    const base = fileName.replace('.json', '');
    const parts = base.split('_');
    
    // Try to extract timestamp (first 2 parts: YYYY-MM-DD and HH-MM-SS)
    let displayTime = fileName;
    let device = '';
    let count = 0;
    
    if (parts.length >= 2) {
      const datePart = parts[0]; // 2026-06-28
      const timePart = parts[1]; // 20-41-46
      displayTime = `${datePart} ${timePart.replace(/-/g, ':')}`;
    }
    
    // Last part might be count (if it's a number)
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
      count = parseInt(lastPart, 10);
      // Device is everything between time and count
      if (parts.length >= 4) {
        device = parts.slice(2, -1).join('_');
      }
    } else {
      // No count, device is everything after time
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

  // 生成备份数据（复用现有逻辑）
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
    ]);
    if (!allContacts || allContacts.length === 0) throw new Error('通讯录中没有联系人');

    const phoneKeys = allContacts
      .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
      .map(c => `@contact_status_${c.phoneNumbers[0].number}`);
    const statusEntries = phoneKeys.length > 0 ? await AsyncStorage.multiGet(phoneKeys) : [];
    const statusMap = new Map<string, string>();
    statusEntries.forEach(([key, value]) => {
      if (value) statusMap.set(key.replace('@contact_status_', ''), value);
    });

    return {
      format: 'HAOBUYUN_BACKUP',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      device: 'mobile',
      device_model: Constants.deviceName || ((Platform as any).constants?.Brand || '') + ' ' + ((Platform as any).constants?.Model || '') || 'Unknown',
      contacts: allContacts
        .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
        .map(c => ({
          name: c.name || '',
          phones: (c.phoneNumbers || []).map(p => ({
            number: p.number || '',
            label: p.label || 'mobile',
            status: statusMap.get(p.number || '') || null,
          })),
          emails: (c.emails || []).map(e => ({ email: e.email || '', label: e.label || '' })),
          company: c.company || '',
          jobTitle: c.jobTitle || '',
          note: c.note || '',
        })),
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
    setCloudLoading(true);
    setCloudBackupLoading('uploading');
    setCloudProgress('正在生成备份数据...');
    try {
      const backupData = await generateBackupData();
      const content = JSON.stringify(backupData, null, 2);
      const contactCount = backupData.contacts?.length || 0;
      const fileName = formatBackupFileName(contactCount);

      // Save local backup copy
      setCloudProgress('正在保存本地副本...');
      await saveLocalBackup(fileName, content);
      await cleanupOldLocalBackups(10);

      setCloudProgress('正在上传到云端...');
      /**
       * 服务端文件：server/src/routes/backup.ts
       * 接口：POST /api/v1/backup/cloud
       * Headers: x-user-id: string
       * Body: { fileName: string, content: string }
       */
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/backup/cloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
        },
        body: JSON.stringify({ fileName, content }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '上传失败');

      Alert.alert('云端备份成功', `已备份 ${backupData.contacts.length} 个联系人到云端`);
      loadCloudBackups();
    } catch (err: any) {
      console.error('Cloud backup error:', err);
      const msg = err?.message || '请检查网络后重试';
      Alert.alert('云端备份失败', msg);
    } finally {
      setCloudLoading(false);
      setCloudBackupLoading(null);
      setCloudProgress('');
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
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/backup/cloud`, {
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
            const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/backup/cloud`, {
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
          setCloudProgress('正在下载备份...');
          try {
            /**
             * 服务端文件：server/src/routes/backup.ts
             * 接口：GET /api/v1/backup/cloud/download?fileName=xxx
             * Headers: x-user-id: string
             */
            const response = await fetch(
              `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/backup/cloud/download?fileName=${encodeURIComponent(fileName)}`,
              { headers: { 'x-user-id': userId } }
            );
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || '下载失败');

            setCloudProgress('正在解析数据...');
            const backupData = JSON.parse(result.content);

            if (!backupData.contacts || backupData.contacts.length === 0) {
              Alert.alert('提示', '备份文件中没有联系人数据');
              setCloudLoading(false);
              setCloudBackupLoading(null);
              return;
            }

            // Step 1: Delete ALL existing contacts from device
            setCloudProgress('正在清空当前通讯录...');
            try {
              const { data: existingContacts } = await Contacts.getAllContactsAsync({
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
            setCloudProgress(`正在恢复 ${backupData.contacts.length} 个联系人...`);
            let successCount = 0;
            for (const contact of backupData.contacts) {
              try {
                const contactName = contact.name || '';
                const contactData: any = {
                  // 同时设置 name 和 firstName 兼容双平台
                  // Android 使用 name，iOS 使用 firstName/lastName
                  name: contactName,
                  firstName: contactName,
                  phoneNumbers: contact.phones?.map((p: any) => ({ number: p.number, label: p.label || 'mobile' })) || [{ number: '', label: 'mobile' }],
                };
                if (contact.emails?.length) {
                  contactData.emails = contact.emails.map((e: any) => ({ email: e.email, label: e.label || 'home' }));
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

                await Contacts.addContactAsync(contactData);
                successCount++;
              } catch (_e) { /* skip failed contact */ }
            }

            Alert.alert('恢复成功', `已替换通讯录，恢复 ${successCount} 个联系人`);
            loadCloudBackups();
          } catch (err: any) {
            console.error('Cloud restore error:', err);
            Alert.alert('恢复失败', err?.message || '请重试');
          } finally {
            setCloudLoading(false);
            setCloudBackupLoading(null);
            setCloudProgress('');
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

  const fetchStats = async () => {
    if (!userId) return;

    try {
      // 1. 获取设备联系人数量
      let deviceContactsCount = 0;
      const { status } = await Contacts.requestPermissionsAsync();
      console.log('[Home] Contacts permission status:', status);
      
      if (status === 'granted') {
        const allDevice = await getAllDeviceContacts([Contacts.Fields.PhoneNumbers]);
        console.log('[Home] Total device contacts fetched:', allDevice.length);
        
        // 统计有电话号码的联系人数量（与手机通讯录应用一致，统计人数而非号码总数）
        const contactsWithPhones = allDevice.filter(c => {
          return c.phoneNumbers && c.phoneNumbers.length > 0;
        });
        deviceContactsCount = contactsWithPhones.length;
        console.log('[Home] Contacts with phones:', contactsWithPhones.length);
        
        // 调试：打印前3个联系人的结构
        if (allDevice.length > 0) {
          console.log('[Home] Sample contact structure:', JSON.stringify(allDevice[0], null, 2));
        }
      } else {
        console.warn('[Home] Contacts permission not granted:', status);
      }

      // 2. 从 AsyncStorage 读取状态分布（真正的标签数据源）
      const allKeys = await AsyncStorage.getAllKeys();
      const statusKeys = allKeys.filter(k => k.startsWith('@contact_status_'));
      const contactStats: ContactStats = {
        total: deviceContactsCount,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: Math.max(0, deviceContactsCount - statusKeys.length),
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

      console.log('[Home] Final stats:', JSON.stringify(contactStats));
      setStats(contactStats);
    } catch (error) {
      console.error('[Home] Failed to fetch stats:', error);
      // 即使出错也设置一个基本的 stats，避免 UI 显示异常
      setStats(prev => prev);
    }
  };

  // 每次页面获得焦点时刷新统计数据（确保从其他页面返回后数据更新）
  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  );

  // 下拉刷新处理函数
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchStats();
      await loadUserAvatar();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // 健康度 = (总号码 - 确认失效 - 可能失效) / 总号码 × 100%
  const healthPercentage = stats.total > 0
    ? Math.round(((stats.total - stats.invalid - stats.maybeInvalid) / stats.total) * 100)
    : 100;

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
        {/* 健康度仪表盘 */}
        <View style={styles.dashboardCard}>
          {/* 用户头像在左上角 */}
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              {userAvatar ? (
                <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
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
      {detectionResult !== null && (
      <Modal
        visible={true}
        transparent
        animationType="none"
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
      )}

      {/* 本地备份模态框 */}
      {cloudBackupVisible && (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        onRequestClose={() => setCloudBackupVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setCloudBackupVisible(false)}>
        <View style={styles.cloudModalOverlay}>
          <TouchableWithoutFeedback>
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
                  style={[styles.cloudListItem, { borderBottomWidth: 0 }]}
                  onPress={() => { loadCloudBackups(); setBackupRecordsVisible(true); }}
                >
                  <View style={[styles.cloudListIcon, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
                    <Ionicons name="time" size={22} color="#E6A23C" />
                  </View>
                  <Text style={styles.cloudListText}>备份记录</Text>
                  <Ionicons name="chevron-forward" size={18} color="#C0C4CC" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </TouchableWithoutFeedback>
        </View>
        </TouchableWithoutFeedback>
      </Modal>
      )}

      {/* 恢复选择弹窗 */}
      {restoreSelectVisible && (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        onRequestClose={() => setRestoreSelectVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setRestoreSelectVisible(false)}>
        <View style={styles.cloudModalOverlay}>
          <TouchableWithoutFeedback>
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
          </TouchableWithoutFeedback>
        </View>
        </TouchableWithoutFeedback>
      </Modal>
      )}

      {/* 备份记录弹窗 */}
      {backupRecordsVisible && (
      <Modal
        visible={true}
        transparent
        animationType="slide"
        onRequestClose={() => setBackupRecordsVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setBackupRecordsVisible(false)}>
        <View style={styles.cloudModalOverlay}>
          <TouchableWithoutFeedback>
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
          </TouchableWithoutFeedback>
        </View>
        </TouchableWithoutFeedback>
      </Modal>
      )}

      {/* 文件名输入弹窗 */}
      {fileNameModalVisible && (
      <Modal
        visible={true}
        transparent
        animationType="none"
        onRequestClose={() => {
          setFileNameModalVisible(false);
          setBackupLoading(false);
        }}
      >
        <View style={styles.modalOverlay}>
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
        </View>
      </Modal>
      )}
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
});
