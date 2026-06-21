import { ExpoConfig, ConfigContext } from 'expo/config';

const appName = process.env.COZE_PROJECT_NAME || process.env.EXPO_PUBLIC_COZE_PROJECT_NAME || '号簿云';
const projectId = process.env.COZE_PROJECT_ID || process.env.EXPO_PUBLIC_COZE_PROJECT_ID;
const slugAppName = projectId ? `app${projectId}` : 'haobuyun';

export default ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    "name": "号簿云",
    "slug": slugAppName,
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon-512.png",
    "scheme": "myapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/ic_launcher_foreground.png",
        "backgroundColor": "#4F46E5"
      },
      "package": `com.haobuyun.app`
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
          "photosPermission": `允许号簿云访问您的相册，以便您上传或保存图片。`,
          "cameraPermission": `允许号簿云使用您的相机，以便您直接拍摄照片上传。`,
          "microphonePermission": `允许号簿云访问您的麦克风，以便您拍摄带有声音的视频。`
        }
      ],
      [
        "expo-location",
        {
          "locationWhenInUsePermission": `号簿云需要访问您的位置以提供周边服务及导航功能。`
        }
      ],
      [
        "expo-camera",
        {
          "cameraPermission": `号簿云需要访问相机以拍摄照片和视频。`,
          "microphonePermission": `号簿云需要访问麦克风以录制视频声音。`,
          "recordAudioAndroid": true
        }
      ],
      [
        "expo-contacts",
        {
          "contactsPermission": `允许号簿云访问您的通讯录，以便检测失效号码和备份联系人信息。`
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
