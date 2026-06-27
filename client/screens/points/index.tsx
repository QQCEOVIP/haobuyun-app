import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useSafeRouter } from "@/hooks/useSafeRouter";
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

interface NavItemProps {
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

function NavItem({ icon, iconColor, iconBg, title, subtitle, onPress }: NavItemProps) {
  return (
    <TouchableOpacity style={styles.navItem} onPress={onPress}>
      <View style={[styles.navIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={22} color={iconColor} />
      </View>
      <View style={styles.navText}>
        <Text style={styles.navTitle}>{title}</Text>
        <Text style={styles.navSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#C0C4CC" />
    </TouchableOpacity>
  );
}

export default function PointsScreen() {
  const { session } = useAuth();
  const router = useSafeRouter();
  const [pointsInfo, setPointsInfo] = useState<PointsInfo | null>(null);
  const [checkinInfo, setCheckinInfo] = useState<CheckinInfo>({
    checked_in_today: false,
    current_streak: 0,
    longest_streak: 0,
  });

  const fetchData = useCallback(async () => {
    if (!session?.access_token) return;
    const headers = { "x-session": session.access_token };
    try {
      const [balanceRes, checkinRes] = await Promise.all([
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/balance`, { headers }),
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/checkin`, { headers }),
      ]);
      if (balanceRes.ok) {
        const data = await balanceRes.json();
        setPointsInfo(data);
      }
      if (checkinRes.ok) {
        const data = await checkinRes.json();
        setCheckinInfo(data);
      }
    } catch {}
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
      {/* 积分概览 */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>当前积分</Text>
        <Text style={styles.balanceValue}>{pointsInfo?.balance ?? 0}</Text>
        <View style={styles.balanceRow}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatValue}>{pointsInfo?.total_earned ?? 0}</Text>
            <Text style={styles.balanceStatLabel}>累计获取</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatValue}>{pointsInfo?.total_spent ?? 0}</Text>
            <Text style={styles.balanceStatLabel}>累计消耗</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatValue}>{pointsInfo?.credit_score ?? 100}</Text>
            <Text style={styles.balanceStatLabel}>信用分</Text>
          </View>
        </View>
      </View>

      {/* 签到信息 */}
      {checkinInfo.current_streak > 0 && (
        <View style={styles.streakCard}>
          <Ionicons name="flame" size={18} color="#E6A23C" />
          <Text style={styles.streakText}>
            已连续签到 <Text style={styles.streakBold}>{checkinInfo.current_streak}</Text> 天
          </Text>
        </View>
      )}

      {/* 4 个功能入口 */}
      <View style={styles.navCard}>
        <NavItem
          icon="shop"
          iconColor="#F56C6C"
          iconBg="rgba(245,108,108,0.12)"
          title="积分商城"
          subtitle="积分兑换好礼"
          onPress={() => router.push("/shop")}
        />
        <NavItem
          icon="trophy"
          iconColor="#E6A23C"
          iconBg="rgba(230,162,60,0.12)"
          title="排行榜"
          subtitle="周榜/月榜 Top10 奖励"
          onPress={() => router.push("/leaderboard")}
        />
        <NavItem
          icon="medal"
          iconColor="#9069D9"
          iconBg="rgba(144,105,217,0.12)"
          title="勋章墙"
          subtitle="查看已获得勋章"
          onPress={() => router.push("/medals")}
        />
        <NavItem
          icon="megaphone"
          iconColor="#4A90D9"
          iconBg="rgba(74,144,217,0.12)"
          title="推广中心"
          subtitle="看广告/玩游戏赚积分"
          onPress={() => router.push("/promo")}
        />
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  content: { padding: 20, paddingTop: 12, paddingBottom: 40 },
  // 积分概览
  balanceCard: {
    backgroundColor: "#4A90D9",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 12,
  },
  balanceLabel: { fontSize: 14, color: "rgba(255,255,255,0.8)" },
  balanceValue: { fontSize: 40, fontWeight: "800", color: "#FFF", marginTop: 4 },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 20,
    width: "100%",
    justifyContent: "center",
  },
  balanceStat: { alignItems: "center", paddingHorizontal: 20 },
  balanceStatValue: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  balanceStatLabel: { fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  balanceDivider: { width: 1, height: 28, backgroundColor: "rgba(255,255,255,0.2)" },
  // 签到信息
  streakCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E6",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  streakText: { fontSize: 14, color: "#E6A23C", marginLeft: 8 },
  streakBold: { fontWeight: "700" },
  // 导航卡片
  navCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#D1D9E6",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F5F7FA",
  },
  navIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  navText: { flex: 1 },
  navTitle: { fontSize: 16, fontWeight: "600", color: "#303133" },
  navSubtitle: { fontSize: 12, color: "#909399", marginTop: 2 },
});
