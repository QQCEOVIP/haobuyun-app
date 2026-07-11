# 号簿云 - 小米/华为兼容性评估报告

> 评估日期：2026-07-12
> 评估范围：小米（MIUI 14+ / HyperOS）和华为（EMUI 12+ / HarmonyOS 4+）
> 项目版本：1.0.1

---

## 一、评估总览

| 风险项 | 等级 | 影响范围 | 是否需要代码修改 |
|--------|------|----------|-----------------|
| 通讯录读取权限 | **高** | 核心功能 | 是 |
| 通讯录写入权限 | **高** | 恢复/编辑功能 | 是 |
| 快照对比后台可靠性 | **中** | 自动捕捉删除 | 是（建议） |
| 通知权限默认关闭 | **中** | 通知提醒 | 是 |
| 文件下载与存储权限 | **中** | APK更新/备份 | 是 |
| 网络权限 | **低** | API调用 | 否（当前实现已兼容） |
| expo-contacts兼容性 | **中** | 核心功能 | 需验证 |

---

## 二、详细评估

### 1. 通讯录读取权限 — 🔴 高风险

**问题**：
- 小米MIUI/HyperOS将"联系人"和"通话记录"分为两个独立权限，部分系统版本默认仅授予"联系人"但需要"通话记录"才能完整读取
- 华为HarmonyOS 4+的权限模型中，通讯录权限需要用户二次确认弹窗（安全提醒），部分用户可能误点拒绝
- 小米MIUI的"权限监控"功能会在应用频繁读取通讯录时弹出安全提醒，可能导致用户恐慌性撤销权限

**当前代码问题**：
- `onboarding/index.tsx` 第18行：`requestPermissionsAsync()` 未区分权限被永久拒绝（shouldShowRequestPermissionRationale=false）的情况
- `home/index.tsx` 第336行：fetchStats 中权限被拒绝时仅打印警告，未引导用户去设置中开启
- `contacts/index.tsx` 第836行：权限不足时只显示"需要通讯录权限"，没有"去设置"按钮

**需要修改的代码位置**：
1. `client/screens/onboarding/index.tsx` — handleAuthorize函数
2. `client/screens/contacts/index.tsx` — 权限不足空状态UI（第1392行）
3. `client/screens/home/index.tsx` — fetchStats中的权限处理

**适配建议**：
```typescript
// 统一的权限请求+引导工具函数
import { Linking, Alert } from 'react-native';

async function requestContactPermissionWithGuide(): Promise<boolean> {
  const { status } = await Contacts.requestPermissionsAsync();
  if (status === 'granted') return true;
  
  // 权限被拒绝，引导用户去设置
  Alert.alert(
    '需要通讯录权限',
    '号簿云需要访问通讯录才能正常工作。请在设置中开启通讯录权限。',
    [
      { text: '暂不', style: 'cancel' },
      { 
        text: '去设置', 
        onPress: () => Linking.openSettings() 
      },
    ]
  );
  return false;
}
```

### 2. 通讯录写入权限 — 🔴 高风险

**问题**：
- 华为HarmonyOS在写入联系人时会弹出额外的安全确认弹窗（"该应用正在修改您的联系人"），用户可能误点拒绝
- 小米MIUI的"安全守护"功能可能拦截批量写入联系人操作
- expo-contacts的 `addContactAsync` 在部分ROM上可能因字段格式不兼容而静默失败

**当前代码问题**：
- `recycle-bin/index.tsx` 第152行：恢复时添加联系人到设备，如果权限在写入过程中被撤销，整个恢复流程中断
- `contacts/index.tsx` 第541行：编辑保存联系人时权限检查在前，但写入过程中权限可能被系统撤销
- 缺少对 `addContactAsync` 返回值的充分验证

**需要修改的代码位置**：
1. `client/screens/recycle-bin/index.tsx` — handleRestore中的逐条恢复逻辑
2. `client/screens/contacts/index.tsx` — 编辑保存联系人逻辑

**适配建议**：
- 批量写入时捕获单条失败，不中断整个流程（当前回收站已部分实现）
- 添加写入结果验证：写入后立即读取验证联系人是否真正添加成功
- 对华为设备添加写入前的用户提示："即将恢复N个号码到通讯录，如出现安全确认弹窗请点击允许"

### 3. 快照对比后台可靠性 — 🟡 中风险

**问题**：
- 当前快照对比逻辑（`contacts/index.tsx` syncContactsSnapshot函数）仅在用户打开通讯录页面时执行
- 小米MIUI/HyperOS和华为EMUI/HarmonyOS都有激进的后台进程限制，应用在后台很快被冻结/杀死
- 没有使用 `BackgroundFetch` 或 `TaskManager` 等后台任务API
- 用户如果不主动打开应用，就无法检测到系统通讯录中被删除的号码

**当前代码问题**：
- `contacts/index.tsx` 第902行：syncContactsSnapshot仅在页面加载时调用
- 项目中没有使用 `expo-background-fetch` 或 `expo-task-manager`
- `app.config.ts` 中没有配置后台任务

**是否需要修改**：
- 短期：不需要。当前方案虽不完美，但在用户打开应用时能正常工作
- 中长期：建议添加 `expo-background-fetch` 实现定期快照对比

