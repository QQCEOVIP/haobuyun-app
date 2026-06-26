import React, { useState, useEffect } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';

const KEYS = {
  shareStatus: '@privacy_share_status',
  hideStats: '@privacy_hide_stats',
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
  const { user, signOut } = useAuth();
  const [shareStatus, setShareStatus] = useState(true);
  const [hideStats, setHideStats] = useState(false);

  const userId = (user as any)?.id;

  useEffect(() => {
    (async () => {
      try {
        const vals = await AsyncStorage.multiGet([KEYS.shareStatus, KEYS.hideStats]);
        setShareStatus(vals[0][1] === null ? true : vals[0][1] === 'true');
        setHideStats(vals[1][1] === 'true');
      } catch {}
    })();
  }, []);

  const toggle = async (key: string, setter: React.Dispatch<React.SetStateAction<boolean>>, val: boolean) => {
    setter(val);
    await AsyncStorage.setItem(key, val.toString());
  };

  const handleExportData = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('phone, status, created_at, updated_at')
        .eq('user_id', userId);
      if (error) throw error;

      const json = JSON.stringify(data || [], null, 2);
      const fileUri = `${FileSystem.cacheDirectory}my_marks_export.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: '导出标记记录',
        });
      } else {
        Alert.alert('提示', '当前设备不支持文件分享');
      }
    } catch (error: any) {
      Alert.alert('导出失败', error?.message || '请重试');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '注销账号',
      '确定要注销账号吗？所有数据将被清除且不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定注销',
          style: 'destructive',
          onPress: async () => {
            try {
              if (userId) {
                await supabase.from('contacts').delete().eq('user_id', userId);
              }
              await AsyncStorage.clear();
              await signOut();
            } catch (error: any) {
              Alert.alert('注销失败', error?.message || '请重试');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>隐私设置</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <ToggleItem
            icon="share-social"
            color="#4A90D9"
            title="号码状态参与共享"
            subtitle="是否将标记上传到社区共享池"
            value={shareStatus}
            onToggle={(v) => toggle(KEYS.shareStatus, setShareStatus, v)}
          />
          <ToggleItem
            icon="eye-off"
            color="#909399"
            title="隐藏我的标记统计"
            subtitle="在个人页隐藏标记次数"
            value={hideStats}
            onToggle={(v) => toggle(KEYS.hideStats, setHideStats, v)}
          />
          <ArrowItem
            icon="download"
            color="#67C23A"
            title="数据导出"
            subtitle="导出本人所有标记记录(JSON)"
            onPress={handleExportData}
          />
          <ArrowItem
            icon="trash"
            color="#F56C6C"
            title="注销账号"
            subtitle="清除所有云端数据并解绑账号"
            onPress={handleDeleteAccount}
          />
          <ArrowItem
            icon="shield-checkmark"
            color="#4A90D9"
            title="查看隐私政策"
            subtitle="了解我们如何保护您的数据"
            onPress={() => router.push('/privacy')}
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
