import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/contexts/AuthContext';
import { FontAwesome6 } from '@expo/vector-icons';

const API_BASE_URL = process.env.EXPO_PUBLIC_BACKEND_BASE_URL || 'http://localhost:9091';

interface ChangeNumberFormProps {
  onSuccess?: () => void;
}

export default function ChangeNumberForm({ onSuccess }: ChangeNumberFormProps) {
  const { user } = useAuth();
  const [oldPhone, setOldPhone] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remark, setRemark] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const isFormValid = oldPhone && newPhone && displayName && agreed;

  const handleSubmit = async () => {
    if (!isFormValid || loading) return;

    if (!user?.id) {
      Alert.alert('提示', '请先登录');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/number-changes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': user.id,
        },
        body: JSON.stringify({
          old_phone: oldPhone,
          new_phone: newPhone,
          display_name: displayName,
          remark: remark,
          disclaimer_agreed: true,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        Alert.alert('成功', '号码变更通知已发布');
        // 清空表单
        setOldPhone('');
        setNewPhone('');
        setDisplayName('');
        setRemark('');
        setAgreed(false);
        onSuccess?.();
      } else {
        Alert.alert('错误', data.error || '提交失败');
      }
    } catch (error) {
      Alert.alert('错误', '网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>本人标记</Text>
      <Text style={styles.subtitle}>标记您的号码已变更，让通讯录好友知晓</Text>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>原号码 *</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入原手机号"
            value={oldPhone}
            onChangeText={setOldPhone}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>新号码 *</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入新手机号"
            value={newPhone}
            onChangeText={setNewPhone}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>您的称呼 *</Text>
          <TextInput
            style={styles.input}
            placeholder="如：龙哥、小王（2-20字符）"
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={20}
          />
          <Text style={styles.hint}>好友将通过此称呼确认您的身份</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>备注（可选）</Text>
          <TextInput
            style={[styles.input, styles.textarea]}
            placeholder="如：已换移动号、原号停用等"
            value={remark}
            onChangeText={setRemark}
            multiline
            maxLength={200}
          />
        </View>

        {/* 免责声明 */}
        <View style={styles.disclaimer}>
          <TouchableOpacity
            onPress={() => setAgreed(!agreed)}
            style={styles.checkbox}>
            <FontAwesome6
              name={agreed ? 'check-square' : 'square'}
              size={20}
              color={agreed ? '#ff9800' : '#ccc'}
            />
          </TouchableOpacity>
          <Text style={styles.disclaimerText}>
            我已阅读并同意以下声明：{'\n'}
            1. 本人标记的号码将一票即生效，直接出现在社区「可能失效」列表中；{'\n'}
            2. 如恶意标记他人号码，本人将承担由此产生的一切法律责任；{'\n'}
            3. 本人确认该号码确已变更，标记行为出于真实意愿。
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, !isFormValid && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!isFormValid || loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>发布变更通知</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  textarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  disclaimer: {
    flexDirection: 'row',
    backgroundColor: '#fff8e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ffe0b2',
  },
  checkbox: {
    marginRight: 10,
    paddingTop: 2,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
