import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

interface PointsInfo {
  balance: number;
  total_earned: number;
  total_spent: number;
  credit_score: number;
}

interface CheckinInfo {
  checked_in_today: boolean;
  current_streak: number;
  longest_streak: number;
}

interface Medal {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

interface ShopProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  stock: number;
}

const TASKS = [
  { id: "report", title: "标注号码", desc: "标注1个号码状态", reward: 10, icon: "phone-portrait" as const, color: "#4A90D9" },
  { id: "daily", title: "每日签到", desc: "每日签到领积分", reward: 5, icon: "calendar" as const, color: "#67C23A" },
  { id: "streak", title: "连续7天标注", desc: "连续7天每天标注", reward: 20, icon: "flame" as const, color: "#E6A23C" },
];

export default function PointsScreen() {
  const { session } = useAuth();
  const [pointsInfo, setPointsInfo] = useState<PointsInfo | null>(null);
  const [checkinInfo, setCheckinInfo] = useState<CheckinInfo>({ checked_in_today: false, current_streak: 0, longest_streak: 0 });
  const [medals, setMedals] = useState<Medal[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.access_token) return;
    const headers = { "x-session": session.access_token };

    try {
      const [balanceRes, checkinRes, medalsRes, productsRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/balance`, { headers }),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/checkin`, { headers }),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/medals`, { headers }),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/shop/products`, { headers }),
      ]);

      const [balanceData, checkinData, medalsData, productsData] = await Promise.all([
        balanceRes.json(),
        checkinRes.json(),
        medalsRes.json(),
        productsRes.json(),
      ]);

      setPointsInfo(balanceData);
      setCheckinInfo(checkinData);
      setMedals(medalsData.medals || []);
      setProducts(productsData.products || []);
    } catch (error) {
      console.error("获取积分数据失败:", error);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCheckin = async () => {
    if (!session?.access_token || checkingIn) return;
    setCheckingIn(true);
    try {
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/checkin`, {
        method: "POST",
        headers: { "x-session": session.access_token },
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert("签到成功", `+${data.points_earned}积分\n连续签到 ${data.streak} 天`);
        fetchData();
      } else {
        Alert.alert("提示", data.message || "今天已签到");
      }
    } catch (error) {
      Alert.alert("错误", "签到失败，请重试");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleExchange = async (product: ShopProduct) => {
    if (!session?.access_token) return;
    Alert.alert(
      "兑换确认",
      `确定用 ${product.price} 积分兑换「${product.name}」吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确定兑换",
          onPress: async () => {
            try {
              const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/shop/exchange`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-session": session.access_token },
                body: JSON.stringify({ product_id: product.id }),
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert("兑换成功", `剩余积分: ${data.remaining_points}`);
                fetchData();
              } else {
                Alert.alert("兑换失败", data.error || "积分不足");
              }
            } catch {
              Alert.alert("错误", "兑换失败，请重试");
            }
          },
        },
      ]
    );
  };

  const earnedCount = medals.filter((m) => m.earned).length;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 积分概览 */}
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

        {/* 每日签到 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar" size={20} color="#67C23A" />
            <Text style={styles.sectionTitle}>每日签到</Text>
          </View>
          <View style={styles.checkinRow}>
            <View style={styles.checkinInfo}>
              <Text style={styles.checkinStreak}>
                连续 <Text style={styles.checkinStreakNum}>{checkinInfo.current_streak}</Text> 天
              </Text>
              <Text style={styles.checkinLongest}>最长 {checkinInfo.longest_streak} 天</Text>
            </View>
            <TouchableOpacity
              style={[styles.checkinButton, checkinInfo.checked_in_today && styles.checkinButtonDisabled]}
              onPress={handleCheckin}
              disabled={checkinInfo.checked_in_today || checkingIn}
            >
              <Text style={styles.checkinButtonText}>
                {checkinInfo.checked_in_today ? "已签到" : checkingIn ? "签到中..." : "签到 +5"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 赚积分任务 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="list" size={20} color="#4A90D9" />
            <Text style={styles.sectionTitle}>赚积分</Text>
          </View>
          {TASKS.map((task) => (
            <View key={task.id} style={styles.taskItem}>
              <View style={[styles.taskIcon, { backgroundColor: `${task.color}15` }]}>
                <Ionicons name={task.icon} size={20} color={task.color} />
              </View>
              <View style={styles.taskContent}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskDesc}>{task.desc}</Text>
              </View>
              <View style={styles.taskReward}>
                <Text style={styles.taskRewardText}>+{task.reward}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* 勋章墙 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="trophy" size={20} color="#E6A23C" />
            <Text style={styles.sectionTitle}>勋章墙</Text>
            <Text style={styles.sectionBadge}>{earnedCount}/{medals.length}</Text>
          </View>
          {medals.length > 0 ? (
            <View style={styles.medalGrid}>
              {medals.map((medal) => (
                <View key={medal.id} style={[styles.medalItem, !medal.earned && styles.medalItemLocked]}>
                  <View style={[styles.medalIconWrap, medal.earned ? styles.medalIconEarned : styles.medalIconLocked]}>
                    <Ionicons
                      name={medal.earned ? "trophy" : "lock-closed"}
                      size={22}
                      color={medal.earned ? "#E6A23C" : "#C0C4CC"}
                    />
                  </View>
                  <Text style={[styles.medalName, !medal.earned && styles.medalNameLocked]}>{medal.name}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>暂无勋章</Text>
          )}
        </View>

        {/* 积分商城 */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shop" size={20} color="#F56C6C" />
            <Text style={styles.sectionTitle}>积分商城</Text>
          </View>
          {products.length > 0 ? (
            products.map((product) => (
              <View key={product.id} style={styles.productItem}>
                <View style={styles.productIcon}>
                  <Ionicons name="gift" size={24} color="#F56C6C" />
                </View>
                <View style={styles.productContent}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productDesc}>{product.description}</Text>
                </View>
                <TouchableOpacity
                  style={styles.exchangeButton}
                  onPress={() => handleExchange(product)}
                >
                  <Text style={styles.exchangeText}>{product.price} 积分</Text>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>暂无商品</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
  },
  scrollContent: {
    paddingBottom: 100,
  },
  // Balance card
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
  statItem: { alignItems: "center" },
  statValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "600" },
  statLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, marginTop: 4 },
  statDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  // Section card
  sectionCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#D1D9E6",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#303133",
    marginLeft: 8,
    flex: 1,
  },
  sectionBadge: {
    fontSize: 13,
    color: "#909399",
  },
  // Checkin
  checkinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkinInfo: {},
  checkinStreak: {
    fontSize: 15,
    color: "#606266",
  },
  checkinStreakNum: {
    fontSize: 20,
    fontWeight: "700",
    color: "#67C23A",
  },
  checkinLongest: {
    fontSize: 12,
    color: "#909399",
    marginTop: 2,
  },
  checkinButton: {
    backgroundColor: "#67C23A",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  checkinButtonDisabled: {
    backgroundColor: "#E6E8EB",
  },
  checkinButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  // Tasks
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F7FA",
  },
  taskIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  taskContent: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: "500", color: "#303133" },
  taskDesc: { fontSize: 12, color: "#909399", marginTop: 2 },
  taskReward: {
    backgroundColor: "#FFF8E6",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  taskRewardText: { fontSize: 13, fontWeight: "600", color: "#E6A23C" },
  // Medals
  medalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  medalItem: {
    width: "25%",
    alignItems: "center",
    marginBottom: 12,
  },
  medalItemLocked: { opacity: 0.5 },
  medalIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  medalIconEarned: { backgroundColor: "rgba(230,162,60,0.12)" },
  medalIconLocked: { backgroundColor: "#F5F7FA" },
  medalName: { fontSize: 11, color: "#303133", textAlign: "center" },
  medalNameLocked: { color: "#C0C4CC" },
  // Products
  productItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F7FA",
  },
  productIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(245,108,108,0.1)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  productContent: { flex: 1 },
  productName: { fontSize: 15, fontWeight: "500", color: "#303133" },
  productDesc: { fontSize: 12, color: "#909399", marginTop: 2 },
  exchangeButton: {
    backgroundColor: "#F56C6C",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  exchangeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#909399",
    textAlign: "center",
    paddingVertical: 16,
  },
});
