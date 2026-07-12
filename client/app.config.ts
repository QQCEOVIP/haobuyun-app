import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = process.env.COZE_PROJECT_NAME || process.env.EXPO_PUBLIC_COZE_PROJECT_NAME || '号簿云';
const projectId = process.env.COZE_PROJECT_ID || process.env.EXPO_PUBLIC_COZE_PROJECT_ID;
const slugAppName = projectId ? `app${projectId}` : 'haobuyun';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": "号簿云",
    "slug": slugAppName,
    "version": "1.0.1",
    "orientation": "portrait",
    "icon": "./assets/images/icon-512.png",
    "scheme": "myapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "enableProguardInReleaseBuilds": true,
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/ic_launcher_foreground.png",
        "backgroundColor": "#4F46E5"
      },
      "package": `com.haobuyun.app`,
      "permissions": ["REQUEST_INSTALL_PACKAGES"]
    },
    "web": {
      "bundler": "metro",
      "output": "single",
      "favicon": "./assets/images/favicon.png",
      "title": "号簿云"
    },
    "plugins": [
      process.env.EXPO_PUBLIC_BACKEND_BASE_URL ? [
        "expo-router",
        {
          "origin": process.env.EXPO_PUBLIC_BACKEND_BASE_URL
        }
      ] : 'expo-router',
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff"
        }
      ],
      [
        "expo-image-picker",
        {
          "photosPermission": `允许号簿云访问您的相册，以便您上传或保存图片。`
        }
      ],
      [
        "expo-contacts",
        {
          "contactsPermission": `允许号簿云访问和编辑您的通讯录，以便检测失效号码、备份和修改联系人信息。`
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    },
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL || 'https://br-slick-peep-6b368f8f.supabase2.aidap-global.cn-beijing.volces.com',
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.COZE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjMzNjI1OTk0ODYsInJvbGUiOiJhbm9uIn0.dLcaM8LcyJTlsvlNstMOKsWlJxIWVqsqNc4RDBZ-ic8'
    }
  }
}