**适配建议**：
```typescript
// 使用 expo-background-fetch 定期执行快照对比
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const SNAPSHOT_TASK = 'contacts-snapshot-check';

TaskManager.defineTask(SNAPSHOT_TASK, async () => {
  // 执行快照对比逻辑
  return BackgroundFetch.BackgroundFetchResult.NewData;
});

// 注册后台任务（间隔最少15分钟）
await BackgroundFetch.registerTaskAsync(SNAPSHOT_TASK, {
  minimumInterval: 15 * 60, // 15分钟
  stopOnTerminate: false,
  startOnBoot: true,
});
```

### 4. 通知权限默认关闭 — 🟡 中风险

**问题**：
- 小米MIUI默认关闭非系统应用的通知权限，需要用户手动开启
- 华为HarmonyOS的通知管理分为"允许通知"和"锁屏通知"两个独立开关
- 当前通知设置页面（`notification/index.tsx`）仅使用AsyncStorage保存开关状态，未实际集成推送通知SDK

**当前代码问题**：
- `client/screens/notification/index.tsx`：4个通知开关仅保存到AsyncStorage，未与系统通知权限关联
- 项目未集成 `expo-notifications` 或任何推送通知服务
- 用户即使开启通知开关，也不会实际收到任何推送通知

**是否需要修改**：
- 当前阶段：通知功能为预留UI，暂不需要集成推送SDK
- 建议：在通知设置页面添加"开启系统通知权限"引导，检测并引导用户开启系统通知权限

**适配建议**：
```typescript
// 在通知设置页面添加系统通知权限引导
import * as Notifications from 'expo-notifications';

async function checkAndRequestNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert(
      '开启通知权限',
      '请在系统设置中开启号簿云的通知权限，以便接收重要提醒',
      [
        { text: '暂不', style: 'cancel' },
        { text: '去设置', onPress: () => Linking.openSettings() },
      ]
    );
  }
}
```

### 5. 文件下载与存储权限 — 🟡 中风险

**问题**：
- 小米MIUI 14+对 `WRITE_EXTERNAL_STORAGE` 权限管理更严格，需要额外适配
- 华为HarmonyOS使用Scoped Storage，应用只能访问自己的私有目录
- 当前APK下载使用 `expo-file-system` 的 `createDownloadResumable`，下载到应用私有目录（`documentDirectory`），不需要外部存储权限
- 但安装APK需要 `REQUEST_INSTALL_PACKAGES` 权限

**当前代码问题**：
- `about/index.tsx`：APK下载到 `documentDirectory`，然后通过 `Linking.openURL` 打开浏览器下载
- `app.config.ts`：已添加 `REQUEST_INSTALL_PACKAGES` 权限声明
- 备份文件存储在应用私有目录，不受Scoped Storage影响

**是否需要修改**：
- 当前实现已兼容：使用应用私有目录存储，不需要外部存储权限
- 建议验证：在小米/华为真机上测试APK下载和安装流程

### 6. 网络权限 — 🟢 低风险

**问题**：
- 小米/华为对网络权限管理较宽松，默认允许应用访问网络
- 部分MIUI版本有"联网控制"功能，可能限制应用的后台联网

**当前代码状态**：
- 所有API调用使用HTTPS协议，不受网络权限限制
- 无HTTP明文流量请求

**是否需要修改**：否，当前实现已兼容

### 7. expo-contacts兼容性 — 🟡 中风险

**问题**：
- `expo-contacts` 在部分小米/华为设备上可能存在字段映射差异
- `Contacts.Fields.PhoneLabels.Main` 在部分设备上可能不被识别
- 联系人头像写入在部分设备上可能静默失败

**当前代码状态**：
- 使用 `Contacts.Fields.PhoneNumbers`、`Contacts.Fields.FirstName` 等标准字段
- 回收站恢复时使用 `normalizePhoneForDevice` 标准化电话号码格式
- 未写入联系人头像到设备通讯录

**是否需要验证**：
- 建议在小米/华为真机上验证以下操作：
  1. 读取通讯录联系人（含电话号码）
  2. 写入新联系人到设备
  3. 编辑已有联系人
  4. 批量恢复联系人

---

## 三、优先级建议

| 优先级 | 任务 | 预计工作量 |
|--------|------|-----------|
| P0 | 通讯录权限请求增加"去设置"引导 | 小 |
| P0 | 通讯录写入增加错误捕获和用户提示 | 中 |
| P1 | 通知设置页面增加系统通知权限引导 | 小 |
| P1 | 在小米/华为真机验证核心功能 | 中 |
| P2 | 添加 expo-background-fetch 定期快照对比 | 大 |
| P2 | 集成推送通知SDK | 大 |

---

## 四、测试清单

- [ ] 小米MIUI 14：首次启动 → 授权通讯录 → 读取联系人
- [ ] 小米MIUI 14：拒绝权限 → 引导去设置 → 重新授权
- [ ] 小米HyperOS：批量恢复联系人到设备通讯录
- [ ] 华为HarmonyOS 4：首次启动 → 二次确认弹窗 → 授权通讯录
- [ ] 华为HarmonyOS 4：写入联系人 → 安全确认弹窗 → 允许写入
- [ ] 华为EMUI 12：APK下载 → 安装 → REQUEST_INSTALL_PACKAGES权限
- [ ] 通用：通知权限 → 开启系统通知 → 接收测试通知
- [ ] 通用：后台运行 → 快照对比 → 检测系统删除
