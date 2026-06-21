import { sql } from "drizzle-orm";
import { pgTable, varchar, timestamp, boolean, integer, jsonb, index, text } from "drizzle-orm/pg-core";

// 联系人表
export const contacts = pgTable(
  "contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    phone_hash: varchar("phone_hash", { length: 64 }).notNull(), // 用于众包查询
    avatar_url: varchar("avatar_url", { length: 512 }),
    status: varchar("status", { length: 20 }).default("unknown").notNull(), // active, maybe_invalid, invalid, unknown
    invalid_reason: text("invalid_reason"),
    invalid_report_count: integer("invalid_report_count").default(0).notNull(), // 众包标记次数
    last_contact_date: timestamp("last_contact_date", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("contacts_user_id_idx").on(table.user_id),
    index("contacts_phone_hash_idx").on(table.phone_hash),
    index("contacts_status_idx").on(table.status),
    index("contacts_last_contact_idx").on(table.last_contact_date),
  ]
);

// 标签表
export const tags = pgTable(
  "tags",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    color: varchar("color", { length: 20 }).default("#4A90D9").notNull(),
    icon: varchar("icon", { length: 64 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tags_user_id_idx").on(table.user_id),
  ]
);

// 联系人-标签关联表
export const contactTags = pgTable(
  "contact_tags",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    contact_id: varchar("contact_id", { length: 36 }).notNull().references(() => contacts.id, { onDelete: "cascade" }),
    tag_id: varchar("tag_id", { length: 36 }).notNull().references(() => tags.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("contact_tags_contact_idx").on(table.contact_id),
    index("contact_tags_tag_idx").on(table.tag_id),
  ]
);

// 众包失效标记表（脱敏存储）
export const invalidReports = pgTable(
  "invalid_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone_hash: varchar("phone_hash", { length: 64 }).notNull().unique(), // 手机号哈希，脱敏
    report_count: integer("report_count").default(1).notNull(),
    report_type: varchar("report_type", { length: 20 }).default("invalid").notNull(), // invalid, changed_number, not_exist
    last_reporter_id: varchar("last_reporter_id", { length: 36 }), // 最后上报者（不关联，仅记录）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("invalid_reports_phone_hash_idx").on(table.phone_hash),
    index("invalid_reports_count_idx").on(table.report_count),
  ]
);

// 备份记录表
export const backups = pgTable(
  "backups",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    contact_count: integer("contact_count").default(0).notNull(),
    backup_url: varchar("backup_url", { length: 512 }),
    backup_type: varchar("backup_type", { length: 20 }).default("full").notNull(), // full, incremental
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("backups_user_id_idx").on(table.user_id),
    index("backups_created_at_idx").on(table.created_at),
  ]
);

// 用户设置表
export const userSettings = pgTable(
  "user_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull().unique(),
    settings: jsonb("settings").default({}).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("user_settings_user_id_idx").on(table.user_id),
  ]
);

// ============ 积分体系表 ============

// 用户积分表
export const userPoints = pgTable(
  "user_points",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull().unique(),
    balance: integer("balance").default(0).notNull(),
    total_earned: integer("total_earned").default(0).notNull(),
    total_spent: integer("total_spent").default(0).notNull(),
    credit_score: integer("credit_score").default(100).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_points_user_id_idx").on(table.user_id),
  ]
);

// 积分记录表
export const pointRecords = pgTable(
  "point_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    type: varchar("type", { length: 20 }).notNull(), // earn, spend
    action: varchar("action", { length: 50 }).notNull(),
    points: integer("points").notNull(),
    balance_after: integer("balance_after").notNull(),
    description: text("description"),
    related_id: varchar("related_id", { length: 36 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("point_records_user_id_idx").on(table.user_id),
    index("point_records_created_at_idx").on(table.created_at),
  ]
);

// 商城商品表
export const shopProducts = pgTable(
  "shop_products",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    category: varchar("category", { length: 30 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    price: integer("price").notNull(),
    stock: integer("stock"),
    is_unlimited: boolean("is_unlimited").default(false),
    is_active: boolean("is_active").default(true),
    metadata: jsonb("metadata"),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("shop_products_category_idx").on(table.category),
    index("shop_products_active_idx").on(table.is_active),
  ]
);

// 兑换记录表
export const exchangeRecords = pgTable(
  "exchange_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    product_id: varchar("product_id", { length: 36 }).notNull(),
    points_spent: integer("points_spent").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("exchange_records_user_id_idx").on(table.user_id),
    index("exchange_records_product_idx").on(table.product_id),
  ]
);

// 勋章定义表
export const medals = pgTable(
  "medals",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    code: varchar("code", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 50 }).notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 100 }),
    requirement_type: varchar("requirement_type", { length: 30 }).notNull(),
    requirement_value: integer("requirement_value").notNull(),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("medals_code_idx").on(table.code),
  ]
);

// 用户勋章表
export const userMedals = pgTable(
  "user_medals",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    medal_id: varchar("medal_id", { length: 36 }).notNull().references(() => medals.id),
    earned_at: timestamp("earned_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("user_medals_user_id_idx").on(table.user_id),
    index("user_medals_medal_id_idx").on(table.medal_id),
  ]
);

// 标注验证表
export const reportValidations = pgTable(
  "report_validations",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    phone_hash: varchar("phone_hash", { length: 64 }).notNull(),
    reporter_id: varchar("reporter_id", { length: 36 }).notNull(),
    first_report_at: timestamp("first_report_at", { withTimezone: true }).defaultNow().notNull(),
    confirmation_count: integer("confirmation_count").default(1).notNull(),
    is_valid: boolean("is_valid").default(false),
    validated_at: timestamp("validated_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("report_validations_phone_idx").on(table.phone_hash),
    index("report_validations_reporter_idx").on(table.reporter_id),
  ]
);

// 连续签到记录表
export const checkinStreaks = pgTable(
  "checkin_streaks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull().unique(),
    current_streak: integer("current_streak").default(0).notNull(),
    longest_streak: integer("longest_streak").default(0).notNull(),
    last_checkin_date: varchar("last_checkin_date", { length: 10 }),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("checkin_streaks_user_id_idx").on(table.user_id),
  ]
);

// 每日标注统计表
export const dailyReports = pgTable(
  "daily_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    report_date: varchar("report_date", { length: 10 }).notNull(),
    valid_count: integer("valid_count").default(0).notNull(),
  },
  (table) => [
    index("daily_reports_user_date_idx").on(table.user_id, table.report_date),
  ]
);

// 异常账号标记表
export const flaggedAccounts = pgTable(
  "flagged_accounts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    reason: varchar("reason", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    reviewed_by: varchar("reviewed_by", { length: 36 }),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("flagged_accounts_user_id_idx").on(table.user_id),
    index("flagged_accounts_status_idx").on(table.status),
  ]
);
