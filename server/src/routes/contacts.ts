/**
 * 通讯录路由
 * 提供联系人管理、备份、恢复等功能
 */
import { Router } from 'express';
import { db } from '../storage/database';
import { contacts, backups } from '../storage/database/shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

const router: any = Router();

// 辅助函数：对手机号进行哈希处理（用于众包查询）
function hashPhone(phone: string): string {
  return crypto.createHash('sha256').update(phone).digest('hex').substring(0, 64);
}

// 辅助函数：从请求头获取用户ID（模拟，实际应从认证中间件获取）
function getUserIdFromHeaders(req: any): string | null {
  // 优先从 x-user-id 头获取（测试模式）
  const userId = req.headers['x-user-id'];
  if (userId) return userId as string;
  
  // 从认证session获取（实际生产环境）
  const session = req.headers['x-session'];
  if (session) {
    try {
      // 这里应该调用 Supabase 验证 token 并获取 user_id
      // 简化处理：直接返回 session 中的 user_id
      return session as string;
    } catch (e) {
      return null;
    }
  }
  return null;
}

// 验证用户是否登录
function requireAuth(req: any, res: any, next: any) {
  const userId = getUserIdFromHeaders(req);
  if (!userId) {
    return res.status(401).json({ error: '请先登录' });
  }
  (req as any).userId = userId;
  next();
}

// ============================================
// 联系人管理
// ============================================

/**
 * 获取用户的所有联系人
 * GET /api/v1/contacts
 */
router.get('/', requireAuth, async (req: any, res: any) => {
  try {
    const userContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.user_id, (req as any).userId))
      .orderBy(desc(contacts.updated_at));

    res.json({
      success: true,
      data: userContacts,
      total: userContacts.length
    });
  } catch (error) {
    console.error('获取联系人失败:', error);
    res.status(500).json({ error: '获取联系人失败' });
  }
});

/**
 * 获取单个联系人详情
 * GET /api/v1/contacts/:id
 */
router.get('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const contact = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.id, req.params.id),
        eq(contacts.user_id, (req as any).userId)
      ))
      .limit(1);

    if (contact.length === 0) {
      return res.status(404).json({ error: '联系人不存在' });
    }

    res.json({
      success: true,
      data: contact[0]
    });
  } catch (error) {
    console.error('获取联系人详情失败:', error);
    res.status(500).json({ error: '获取联系人详情失败' });
  }
});

/**
 * 添加联系人
 * POST /api/v1/contacts
 */
router.post('/', requireAuth, async (req: any, res: any) => {
  try {
    const { name, phone, avatar_url, notes } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: '姓名和电话不能为空' });
    }

    const phoneHash = hashPhone(phone);
    
    const newContact = await db.insert(contacts).values({
      user_id: (req as any).userId,
      name,
      phone,
      phone_hash: phoneHash,
      avatar_url: avatar_url || null,
      notes: notes || null,
      status: 'unknown'
    }).returning();

    res.status(201).json({
      success: true,
      data: newContact[0]
    });
  } catch (error) {
    console.error('添加联系人失败:', error);
    res.status(500).json({ error: '添加联系人失败' });
  }
});

/**
 * 批量添加联系人（用于通讯录导入）
 * POST /api/v1/contacts/batch
 */
router.post('/batch', requireAuth, async (req: any, res: any) => {
  try {
    const { contacts: contactList } = req.body;

    if (!Array.isArray(contactList) || contactList.length === 0) {
      return res.status(400).json({ error: '联系人列表不能为空' });
    }

    // 限制单次导入数量
    const maxBatchSize = 500;
    const batchContacts = contactList.slice(0, maxBatchSize);

    // 构建插入数据
    const insertData = batchContacts.map((c: any) => ({
      user_id: (req as any).userId,
      name: c.name || '未知',
      phone: c.phone || '',
      phone_hash: hashPhone(c.phone || ''),
      avatar_url: c.avatar_url || null,
      notes: c.notes || null,
      status: 'unknown'
    })).filter((c: any) => c.phone !== '');

    // 批量插入
    const inserted = await db.insert(contacts).values(insertData).returning();

    res.status(201).json({
      success: true,
      data: inserted,
      imported: inserted.length,
      skipped: batchContacts.length - inserted.length
    });
  } catch (error) {
    console.error('批量导入联系人失败:', error);
    res.status(500).json({ error: '批量导入联系人失败' });
  }
});

