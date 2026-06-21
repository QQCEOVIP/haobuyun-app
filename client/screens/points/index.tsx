import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

interface PointRecord {
  id: string;
  type: "earn" | "spend";
  action: string;
  points: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface PointsInfo {
  balance: number;
  total_earned: number;
  total_spent: number;
  credit_score: number;
}

export default function PointsDetailScreen() {
  const { session } = useAuth();
  const [pointsInfo, setPointsInfo] = useState<PointsInfo | null>(null);
  const [records, setRecords] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "earn" | "spend">("all");
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    if (!session?.access_token) return;

    try {
      // 获取积分余额
      const balanceRes = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/balance`, {
        headers: { "x-session": session.access_token }
      });
      const balanceData = await balanceRes.json();
      setPointsInfo(balanceData);

      // 获取积分记录
      const recordsRes = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/records?limit=50&type=${filter === "all" ? "" : filter}`, {
        headers: { "x-session": session.access_token }
      });
      const recordsData = await recordsRes.json();
      setRecords(recordsData.records || []);
    } catch (error) {
      console.error("获取积分数据失败:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [session, filter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      report_phone: "标注号码",
      streak_bonus: "连续标注奖励",
      exchange_product: "兑换商品",
      daily_bonus: "每日奖励",
      weekly_bonus: "周榜奖励",
      monthly_bonus: "月榜奖励",
    };
    return labels[action] || action;
  };

  const renderRecord = ({ item }: { item: PointRecord }) => (
    <View style={styles.recordItem}>
      <View style={styles.recordLeft}>
        <Text style={styles.recordAction}>{getActionLabel(item.action)}</Text>
        <Text style={styles.recordDesc}>{item.description}</Text>
        <Text style={styles.recordTime}>
          {new Date(item.created_at).toLocaleDateString("zh-CN")}
        </Text>
      </View>
      <View style={styles.recordRight}>
        <Text style={[
          styles.recordPoints,
          item.type === "earn" ? styles.earnPoints : styles.spendPoints
        ]}>
          {item.type === "earn" ? "+" : ""}{item.points}
        </Text>
        <Text style={styles.recordBalance}>余额: {item.balance_after}</Text>
      </View>
    </View>
  );

  return (
    <Screen>
      <View style={styles.container}>
        {/* 积分概览卡片 */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>我的积分</Text>
          <Text style={styles.balanceAmount}>{pointsInfo?.balance || 0}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pointsInfo?.total_earned || 0}</Text>
              <Text style={styles.statLabel}>累计获取</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pointsInfo?.total_spent || 0}</Text>
              <Text style={styles.statLabel}>累计消耗</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{pointsInfo?.credit_score || 100}</Text>
              <Text style={styles.statLabel}>信用分</Text>
            </View>
          </View>
        </View>

        {/* 筛选标签 */}
        <View style={styles.filterTabs}>
          {(["all", "earn", "spend"] as const).map((type) => (
            <TouchableOpacity
              key={type}
              style={[styles.filterTab, filter === type && styles.filterTabActive]}
              onPress={() => setFilter(type)}
            >
              <Text style={[styles.filterText, filter === type && styles.filterTextActive]}>
                {type === "all" ? "全部" : type === "earn" ? "获得" : "消耗"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 记录列表 */}
        <FlatList
          data={records}
          renderItem={renderRecord}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>暂无记录</Text>
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
  balanceCard: {
    backgroundColor: "#4A90D9",
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: "center",
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 14,
  },
  balanceAmount: {
    color: "#FFFFFF",
    fontSize: 48,
    fontWeight: "bold",
    marginVertical: 8,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 16,
    width: "100%",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  statLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  filterTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: "#E8E8E8",
  },
  filterTabActive: {
    backgroundColor: "#4A90D9",
  },
  filterText: {
    color: "#666",
    fontSize: 14,
  },
  filterTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  recordItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  recordLeft: {
    flex: 1,
  },
  recordAction: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  recordDesc: {
    fontSize: 13,
    color: "#666",
    marginTop: 4,
  },
  recordTime: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  recordRight: {
    alignItems: "flex-end",
  },
  recordPoints: {
    fontSize: 18,
    fontWeight: "bold",
  },
  earnPoints: {
    color: "#52C41A",
  },
  spendPoints: {
    color: "#FF4D4F",
  },
  recordBalance: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: "#999",
    fontSize: 14,
  },
});
