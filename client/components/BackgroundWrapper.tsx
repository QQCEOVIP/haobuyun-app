import React from 'react';
import { ImageBackground, View, StyleSheet } from 'react-native';

const bgImage = require('@/assets/bg_main.jpg');

interface BackgroundWrapperProps {
  children: React.ReactNode;
  overlayOpacity?: number;
}

/**
 * 全局背景组件
 * - 使用 ImageBackground 铺满整个屏幕
 * - 添加半透明遮罩层确保内容可读性
 * - 背景固定不随页面滚动
 */
export default function BackgroundWrapper({ children, overlayOpacity = 0 }: BackgroundWrapperProps) {
  return (
    <ImageBackground
      source={bgImage}
      style={styles.background}
      resizeMode="cover"
    >
      {/* 半透明遮罩层 */}
      <View style={[styles.overlay, { backgroundColor: `rgba(255, 255, 255, ${overlayOpacity})` }]}>
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    width: '100%',
  },
});