/**
 * 更新联系人
 * PUT /api/v1/contacts/:id
 */
router.put('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const { name, phone, avatar_url, notes, status } = req.body;

    // 检查联系人是否存在且属于当前用户
    const existing = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.id, req.params.id),
        eq(contacts.user_id, (req as any).userId)
      ))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: '联系人不存在' });
    }

    const updateData: any = { updated_at: new Date() };
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) {
      updateData.phone = phone;
      updateData.phone_hash = hashPhone(phone);
    }
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (notes !== undefined) updateData.notes = notes;
    if (status !== undefined) updateData.status = status;

    const updated = await db
      .update(contacts)
      .set(updateData)
      .where(and(
        eq(contacts.id, req.params.id),
        eq(contacts.user_id, (req as any).userId)
      ))
      .returning();

    res.json({
      success: true,
      data: updated[0]
    });
  } catch (error) {
    console.error('更新联系人失败:', error);
    res.status(500).json({ error: '更新联系人失败' });
  }
});

/**
 * 删除联系人
 * DELETE /api/v1/contacts/:id
 */
router.delete('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const deleted = await db
      .delete(contacts)
      .where(and(
        eq(contacts.id, req.params.id),
        eq(contacts.user_id, (req as any).userId)
      ))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: '联系人不存在' });
    }

    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除联系人失败:', error);
    res.status(500).json({ error: '删除联系人失败' });
  }
});

// ============================================
// 通讯录备份与恢复
// ============================================

/**
 * 备份通讯录
 * POST /api/v1/contacts/backup
 */
router.post('/backup', requireAuth, async (req: any, res: any) => {
  try {
    // 获取用户所有联系人
    const userContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.user_id, (req as any).userId));

    // 生成备份数据（JSON格式）
    const backupData = {
      version: '1.0',
      exportTime: new Date().toISOString(),
      appName: '号簿云',
      totalContacts: userContacts.length,
      contacts: userContacts.map(c => ({
        name: c.name,
        phone: c.phone,
        avatar_url: c.avatar_url,
        status: c.status,
        notes: c.notes,
        last_contact_date: c.last_contact_date
      }))
    };

    // 创建备份记录（实际存储应由对象存储服务处理，这里简化处理）
    const backupRecord = await db.insert(backups).values({
      user_id: (req as any).userId,
      contact_count: userContacts.length,
      backup_type: 'full',
      metadata: backupData
    }).returning();

    res.status(201).json({
      success: true,
      message: '备份成功',
      data: {
        id: backupRecord[0].id,
        contact_count: userContacts.length,
        created_at: backupRecord[0].created_at,
        download_url: `/api/v1/contacts/backup/${backupRecord[0].id}` // 下载链接
      }
    });
  } catch (error) {
    console.error('备份通讯录失败:', error);
    res.status(500).json({ error: '备份通讯录失败' });
  }
});

/**
 * 获取备份列表
 * GET /api/v1/contacts/backups
 */
router.get('/backups/list', requireAuth, async (req: any, res: any) => {
  try {
    const backupList = await db
      .select()
      .from(backups)
      .where(eq(backups.user_id, (req as any).userId))
      .orderBy(desc(backups.created_at))
      .limit(20);

    res.json({
      success: true,
      data: backupList
    });
  } catch (error) {
    console.error('获取备份列表失败:', error);
    res.status(500).json({ error: '获取备份列表失败' });
  }
});

/**
 * 下载备份
 * GET /api/v1/contacts/backup/:id
 */
router.get('/backup/:id', requireAuth, async (req: any, res: any) => {
  try {
    const backup = await db
      .select()
      .from(backups)
      .where(and(
        eq(backups.id, req.params.id),
        eq(backups.user_id, (req as any).userId)
      ))
      .limit(1);

    if (backup.length === 0) {
      return res.status(404).json({ error: '备份不存在' });
    }

    // 返回备份数据（vCard格式转换在客户端处理）
    res.json({
      success: true,
      data: backup[0].metadata
    });
  } catch (error) {
    console.error('获取备份失败:', error);
    res.status(500).json({ error: '获取备份失败' });
  }
});

