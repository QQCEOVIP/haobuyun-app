import React, { useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { useAuth } from "@/contexts/AuthContext";

interface ExchangeRecord {
  id: string;
  product_name: string;
  points_spent: number;
  status: string;
  created_at: string;
}

export default function ShopExchangesScreen() {
  const { session } = useAuth();
  const router = useSafeRouter();
  const [records, setRecords] = useState<ExchangeRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      fetchRecords();
    }, [session?.access_token])
  );

  const fetchRecords = async () => {
    if (!session?.access_token) return;

    try {
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/shop/exchanges`,
        {
          headers: { "x-session": session.access_token },
        }
      );
      const data = await res.json();
      setRecords(data.records || []);
    } catch (error) {
      console.error("获取兑换记录失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: "处理中",
      completed: "已完成",
      cancelled: "已取消",
      refunded: "已退款",
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: "#FF9800",
      completed: "#4CAF50",
      cancelled: "#9E9E9E",
      refunded: "#F44336",
    };
    return colorMap[status] || "#9E9E9E";
  };

  const renderItem = ({ item }: { item: ExchangeRecord }) => (
    <View style={styles.itemCard}>
      <View style={styles.itemInfo}>
        <Text style={styles.productName}>{item.product_name}</Text>
        <Text style={styles.exchangeDate}>
          {new Date(item.created_at).toLocaleDateString("zh-CN")}
        </Text>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.pointsSpent}>-{item.points_spent}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusColor(item.status) + "20" },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: getStatusColor(item.status) },
            ]}
          >
            {getStatusText(item.status)}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>暂无兑换记录</Text>
      <Text style={styles.emptySubtext}>快去积分商城逛逛吧</Text>
    </View>
  );

  if (loading) {
    return (
      <Screen>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>兑换记录</Text>
        <Text style={styles.headerSubtitle}>查看您的历史兑换</Text>
      </View>

      <FlatList
        data={records}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1F2937",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  itemCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1F2937",
  },
  exchangeDate: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  itemRight: {
    alignItems: "flex-end",
  },
  pointsSpent: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 8,
  },
});
