import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useRouter as useExpoRouter, useRootNavigationState, useSegments } from 'expo-router';
import { verifyEnvironment } from '@/utils/verifyEnv';

import '../global.css';

LogBox.ignoreLogs([
  "TurboModuleRegistry.getEnforcing(...): 'RNMapsAirModule' could not be found",
]);

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useExpoRouter();
  const segments = useSegments();
  const rootState = useRootNavigationState();

  useEffect(() => {
    if (!rootState?.key) return;
    if (isLoading) return;

    const inAuthRoute = segments.length > 0 && (segments[0] === 'login' || segments[0] === 'forgot-password');

    if (!isAuthenticated && !inAuthRoute) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [rootState?.key, isAuthenticated, isLoading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  // Environment verification on app startup (soft check, no blocking)
  useEffect(() => {
    verifyEnvironment();
  }, []);

  return (
    <Provider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AuthGuard>
          <Stack
            screenOptions={{
              animation: 'simple_push',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              headerShown: false
            }}
          >
            <Stack.Screen name="index" options={{ title: "" }} />
            <Stack.Screen name="login" options={{ title: "登录" }} />
            <Stack.Screen name="onboarding" options={{ title: "引导" }} />
            <Stack.Screen name="(tabs)" options={{ animation: 'none', contentStyle: { backgroundColor: '#F5F7FA' } }} />
            <Stack.Screen name="points" options={{ title: "我的积分" }} />
            <Stack.Screen name="shop" options={{ title: "积分商城" }} />
            <Stack.Screen name="shopExchanges" options={{ title: "兑换记录" }} />
            <Stack.Screen name="leaderboard" options={{ title: "排行榜" }} />
            <Stack.Screen name="medals" options={{ title: "勋章墙" }} />
            <Stack.Screen name="promo" options={{ title: "推广中心" }} />
            <Stack.Screen name="agreement" options={{ title: "用户协议" }} />
            <Stack.Screen name="privacy" options={{ title: "隐私政策" }} />
            <Stack.Screen name="forgot-password" options={{ title: "找回密码" }} />
            <Stack.Screen name="about" options={{ title: "关于我们" }} />
            <Stack.Screen name="notification" options={{ title: "通知设置" }} />
            <Stack.Screen name="privacy-settings" options={{ title: "隐私设置" }} />
            <Stack.Screen name="duplicates" options={{ title: "疑似重复" }} />
            <Stack.Screen name="stopped-contacts" options={{ title: "失效号码" }} />
            <Stack.Screen name="recycle-bin" options={{ title: "回收站" }} />
            <Stack.Screen name="feedback" options={{ title: "意见反馈" }} />
            <Stack.Screen name="suspected-contacts" options={{ title: "可能失效" }} />
            <Stack.Screen name="number-authenticate" options={{ title: "换机主认证" }} />
            <Stack.Screen name="authenticated-numbers" options={{ title: "已认证号码" }} />
          </Stack>
        </AuthGuard>
        <Toast />
      </AuthProvider>
    </Provider>
  );
}
