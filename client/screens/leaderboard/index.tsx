import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

interface LeaderboardItem {
  rank: number;
  user_id: string;
  nickname: string;
  avatar_url: string | null;
  total_earned: number;
  is_me: boolean;
}

interface MyRank {
  rank: number;
  total_earned: number;
}

export default function LeaderboardScreen() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<"weekly" | "monthly">("weekly");
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/leaderboard?period=${period}`,
        {
          headers: { "x-session": session.access_token }
        }
      );
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
      setMyRank(data.my_rank);
    } catch (error) {
      console.error("获取排行榜失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLeaderboard();
    }, [session, period])
  );

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { backgroundColor: "#FFD700", color: "#8B6914" };
    if (rank === 2) return { backgroundColor: "#C0C0C0", color: "#666" };
    if (rank === 3) return { backgroundColor: "#CD7F32", color: "#FFF" };
    return { backgroundColor: "#F0F0F0", color: "#666" };
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return "medal";
    if (rank === 2) return "medal-outline";
    if (rank === 3) return "medal-outline";
    return null;
  };

  const renderItem = ({ item }: { item: LeaderboardItem }) => {
    const rankStyle = getRankStyle(item.rank);
    const iconName = getRankIcon(item.rank);

    return (
      <View style={[styles.rankItem, item.is_me && styles.myRankItem]}>
        <View style={styles.rankNumber}>
          {iconName ? (
            <View style={[styles.rankBadge, { backgroundColor: rankStyle.backgroundColor }]}>
              <Ionicons name={iconName as any} size={20} color={rankStyle.color} />
            </View>
          ) : (
            <View style={[styles.rankBadge, { backgroundColor: rankStyle.backgroundColor }]}>
              <Text style={[styles.rankText, { color: rankStyle.color }]}>{item.rank}</Text>
            </View>
          )}
        </View>

        <View style={styles.userInfo}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {item.nickname?.charAt(0) || "?"}
              </Text>
            </View>
          )}
          <View style={styles.userText}>
            <Text style={styles.nickname}>{item.nickname}</Text>
            {item.is_me && <Text style={styles.meTag}>我</Text>}
          </View>
        </View>

        <View style={styles.scoreInfo}>
          <Text style={styles.scoreText}>{item.total_earned}</Text>
          <Text style={styles.scoreLabel}>积分</Text>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.container}>
        {/* 顶部卡片 */}
        <View style={styles.headerCard}>
          <Text style={styles.headerTitle}>积分排行榜</Text>

          {/* 我的排名 */}
          {myRank && (
            <View style={styles.myRankCard}>
              <Text style={styles.myRankLabel}>我的排名</Text>
              <Text style={styles.myRankValue}>#{myRank.rank}</Text>
              <Text style={styles.myRankScore}>{myRank.total_earned} 积分</Text>
            </View>
          )}

          {/* 切换周期 */}
          <View style={styles.periodTabs}>
            <TouchableOpacity
              style={[styles.periodTab, period === "weekly" && styles.periodTabActive]}
              onPress={() => setPeriod("weekly")}
            >
              <Text style={[styles.periodText, period === "weekly" && styles.periodTextActive]}>
                周榜
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.periodTab, period === "monthly" && styles.periodTabActive]}
              onPress={() => setPeriod("monthly")}
            >
              <Text style={[styles.periodText, period === "monthly" && styles.periodTextActive]}>
                月榜
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 排行榜列表 */}
        <FlatList
          data={leaderboard}
          renderItem={renderItem}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>暂无数据</Text>
              <Text style={styles.emptySubtext}>快去标注号码获取积分吧！</Text>
            </View>
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
  headerCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  myRankCard: {
    backgroundColor: "#F0F7FF",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  myRankLabel: {
    fontSize: 13,
    color: "#666",
  },
  myRankValue: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#4A90D9",
    marginVertical: 4,
  },
  myRankScore: {
    fontSize: 13,
    color: "#999",
  },
  periodTabs: {
    flexDirection: "row",
    justifyContent: "center",
  },
  periodTab: {
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: "#F0F0F0",
    marginHorizontal: 4,
  },
  periodTabActive: {
    backgroundColor: "#4A90D9",
  },
  periodText: {
    fontSize: 14,
    color: "#666",
  },
  periodTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    padding: 16,
  },
  rankItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  myRankItem: {
    backgroundColor: "#F0F7FF",
    borderWidth: 2,
    borderColor: "#4A90D9",
  },
  rankNumber: {
    width: 40,
    alignItems: "center",
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  rankEmoji: {
    fontSize: 28,
  },
  userInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E8E8E8",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#999",
  },
  userText: {
    marginLeft: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  nickname: {
    fontSize: 15,
    color: "#333",
    fontWeight: "500",
  },
  meTag: {
    fontSize: 11,
    color: "#FFFFFF",
    backgroundColor: "#4A90D9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 6,
    overflow: "hidden",
  },
  scoreInfo: {
    alignItems: "flex-end",
  },
  scoreText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#FA8C16",
  },
  scoreLabel: {
    fontSize: 11,
    color: "#999",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: "#999",
  },
});
