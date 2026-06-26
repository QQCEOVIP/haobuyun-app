import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AgreementScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>号簿云用户服务协议</Text>
        <Text style={styles.updateDate}>更新日期：2026年6月1日</Text>

        <Text style={styles.sectionTitle}>一、应用简介</Text>
        <Text style={styles.paragraph}>号簿云是一款通讯录管理工具应用，旨在帮助用户备份、管理及检测通讯录中联系人号码的状态。本协议是您与号簿云之间关于使用号簿云服务所订立的协议。</Text>

        <Text style={styles.sectionTitle}>二、账号注册与使用</Text>
        <Text style={styles.paragraph}>1. 您在注册账号时需提供真实、准确的信息，并在信息发生变更时及时更新。</Text>
        <Text style={styles.paragraph}>2. 您应妥善保管账号和密码，因您保管不当造成的损失由您自行承担。</Text>
        <Text style={styles.paragraph}>3. 您不得将账号转让、出售或出借给他人使用。</Text>

        <Text style={styles.sectionTitle}>三、服务内容</Text>
        <Text style={styles.paragraph}>号簿云为您提供以下服务：</Text>
        <Text style={styles.paragraph}>1. 通讯录备份与恢复：将您的通讯录数据安全备份至云端，支持随时恢复。</Text>
        <Text style={styles.paragraph}>2. 号码状态检测：检测通讯录中联系人号码的状态，包括正常、停机、疑似停机等状态标识。</Text>
        <Text style={styles.paragraph}>3. 通讯录导入导出：支持通讯录数据的批量导入与导出操作。</Text>
        <Text style={styles.paragraph}>4. 智能标签管理：为联系人添加状态标签，便于分类管理。</Text>

        <Text style={styles.sectionTitle}>四、用户权利义务</Text>
        <Text style={styles.paragraph}>1. 您有权按照本协议约定使用号簿云提供的服务。</Text>
        <Text style={styles.paragraph}>2. 您不得利用号簿云服务从事任何违法违规活动。</Text>
        <Text style={styles.paragraph}>3. 您理解并同意，号码状态检测结果仅供参考，号簿云不对检测结果的准确性作出保证。</Text>
        <Text style={styles.paragraph}>4. 您应合法合规地使用通讯录数据，尊重他人隐私权。</Text>

        <Text style={styles.sectionTitle}>五、免责声明</Text>
        <Text style={styles.paragraph}>1. 号簿云仅提供号码状态检测工具，检测结果基于技术手段判断，不构成对号码实际状态的确认。</Text>
        <Text style={styles.paragraph}>2. 因不可抗力、系统故障等原因导致服务中断的，号簿云不承担责任。</Text>
        <Text style={styles.paragraph}>3. 号簿云不对因使用本服务而产生的任何间接、附带损失承担责任。</Text>

        <Text style={styles.sectionTitle}>六、协议修改</Text>
        <Text style={styles.paragraph}>号簿云有权根据法律法规变化及业务发展需要修改本协议，修改后的协议将在应用内公示。如您继续使用服务，视为同意修改后的协议。</Text>

        <Text style={styles.sectionTitle}>七、联系方式</Text>
        <Text style={styles.paragraph}>如您对本协议有任何疑问，可通过应用内反馈功能与我们联系。</Text>
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
