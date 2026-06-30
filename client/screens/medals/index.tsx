import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { getBackendBaseUrl } from "@/utils";

interface Medal {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string | null;
  earned: boolean;
  earned_at?: string;
}

export default function MedalsScreen() {
  const { session } = useAuth();
  const [medals, setMedals] = useState<Medal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMedals = async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(
        `${getBackendBaseUrl()}/api/v1/points/medals`,
        {
          headers: { "x-session": session.access_token }
        }
      );
      const data = await res.json();
      setMedals(data.medals || []);
    } catch (error) {
      console.error("获取勋章失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchMedals();
    }, [session])
  );

  const earnedCount = medals.filter(m => m.earned).length;

  const getMedalIcon = (code: string, earned: boolean) => {
    const icons: Record<string, { earned: string; locked: string }> = {
      citizen: { earned: "star", locked: "lock-closed" },
      guardian: { earned: "shield-checkmark", locked: "lock-closed" },
      star: { earned: "star", locked: "lock-closed" },
      early_adopter: { earned: "rocket", locked: "lock-closed" },
      week_champion: { earned: "trophy", locked: "lock-closed" },
      month_champion: { earned: "ribbon", locked: "lock-closed" },
      streak_master: { earned: "flame", locked: "lock-closed" },
      helper: { earned: "hand-left", locked: "lock-closed" },
    };
    const icon = icons[code] || { earned: "medal", locked: "lock-closed" };
    return earned ? icon.earned : icon.locked;
  };

  const renderMedal = ({ item }: { item: Medal }) => (
    <View style={[styles.medalCard, !item.earned && styles.medalCardLocked]}>
      <View style={[styles.medalIcon, !item.earned && styles.medalIconLocked]}>
        <Ionicons
          name={getMedalIcon(item.code, item.earned) as any}
          size={32}
          color={item.earned ? "#FA8C16" : "#CCC"}
        />
      </View>
      <Text style={[styles.medalName, !item.earned && styles.medalNameLocked]}>
        {item.name}
      </Text>
      <Text style={[styles.medalDesc, !item.earned && styles.medalDescLocked]}>
        {item.description}
      </Text>
      {item.earned && item.earned_at && (
        <Text style={styles.earnedDate}>
          获得于 {new Date(item.earned_at).toLocaleDateString("zh-CN")}
        </Text>
      )}
      {!item.earned && (
        <View style={styles.lockedOverlay}>
          <Text style={styles.lockedText}>未解锁</Text>
        </View>
      )}
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        {/* 头部 */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Ionicons name="ribbon" size={24} color="#FA8C16" />
            <Text style={styles.headerTitle}> 我的勋章</Text>
          </View>
          <View style={styles.progressCard}>
            <Text style={styles.progressText}>
              已获得 <Text style={styles.progressHighlight}>{earnedCount}</Text> / {medals.length}
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${(earnedCount / Math.max(medals.length, 1)) * 100}%` }
                ]}
              />
            </View>
          </View>
        </View>

        {/* 提示 */}
        <View style={styles.tipCard}>
          <View style={styles.tipHeader}>
            <Ionicons name="bulb" size={20} color="#4A90D9" />
            <Text style={styles.tipTitle}> 如何获得勋章？</Text>
          </View>
          <Text style={styles.tipText}>
            • 热心市民：累计有效标注50+{'\n'}
            • 号码守护者：累计有效标注100+{'\n'}
            • 社区之星：累计有效标注500+{'\n'}
            • 互助使者：帮助5人确认号码
          </Text>
        </View>

        {/* 勋章列表 */}
        <FlatList
          data={medals}
          renderItem={renderMedal}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.medalRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !loading && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>暂无勋章数据</Text>
              </View>
            )
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  header: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  progressCard: {
    backgroundColor: "#F8F8F8",
    borderRadius: 12,
    padding: 12,
  },
  progressText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
    textAlign: "center",
  },
  progressHighlight: {
    color: "#4A90D9",
    fontWeight: "bold",
    fontSize: 18,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#E8E8E8",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#4A90D9",
    borderRadius: 4,
  },
  tipCard: {
    backgroundColor: "#FFF7E6",
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#FA8C16",
  },
  tipHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#664400",
    marginBottom: 8,
  },
  tipText: {
    fontSize: 13,
    color: "#8B6914",
    lineHeight: 22,
  },
  listContent: {
    padding: 12,
  },
  medalRow: {
    justifyContent: "space-between",
  },
  medalCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  medalCardLocked: {
    backgroundColor: "#F8F8F8",
  },
  medalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFF7E6",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  medalIconLocked: {
    backgroundColor: "#E8E8E8",
  },
  medalEmoji: {
    fontSize: 36,
  },
  medalEmojiLocked: {
    opacity: 0.5,
  },
  medalName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
    textAlign: "center",
  },
  medalNameLocked: {
    color: "#999",
  },
  medalDesc: {
    fontSize: 12,
    color: "#666",
    textAlign: "center",
    lineHeight: 18,
  },
  medalDescLocked: {
    color: "#999",
  },
  earnedDate: {
    fontSize: 11,
    color: "#4A90D9",
    marginTop: 8,
  },
  lockedOverlay: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#999",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  lockedText: {
    fontSize: 10,
    color: "#FFF",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: "#999",
  },
});
