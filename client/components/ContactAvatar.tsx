import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Pre-defined color palette for avatars
const AVATAR_COLORS = [
  '#4A90D9', // blue
  '#E6A23C', // orange
  '#67C23A', // green
  '#F56C6C', // red
  '#909399', // gray
  '#9B59B6', // purple
  '#1ABC9C', // teal
  '#E91E63', // pink
  '#FF9800', // deep orange
  '#00BCD4', // cyan
  '#795548', // brown
  '#607D8B', // blue gray
];

/**
 * Generate a consistent hash code from a string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get avatar color based on name hash
 */
function getAvatarColor(name: string): string {
  const hash = hashString(name);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Get the first character to display (handles Chinese and English)
 */
function getDisplayChar(name: string): string {
  if (!name || name.trim() === '') return '?';
  const trimmed = name.trim();
  return trimmed[0].toUpperCase();
}

interface ContactAvatarProps {
  name: string;
  size?: number;
}

export default function ContactAvatar({ name, size = 44 }: ContactAvatarProps) {
  const bgColor = getAvatarColor(name || '');
  const displayChar = getDisplayChar(name || '');
  const fontSize = size * 0.4;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bgColor,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize }]}>{displayChar}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
