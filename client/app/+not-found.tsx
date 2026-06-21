import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 justify-center items-center bg-background">
      <Text className="text-foreground text-lg">
        页面不存在
      </Text>
      <TouchableOpacity 
        className="mt-6 px-6 py-3 bg-accent rounded-lg"
        onPress={() => router.replace('/')}
      >
        <Text className="text-white font-medium">返回首页</Text>
      </TouchableOpacity>
    </View>
  );
}
