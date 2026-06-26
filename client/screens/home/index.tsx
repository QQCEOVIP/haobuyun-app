import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as FileSystem from 'expo-file-system/legacy';
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
  const [cloudBackupTab, setCloudBackupTab] = useState<'backup' | 'restore' | 'records' | 'analysis'>('backup');
  const [backups, setBackups] = useState<any[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [customFileName, setCustomFileName] = useState('');
  const [fileNameModalVisible, setFileNameModalVisible] = useState(false);

  const userId = (user as any)?.id;
  const userEmail = (user as any)?.email || '';

  // 分页获取所有设备联系人的辅助函数
  const getAllDeviceContacts = async (fields: any[]) => {
    let allContacts: Contacts.Contact[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: dc } = await Contacts.getContactsAsync({
        fields,
        pageSize,
        pageOffset: offset,
      });
      if (!dc || dc.length === 0) break;
      allContacts = allContacts.concat(dc);
      offset += dc.length;
      if (dc.length < pageSize) break;
    }
    return allContacts;
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

      // 分页获取所有supabase中的联系人状态
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
        
        switch (localData?.status) {
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
      let DocumentPicker: any = null;
      try {
        DocumentPicker = require('expo-document-picker');
      } catch (e) {
        // DocumentPicker not available, fall back to directory scan
      }
      
      if (DocumentPicker) {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['text/vcard', 'application/json', '*/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const file = result.assets[0];
        if (!file) return;
        
        // Determine file type by extension
        const fileName = file.name || '';
        const fileUri = file.uri;
        const content = await FileSystem.readAsStringAsync(fileUri);
        
        if (fileName.endsWith('.json') || fileName.endsWith('.vcf')) {
          await importFromContent(content, fileName);
        } else {
          Alert.alert("提示", "请选择 .vcf 或 .json 格式的文件");
        }
      } else {
        // Fallback: scan document directory
        const dirInfo = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory);
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
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + ((error as any)?.message || '请重试'));
    }
  };

  const importFromContent = async (content: string, fileName: string) => {
    try {
      let contacts: Array<{ name: string; phone: string; email?: string; company?: string; jobTitle?: string; note?: string }> = [];
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(content);
        contacts = Array.isArray(parsed) ? parsed : [];
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
      Alert.alert(
        "导入完成",
        `成功导入 ${successCount} 个联系人${failCount > 0 ? `，${failCount} 个失败` : ''}`
      );
    } catch (error) {
      console.error("导入失败:", error);
      Alert.alert("错误", "导入失败: " + ((error as any)?.message || '请重试'));
    }
  };

  const importFromFile = async (fileName: string) => {
    try {
      const filePath = FileSystem.documentDirectory + fileName;
      const content = await FileSystem.readAsStringAsync(filePath);
      let contacts: Array<{ name: string; phone: string; email?: string; company?: string; jobTitle?: string; note?: string }> = [];
      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(content);
        contacts = Array.isArray(parsed) ? parsed : [];
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

      // 生成 vCard 3.0 格式
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
          const typeMap: Record<string, string> = { 'mobile': 'CELL', 'home': 'HOME', 'work': 'WORK', 'iPhone': 'CELL' };
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
      const vcfContent = vcardLines.join('\n');
      const contactCount = vcardLines.filter(l => l === 'BEGIN:VCARD').length;

      // Write to cache and share
      const fileUri = FileSystem.cacheDirectory + defaultFileName;
      await FileSystem.writeAsStringAsync(fileUri, vcfContent, { encoding: FileSystem.EncodingType.UTF8 });

      // Try Sharing API
      let Sharing: any = null;
      try {
        Sharing = require('expo-sharing');
      } catch (e) {
        // Sharing not available
      }

      if (Sharing && await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/vcard',
          dialogTitle: '导出通讯录',
        });
        Alert.alert('导出成功', `已导出 ${contactCount} 个联系人`);
      } else {
        // Fallback: save to document directory and show filename modal
        setCustomFileName(defaultFileName);
        setFileNameModalVisible(true);
        (global as any).__pendingVcard = vcfContent;
        (global as any).__pendingVcardCount = contactCount;
        (global as any).__pendingVcardDefaultName = defaultFileName;
      }
    } catch (error) {
      console.error("导出失败:", error);
      Alert.alert("错误", "导出失败: " + ((error as any)?.message || '请重试'));
    }
  };

  // 确认导出文件名并保存
  const confirmExport = async () => {
    const vcardContent = (global as any).__pendingVcard;
    const contactCount = (global as any).__pendingVcardCount || 0;
    const safeFileName = customFileName.trim().endsWith('.vcf') 
      ? customFileName.trim() 
      : `${customFileName.trim()}.vcf`;
    const filePath = `${FileSystem.documentDirectory}${safeFileName}`;
    
    try {
      await FileSystem.writeAsStringAsync(filePath, vcardContent);
      Alert.alert('导出成功', `已导出 ${contactCount} 个联系人\n文件：${safeFileName}`);
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
      (global as any).__pendingBackupVcard = vcardLines.join('\n');
      (global as any).__pendingBackupCount = vcardLines.filter(l => l === 'BEGIN:VCARD').length;

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
    const filePath = `${FileSystem.documentDirectory}${safeFileName}`;
    
    try {
      await FileSystem.writeAsStringAsync(filePath, vcardContent);
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
      const files = await FileSystem.readDirectoryAsync(FileSystem.documentDirectory || '');
      const backupFiles = files
        .filter(f => (f.startsWith('contacts_backup_') && f.endsWith('.json')) || (f.startsWith('通讯录备份_') && f.endsWith('.vcf')))
        .sort()
        .reverse();

      const backupList = await Promise.all(
        backupFiles.map(async (fileName) => {
          const filePath = `${FileSystem.documentDirectory}${fileName}`;
          const content = await FileSystem.readAsStringAsync(filePath);
          
          let contactCount = 0;
          let contacts: any[] = [];
          
          if (fileName.endsWith('.json')) {
            contacts = JSON.parse(content);
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

      for (const contact of backupData) {
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

      Alert.alert('恢复完成', `成功导入 ${successCount} 个联系人${failCount > 0 ? `，失败 ${failCount} 个` : ''}`);
      fetchStats();
    } catch (error) {
      console.error('恢复失败:', error);
      Alert.alert('错误', '恢复失败，请重试');
    } finally {
      setBackupLoading(false);
    }
  };

  const analyzeBackups = () => {
    if (backups.length < 2) {
      setAnalysisResult({ error: '至少需要2次备份才能进行对比分析' });
      return;
    }
    const latest = backups[0]?.contacts || [];
    const previous = backups[1]?.contacts || [];
    
    const latestPhones = new Set(latest.map((c: any) => c.phone));
    const previousPhones = new Set(previous.map((c: any) => c.phone));
    
    const added = latest.filter((c: any) => !previousPhones.has(c.phone));
    const deleted = previous.filter((c: any) => !latestPhones.has(c.phone));
    
    const modified: any[] = [];
    latest.forEach((c: any) => {
      const prev = previous.find((p: any) => p.phone === c.phone);
      if (prev && (prev.name !== c.name || prev.email !== c.email)) {
        modified.push({ phone: c.phone, oldName: prev.name, newName: c.name, oldEmail: prev.email, newEmail: c.email });
      }
    });
    
    setAnalysisResult({
      latestDate: backups[0].created_at,
      previousDate: backups[1].created_at,
      added: added.length,
      deleted: deleted.length,
      modified: modified.length,
      details: { added, deleted, modified },
    });
  };

  const fetchStats = async () => {
    if (!userId) return;

    try {
      // 1. 分页获取设备联系人数量
      let deviceContactsCount = 0;
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const allDevice = await getAllDeviceContacts([Contacts.Fields.PhoneNumbers]);
        deviceContactsCount = allDevice.filter(
          c => c.phoneNumbers && c.phoneNumbers.length > 0
        ).length;
      }

      // 2. 分页获取 supabase 中的状态分布数据
      let allData: any[] = [];
      let page = 0;
      const dbPageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('contacts')
          .select('status')
          .eq('user_id', userId)
          .range(page * dbPageSize, (page + 1) * dbPageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < dbPageSize) break;
        page++;
      }

      // 3. 计算状态分布
      const contactStats: ContactStats = {
        total: deviceContactsCount || allData?.length || 0,
        active: 0,
        maybeInvalid: 0,
        invalid: 0,
        unknown: 0,
      };

      allData?.forEach((contact: any) => {
        switch (contact.status) {
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
            contactStats.unknown++;
        }
      });

      if (deviceContactsCount === 0) {
        contactStats.total = allData?.length || 0;
      }

      setStats(contactStats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // 延迟到过渡动画完成后再执行重度异步操作，防止切换闪屏
      const handle = InteractionManager.runAfterInteractions(() => {
        fetchStats();
      });
      return () => handle.cancel();
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
      </View>

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
        <View style={styles.cloudModalOverlay}>
          <View style={styles.cloudModalContent}>
            <View style={styles.cloudModalHeader}>
              <Text style={styles.cloudModalTitle}>云端备份</Text>
              <TouchableOpacity onPress={() => setCloudBackupVisible(false)}>
                <Ionicons name="close" size={24} color="#909399" />
              </TouchableOpacity>
            </View>

            <View style={styles.cloudModalBody}>
              <View style={styles.cloudButtonGrid}>
                {/* 备份通讯录 */}
                <TouchableOpacity
                  style={styles.cloudButtonItem}
                  onPress={handleBackup}
                  disabled={backupLoading}
                >
                  <View style={[styles.cloudButtonIcon, { backgroundColor: 'rgba(74, 144, 217, 0.12)' }]}>
                    <Ionicons name="cloud-upload" size={24} color="#4A90D9" />
                  </View>
                  <Text style={styles.cloudButtonText}>
                    {backupLoading ? '备份中...' : '备份通讯录'}
                  </Text>
                </TouchableOpacity>

                {/* 恢复通讯录 */}
                <TouchableOpacity
                  style={styles.cloudButtonItem}
                  onPress={() => handleRestore()}
                  disabled={backupLoading}
                >
                  <View style={[styles.cloudButtonIcon, { backgroundColor: 'rgba(103, 194, 58, 0.12)' }]}>
                    <Ionicons name="cloud-download" size={24} color="#67C23A" />
                  </View>
                  <Text style={styles.cloudButtonText}>
                    {backupLoading ? '恢复中...' : '恢复通讯录'}
                  </Text>
                </TouchableOpacity>

                {/* 备份记录 */}
                <TouchableOpacity
                  style={styles.cloudButtonItem}
                  onPress={() => setCloudBackupTab('records')}
                >
                  <View style={[styles.cloudButtonIcon, { backgroundColor: 'rgba(230, 162, 60, 0.12)' }]}>
                    <Ionicons name="time" size={24} color="#E6A23C" />
                  </View>
                  <Text style={styles.cloudButtonText}>备份记录</Text>
                </TouchableOpacity>

                {/* 数据分析 */}
                <TouchableOpacity
                  style={styles.cloudButtonItem}
                  onPress={() => {
                    analyzeBackups();
                    setCloudBackupTab('analysis');
                  }}
                >
                  <View style={[styles.cloudButtonIcon, { backgroundColor: 'rgba(144, 105, 217, 0.12)' }]}>
                    <Ionicons name="analytics" size={24} color="#9069D9" />
                  </View>
                  <Text style={styles.cloudButtonText}>数据分析</Text>
                </TouchableOpacity>
              </View>

              {/* 备份记录详情 */}
              {cloudBackupTab === 'records' && (
                <View style={styles.recordsContainer}>
                  {backups.length > 0 ? (
                    backups.map((backup, index) => (
                      <View key={index} style={styles.backupRecord}>
                        <View>
                          <Text style={styles.backupRecordText}>
                            {new Date(backup.created_at).toLocaleString()}
                          </Text>
                          <Text style={styles.backupRecordCount}>
                            {backup.contact_count} 个联系人
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.restoreButton}
                          onPress={() => handleRestore(backup)}
                        >
                          <Text style={styles.restoreButtonText}>恢复</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noBackupText}>暂无备份记录</Text>
                  )}
                </View>
              )}

              {/* 数据分析详情 */}
              {cloudBackupTab === 'analysis' && analysisResult && (
                <View style={styles.recordsContainer}>
                  {analysisResult.error ? (
                    <Text style={styles.noBackupText}>{analysisResult.error}</Text>
                  ) : (
                    <>
                      <View style={styles.analysisRow}>
                        <Text style={styles.analysisLabel}>新增联系人</Text>
                        <Text style={[styles.analysisValue, { color: '#67C23A' }]}>
                          +{analysisResult.added}
                        </Text>
                      </View>
                      <View style={styles.analysisRow}>
                        <Text style={styles.analysisLabel}>删除联系人</Text>
                        <Text style={[styles.analysisValue, { color: '#F56C6C' }]}>
                          -{analysisResult.deleted}
                        </Text>
                      </View>
                      <View style={styles.analysisRow}>
                        <Text style={styles.analysisLabel}>修改联系人</Text>
                        <Text style={[styles.analysisValue, { color: '#E6A23C' }]}>
                          ~{analysisResult.modified}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  cloudModalBody: {
    marginTop: 4,
  },
  cloudModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    minHeight: 380,
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
  cloudButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  cloudButtonItem: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cloudButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  cloudButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#303133',
    textAlign: 'center',
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
