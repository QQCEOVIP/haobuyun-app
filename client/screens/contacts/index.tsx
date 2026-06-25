import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/storage/supabase';
import * as Contacts from 'expo-contacts';

interface Contact {
  id: string;
  name: string;
  phone: string;
  status: string;
  lastContactDate?: string;
}

const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '活跃' },
  { key: 'maybe_invalid', label: '可能失效' },
  { key: 'invalid', label: '确定失效' },
];

export default function ContactsScreen() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchText, setSearchText] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tags, setTags] = useState<any[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4A90D9');

  const userId = (user as any)?.id;

  const loadContacts = async () => {
    if (!userId) return;

    try {
      const { data: localContacts, error } = await supabase
        .from('contacts')
        .select('id, phone, status, last_contact_date')
        .eq('user_id', userId);

      if (error) throw error;

      const { status } = await Contacts.requestPermissionsAsync();
      setHasPermission(status === 'granted');

      if (status === 'granted') {
        const { data: deviceContacts } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          pageSize: 1000,
        });

        if (deviceContacts) {
          const mappedContacts: Contact[] = deviceContacts
            .filter(c => c.phoneNumbers && c.phoneNumbers.length > 0)
            .map(c => {
              const phone = c.phoneNumbers![0].number || '';
              const localData = localContacts?.find((lc: any) => lc.phone === phone);
              return {
                id: c.id,
                name: c.name || '未知联系人',
                phone: phone,
                status: localData?.status || 'unknown',
                lastContactDate: localData?.last_contact_date,
              };
            });

          setContacts(mappedContacts);
          filterContacts(mappedContacts, searchText, activeTab);
        }
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  // 加载标签
  const loadTags = async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error('Failed to load tags:', error);
    }
  };

  // 创建标签
  const handleCreateTag = async () => {
    if (!newTagName.trim() || !userId) return;
    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({
          user_id: userId,
          name: newTagName.trim(),
          color: newTagColor,
        })
        .select()
        .single();
      if (error) throw error;
      setTags([...tags, data]);
      setNewTagName('');
      setNewTagColor('#4A90D9');
    } catch (error) {
      console.error('Failed to create tag:', error);
      Alert.alert('错误', '创建标签失败');
    }
  };

  // 删除标签
  const handleDeleteTag = async (tagId: string) => {
    Alert.alert('确认删除', '确定要删除这个标签吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('tags')
              .delete()
              .eq('id', tagId);
            if (error) throw error;
            setTags(tags.filter(t => t.id !== tagId));
          } catch (error) {
            console.error('Failed to delete tag:', error);
            Alert.alert('错误', '删除标签失败');
          }
        },
      },
    ]);
  };

  const filterContacts = (contactList: Contact[], search: string, tab: string) => {
    let filtered = contactList;

    if (search) {
      filtered = filtered.filter(
        c => c.name.toLowerCase().includes(search.toLowerCase()) ||
             c.phone.includes(search)
      );
    }

    if (tab !== 'all') {
      filtered = filtered.filter(c => c.status === tab);
    }

    setFilteredContacts(filtered);
  };

  useFocusEffect(
    useCallback(() => {
      loadContacts();
      loadTags();
    }, [userId])
  );

  useEffect(() => {
    filterContacts(contacts, searchText, activeTab);
  }, [searchText, activeTab, contacts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active':
        return { bg: '#E7F7E7', text: '#67C23A', label: '活跃' };
      case 'maybe_invalid':
        return { bg: '#FFF8E6', text: '#E6A23C', label: '可能失效' };
      case 'invalid':
        return { bg: '#FEF0F0', text: '#F56C6C', label: '确定失效' };
      default:
        return { bg: '#F5F7FA', text: '#909399', label: '未知' };
    }
  };

  const renderContact = ({ item }: { item: Contact }) => {
    const statusStyle = getStatusStyle(item.status);
    return (
      <TouchableOpacity style={styles.contactCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0]?.toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {statusStyle.label}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>通讯录</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setTagModalVisible(true)}
            >
              <Ionicons name="pricetag-outline" size={24} color="#E6A23C" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => setInfoModalVisible(true)}
            >
              <Ionicons name="help-circle-outline" size={24} color="#909399" />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subtitle}>{contacts.length} 位联系人</Text>
      </View>

      {/* 搜索框 */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索姓名或号码"
          placeholderTextColor="#B2BEC3"
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>

      {/* 状态标签 */}
      <View style={styles.tabContainer}>
        {STATUS_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 权限提示 */}
      {hasPermission === false && (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionText}>
            需要授权访问通讯录才能检测号码状态
          </Text>
          <TouchableOpacity style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>去授权</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 联系人列表 */}
      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchText ? '未找到匹配的联系人' : '暂无联系人数据'}
            </Text>
          </View>
        }
      />

      {/* 标签管理弹窗 */}
      <Modal
        visible={tagModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTagModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setTagModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.tagModal}>
                <View style={styles.tagModalHeader}>
                  <Text style={styles.tagModalTitle}>标签管理</Text>
                  <TouchableOpacity onPress={() => setTagModalVisible(false)}>
                    <Ionicons name="close" size={24} color="#909399" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.tagList}>
                  {tags.length === 0 ? (
                    <Text style={styles.emptyTagText}>暂无标签，请创建</Text>
                  ) : (
                    tags.map((tag) => (
                      <View key={tag.id} style={styles.tagItem}>
                        <View style={[styles.tagColorDot, { backgroundColor: tag.color }]} />
                        <Text style={styles.tagName}>{tag.name}</Text>
                        <TouchableOpacity
                          style={styles.deleteTagButton}
                          onPress={() => handleDeleteTag(tag.id)}
                        >
                          <Ionicons name="trash-outline" size={18} color="#F56C6C" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>

                <View style={styles.createTagSection}>
                  <Text style={styles.createTagTitle}>创建新标签</Text>
                  <TextInput
                    style={styles.tagInput}
                    placeholder="标签名称"
                    placeholderTextColor="#B2BEC3"
                    value={newTagName}
                    onChangeText={setNewTagName}
                  />
                  <View style={styles.colorPicker}>
                    {['#4A90D9', '#67C23A', '#E6A23C', '#F56C6C', '#9069D9', '#909399'].map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          newTagColor === color && styles.colorOptionSelected,
                        ]}
                        onPress={() => setNewTagColor(color)}
                      />
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.createTagButton,
                      (!newTagName.trim() || !newTagColor) && styles.createTagButtonDisabled,
                    ]}
                    onPress={handleCreateTag}
                    disabled={!newTagName.trim() || !newTagColor}
                  >
                    <Text style={styles.createTagButtonText}>创建标签</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* 如何判断号码失效弹窗 */}
      <Modal
        visible={infoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setInfoModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>如何判断号码失效</Text>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#4A90D9' }]} />
                  <Text style={styles.infoText}>众包标记：其他用户标记该号码可能失效</Text>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#E6A23C' }]} />
                  <Text style={styles.infoText}>长期未联系：超过设定的月数无互动</Text>
                </View>
                <View style={styles.infoItem}>
                  <View style={[styles.infoDot, { backgroundColor: '#F56C6C' }]} />
                  <Text style={styles.infoText}>手动标记：您主动标记为失效号码</Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#303133',
  },
  helpButton: {
    padding: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#909399',
    marginTop: 4,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#303133',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: '#4A90D9',
  },
  tabText: {
    fontSize: 14,
    color: '#909399',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  permissionCard: {
    backgroundColor: '#FFF8E6',
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  permissionText: {
    flex: 1,
    fontSize: 14,
    color: '#E6A23C',
  },
  permissionButton: {
    backgroundColor: '#E6A23C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  contactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#D1D9E6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90D9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#303133',
  },
  contactPhone: {
    fontSize: 14,
    color: '#909399',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#909399',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    width: '80%',
    maxWidth: 320,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
    marginRight: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#606266',
    lineHeight: 20,
  },
  // 标签管理模态框样式
  tagModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 40,
    width: '85%',
    maxWidth: 360,
    maxHeight: '80%',
  },
  tagModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#303133',
    marginBottom: 16,
  },
  tagListContainer: {
    maxHeight: 200,
    marginBottom: 16,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  tagColorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 10,
  },
  tagName: {
    flex: 1,
    fontSize: 15,
    color: '#303133',
  },
  tagDeleteButton: {
    padding: 8,
  },
  createTagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  tagInput: {
    flex: 1,
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginRight: 10,
  },
  createTagButton: {
    backgroundColor: '#E6A23C',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  createTagButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  colorPickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#303133',
  },
});
