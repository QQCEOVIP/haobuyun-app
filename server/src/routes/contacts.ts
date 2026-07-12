/**
 * 通讯录路由
 * 提供联系人管理、备份、恢复等功能
 */
import { Router } from 'express';
import { db } from '../storage/database';
import { contacts, backups, deletedContacts } from '../storage/database/shared/schema';
import { eq, and, desc, or, isNull, inArray } from 'drizzle-orm';
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
    const { status } = req.query;
    const conditions = [
      eq(contacts.user_id, (req as any).userId),
      or(isNull(contacts.is_deleted), eq(contacts.is_deleted, false))
    ];
    if (status && ['normal', 'stopped', 'suspected_stopped'].includes(status)) {
      conditions.push(eq(contacts.status, status as string));
    }
    const userContacts = await db
      .select()
      .from(contacts)
      .where(and(...conditions))
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
 * 删除联系人（搬家模式 - 移入 deleted_contacts 回收站）
 * DELETE /api/v1/contacts/:id
 */
router.delete('/:id', requireAuth, async (req: any, res: any) => {
  try {
    const userId = (req as any).userId;
    const contactId = req.params.id;

    // Find the contact
    const existing = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.id, contactId),
        eq(contacts.user_id, userId)
      ))
      .limit(1);

    if (existing.length === 0) {
      return res.status(404).json({ error: '联系人不存在' });
    }

    const contact = existing[0];
    const deletedAt = new Date();

    // Move to deleted_contacts
    await db.insert(deletedContacts).values({
      user_id: contact.user_id,
      name: contact.name,
      phone: contact.phone,
      phone_hash: contact.phone_hash,
      avatar_url: contact.avatar_url,
      status: contact.status ?? 'unknown',
      invalid_reason: contact.invalid_reason,
      invalid_report_count: contact.invalid_report_count ?? 0,
      last_contact_date: contact.last_contact_date,
      notes: contact.notes,
      deleted_at: deletedAt,
      created_at: contact.created_at ?? deletedAt,
    });

    // Remove from contacts
    await db.delete(contacts).where(eq(contacts.id, contactId));

    res.json({
      success: true,
      message: '已移入回收站，60天内可恢复'
    });
  } catch (error) {
    console.error('删除联系人失败:', error);
    res.status(500).json({ error: '删除联系人失败' });
  }
});

/**
 * 记录删除的联系人到回收站（搬家模式）
 * POST /api/v1/contacts/trash
 * Body: { name: string, phone: string }
 */
router.post('/trash', requireAuth, async (req: any, res: any) => {
  try {
    const { name, phone } = req.body;
    if (!phone) {
      return res.status(400).json({ error: 'Missing phone' });
    }

    const userId = (req as any).userId;
    const phoneHash = hashPhone(phone);
    const deletedAt = new Date();

    // First try to find and move from contacts table
    const existing = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.phone, phone),
        eq(contacts.user_id, userId)
      ))
      .limit(1);

    if (existing.length > 0) {
      const contact = existing[0];
      // Check if already in trash (upsert: update name and deleted_at if exists)
      const existingTrash = await db
        .select()
        .from(deletedContacts)
        .where(and(
          eq(deletedContacts.phone_hash, contact.phone_hash),
          eq(deletedContacts.user_id, userId)
        ))
        .limit(1);

      if (existingTrash.length > 0) {
        // Update existing trash record with latest name and deleted_at
        await db.update(deletedContacts)
          .set({
            name: contact.name || name || '',
            deleted_at: deletedAt,
          })
          .where(eq(deletedContacts.id, existingTrash[0].id));
      } else {
        await db.insert(deletedContacts).values({
          user_id: contact.user_id,
          name: contact.name || name || '',
          phone: contact.phone,
          phone_hash: contact.phone_hash,
          avatar_url: contact.avatar_url,
          status: contact.status ?? 'unknown',
          invalid_reason: contact.invalid_reason,
          invalid_report_count: contact.invalid_report_count ?? 0,
          last_contact_date: contact.last_contact_date,
          notes: contact.notes,
          deleted_at: deletedAt,
          created_at: contact.created_at ?? deletedAt,
        });
      }
      await db.delete(contacts).where(eq(contacts.id, contact.id));
    } else {
      // Contact not in contacts table, check if already in trash
      const existingTrash = await db
        .select()
        .from(deletedContacts)
        .where(and(
          eq(deletedContacts.phone_hash, phoneHash),
          eq(deletedContacts.user_id, userId)
        ))
        .limit(1);

      if (existingTrash.length > 0) {
        // Update existing trash record with latest name and deleted_at
        await db.update(deletedContacts)
          .set({
            name: name || existingTrash[0].name,
            deleted_at: deletedAt,
          })
          .where(eq(deletedContacts.id, existingTrash[0].id));
      } else {
        await db.insert(deletedContacts).values({
          user_id: userId,
          name: name || '',
          phone,
          phone_hash: phoneHash,
          status: 'unknown',
          deleted_at: deletedAt,
        });
      }
    }

    res.json({ success: true, message: '已移入回收站' });
  } catch (error) {
    console.error('记录回收站失败:', error);
    res.status(500).json({ error: '记录回收站失败' });
  }
});

