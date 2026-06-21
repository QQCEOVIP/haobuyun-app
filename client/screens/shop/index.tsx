import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { useFocusEffect } from "expo-router";
import { useSafeRouter } from "@/hooks/useSafeRouter";
import { useAuth } from "@/contexts/AuthContext";

interface Product {
  id: string;
  category: string;
  name: string;
  description: string;
  price: number;
  stock: number | null;
  is_unlimited: boolean;
  metadata: any;
}

const CATEGORIES = [
  { key: "membership", label: "会员" },
  { key: "feature", label: "功能" },
  { key: "backup", label: "备份" },
  { key: "medal", label: "勋章" },
  { key: "item", label: "道具" },
];

export default function ShopScreen() {
  const { session } = useAuth();
  const router = useSafeRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [balance, setBalance] = useState(0);
  const [activeCategory, setActiveCategory] = useState("membership");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!session?.access_token) return;

    try {
      // 获取积分余额
      const balanceRes = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/balance`, {
        headers: { "x-session": session.access_token }
      });
      const balanceData = await balanceRes.json();
      setBalance(balanceData.balance || 0);

      // 获取商品列表
      const productsRes = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/shop/products`, {
        headers: { "x-session": session.access_token }
      });
      const productsData = await productsRes.json();
      setProducts(productsData.products || []);
    } catch (error) {
      console.error("获取商城数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [session])
  );

  const handleExchange = async (product: Product) => {
    if (!session?.access_token) {
      Alert.alert("提示", "请先登录");
      return;
    }

    Alert.alert(
      "确认兑换",
      `确定用 ${product.price} 积分兑换「${product.name}」吗？`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "确认",
          onPress: async () => {
            try {
              const res = await fetch(
                `${process.env.EXPO_PUBLIC_BACKEND_BASE_URL}/api/v1/points/shop/exchange`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-session": session.access_token
                  },
                  body: JSON.stringify({ product_id: product.id })
                }
              );
              const data = await res.json();

              if (data.success) {
                Alert.alert("兑换成功", `剩余积分: ${data.remaining_points}`);
                setBalance(data.remaining_points);
              } else {
                Alert.alert("兑换失败", data.error || "未知错误");
              }
            } catch (error) {
              Alert.alert("兑换失败", "网络错误");
            }
          }
        }
      ]
    );
  };

  const filteredProducts = products.filter(p => p.category === activeCategory);

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      membership: "card",
      feature: "flash",
      backup: "cloud",
      medal: "ribbon",
      item: "color-palette"
    };
    return icons[category] || "cube";
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => handleExchange(item)}
      activeOpacity={0.8}
    >
      <View style={styles.productIcon}>
        <Ionicons name={getCategoryIcon(item.category) as any} size={32} color="#4A90D9" />
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productDesc} numberOfLines={2}>{item.description}</Text>
        <View style={styles.productFooter}>
          <View style={styles.priceTag}>
            <Text style={styles.priceText}>{item.price}</Text>
            <Text style={styles.priceLabel}>积分</Text>
          </View>
          {!item.is_unlimited && item.stock !== null && (
            <Text style={styles.stockText}>库存: {item.stock}</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Screen>
      <View style={styles.container}>
        {/* 积分余额 */}
        <View style={styles.balanceBar}>
          <View style={styles.balanceLeft}>
            <Text style={styles.balanceLabel}>我的积分</Text>
            <Text style={styles.balanceAmount}>{balance}</Text>
          </View>
          <TouchableOpacity
            style={styles.historyBtn}
            onPress={() => router.push("/points")}
          >
            <Text style={styles.historyBtnText}>积分明细</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.historyBtn, { marginLeft: 8 }]}
            onPress={() => router.push("/shopExchanges")}
          >
            <Text style={styles.historyBtnText}>兑换记录</Text>
          </TouchableOpacity>
        </View>

        {/* 分类Tab */}
        <View style={styles.categoryTabs}>
          <FlatList
            horizontal
            data={CATEGORIES}
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  activeCategory === item.key && styles.categoryTabActive
                ]}
                onPress={() => setActiveCategory(item.key)}
              >
                <Text style={styles.categoryEmoji}>{getCategoryIcon(item.key)}</Text>
                <Text style={[
                  styles.categoryText,
                  activeCategory === item.key && styles.categoryTextActive
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* 商品列表 */}
        <FlatList
          data={filteredProducts}
          renderItem={renderProduct}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.productList}
          numColumns={2}
          columnWrapperStyle={styles.productRow}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>暂无商品</Text>
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
  balanceBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 8,
  },
  balanceLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  balanceLabel: {
    color: "#666",
    fontSize: 14,
    marginRight: 8,
  },
  balanceAmount: {
    color: "#4A90D9",
    fontSize: 24,
    fontWeight: "bold",
  },
  historyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F0F0F0",
    borderRadius: 16,
  },
  historyBtnText: {
    color: "#666",
    fontSize: 13,
  },
  categoryTabs: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    marginBottom: 8,
  },
  categoryTab: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 12,
    backgroundColor: "#F5F5F5",
  },
  categoryTabActive: {
    backgroundColor: "#4A90D9",
  },
  categoryEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryText: {
    fontSize: 12,
    color: "#666",
  },
  categoryTextActive: {
    color: "#FFFFFF",
  },
  productList: {
    padding: 8,
  },
  productRow: {
    justifyContent: "space-between",
  },
  productCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  productIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F5F8FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  productEmoji: {
    fontSize: 24,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  productDesc: {
    fontSize: 12,
    color: "#999",
    marginBottom: 8,
    lineHeight: 18,
  },
  productFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceTag: {
    flexDirection: "row",
    alignItems: "baseline",
    backgroundColor: "#FFF7E6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  priceText: {
    color: "#FA8C16",
    fontSize: 16,
    fontWeight: "bold",
  },
  priceLabel: {
    color: "#FA8C16",
    fontSize: 11,
    marginLeft: 2,
  },
  stockText: {
    fontSize: 11,
    color: "#999",
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
