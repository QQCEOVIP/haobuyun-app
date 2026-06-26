import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

interface ToggleItemProps {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
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
        disabled={true}
      />
    </View>
  );
}

export default function NotificationScreen() {
  const [detectComplete, setDetectComplete] = useState(false);
  const [periodicDetect, setPeriodicDetect] = useState(false);
  const [backupReminder, setBackupReminder] = useState(false);
  const [labelChange, setLabelChange] = useState(false);

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    Toast.show({
      type: 'info',
      text1: '功能开发中，敬请期待',
      visibilityTime: 1500,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>通知设置</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <ToggleItem
            icon="checkmark-circle"
            color="#67C23A"
            title="检测完成通知"
            subtitle="检测完成后推送结果摘要"
            value={detectComplete}
            onToggle={() => handleToggle(setDetectComplete)}
          />
          <ToggleItem
            icon="time"
            color="#4A90D9"
            title="定期检测提醒"
            subtitle="自动检测号码状态变化"
            value={periodicDetect}
            onToggle={() => handleToggle(setPeriodicDetect)}
          />
          <ToggleItem
            icon="cloud-upload"
            color="#E6A23C"
            title="备份提醒"
            subtitle="定期提醒备份通讯录"
            value={backupReminder}
            onToggle={() => handleToggle(setBackupReminder)}
          />
          <ToggleItem
            icon="pricetag"
            color="#F56C6C"
            title="标签变更通知"
            subtitle="号码状态变化时提醒"
            value={labelChange}
            onToggle={() => handleToggle(setLabelChange)}
          />
        </View>
        <Text style={styles.hint}>以上功能即将上线，敬请期待</Text>
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
  hint: {
    fontSize: 13,
    color: '#C0C4CC',
    textAlign: 'center',
    marginTop: 24,
  },
});
