import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  integer,
  real,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  fullName: varchar("full_name", { length: 200 }).notNull(),
  email: varchar("email", { length: 200 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }).notNull(),
  country: varchar("country", { length: 100 }).notNull().default("Ghana"),
  countryFlag: varchar("country_flag", { length: 20 }).notNull().default("🇬🇭"),
  currency: varchar("currency", { length: 10 }).notNull().default("GHS"),
  passwordHash: text("password_hash").notNull(),
  // Registration approval status: pending | approved | rejected
  registrationStatus: varchar("registration_status", { length: 20 })
    .notNull()
    .default("pending"),
  // Active plan code: basic | starter | standard | pro | elite | none
  activePlan: varchar("active_plan", { length: 30 }).notNull().default("none"),
  // Current plan purchase status: none | pending | active
  planStatus: varchar("plan_status", { length: 20 }).notNull().default("none"),
  // Pending plan that's awaiting approval
  pendingPlan: varchar("pending_plan", { length: 30 }),
  createdAt: timestamp("created_at").defaultNow(),
  avatarInitial: varchar("avatar_initial", { length: 2 }),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  // "registration" | "plan"
  paymentType: varchar("payment_type", { length: 20 }).notNull(),
  // For plan payments, the plan code
  planCode: varchar("plan_code", { length: 30 }),
  planName: varchar("plan_name", { length: 60 }),
  amount: varchar("amount", { length: 20 }).notNull(),
  currency: varchar("currency", { length: 10 }).notNull().default("GHS"),
  network: varchar("network", { length: 50 })
    .notNull()
    .default("TELECEL NETWORK"),
  recipientNumber: varchar("recipient_number", { length: 30 })
    .notNull()
    .default("0506805681"),
  recipientName: varchar("recipient_name", { length: 200 })
    .notNull()
    .default("Richard Alorzuke"),
  transactionReference: varchar("transaction_reference", { length: 100 }),
  screenshotName: varchar("screenshot_name", { length: 200 }),
  screenshotData: text("screenshot_data"),
  homeProb: real("home_prob"),
  drawProb: real("draw_prob"),
  awayProb: real("away_prob"),
  confidence: integer("confidence"),
  dataQuality: varchar("data_quality", { length: 30 }),
  modelJson: text("model_json"),
  // pending | approved | rejected
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
