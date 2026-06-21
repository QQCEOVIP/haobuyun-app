/**
 * 号簿云 Logo 组件
 * 设计语言：蓝紫渐变背景 + 白色云朵 + 通讯录笔记本融合
 * 与应用图标保持一致
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  Circle,
  G,
  Text as SvgText,
} from 'react-native-svg';

interface LogoProps {
  size?: number;
  showText?: boolean;
}

export default function Logo({ size = 120, showText = false }: LogoProps) {
  const iconSize = showText ? size * 0.6 : size;
  const textHeight = showText ? 24 : 0;
  const totalHeight = iconSize + textHeight + 8;

  return (
    <View style={[styles.container, { width: size, height: totalHeight }]}>
      <Svg width={size} height={iconSize} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#4F46E5" />
            <Stop offset="50%" stopColor="#6366F1" />
            <Stop offset="100%" stopColor="#8B5CF6" />
          </LinearGradient>
          <LinearGradient id="cloudGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#E0E7FF" />
          </LinearGradient>
          <LinearGradient id="bookGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" />
            <Stop offset="100%" stopColor="#F5F3FF" />
          </LinearGradient>
          <LinearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FAFAFA" />
            <Stop offset="100%" stopColor="#F0F0FF" />
          </LinearGradient>
        </Defs>

        {/* 背景圆角方形 */}
        <Rect x="4" y="4" width="112" height="112" rx="24" fill="url(#bgGradient)" />

        {/* 云朵 - 左上角 */}
        <G transform="translate(15, 20)">
          {/* 云朵主体 */}
          <Circle cx="20" cy="25" r="12" fill="url(#cloudGradient)" opacity="0.95" />
          <Circle cx="35" cy="22" r="14" fill="url(#cloudGradient)" opacity="0.95" />
          <Circle cx="48" cy="28" r="10" fill="url(#cloudGradient)" opacity="0.95" />
          <Circle cx="38" cy="32" r="8" fill="url(#cloudGradient)" opacity="0.95" />
          <Rect x="15" y="28" width="38" height="12" fill="url(#cloudGradient)" opacity="0.95" />
        </G>

        {/* 通讯录笔记本 - 右下角 */}
        <G transform="translate(55, 55)">
          {/* 笔记本背景 */}
          <Rect x="2" y="2" width="48" height="55" rx="4" fill="url(#bookGradient)" />
          
          {/* 笔记本书脊 */}
          <Rect x="2" y="2" width="6" height="55" rx="2" fill="#E0E7FF" />
          
          {/* 页面 */}
          <Rect x="12" y="8" width="34" height="44" rx="2" fill="url(#pageGradient)" />
          
          {/* 页面分隔线 */}
          <Rect x="16" y="14" width="20" height="2" rx="1" fill="#CBD5E1" opacity="0.6" />
          <Rect x="16" y="20" width="16" height="2" rx="1" fill="#CBD5E1" opacity="0.6" />
          <Rect x="16" y="26" width="22" height="2" rx="1" fill="#CBD5E1" opacity="0.6" />
          
          {/* 头像占位 */}
          <Circle cx="24" cy="40" r="6" fill="#818CF8" opacity="0.5" />
          
          {/* 页面内容线 */}
          <Rect x="16" y="50" width="18" height="2" rx="1" fill="#CBD5E1" opacity="0.4" />
        </G>

        {/* 连接线装饰 */}
        <G opacity="0.3">
          <Circle cx="45" cy="50" r="3" fill="#FFFFFF" />
          <Circle cx="52" cy="58" r="2" fill="#FFFFFF" />
          <Circle cx="48" cy="65" r="2.5" fill="#FFFFFF" />
        </G>
      </Svg>
      
      {showText && (
        <SvgText
          fill="#4F46E5"
          fontSize={20}
          fontWeight="bold"
          textAnchor="middle"
          dy={20}
        >
          号簿云
        </SvgText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
