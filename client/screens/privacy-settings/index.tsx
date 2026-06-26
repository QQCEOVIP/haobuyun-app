import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
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

interface ArrowItemProps {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function ArrowItem({ icon, color, title, subtitle, onPress }: ArrowItemProps) {
  return (
    <TouchableOpacity style={styles.item} onPress={onPress}>
      <View style={[styles.itemIcon, { backgroundColor: `${color}20` }]}>
        <Ionicons name={icon as any} size={20} color={color} />
      </View>
      <View style={styles.itemTextContainer}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#C0C4CC" />
    </TouchableOpacity>
  );
}

export default function PrivacySettingsScreen() {
  const [autoBackup, setAutoBackup] = useState(false);
  const [numberMasking, setNumberMasking] = useState(false);

  const handleToggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    Toast.show({
      type: 'info',
      text1: '功能开发中，敬请期待',
      visibilityTime: 1500,
    });
  };

  const handleComingSoon = () => {
    Toast.show({
      type: 'info',
      text1: '功能开发中，敬请期待',
      visibilityTime: 1500,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>隐私设置</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <ToggleItem
            icon="cloud-upload"
            color="#4A90D9"
            title="自动备份"
            subtitle="自动同步通讯录到云端"
            value={autoBackup}
            onToggle={() => handleToggle(setAutoBackup)}
          />
          <ArrowItem
            icon="timer"
            color="#E6A23C"
            title="检测数据保留"
            subtitle="7天"
            onPress={handleComingSoon}
          />
          <ArrowItem
            icon="key"
            color="#67C23A"
            title="权限管理"
            subtitle="管理APP已申请的权限"
            onPress={handleComingSoon}
          />
          <ArrowItem
            icon="trash"
            color="#F56C6C"
            title="数据清除"
            subtitle="清除本地缓存和云端数据"
            onPress={handleComingSoon}
          />
          <ToggleItem
            icon="eye-off"
            color="#909399"
            title="号码脱敏显示"
            subtitle="隐藏部分号码数字"
            value={numberMasking}
            onToggle={() => handleToggle(setNumberMasking)}
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
