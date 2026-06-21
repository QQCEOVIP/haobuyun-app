import React, { useEffect, useCallback, useRef } from "react";
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface PointRewardModalProps {
  visible: boolean;
  points: number;
  description: string;
  onClose: () => void;
}

export function PointRewardModal({ visible, points, description, onClose }: PointRewardModalProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const handleCloseAnimation = useCallback(() => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  }, [onClose]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 50,
          friction: 7,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // 3秒后自动关闭
      const timer = setTimeout(() => {
        handleCloseAnimation();
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [visible, handleCloseAnimation]);

  return (
    <Modal transparent visible={visible} animationType="none">
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleCloseAnimation}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <Ionicons name="gift" size={48} color="#FA8C16" />
          </View>
          <Text style={styles.title}>积分到账</Text>
          <View style={styles.pointsContainer}>
            <Text style={styles.pointsValue}>+{points}</Text>
            <Text style={styles.pointsLabel}>积分</Text>
          </View>
          <Text style={styles.description}>{description}</Text>
          <TouchableOpacity style={styles.button} onPress={handleCloseAnimation}>
            <Text style={styles.buttonText}>太棒了</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFF7E6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  pointsContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
  },
  pointsValue: {
    fontSize: 48,
    fontWeight: "bold",
    color: "#FA8C16",
  },
  pointsLabel: {
    fontSize: 18,
    color: "#FA8C16",
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    backgroundColor: "#4A90D9",
    paddingHorizontal: 40,
    paddingVertical: 12,
    borderRadius: 24,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default PointRewardModal;
