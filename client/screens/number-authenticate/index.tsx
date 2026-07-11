import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeRouter, useSafeSearchParams } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import { getBackendBaseUrl } from '@/utils';

export default function NumberAuthenticateScreen() {
  const router = useSafeRouter();
  const { phone, name, displayPhone } = useSafeSearchParams<{
    phone: string;
    name: string;
    displayPhone: string;
  }>();
  const { user } = useAuth();
  const [userName, setUserName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  /**
   * 提交认证姓名
   * 服务端文件：server/src/routes/authenticate.ts
   * 接口：POST /api/v1/authenticate
   * Body 参数：phone: string, user_name: string
   */
  const handleSubmit = useCallback(async () => {
    const trimmedName = userName.trim();
    if (!trimmedName) {
      Alert.alert('提示', '请输入当前号码使用者的姓名');
      return;
    }
    if (trimmedName.length < 2) {
      Alert.alert('提示', '姓名至少需要2个字符');
      return;
    }
    if (!phone) {
      Alert.alert('错误', '缺少号码信息');
      return;
    }

    setSubmitting(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user?.id) headers['x-user-id'] = user.id;

      const response = await fetch(`${getBackendBaseUrl()}/api/v1/authenticate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, user_name: trimmedName }),
      });

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({}));
        throw new Error(errorJson.error || `HTTP ${response.status}`);
      }

      // Remove local status - number is no longer "possibly invalid" on this device
      await AsyncStorage.removeItem(`@contact_status_${phone}`);

      Alert.alert(
        '认证成功',
        `已将 ${displayPhone || phone} 的使用者登记为「${trimmedName}」，该号码已从可能失效列表移除。`,
        [{ text: '确定', onPress: () => router.back() }]
      );
    } catch (error) {
      console.error('Failed to authenticate:', error);
      Alert.alert('提交失败', error instanceof Error ? error.message : '请重试');
    } finally {
      setSubmitting(false);
    }
  }, [userName, phone, displayPhone, user?.id, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>换机主认证</Text>
        <View style={styles.placeholder} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss} disabled={Platform.OS === 'web'}>
        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Contact info card */}
          <View style={styles.infoCard}>
            <View style={styles.infoIconWrap}>
              <Ionicons name="phone-portrait-outline" size={24} color="#F97316" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoName}>{name || '未知联系人'}</Text>
              <Text style={styles.infoPhone}>{displayPhone || phone}</Text>
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeText}>可能失效</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={styles.descSection}>
            <Text style={styles.descTitle}>确认号码使用者</Text>
            <Text style={styles.descText}>
              如果您确认该号码仍在使用中，请输入当前使用者的真实姓名进行认证。
              认证后该号码将从「可能失效」列表中移除，姓名将以脱敏方式展示给其他用户。
            </Text>
          </View>

          {/* Name input */}
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>使用者姓名</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color="#9CA3AF" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="请输入中文姓名"
                placeholderTextColor="#9CA3AF"
                value={userName}
                onChangeText={setUserName}
                maxLength={20}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                editable={!submitting}
              />
            </View>
            <Text style={styles.inputHint}>
              姓名将以脱敏方式展示（如：张*三、李*明）
            </Text>
          </View>

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitBtn, (!userName.trim() || submitting) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!userName.trim() || submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>提交认证</Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff',
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  placeholder: { width: 32 },
  body: { flex: 1, padding: 16 },
  infoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF7ED',
    borderRadius: 16, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  infoIconWrap: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  infoContent: { flex: 1 },
  infoName: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  infoPhone: { fontSize: 14, color: '#6B7280', marginBottom: 6 },
  infoBadge: {
    alignSelf: 'flex-start', backgroundColor: '#FED7AA',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  infoBadgeText: { fontSize: 11, fontWeight: '600', color: '#C2410C' },
  descSection: { marginBottom: 20 },
  descTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  descText: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
  inputSection: { marginBottom: 24 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: '#111827', paddingVertical: 14 },
  inputHint: { fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366F1', paddingVertical: 16, borderRadius: 14, gap: 8,
  },
  submitBtnDisabled: { backgroundColor: '#C7D2FE' },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
