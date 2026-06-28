import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>号簿云隐私政策</Text>
        <Text style={styles.updateDate}>更新日期：2026年6月1日</Text>

        <Text style={styles.sectionTitle}>一、信息收集范围</Text>
        <Text style={styles.paragraph}>号簿云收集和使用以下个人信息：</Text>
        <Text style={styles.paragraph}>1. 通讯录联系人信息：包括联系人姓名和电话号码，用于通讯录备份恢复及号码状态检测功能。</Text>
        <Text style={styles.paragraph}>2. 账号信息：包括您注册时提供的手机号码等基本信息。</Text>
        <Text style={styles.paragraph}>3. 设备信息：包括设备型号、操作系统版本等，用于优化应用体验。</Text>

        <Text style={styles.sectionTitle}>二、信息使用目的</Text>
        <Text style={styles.paragraph}>我们收集的信息将用于以下目的：</Text>
        <Text style={styles.paragraph}>1. 通讯录备份与恢复：将您的通讯录数据安全存储至云端，支持跨设备恢复。</Text>
        <Text style={styles.paragraph}>2. 号码状态检测：对通讯录中的号码进行状态检测，标识正常、停机、疑似停机等状态。</Text>
        <Text style={styles.paragraph}>3. 服务改进：基于使用情况优化产品功能和服务质量。</Text>

        <Text style={styles.sectionTitle}>三、信息存储</Text>
        <Text style={styles.paragraph}>1. 您的数据使用Supabase云服务进行存储，服务器采用加密传输和加密存储技术保障数据安全。</Text>
        <Text style={styles.paragraph}>2. 我们在中华人民共和国境内存储您的个人信息，未经您的同意不会将数据传输至境外。</Text>
        <Text style={styles.paragraph}>3. 当您注销账号后，我们将在合理期限内删除您的个人信息或进行匿名化处理。</Text>

        <Text style={styles.sectionTitle}>四、信息共享</Text>
        <Text style={styles.paragraph}>1. 号簿云不会将您的个人数据出售或与第三方共享，法律法规要求或您明确同意的除外。</Text>
        <Text style={styles.paragraph}>2. 我们可能委托第三方服务商提供技术服务（如云存储服务），我们会与第三方签署严格的保密协议。</Text>

        <Text style={styles.sectionTitle}>五、用户权利</Text>
        <Text style={styles.paragraph}>根据《个人信息保护法》，您享有以下权利：</Text>
        <Text style={styles.paragraph}>1. 查阅权：您有权查阅您的个人数据。</Text>
        <Text style={styles.paragraph}>2. 修改权：您有权要求更正不准确的个人数据。</Text>
        <Text style={styles.paragraph}>3. 删除权：您有权要求删除您的个人数据。</Text>
        <Text style={styles.paragraph}>4. 撤回同意权：您有权撤回之前给予的同意。</Text>

        <Text style={styles.sectionTitle}>六、本地备份</Text>
        <Text style={styles.paragraph}>号簿云支持本地备份功能。使用本地备份时，数据仅保存在您的设备本地，不会上传至云端服务器，您可以完全掌控自己的数据。</Text>

        <Text style={styles.sectionTitle}>七、儿童隐私保护</Text>
        <Text style={styles.paragraph}>号簿云不面向未满14周岁的儿童提供服务。我们不会故意收集儿童的个人信息。如果我们发现在未获可证监护人同意的情况下收集了儿童的个人信息，我们会尽快删除相关数据。</Text>

        <Text style={styles.sectionTitle}>八、联系我们</Text>
        <Text style={styles.paragraph}>如您对本隐私政策有任何疑问、意见或建议，可通过应用内反馈功能与我们联系。</Text>
        <Text style={styles.paragraph}>联系邮箱：vip2012@vip.qq.com</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', color: '#303133', marginBottom: 8 },
  updateDate: { fontSize: 13, color: '#909399', marginBottom: 24 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: '#303133', marginTop: 20, marginBottom: 10 },
  paragraph: { fontSize: 15, color: '#606266', lineHeight: 24, marginBottom: 8 },
});
