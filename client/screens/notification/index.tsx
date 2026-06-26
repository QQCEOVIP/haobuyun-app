import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  backup: '@notification_backup',
  statusUpdate: '@notification_status_update',
  detectComplete: '@notification_detect_complete',
  systemAnnounce: '@notification_system_announce',
};

interface ToggleItemProps {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: (val: boolean) => void;
}

function ToggleItem({ icon, color, title, subtitle, value, onToggle }: ToggleItemProps) {
  return (
    <View style={styles.item}>
      <View style={[styles.itemIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.itemTextContainer}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#E6E8EB', true: '#4A90D9' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export default function NotificationScreen() {
  const [backup, setBackup] = useState(true);
  const [statusUpdate, setStatusUpdate] = useState(true);
  const [detectComplete, setDetectComplete] = useState(true);
  const [systemAnnounce, setSystemAnnounce] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const vals = await AsyncStorage.multiGet([
          KEYS.backup,
          KEYS.statusUpdate,
          KEYS.detectComplete,
          KEYS.systemAnnounce,
        ]);
        const get = (v: (typeof vals)[0]) => (v[1] === null ? true : v[1] === 'true');
        setBackup(get(vals[0]));
        setStatusUpdate(get(vals[1]));
        setDetectComplete(get(vals[2]));
        setSystemAnnounce(get(vals[3]));
      } catch {}
    })();
  }, []);

  const toggle = async (key: string, setter: React.Dispatch<React.SetStateAction<boolean>>, val: boolean) => {
    setter(val);
    await AsyncStorage.setItem(key, val.toString());
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>通知设置</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <ToggleItem
            icon="cloud-upload"
            color="#4A90D9"
            title="备份提醒"
            subtitle="定期提醒用户备份通讯录"
            value={backup}
            onToggle={(v) => toggle(KEYS.backup, setBackup, v)}
          />
          <ToggleItem
            icon="refresh"
            color="#67C23A"
            title="状态更新通知"
            subtitle="关注的号码状态变更时推送通知"
            value={statusUpdate}
            onToggle={(v) => toggle(KEYS.statusUpdate, setStatusUpdate, v)}
          />
          <ToggleItem
            icon="checkmark-circle"
            color="#E6A23C"
            title="检测完成通知"
            subtitle="一键检测完成后推送结果"
            value={detectComplete}
            onToggle={(v) => toggle(KEYS.detectComplete, setDetectComplete, v)}
          />
          <ToggleItem
            icon="megaphone"
            color="#F56C6C"
            title="系统公告"
            subtitle="版本更新、功能上线通知"
            value={systemAnnounce}
            onToggle={(v) => toggle(KEYS.systemAnnounce, setSystemAnnounce, v)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#303133',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F7FA',
  },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#303133',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#909399',
    marginTop: 2,
  },
});
