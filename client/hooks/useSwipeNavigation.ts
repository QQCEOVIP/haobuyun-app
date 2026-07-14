import { useRef } from 'react';
import { PanResponder } from 'react-native';
import { usePathname } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';

// Tab顺序：首页 → 通讯录 → 新玩法 → 我的
const TAB_ROUTES = ['/', '/contacts', '/cleanup', '/profile'];

const SWIPE_THRESHOLD = 80; // 滑动距离阈值（像素）

/**
 * 滑动手势导航Hook
 * 支持左右滑动切换Tab页面
 */
export function useSwipeNavigation() {
  const router = useSafeRouter();
  const pathname = usePathname();

  const panResponder = useRef(
    PanResponder.create({
      // 只在水平方向滑动时响应
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        // 水平滑动距离大于垂直滑动距离，且超过阈值
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20;
      },
      onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 20;
      },
      // 滑动结束时处理
      onPanResponderRelease: (evt, gestureState) => {
        const { dx } = gestureState;
        
        // 获取当前Tab索引
        const currentIndex = TAB_ROUTES.indexOf(pathname);
        if (currentIndex === -1) return;

        // 左滑（dx < 0）→ 下一个页面
        // 右滑（dx > 0）→ 上一个页面
        if (dx < -SWIPE_THRESHOLD && currentIndex < TAB_ROUTES.length - 1) {
          // 左滑，切换到下一个Tab
          router.push(TAB_ROUTES[currentIndex + 1]);
        } else if (dx > SWIPE_THRESHOLD && currentIndex > 0) {
          // 右滑，切换到上一个Tab
          router.push(TAB_ROUTES[currentIndex - 1]);
        }
      },
      // 不阻止子组件响应事件
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  return panResponder.panHandlers;
}