/**
 * 批量删除联系人（搬家到回收站）
 * POST /api/v1/contacts/batch-delete
 * Body: { contactIds?: string[], phones?: string[], names?: string[] }
 */
router.post('/batch-delete', requireAuth, async (req: any, res: any) => {
  try {
    const { contactIds, phones, names } = req.body;
    const userId = (req as any).userId;
    const deletedAt = new Date();
    let movedCount = 0;

    // Helper: move a contact record from contacts → deleted_contacts
    async function moveToTrash(contact: any) {
      await db.insert(deletedContacts).values({
        user_id: contact.user_id,
        name: contact.name,
        phone: contact.phone,
        phone_hash: contact.phone_hash,
        avatar_url: contact.avatar_url,
        status: contact.status ?? 'unknown',
        invalid_reason: contact.invalid_reason,
        invalid_report_count: contact.invalid_report_count ?? 0,
        last_contact_date: contact.last_contact_date,
        notes: contact.notes,
        deleted_at: deletedAt,
        created_at: contact.created_at ?? deletedAt,
      });
      await db.delete(contacts).where(eq(contacts.id, contact.id));
      movedCount++;
    }

    if (Array.isArray(contactIds) && contactIds.length > 0) {
      const records = await db
        .select()
        .from(contacts)
        .where(and(
          inArray(contacts.id, contactIds),
          eq(contacts.user_id, userId)
        ));
      for (const record of records) {
        await moveToTrash(record);
      }
    }

    if (Array.isArray(phones) && phones.length > 0) {
      const records = await db
        .select()
        .from(contacts)
        .where(and(
          inArray(contacts.phone, phones),
          eq(contacts.user_id, userId)
        ));
      const foundPhones = new Set(records.map(r => r.phone));
      for (const record of records) {
        await moveToTrash(record);
      }

      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];
        if (!phone || foundPhones.has(phone)) continue;
        const name = Array.isArray(names) && names[i] ? names[i] : '';
        await db.insert(deletedContacts).values({
          user_id: userId,
          phone,
          name,
          phone_hash: hashPhone(phone),
          status: 'unknown',
          deleted_at: deletedAt,
        });
        movedCount++;
      }
    }

    res.json({
      success: true,
      message: `已将 ${movedCount} 个号码移至回收站`,
      movedCount,
    });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({ error: '批量删除失败' });
  }
});

/**
 * 获取回收站（从 deleted_contacts 表读取）
 * GET /api/v1/contacts/trash
 */
