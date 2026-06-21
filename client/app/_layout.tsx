import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import Toast from 'react-native-toast-message';
import { Provider } from '@/components/Provider';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useRouter as useExpoRouter, useRootNavigationState, useSegments } from 'expo-router';

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

    const inAuthRoute = segments.length > 0 && segments[0] === 'login';

    if (!isAuthenticated && !inAuthRoute) {
      router.replace('/login');
    } else if (isAuthenticated && inAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [rootState?.key, isAuthenticated, isLoading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <Provider>
      <AuthProvider>
        <StatusBar style="dark" />
        <AuthGuard>
          <Stack
            screenOptions={{
              animation: 'slide_from_right',
              gestureEnabled: true,
              gestureDirection: 'horizontal',
              headerShown: false
            }}
          >
            <Stack.Screen name="index" options={{ title: "" }} />
            <Stack.Screen name="login" options={{ title: "登录" }} />
            <Stack.Screen name="onboarding" options={{ title: "引导" }} />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthGuard>
        <Toast />
      </AuthProvider>
    </Provider>
  );
}
