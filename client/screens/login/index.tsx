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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSafeRouter } from '@/hooks/useSafeRouter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
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
  const [rememberPassword, setRememberPassword] = useState(true);
  const [showAgreement, setShowAgreement] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { signInWithEmail, signUpWithEmail } = useAuth();

  // Load saved accounts on mount
  useEffect(() => {
    loadSavedAccounts();
  }, []);

  const loadSavedAccounts = async () => {
    try {
      // 1. Try loading from AsyncStorage first
      const data = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
      if (data) {
        const accounts: SavedAccount[] = JSON.parse(data);
        setSavedAccounts(accounts);
        if (accounts.length > 0) {
          const latest = accounts[0];
          setPhone(latest.phone);
          setPassword(latest.password);
          setRememberPassword(true);
        }
        return;
      }

      // 2. No data in AsyncStorage, try migrating from SecureStore
      try {
        const oldPhone = await SecureStore.getItemAsync('saved_phone');
        const oldPassword = await SecureStore.getItemAsync('saved_password');
        if (oldPhone && oldPassword) {
          const migratedAccount: SavedAccount = {
            phone: oldPhone,
            password: oldPassword,
            lastLoginAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify([migratedAccount]));
          setSavedAccounts([migratedAccount]);
          setPhone(oldPhone);
          setPassword(oldPassword);
          setRememberPassword(true);
          // Delete old data after migration
          await SecureStore.deleteItemAsync('saved_phone');
          await SecureStore.deleteItemAsync('saved_password');
        }
      } catch (e) {
        console.log('[Login] SecureStore migration failed:', e);
      }
    } catch (e) {
      console.log('[Login] loadSavedAccounts error:', e);
    }
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
          // Save account on successful login if rememberPassword is checked
          if (rememberPassword) {
            await saveAccount(phone, password);
          }
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
            <View style={styles.inputContainer} importantForAutofill="noExcludeDescendants">
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
                      <Ionicons name="close" size={18} color="#F56C6C" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.inputContainer} importantForAutofill="noExcludeDescendants">
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

            {/* 记住密码勾选 */}
            {isLogin && (
              <View style={styles.agreementRow}>
                <TouchableOpacity
                  style={styles.agreementCheckbox}
                  onPress={() => setRememberPassword(!rememberPassword)}
                >
                  <View style={[styles.checkboxInner, rememberPassword && styles.checkboxInnerChecked]}>
                    {rememberPassword && <Ionicons name="checkmark" size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>
                <Text style={styles.agreementText}>记住密码</Text>
              </View>
            )}

            {/* 协议勾选 - 使用 View + TouchableOpacity 平级布局，兼容 Android */}
            <View style={styles.agreementRow}>
              <TouchableOpacity
                style={styles.agreementCheckbox}
                onPress={() => setAgreed(!agreed)}
              >
                <View style={[styles.checkboxInner, agreed && styles.checkboxInnerChecked]}>
                  {agreed && <Ionicons name="checkmark" size={12} color="#fff" />}
                </View>
              </TouchableOpacity>
              <View style={styles.agreementTextWrap}>
                <Text style={styles.agreementText}>我已阅读并同意</Text>
                <TouchableOpacity onPress={() => setShowAgreement(true)}>
                  <Text style={styles.agreementLink}>《用户协议》</Text>
                </TouchableOpacity>
                <Text style={styles.agreementText}>和</Text>
                <TouchableOpacity onPress={() => setShowPrivacy(true)}>
                  <Text style={styles.agreementLink}>《隐私政策》</Text>
                </TouchableOpacity>
              </View>
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

      {/* 用户协议 Modal */}
      <Modal visible={showAgreement} transparent animationType="slide" onRequestClose={() => setShowAgreement(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EBEEF5' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#303133' }}>用户协议</Text>
              <TouchableOpacity onPress={() => setShowAgreement(false)}><Ionicons name="close" size={24} color="#909399" /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
              <Text style={{ fontSize: 14, color: '#303133', lineHeight: 24 }}>
                {'号簿云用户协议\n\n更新日期：2026年1月1日\n\n一、服务条款\n欢迎使用号簿云通讯录管理服务。本协议是您与号簿云之间关于使用号簿云服务所订立的协议。\n\n二、服务内容\n号簿云为用户提供通讯录备份、恢复、清理、号码标记等服务。\n\n三、用户责任\n1. 用户应妥善保管账号和密码，因用户原因导致的安全问题由用户自行承担。\n2. 用户不得利用本服务从事违法活动。\n3. 用户应确保上传的数据合法合规。\n\n四、隐私保护\n号簿云重视用户隐私保护，具体内容请参见《隐私政策》。\n\n五、免责声明\n1. 因不可抗力导致的服务中断，号簿云不承担责任。\n2. 号簿云不对第三方服务质量做任何保证。\n3. 号码标记功能仅供参考，不保证标记结果的准确性。\n4. 通讯录备份服务不承诺100%数据完整性。\n\n六、协议修改\n号簿云有权修改本协议，修改后将在应用内通知用户。'}
              </Text>
            </ScrollView>
            <View style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EBEEF5' }}>
              <TouchableOpacity onPress={() => setShowAgreement(false)} style={{ backgroundColor: '#4A90D9', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 }}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 隐私政策 Modal */}
      <Modal visible={showPrivacy} transparent animationType="slide" onRequestClose={() => setShowPrivacy(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%', paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EBEEF5' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#303133' }}>隐私政策</Text>
              <TouchableOpacity onPress={() => setShowPrivacy(false)}><Ionicons name="close" size={24} color="#909399" /></TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} contentContainerStyle={{ paddingBottom: 80 }}>
              <Text style={{ fontSize: 14, color: '#303133', lineHeight: 24 }}>
                {'号簿云隐私政策\n\n更新日期：2026年1月1日\n\n一、信息收集\n我们收集以下信息：\n1. 注册信息：手机号、身份证号（用于找回密码）\n2. 通讯录数据：联系人姓名、电话号码（用于备份和恢复服务）\n3. 设备信息：设备型号、操作系统版本\n\n二、信息使用\n收集的信息仅用于：\n1. 提供通讯录备份和恢复服务\n2. 号码状态检测和标记\n3. 改进服务质量\n\n三、信息存储\n1. 数据通过加密方式存储在安全的服务器上（使用Supabase安全基础设施）\n2. 用户可随时删除自己的数据\n\n四、信息共享\n未经用户同意，我们不会向第三方共享用户个人信息，法律法规要求除外。\n\n五、数据安全\n我们采用行业标准的安全措施保护用户数据。\n\n六、用户权利\n1. 查询和更正个人信息\n2. 删除个人信息\n3. 撤回授权同意\n4. 注销账号\n\n七、第三方服务\n本应用使用Supabase作为后端基础设施，其隐私政策请参阅Supabase官方网站。'}
              </Text>
            </ScrollView>
            <View style={{ paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EBEEF5' }}>
              <TouchableOpacity onPress={() => setShowPrivacy(false)} style={{ backgroundColor: '#4A90D9', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 25 }}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>关闭</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    padding: 8,
    marginLeft: 8,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 13,
    color: '#909399',
    lineHeight: 20,
  },
  agreementTextWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  agreementLink: {
    color: '#4A90D9',
    fontSize: 13,
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
