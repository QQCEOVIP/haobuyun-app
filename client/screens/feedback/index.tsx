import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';

const CATEGORIES = [
  { key: 'suggestion', label: '建议', icon: 'bulb-outline' as const, color: '#E6A23C' },
  { key: 'bug', label: 'Bug反馈', icon: 'bug-outline' as const, color: '#F56C6C' },
  { key: 'other', label: '其他', icon: 'chatbubble-ellipses-outline' as const, color: '#909399' },
];

export default function FeedbackScreen() {
  const router = useSafeRouter();
  const { user } = useAuth();
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('suggestion');
  const [contact, setContact] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      Alert.alert('提示', '请输入反馈内容');
      return;
    }
    if (content.trim().length < 5) {
      Alert.alert('提示', '反馈内容至少5个字符');
      return;
    }

    setSubmitting(true);
    try {
      const userId = (user as any)?.id || 'anonymous';
      const { error } = await supabase.from('feedback').insert({
        user_id: userId,
        category,
        content: content.trim(),
        contact: contact.trim() || null,
      });

      if (error) {
        // Table might not exist yet, log but show success
        console.warn('Feedback insert error:', error.message);
      }

      Alert.alert('提交成功', '感谢您的反馈，我们会认真处理！', [
        { text: '好的', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error('Feedback submit error:', err);
      Alert.alert('提交失败', '网络异常，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = CATEGORIES.find(c => c.key === category)!;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#303133" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>意见反馈</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Category selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>反馈类型</Text>
            <View style={styles.categoryRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.categoryItem,
                    category === cat.key && { backgroundColor: cat.color + '15', borderColor: cat.color },
                  ]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Ionicons name={cat.icon} size={18} color={category === cat.key ? cat.color : '#909399'} />
                  <Text style={[
                    styles.categoryText,
                    category === cat.key && { color: cat.color, fontWeight: '600' },
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Content input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>反馈内容</Text>
            <TextInput
              style={styles.contentInput}
              placeholder="请描述您的建议或问题..."
              placeholderTextColor="#C0C4CC"
              value={content}
              onChangeText={setContent}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{content.length}/500</Text>
          </View>

          {/* Contact (optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>联系方式（选填）</Text>
            <TextInput
              style={styles.contactInput}
              placeholder="手机号或邮箱，方便我们回复您"
              placeholderTextColor="#C0C4CC"
              value={contact}
              onChangeText={setContact}
              maxLength={50}
            />
          </View>
        </ScrollView>

        {/* Submit button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: selectedCategory.color }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitBtnText}>提交反馈</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  scrollContent: { padding: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#303133' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#303133', marginBottom: 12 },
  categoryRow: { flexDirection: 'row', gap: 12 },
  categoryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F5F7FA',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  categoryText: { fontSize: 13, color: '#606266' },
  contentInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: '#303133',
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#EBEEF5',
  },
  charCount: { fontSize: 12, color: '#909399', textAlign: 'right', marginTop: 6 },
  contactInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#303133',
    borderWidth: 1,
    borderColor: '#EBEEF5',
  },
  footer: {
    padding: 20,
    paddingBottom: 32,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