router.get('/trash', requireAuth, async (req: any, res: any) => {
  try {
    const trashContacts = await db
      .select()
      .from(deletedContacts)
      .where(eq(deletedContacts.user_id, (req as any).userId))
      .orderBy(desc(deletedContacts.deleted_at));

    const now = new Date();
    const data = trashContacts.map(c => {
      const deletedAt = c.deleted_at ? new Date(c.deleted_at) : now;
      const daysSinceDelete = Math.floor((now.getTime() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, 60 - daysSinceDelete);
      return { ...c, days_remaining: daysRemaining };
    });

    res.json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('获取回收站失败:', error);
    res.status(500).json({ error: '获取回收站失败' });
  }
});

/**
 * 恢复联系人（从 deleted_contacts 移回 contacts）
 * POST /api/v1/contacts/:id/restore
 */
router.post('/:id/restore', requireAuth, async (req: any, res: any) => {
  try {
    const userId = (req as any).userId;
    const record = await db
      .select()
      .from(deletedContacts)
      .where(and(
        eq(deletedContacts.id, req.params.id),
        eq(deletedContacts.user_id, userId)
      ))
      .limit(1);

    if (record.length === 0) {
      return res.status(404).json({ error: '回收站中未找到该联系人', code: 'NOT_FOUND' });
    }

    const c = record[0];

    // 如果phone_hash为空，重新计算（deleted_contacts.phone_hash 是 nullable 的）
    let phoneHash = c.phone_hash as string;
    if (!phoneHash && c.phone) {
      phoneHash = hashPhone(c.phone as string);
      console.log('[Restore] phone_hash was null, recalculated:', phoneHash);
    }
    if (!phoneHash) {
      return res.status(500).json({ error: '号码哈希值缺失，无法恢复', code: 'MISSING_PHONE_HASH' });
    }

    // Check if contact already exists in contacts table
    const existingContact = await db
      .select()
      .from(contacts)
      .where(and(
        eq(contacts.phone_hash, phoneHash),
        eq(contacts.user_id, userId)
      ))
      .limit(1);

    if (existingContact.length > 0) {
      await db.delete(deletedContacts).where(eq(deletedContacts.id, c.id));
      return res.json({
        success: true,
        message: '联系人已存在于通讯录中，已从回收站移除',
        code: 'ALREADY_EXISTS'
      });
    }

    // 恢复联系人时，保持用户删除前的状态
    // 回收站是用户自己删除的号码，恢复时不受社区投票或认证状态影响
    const restoreStatus = (c.status ?? 'unknown') as string;

    try {
      await db.insert(contacts).values({
        user_id: c.user_id as string,
        name: c.name as string,
        phone: c.phone as string,
        phone_hash: phoneHash,
        avatar_url: (c.avatar_url ?? undefined) as string | undefined,
        status: restoreStatus,
        invalid_reason: (c.invalid_reason ?? undefined) as string | undefined,
        invalid_report_count: (c.invalid_report_count ?? 0) as number,
        last_contact_date: (c.last_contact_date ?? undefined) as Date | undefined,
        notes: (c.notes ?? undefined) as string | undefined,
        created_at: (c.created_at ?? new Date()) as Date,
        updated_at: new Date(),
      });
    } catch (insertError: any) {
      console.error('[Restore] 插入contacts表失败:', insertError);
      // 检查是否是唯一约束冲突（号码已存在）
      if (insertError?.code === '23505' || insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
        await db.delete(deletedContacts).where(eq(deletedContacts.id, c.id));
        return res.json({
          success: true,
          message: '联系人已存在于通讯录中，已从回收站移除',
          code: 'ALREADY_EXISTS'
        });
      }
      return res.status(500).json({
        error: '恢复联系人失败：' + (insertError?.message || '数据库写入错误'),
        code: 'INSERT_FAILED'
      });
    }

    // Remove from deleted_contacts
    await db.delete(deletedContacts).where(eq(deletedContacts.id, c.id));

    res.json({
      success: true,
      message: '恢复成功',
      code: 'RESTORED'
    });
  } catch (error: any) {
    console.error('[Restore] 恢复联系人失败:', error);
    res.status(500).json({
      error: '恢复联系人失败：' + (error?.message || '未知错误'),
      code: 'RESTORE_ERROR'
    });
  }
});

/**
 * 批量恢复联系人（从 deleted_contacts 移回 contacts）
 * POST /api/v1/contacts/trash/restore-batch
 */
router.post('/trash/restore-batch', requireAuth, async (req: any, res: any) => {
  try {
    const { ids } = req.body as { ids: string[] };
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: '请选择要恢复的联系人', code: 'NO_IDS' });
    }

    const userId = (req as any).userId;
    let restoredCount = 0;
    const failedItems: Array<{ id: string; name: string; reason: string }> = [];

    for (const id of ids) {
      const [record] = await db
        .select()
        .from(deletedContacts)
        .where(and(eq(deletedContacts.id, id), eq(deletedContacts.user_id, userId)))
        .limit(1);

      if (!record) {
        failedItems.push({ id, name: '', reason: '回收站中未找到该联系人' });
        continue;
      }

      // 如果phone_hash为空，重新计算（deleted_contacts.phone_hash 是 nullable 的）
      let phoneHash = record.phone_hash as string;
      if (!phoneHash && record.phone) {
        phoneHash = hashPhone(record.phone as string);
        console.log('[RestoreBatch] phone_hash was null, recalculated:', phoneHash);
      }
      if (!phoneHash) {
        failedItems.push({ id, name: record.name as string, reason: '号码哈希值缺失' });
        continue;
      }

      // Check if contact already exists in contacts table
      const existingContact = await db
        .select()
        .from(contacts)
        .where(and(
          eq(contacts.phone_hash, phoneHash),
          eq(contacts.user_id, userId)
        ))
        .limit(1);

      if (existingContact.length > 0) {
        await db.delete(deletedContacts).where(eq(deletedContacts.id, id));
        restoredCount++;
        continue;
      }

      // 恢复时保持用户删除前的状态，不受社区投票或认证状态影响
      const restoreStatus = (record.status ?? 'unknown') as string;

      try {
        await db.insert(contacts).values({
          user_id: record.user_id as string,
          name: record.name as string,
          phone: record.phone as string,
          phone_hash: phoneHash,
          avatar_url: (record.avatar_url ?? undefined) as string | undefined,
          status: restoreStatus,
          invalid_reason: (record.invalid_reason ?? undefined) as string | undefined,
          invalid_report_count: (record.invalid_report_count ?? 0) as number,
          last_contact_date: (record.last_contact_date ?? undefined) as Date | undefined,
          notes: (record.notes ?? undefined) as string | undefined,
        });
      } catch (insertError: any) {
        console.error('[RestoreBatch] 插入contacts表失败:', insertError);
        // 唯一约束冲突，视为已存在
        if (insertError?.code === '23505' || insertError?.message?.includes('duplicate') || insertError?.message?.includes('unique')) {
          await db.delete(deletedContacts).where(eq(deletedContacts.id, id));
          restoredCount++;
          continue;
        }
        failedItems.push({
          id,
          name: record.name as string,
          reason: insertError?.message || '数据库写入错误'
        });
        continue;
      }

      // Remove from deleted_contacts
      await db.delete(deletedContacts).where(eq(deletedContacts.id, id));
      restoredCount++;
    }

    res.json({
      success: true,
      message: failedItems.length > 0
        ? '成功恢复 ' + restoredCount + ' 个联系人，' + failedItems.length + ' 个恢复失败'
        : '成功恢复 ' + restoredCount + ' 个联系人',
      restoredCount,
      failedItems: failedItems.length > 0 ? failedItems : undefined,
    });
  } catch (error: any) {
    console.error('[RestoreBatch] 批量恢复失败:', error);
    res.status(500).json({
      error: '批量恢复失败：' + (error?.message || '未知错误'),
      code: 'BATCH_RESTORE_ERROR'
    });
  }
});

/**
 * 永久删除联系人（从 deleted_contacts 彻底删除）
 * DELETE /api/v1/contacts/:id/permanent
 */
router.delete('/:id/permanent', requireAuth, async (req: any, res: any) => {
  try {
    const deleted = await db
      .delete(deletedContacts)
      .where(and(
        eq(deletedContacts.id, req.params.id),
        eq(deletedContacts.user_id, (req as any).userId)
      ))
      .returning();

    if (deleted.length === 0) {
      return res.status(404).json({ error: '回收站中未找到该联系人' });
    }

    res.json({
      success: true,
      message: '已永久删除'
    });
  } catch (error) {
    console.error('永久删除失败:', error);
    res.status(500).json({ error: '永久删除失败' });
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

export default router;
