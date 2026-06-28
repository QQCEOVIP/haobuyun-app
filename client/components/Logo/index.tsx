import React from 'react';
import { Image, View, Text, StyleSheet, ImageStyle } from 'react-native';

interface LogoProps {
  size?: number;
  showText?: boolean;
  style?: ImageStyle;
}

export default function Logo({ size = 80, showText = false, style }: LogoProps) {
  return (
    <View style={styles.container}>
      <Image
        source={require('@/assets/images/login-logo.png')}
        style={[{ width: size, height: size, resizeMode: 'contain', borderRadius: size * 0.25 }, style]}
      />
      {showText && (
        <Text style={styles.text}>号簿云</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4F46E5',
  },
});
