import { sql } from "drizzle-orm";
import {
  pgTable,
  varchar,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  uuid,
  bigserial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ============================================================================
// contacts - 联系人表 (varchar(36) for id and user_id)
// ============================================================================
export const contacts = pgTable(
  "contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    phone_hash: varchar("phone_hash", { length: 64 }).notNull(),
    avatar_url: varchar("avatar_url", { length: 512 }),
    status: varchar("status", { length: 20 }).notNull().default("unknown"),
    invalid_reason: text("invalid_reason"),
    invalid_report_count: integer("invalid_report_count").notNull().default(0),
    last_contact_date: timestamp("last_contact_date", { withTimezone: true }),
    notes: text("notes"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
    is_deleted: boolean("is_deleted").default(false),
    deleted_at: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("contacts_user_id_idx").on(table.user_id),
    index("contacts_phone_hash_idx").on(table.phone_hash),
    index("contacts_status_idx").on(table.status),
    index("contacts_last_contact_idx").on(table.last_contact_date),
  ]
);

// ============================================================================
// deleted_contacts - 已删除联系人表 (varchar(36) for id and user_id)
// ============================================================================
export const deletedContacts = pgTable(
  "deleted_contacts",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    phone_hash: varchar("phone_hash", { length: 64 }),
    avatar_url: varchar("avatar_url", { length: 512 }),
    status: varchar("status", { length: 20 }).notNull().default("unknown"),
    invalid_reason: text("invalid_reason"),
    invalid_report_count: integer("invalid_report_count").notNull().default(0),
    last_contact_date: timestamp("last_contact_date", { withTimezone: true }),
    notes: text("notes"),
    deleted_at: timestamp("deleted_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("deleted_contacts_user_id_idx").on(table.user_id),
    index("deleted_contacts_phone_idx").on(table.phone),
  ]
);

// ============================================================================
// tags - 标签表 (varchar(36) for id and user_id)
// ============================================================================
export const tags = pgTable("tags", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }),
  icon: varchar("icon", { length: 50 }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

// ============================================================================
// contact_tags - 联系人标签关联表 (varchar(36) for all ids)
// ============================================================================
export const contactTags = pgTable("contact_tags", {
  id: varchar("id", { length: 36 }).primaryKey(),
  contact_id: varchar("contact_id", { length: 36 }).notNull(),
  tag_id: varchar("tag_id", { length: 36 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// invalid_reports - 无效号码举报表 (varchar(36) for id)
// ============================================================================
export const invalidReports = pgTable("invalid_reports", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  phone_hash: varchar("phone_hash", { length: 64 }).notNull().unique(),
  report_count: integer("report_count").notNull().default(1),
  report_type: varchar("report_type", { length: 20 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

// ============================================================================
// backups - 备份记录表 (varchar(36) for id and user_id)
// ============================================================================
export const backups = pgTable(
  "backups",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull(),
    contact_count: integer("contact_count").notNull().default(0),
    backup_url: varchar("backup_url", { length: 512 }),
    backup_type: varchar("backup_type", { length: 20 }).notNull().default("full"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("backups_user_id_idx").on(table.user_id),
    index("backups_created_at_idx").on(table.created_at),
  ]
);

// ============================================================================
// user_settings - 用户设置表 (varchar(36) for id and user_id)
// ============================================================================
export const userSettings = pgTable("user_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  user_id: varchar("user_id", { length: 36 }).notNull().unique(),
  settings: jsonb("settings"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

// ============================================================================
// user_points - 用户积分表 (uuid for id and user_id)
// ============================================================================
export const userPoints = pgTable("user_points", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  total_earned: integer("total_earned").notNull().default(0),
  total_spent: integer("total_spent").notNull().default(0),
  credit_score: integer("credit_score").notNull().default(100),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// point_records - 积分记录表 (uuid for id, user_id, related_id)
// ============================================================================
export const pointRecords = pgTable(
  "point_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    points: integer("points").notNull(),
    balance_after: integer("balance_after").notNull(),
    description: text("description"),
    related_id: uuid("related_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_point_records_user").on(table.user_id),
    index("idx_point_records_created").on(table.created_at),
  ]
);

// ============================================================================
// shop_products - 商品表 (uuid for id)
// ============================================================================
export const shopProducts = pgTable("shop_products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  category: varchar("category", { length: 30 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  price: integer("price").notNull(),
  stock: integer("stock"),
  is_unlimited: boolean("is_unlimited").default(false),
  is_active: boolean("is_active").default(true),
  metadata: jsonb("metadata"),
  sort_order: integer("sort_order").default(0),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// exchange_records - 兑换记录表 (uuid for id, user_id, product_id)
// ============================================================================
export const exchangeRecords = pgTable(
  "exchange_records",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    product_id: uuid("product_id").notNull(),
    points_spent: integer("points_spent").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    metadata: jsonb("metadata"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_exchange_records_user").on(table.user_id),
  ]
);

// ============================================================================
// medals - 勋章定义表 (uuid for id)
// ============================================================================
export const medals = pgTable("medals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 50 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 100 }),
  requirement_type: varchar("requirement_type", { length: 30 }).notNull(),
  requirement_value: integer("requirement_value").notNull(),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// user_medals - 用户勋章表 (uuid for id, user_id, medal_id)
// ============================================================================
export const userMedals = pgTable(
  "user_medals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    medal_id: uuid("medal_id").notNull(),
    earned_at: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_medals_user_id_medal_id_unique").on(table.user_id, table.medal_id),
    index("idx_user_medals_user").on(table.user_id),
  ]
);

// ============================================================================
// report_validations - 举报验证表 (uuid for id and reporter_id)
// ============================================================================
export const reportValidations = pgTable(
  "report_validations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    phone_hash: varchar("phone_hash", { length: 64 }).notNull(),
    reporter_id: uuid("reporter_id").notNull(),
    first_report_at: timestamp("first_report_at", { withTimezone: true }).notNull().defaultNow(),
    confirmation_count: integer("confirmation_count").notNull().default(1),
    is_valid: boolean("is_valid").default(false),
    validated_at: timestamp("validated_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_report_validations_phone").on(table.phone_hash),
  ]
);

// ============================================================================
// checkin_streaks - 签到连续记录表 (uuid for id and user_id)
// ============================================================================
export const checkinStreaks = pgTable("checkin_streaks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull().unique(),
  current_streak: integer("current_streak").notNull().default(0),
  longest_streak: integer("longest_streak").notNull().default(0),
  last_checkin_date: timestamp("last_checkin_date", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// daily_reports - 每日举报统计表 (uuid for id and user_id)
// ============================================================================
export const dailyReports = pgTable(
  "daily_reports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull(),
    report_date: timestamp("report_date", { withTimezone: true }).notNull(),
    valid_count: integer("valid_count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("daily_reports_user_id_report_date_unique").on(table.user_id, table.report_date),
    index("idx_daily_reports_user_date").on(table.user_id, table.report_date),
  ]
);

// ============================================================================
// flagged_accounts - 标记账号表 (uuid for id, user_id, reviewed_by)
// ============================================================================
export const flaggedAccounts = pgTable("flagged_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  user_id: uuid("user_id").notNull(),
  reason: varchar("reason", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  reviewed_by: uuid("reviewed_by"),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================================
// feedback - 用户反馈表 (bigint for id, text for user_id)
// ============================================================================
export const feedback = pgTable("feedback", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  user_id: text("user_id").notNull(),
  category: text("category").notNull().default("suggestion"),
  content: text("content").notNull(),
  contact: text("contact"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================================
// number_votes - 号码投票表 (bigserial for id, text for user_id)
// ============================================================================
export const numberVotes = pgTable(
  "number_votes",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    phone: text("phone").notNull(),
    user_id: text("user_id").notNull(),
    vote: text("vote").notNull(),
    voted_at: timestamp("voted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("number_votes_phone_idx").on(table.phone),
    index("number_votes_user_idx").on(table.user_id),
  ]
);

// ============================================================================
// number_authentications - 号码认证表 (bigserial for id, text for user_id)
// ============================================================================
export const numberAuthentications = pgTable(
  "number_authentications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    phone: text("phone").notNull(),
    user_id: text("user_id").notNull(),
    user_name: text("user_name").notNull(),
    authenticated_at: timestamp("authenticated_at", { withTimezone: true }).notNull().defaultNow(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("number_authentications_phone_idx").on(table.phone),
    index("number_authentications_user_idx").on(table.user_id),
  ]
);
