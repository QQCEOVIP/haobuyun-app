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