/**
 * 恢复通讯录
 * POST /api/v1/contacts/restore
 */
router.post('/restore', requireAuth, async (req: any, res: any) => {
  try {
    const { backup_id, merge_mode = 'replace' } = req.body;

    if (!backup_id) {
      return res.status(400).json({ error: '备份ID不能为空' });
    }

    // 获取备份数据
    const backup = await db
      .select()
      .from(backups)
      .where(and(
        eq(backups.id, backup_id),
        eq(backups.user_id, (req as any).userId)
      ))
      .limit(1);

    if (backup.length === 0) {
      return res.status(404).json({ error: '备份不存在' });
    }

    const backupData = backup[0].metadata as any;
    if (!backupData || !backupData.contacts) {
      return res.status(400).json({ error: '备份数据格式错误' });
    }

    let restored = 0;
    let skipped = 0;

    if (merge_mode === 'replace') {
      // 替换模式：先删除旧联系人，再导入新联系人
      await db.delete(contacts).where(eq(contacts.user_id, (req as any).userId));
      
      // 批量导入
      const insertData = backupData.contacts.map((c: any) => ({
        user_id: (req as any).userId,
        name: c.name || '未知',
        phone: c.phone || '',
        phone_hash: hashPhone(c.phone || ''),
        avatar_url: c.avatar_url || null,
        notes: c.notes || null,
        status: c.status || 'unknown'
      })).filter((c: any) => c.phone !== '');

      const inserted = await db.insert(contacts).values(insertData).returning();
      restored = inserted.length;
    } else {
      // 合并模式：只添加不存在的联系人
      for (const c of backupData.contacts) {
        if (!c.phone) {
          skipped++;
          continue;
        }

        // 检查是否已存在
        const existing = await db
          .select()
          .from(contacts)
          .where(and(
            eq(contacts.user_id, (req as any).userId),
            eq(contacts.phone, c.phone)
          ))
          .limit(1);

        if (existing.length === 0) {
          await db.insert(contacts).values({
            user_id: (req as any).userId,
            name: c.name || '未知',
            phone: c.phone,
            phone_hash: hashPhone(c.phone),
            avatar_url: c.avatar_url || null,
            notes: c.notes || null,
            status: c.status || 'unknown'
          });
          restored++;
        } else {
          skipped++;
        }
      }
    }

    res.json({
      success: true,
      message: `恢复成功，共恢复 ${restored} 个联系人，跳过 ${skipped} 个重复联系人`,
      data: {
        restored,
        skipped
      }
    });
  } catch (error) {
    console.error('恢复通讯录失败:', error);
    res.status(500).json({ error: '恢复通讯录失败' });
  }
});

/**
 * 导出通讯录为 vCard 格式
 * GET /api/v1/contacts/export
 */
router.get('/export', requireAuth, async (req: any, res: any) => {
  try {
    const userContacts = await db
      .select()
      .from(contacts)
      .where(eq(contacts.user_id, (req as any).userId));

    // 生成 vCard 格式
    const vCards = userContacts.map(c => {
      const escapeVCard = (str: string | null) => 
        str ? str.replace(/[,\\;]/g, '\\$&').replace(/\n/g, '\\n') : '';
      
      return `BEGIN:VCARD
VERSION:3.0
N:${escapeVCard(c.name)};;;
FN:${escapeVCard(c.name)}
TEL;TYPE=CELL:${escapeVCard(c.phone)}
${c.notes ? `NOTE:${escapeVCard(c.notes)}` : ''}
END:VCARD`;
    }).join('\n');

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="号簿云通讯录_${new Date().toISOString().split('T')[0]}.vcf"`);
    res.send(vCards);
  } catch (error) {
    console.error('导出通讯录失败:', error);
    res.status(500).json({ error: '导出通讯录失败' });
  }
});

export default router;
