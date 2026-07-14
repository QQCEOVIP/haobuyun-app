import { useRef, useCallback } from 'react';
import { usePathname } from 'expo-router';
import { useSafeRouter } from '@/hooks/useSafeRouter';

// Tab顺序：首页 → 通讯录 → 新玩法 → 我的
const TAB_ROUTES = ['/', '/contacts', '/cleanup', '/profile'];

const SWIPE_THRESHOLD = 60; // 水平滑动距离阈值（像素）

/**
 * 滑动手势导航Hook
 * 使用 onTouchStart/onTouchEnd 捕捉水平滑动手势
 * 事件会冒泡，不受 FlatList/ScrollView 拦截影响
 */
export function useSwipeNavigation() {
  const router = useSafeRouter();
  const pathname = usePathname();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: any) => {
    const touch = e.nativeEvent?.touches?.[0];
    if (touch) {
      touchStartX.current = touch.pageX;
      touchStartY.current = touch.pageY;
    }
  }, []);

  const handleTouchEnd = useCallback((e: any) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const touch = e.nativeEvent?.changedTouches?.[0];
    if (!touch) return;

    const dx = touch.pageX - touchStartX.current;
    const dy = touch.pageY - touchStartY.current;

    // 重置
    touchStartX.current = null;
    touchStartY.current = null;

    // 判断是否为水平滑动（"一"字动作）：水平位移远大于垂直位移
    if (Math.abs(dx) < Math.abs(dy)) return; // 垂直滑动，不处理
    if (Math.abs(dx) < SWIPE_THRESHOLD) return; // 位移太小，可能是点击

    // 获取当前Tab索引
    const currentIndex = TAB_ROUTES.indexOf(pathname);
    if (currentIndex === -1) return;

    // 左滑（dx < 0）→ 下一个页面
    // 右滑（dx > 0）→ 上一个页面
    if (dx < 0 && currentIndex < TAB_ROUTES.length - 1) {
      router.push(TAB_ROUTES[currentIndex + 1]);
    } else if (dx > 0 && currentIndex > 0) {
      router.push(TAB_ROUTES[currentIndex - 1]);
    }
  }, [pathname, router]);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
  };
}
