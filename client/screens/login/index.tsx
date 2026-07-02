import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/contexts/AuthContext';
import Logo from '@/components/Logo';

const APP_NAME = '号簿云';
const APP_DOMAIN = 'haobuyun.app';
const SAVED_ACCOUNTS_KEY = '@saved_login_accounts';
const MAX_SAVED_ACCOUNTS = 5;

interface SavedAccount {
  phone: string;
  password: string;
  lastLoginAt: string;
}

export default function LoginScreen() {
  const router = useSafeRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [idCard, setIdCard] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const { signInWithEmail, signUpWithEmail } = useAuth();

  // Load saved accounts on mount
  useEffect(() => {
    loadSavedAccounts();
  }, []);

  const loadSavedAccounts = async () => {
    try {
      const data = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
      if (data) {
        const accounts: SavedAccount[] = JSON.parse(data);
        setSavedAccounts(accounts);
        // Auto-fill the most recent account
        if (accounts.length > 0) {
          const latest = accounts[0];
          setPhone(latest.phone);
          setPassword(latest.password);
        }
      }
    } catch {}
  };

  const saveAccount = async (phoneNumber: string, pwd: string) => {
    try {
      let accounts = [...savedAccounts];
      // Remove existing entry for this phone if present
      accounts = accounts.filter(a => a.phone !== phoneNumber);
      // Add new entry at the beginning (most recent first)
      accounts.unshift({
        phone: phoneNumber,
        password: pwd,
        lastLoginAt: new Date().toISOString(),
      });
      // Keep only the latest MAX_SAVED_ACCOUNTS
      if (accounts.length > MAX_SAVED_ACCOUNTS) {
        accounts = accounts.slice(0, MAX_SAVED_ACCOUNTS);
      }
      await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
      setSavedAccounts(accounts);
    } catch {}
  };

  const deleteAccount = async (phoneNumber: string) => {
    try {
      const accounts = savedAccounts.filter(a => a.phone !== phoneNumber);
      await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts));
      setSavedAccounts(accounts);
      // If deleted the currently filled account, clear fields
      if (phone === phoneNumber) {
        setPhone('');
        setPassword('');
      }
    } catch {}
  };

  const selectAccount = (account: SavedAccount) => {
    setPhone(account.phone);
    setPassword(account.password);
  };

  // Convert phone to email for Supabase auth
  const phoneToEmail = (phoneNumber: string) => `${phoneNumber}@${APP_DOMAIN}`;

  const handleSubmit = async () => {
    if (!agreed) {
      Alert.alert('提示', '请先阅读并同意用户协议和隐私政策');
      return;
    }
    if (!phone || !password) {
      Alert.alert('提示', '请输入手机号和密码');
      return;
    }

    // Validate phone number (11 digits for China)
    if (!/^\d{11}$/.test(phone)) {
      Alert.alert('提示', '请输入正确的11位手机号');
      return;
    }

    if (password.length < 6) {
      Alert.alert('提示', '密码至少需要6个字符');
      return;
    }

    if (!isLogin) {
      if (password !== confirmPassword) {
        Alert.alert('提示', '两次输入的密码不一致');
        return;
      }
      if (!idCard || idCard.length !== 18) {
        Alert.alert('提示', '请输入正确的18位身份证号');
        return;
      }
    }

    setLoading(true);
    try {
      const email = phoneToEmail(phone);
      if (isLogin) {
        const { error } = await signInWithEmail(email, password);
        if (error) {
          Alert.alert('登录失败', error.message);
        } else {
          // Save account on successful login
          await saveAccount(phone, password);
        }
      } else {
        const { error } = await signUpWithEmail(email, password, { phone, id_card: idCard });
        if (error) {
          Alert.alert('注册失败', error.message);
        } else {
          Alert.alert('注册成功', '注册成功，请登录', [
            { text: '确定', onPress: () => setIsLogin(true) }
          ]);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Logo size={80} />
            <Text style={styles.appName}>{APP_NAME}</Text>
            <Text style={styles.subtitle}>
              {isLogin ? '欢迎回来' : '创建账号'}
            </Text>
          </View>

          <View style={styles.form} importantForAutofill="noExcludeDescendants">
            <View style={styles.inputContainer}>
              <Text style={styles.label}>手机号</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入手机号"
                placeholderTextColor="#B2BEC3"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={11}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                readOnly={false}
              />
            </View>

            {/* Saved accounts list */}
            {isLogin && savedAccounts.length > 0 && (
              <View style={styles.savedAccountsContainer}>
                <Text style={styles.savedAccountsTitle}>已保存的账号</Text>
                {savedAccounts.map((account) => (
                  <View key={account.phone} style={styles.savedAccountRow}>
                    <TouchableOpacity
                      style={styles.savedAccountInfo}
                      onPress={() => selectAccount(account)}
                    >
                      <Ionicons name="person-circle-outline" size={20} color="#4A90D9" />
                      <View style={styles.savedAccountText}>
                        <Text style={styles.savedAccountPhone}>{account.phone}</Text>
                        <Text style={styles.savedAccountDate}>
                          {new Date(account.lastLoginAt).toLocaleDateString('zh-CN')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.savedAccountDelete}
                      onPress={() => deleteAccount(account.phone)}
                    >
                      <Ionicons name="close-circle" size={20} color="#C0C4CC" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>密码</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="请输入密码"
                  placeholderTextColor="#B2BEC3"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="off"
                  textContentType="none"
                  importantForAutofill="no"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={22}
                    color="#666"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {!isLogin && (
              <>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>确认密码</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="请再次输入密码"
                    placeholderTextColor="#B2BEC3"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>身份证号</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="请输入身份证号（用于找回密码）"
                    placeholderTextColor="#B2BEC3"
                    value={idCard}
                    onChangeText={setIdCard}
                    maxLength={18}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </>
            )}

            {/* 协议勾选 */}
            <View style={styles.agreementRow}>
              <TouchableOpacity
                style={styles.agreementCheckbox}
                onPress={() => setAgreed(!agreed)}
              >
                <View style={[styles.checkboxInner, agreed && styles.checkboxInnerChecked]}>
                  {agreed && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
              <Text style={styles.agreementText}>
                我已阅读并同意
                <Text
                  style={[styles.agreementLink, { textDecorationLine: 'underline' }]}
                  onPress={() => router.push('/agreement')}
                  hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
                >
                  《用户协议》
                </Text>
                和
                <Text
                  style={[styles.agreementLink, { textDecorationLine: 'underline' }]}
                  onPress={() => router.push('/privacy')}
                  hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
                >
                  《隐私政策》
                </Text>
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.button, (!agreed || loading) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading || !agreed}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? '登录' : '注册'}
                </Text>
              )}
            </TouchableOpacity>

            {isLogin && (
              <TouchableOpacity
                style={styles.forgotPasswordRow}
                onPress={() => router.push('/forgot-password')}
              >
                <Text style={styles.forgotPasswordText}>忘记密码？</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setIsLogin(!isLogin);
                setConfirmPassword('');
                setIdCard('');
              }}
            >
              <Text style={styles.switchText}>
                {isLogin ? '还没有账号？去注册' : '已有账号？去登录'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.privacy}>
            <Text style={styles.privacyText}>
              登录即表示同意
              <Text style={styles.privacyLink}>《用户协议》</Text>
              和
              <Text style={styles.privacyLink}>《隐私政策》</Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#909399',
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#303133',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#303133',
  },
  passwordContainer: {
    flexDirection: 'row',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#303133',
  },
  eyeButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  savedAccountsContainer: {
    marginBottom: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  savedAccountsTitle: {
    fontSize: 12,
    color: '#909399',
    marginBottom: 8,
  },
  savedAccountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EBEEF5',
  },
  savedAccountInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  savedAccountText: {
    marginLeft: 8,
  },
  savedAccountPhone: {
    fontSize: 14,
    color: '#303133',
    fontWeight: '500',
  },
  savedAccountDate: {
    fontSize: 11,
    color: '#C0C4CC',
    marginTop: 2,
  },
  savedAccountDelete: {
    padding: 4,
  },
  agreementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  agreementCheckbox: {
    marginRight: 8,
    paddingTop: 2,
  },
  checkboxInner: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#DCDFE6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxInnerChecked: {
    backgroundColor: '#4A90D9',
    borderColor: '#4A90D9',
  },
  agreementText: {
    flex: 1,
    fontSize: 13,
    color: '#909399',
    lineHeight: 20,
  },
  agreementLink: {
    color: '#4A90D9',
  },
  button: {
    backgroundColor: '#4A90D9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  switchButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  switchText: {
    color: '#4A90D9',
    fontSize: 14,
  },
  forgotPasswordRow: {
    marginTop: 12,
    alignItems: 'center',
  },
  forgotPasswordText: {
    color: '#909399',
    fontSize: 13,
  },
  privacy: {
    marginTop: 24,
    alignItems: 'center',
  },
  privacyText: {
    fontSize: 12,
    color: '#909399',
  },
  privacyLink: {
    color: '#4A90D9',
  },
});
