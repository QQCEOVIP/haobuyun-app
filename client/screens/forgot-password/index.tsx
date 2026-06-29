import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { Ionicons } from '@expo/vector-icons';

export default function ForgotPasswordScreen() {
  const router = useSafeRouter();
  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [phone, setPhone] = useState('');
  const [idCard, setIdCard] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!phone.trim()) {
      Alert.alert('提示', '请输入手机号');
      return;
    }
    if (!idCard.trim()) {
      Alert.alert('提示', '请输入身份证号');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/auth/forgot-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone.trim(),
            idCard: idCard.trim(),
            newPassword: 'temp_verify_only', // Just verify, don't reset yet
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        // Verification successful, move to reset step
        setStep('reset');
      } else {
        Alert.alert('验证失败', result.error || '信息不匹配');
      }
    } catch (error) {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('提示', '密码长度至少6位');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('提示', '两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/auth/forgot-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phone.trim(),
            idCard: idCard.trim(),
            newPassword: newPassword,
          }),
        }
      );

      const result = await response.json();

      if (response.ok && result.success) {
        Alert.alert('成功', '密码重置成功，请使用新密码登录', [
          { text: '确定', onPress: () => router.replace('/login') },
        ]);
      } else {
        Alert.alert('失败', result.error || '重置密码失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>

        <Text style={styles.title}>找回密码</Text>

        {step === 'verify' ? (
          <View style={styles.form}>
            <Text style={styles.label}>手机号</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="请输入注册时的手机号"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              maxLength={11}
            />

            <Text style={styles.label}>身份证号</Text>
            <TextInput
              style={styles.input}
              value={idCard}
              onChangeText={setIdCard}
              placeholder="请输入注册时的身份证号"
              placeholderTextColor="#999"
              maxLength={18}
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? '验证中...' : '下一步'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.subtitle}>验证成功，请设置新密码</Text>

            <Text style={styles.label}>新密码</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="请输入新密码（至少6位）"
              placeholderTextColor="#999"
              secureTextEntry
            />

            <Text style={styles.label}>确认密码</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="请再次输入新密码"
              placeholderTextColor="#999"
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? '重置中...' : '重置密码'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 40,
  },
  subtitle: {
    fontSize: 16,
    color: '#67C23A',
    marginBottom: 20,
  },
  form: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E6E8EB',
  },
  button: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
