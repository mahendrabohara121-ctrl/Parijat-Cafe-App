import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutDashboard, ClipboardList, LayoutGrid, Package, Wallet, UtensilsCrossed,
  Users, ChefHat, BarChart3, QrCode, ShoppingBag, Gift, Share2, Plus, X, Trash2,
  Check, Clock, Flame, AlertTriangle, TrendingUp, TrendingDown, Search, Menu as MenuIcon, Shield, Eye, EyeOff, LogOut, Truck,
  CalendarDays, Lock, Unlock, CheckCircle2, CreditCard, Printer
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { supabase } from "./supabaseClient";

/* ---------------- brand tokens (matches Parijat Cafe POS marketing site) ---------------- */
const T = {
  dusk: "#14213D",   // navy — dark surfaces (sidebar bg, primary buttons, headings)
  plum: "#6B7280",   // muted body text
  gold: "#2F6FED",   // primary accent (blue)
  cream: "#F6F8FB",  // page background
  petal: "#FFFFFF",  // text/labels ON dark surfaces — must stay white, not navy
  sage: "#1FAA59",   // success green
  ink: "#14213D",
  line: "#E6E9F0",
  red: "#E5484D",
};

// generates a real UUID (required by Supabase's uuid columns) —
// uses the browser's built-in generator when available, with a safe fallback
const uid = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
const money = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN");
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- purchase categories & accounting treatment ---------------- */
const PURCHASE_CATEGORIES = [
  "Food Ingredients",
  "Beverage Ingredients",
  "Cigarettes & Tobacco",
  "Packaging",
  "Cleaning & Hygiene",
  "Office & Stationery",
  "Utilities",
  "Equipment & Smallwares",
  "Maintenance",
  "Other",
];

const PURCHASE_COST_TYPES = [
  { id: "cogs", label: "Stock / Cost of Goods" },
  { id: "operating", label: "Operating / Other Purchase" },
];

/* ---------------- seed data ---------------- */
const SEED_MENU = [
  { id: uid(), name: "Dusk Pour-Over", category: "Coffee & Brews", price: 320, veg: true, available: true, station: "bar", recipe: [] },
  { id: uid(), name: "Parijat Cardamom Latte", category: "Coffee & Brews", price: 280, veg: true, available: true, station: "bar", recipe: [] },
  { id: uid(), name: "Himalayan Cold Brew", category: "Coffee & Brews", price: 260, veg: true, available: true, station: "bar", recipe: [] },
  { id: uid(), name: "Masala Chiya", category: "Coffee & Brews", price: 150, veg: true, available: true, station: "bar", recipe: [] },
  { id: uid(), name: "Sekuwa Skewers", category: "Small Plates", price: 420, veg: false, available: true, station: "kitchen", recipe: [] },
  { id: uid(), name: "Momo Trio", category: "Small Plates", price: 380, veg: false, available: true, station: "kitchen", recipe: [] },
  { id: uid(), name: "Aloo Sadeko Toast", category: "Small Plates", price: 240, veg: true, available: true, station: "kitchen", recipe: [] },
  { id: uid(), name: "Sel Roti Stack", category: "Sweet", price: 260, veg: true, available: true, station: "kitchen", recipe: [] },
  { id: uid(), name: "Malai Cheesecake", category: "Sweet", price: 340, veg: true, available: true, station: "kitchen", recipe: [] },
  { id: uid(), name: "Jasmine Kulfi", category: "Sweet", price: 220, veg: true, available: true, station: "bar", recipe: [] },
];
const SEED_TABLES = Array.from({ length: 10 }, (_, i) => ({
  id: uid(), name: "T" + (i + 1), capacity: i % 3 === 0 ? 2 : 4, status: "free", orderId: null,
}));
const SEED_INVENTORY = [
  { id: uid(), name: "Coffee Beans (Arabica)", unit: "kg", stock: 8, reorder: 5, avgCost: 0 },
  { id: uid(), name: "Whole Milk", unit: "L", stock: 14, reorder: 10, avgCost: 0 },
  { id: uid(), name: "Chicken (for Sekuwa)", unit: "kg", stock: 3, reorder: 4, avgCost: 0 },
  { id: uid(), name: "Momo Flour", unit: "kg", stock: 12, reorder: 6, avgCost: 0 },
  { id: uid(), name: "Cardamom", unit: "g", stock: 400, reorder: 200, avgCost: 0 },
  { id: uid(), name: "Cream Cheese", unit: "kg", stock: 2, reorder: 3, avgCost: 0 },
];
const SEED_CUSTOMERS = [
  { id: uid(), name: "Anita Sharma", phone: "98xxxxxx01", visits: 12, points: 340, notes: "Prefers window seating", referralCode: "ANITA12" },
  { id: uid(), name: "Bikash Thapa", phone: "98xxxxxx02", visits: 4, points: 90, notes: "Allergic to peanuts", referralCode: "BIKASH4" },
];

/* ---------------- roles & access ---------------- */
const ROLES = [
  { id: "owner", label: "Owner" },
  { id: "manager", label: "Manager" },
  { id: "cashier", label: "Cashier" },
  { id: "barista", label: "Barista" },
];
// which modules each role can see. "staff" (Staff Management) and "auditlog" are owner-only.
const ROLE_ACCESS = {
  owner: ["overview", "orders", "kds", "tables", "purchase", "inventory", "accounting", "menu", "crm", "sales", "qr", "online", "loyalty", "refer", "creditbook", "staff", "auditlog"],
  manager: ["overview", "orders", "kds", "tables", "purchase", "inventory", "accounting", "menu", "crm", "sales", "qr", "online", "loyalty", "refer", "creditbook"],
  cashier: ["overview", "orders", "tables", "accounting", "crm", "sales", "qr", "online", "loyalty", "refer", "creditbook"],
  barista: ["kds", "orders"],
};
const SEED_STAFF = [
  { id: uid(), name: "Owner", username: "owner", password: "owner123", role: "owner", active: true },
];

/* ---------------- Supabase data layer ---------------- */
// maps each in-app array to its real Postgres table + field-name translation
// (JS uses camelCase like tableId, DB columns use snake_case like table_id)
const TABLE_MAP = {
  menu: {
    table: "menu_items",
    toDb: (m) => ({ id: m.id, name: m.name, category: m.category, price: m.price, veg: m.veg, available: m.available, station: m.station || "kitchen", recipe: m.recipe || [] }),
    fromDb: (r) => ({ id: r.id, name: r.name, category: r.category, price: Number(r.price), veg: r.veg, available: r.available, station: r.station || "kitchen", recipe: Array.isArray(r.recipe) ? r.recipe : [] }),
  },
  tables: {
    table: "dining_tables",
    toDb: (t) => ({ id: t.id, name: t.name, capacity: t.capacity, status: t.status, order_id: t.orderId || null }),
    fromDb: (r) => ({ id: r.id, name: r.name, capacity: r.capacity, status: r.status, orderId: r.order_id }),
  },
  orders: {
    table: "orders",
    toDb: (o) => ({
      id: o.id, table_id: o.tableId || null, table_name: o.tableName, items: o.items, total: o.total,
      status: o.status, source: o.source, customer_name: o.customerName || null,
      payment_method: o.paymentMethod || null, created_at: o.createdAt, paid_at: o.paidAt || null,
      cancel_reason: o.cancelReason || null, cancelled_from_paid: !!o.cancelledFromPaid,
      subtotal: o.subtotal != null ? o.subtotal : o.total, discount: o.discount || 0,
      discount_by: o.discountBy || null, voided_by: o.voidedBy || null, inventory_consumed_at: o.inventoryConsumedAt || null, cogs_total: Number(o.cogsTotal || 0),
    }),
    fromDb: (r) => ({
      id: r.id, tableId: r.table_id, tableName: r.table_name, items: r.items, total: Number(r.total),
      status: r.status, source: r.source, customerName: r.customer_name,
      paymentMethod: r.payment_method, createdAt: r.created_at, paidAt: r.paid_at,
      cancelReason: r.cancel_reason, cancelledFromPaid: r.cancelled_from_paid,
      subtotal: r.subtotal != null ? Number(r.subtotal) : Number(r.total), discount: Number(r.discount || 0),
      discountBy: r.discount_by, voidedBy: r.voided_by, inventoryConsumedAt: r.inventory_consumed_at, cogsTotal: Number(r.cogs_total || 0),
    }),
  },
  inventory: {
    table: "inventory_items",
    toDb: (i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock, reorder: i.reorder, avg_cost: Number(i.avgCost || 0) }),
    fromDb: (r) => ({ id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock), reorder: Number(r.reorder), avgCost: Number(r.avg_cost || 0) }),
  },
  inventoryMovements: {
    table: "inventory_movements",
    toDb: (m) => ({ id: m.id, item_id: m.itemId, item_name: m.itemName, unit: m.unit, qty: m.qty, unit_cost: m.unitCost, total_cost: m.totalCost, type: m.type, order_id: m.orderId || null, menu_item_id: m.menuItemId || null, menu_item_name: m.menuItemName || null, date: m.date, created_at: m.createdAt || new Date().toISOString() }),
    fromDb: (r) => ({ id: r.id, itemId: r.item_id, itemName: r.item_name, unit: r.unit, qty: Number(r.qty), unitCost: Number(r.unit_cost || 0), totalCost: Number(r.total_cost || 0), type: r.type, orderId: r.order_id, menuItemId: r.menu_item_id, menuItemName: r.menu_item_name, date: r.date, createdAt: r.created_at }),
  },
  waste: {
    table: "waste_log",
    toDb: (w) => ({ id: w.id, item_name: w.itemName, qty: w.qty, unit: w.unit, reason: w.reason, date: w.date }),
    fromDb: (r) => ({ id: r.id, itemName: r.item_name, qty: Number(r.qty), unit: r.unit, reason: r.reason, date: r.date }),
  },
  expenses: {
    table: "expenses",
    toDb: (e) => ({ id: e.id, category: e.category, description: e.description || null, amount: e.amount, date: e.date, payment_method: e.paymentMethod || "cash" }),
    fromDb: (r) => ({ id: r.id, category: r.category, description: r.description, amount: Number(r.amount), date: r.date, paymentMethod: r.payment_method || "cash" }),
  },
  customers: {
    table: "customers",
    toDb: (c) => ({ id: c.id, name: c.name, phone: c.phone || null, notes: c.notes || null, visits: c.visits, points: c.points, referral_code: c.referralCode || null }),
    fromDb: (r) => ({ id: r.id, name: r.name, phone: r.phone, notes: r.notes, visits: r.visits, points: r.points, referralCode: r.referral_code }),
  },
  referrals: {
    table: "referrals",
    toDb: (r) => ({ id: r.id, referrer_id: r.referrerId || null, referrer_name: r.referrerName, referee_name: r.refereeName, referee_phone: r.refereePhone || null, status: r.status, date: r.date }),
    fromDb: (r) => ({ id: r.id, referrerId: r.referrer_id, referrerName: r.referrer_name, refereeName: r.referee_name, refereePhone: r.referee_phone, status: r.status, date: r.date }),
  },
  purchases: {
    table: "purchases",
    toDb: (p) => ({
      id: p.id, item_id: p.itemId || null, item_name: p.itemName, quantity: p.quantity, unit: p.unit,
      unit_cost: p.unitCost, total_cost: p.totalCost, supplier: p.supplier || null, notes: p.notes || null, date: p.date,
      payment_method: p.paymentMethod || "cash", category: p.category || "Other", cost_type: p.costType || (p.itemId ? "cogs" : "operating"),
    }),
    fromDb: (r) => ({
      id: r.id, itemId: r.item_id, itemName: r.item_name, quantity: Number(r.quantity), unit: r.unit,
      unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost), supplier: r.supplier, notes: r.notes, date: r.date,
      paymentMethod: r.payment_method || "cash", category: r.category || "Other", costType: r.cost_type || (r.item_id ? "cogs" : "operating"),
    }),
  },
  cashDeposits: {
    table: "cash_deposits",
    toDb: (d) => ({ id: d.id, amount: d.amount, notes: d.notes || null, date: d.date }),
    fromDb: (r) => ({ id: r.id, amount: Number(r.amount), notes: r.notes, date: r.date }),
  },
  creditTransactions: {
    table: "credit_transactions",
    toDb: (c) => ({
      id: c.id, customer_id: c.customerId || null, customer_name: c.customerName, type: c.type,
      order_id: c.orderId || null, amount: c.amount, payment_method: c.paymentMethod || null,
      notes: c.notes || null, date: c.date, created_by: c.createdBy || null,
    }),
    fromDb: (r) => ({
      id: r.id, customerId: r.customer_id, customerName: r.customer_name, type: r.type,
      orderId: r.order_id, amount: Number(r.amount), paymentMethod: r.payment_method,
      notes: r.notes, date: r.date, createdBy: r.created_by,
    }),
  },
};

// fetch a whole table fresh from Supabase, mapped to the app's JS shape
async function fetchTable(key) {
  const { table, fromDb } = TABLE_MAP[key];
  // Supabase caps a single response (default 1000 rows). Page until an empty page so
  // big tables (orders, inventory_movements) are never silently truncated.
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from(table).select("*").order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) {
      console.error("fetch failed", table, error);
      // Throw instead of returning [] — an empty array looks like "first run" and would re-seed demo data.
      throw new Error(`Couldn't load ${table}: ${error.message}`);
    }
    if (!data.length) break;
    all.push(...data);
    from += data.length;
  }
  const rows = all.map(fromDb);
  // Sort once at the source so every screen sees consistent chronological data.
  const sortKey = rows[0] && "createdAt" in rows[0] ? "createdAt" : (rows[0] && "date" in rows[0] ? "date" : null);
  if (sortKey) rows.sort((a, b) => new Date(a[sortKey]) - new Date(b[sortKey]));
  return rows;
}

// reconcile the whole in-memory array back to Supabase: upsert everything present,
// delete anything that used to be in oldArr but isn't in newArr anymore.
// Returns { ok: boolean, error? } instead of swallowing failures, so callers can
// show the user something went wrong and roll back optimistic state if needed.
// Serialize writes per table. Without this, two fast order changes (for example
// Served -> Paid) can race in Supabase: an older full-array upsert may arrive after
// the newer one and put the order back into the previous status.
const syncQueues = {};
// Timestamp of the last local write (start OR finish). Background refreshes (poll / live events)
// that began before this must be discarded, otherwise a stale read can put an old status back on screen.
let lastLocalWriteAt = 0;
const hasPendingSync = () => Object.keys(syncQueues).length > 0;

async function syncTable(key, oldArr, newArr) {
  const runInner = async () => {
    const { table, toDb } = TABLE_MAP[key];
    const newIds = new Set(newArr.map((r) => r.id));
    const toDelete = oldArr.filter((r) => !newIds.has(r.id)).map((r) => r.id);
    if (newArr.length) {
      const { error } = await supabase.from(table).upsert(newArr.map(toDb));
      if (error) { console.error("upsert failed", table, error); return { ok: false, error }; }
    }
    if (toDelete.length) {
      const { error } = await supabase.from(table).delete().in("id", toDelete);
      if (error) { console.error("delete failed", table, error); return { ok: false, error }; }
    }
    return { ok: true };
  };
  // never let an unexpected exception vanish: report it as a failed save so the UI rolls back AND tells the user
  const run = async () => {
    try { return await runInner(); }
    catch (e) { console.error("sync crashed", key, e); return { ok: false, error: e }; }
  };

  const previous = syncQueues[key] || Promise.resolve();
  const current = previous.catch(() => {}).then(run);
  syncQueues[key] = current;
  current.finally(() => {
    if (syncQueues[key] === current) delete syncQueues[key];
  });
  return current;
}

/* ---------------- business days (keyed by date, not id — handled separately from the generic tables above) ---------------- */
async function fetchBusinessDays() {
  const { data, error } = await supabase.from("business_days").select("*");
  if (error) { console.error("fetch business_days failed", error); return {}; }
  const map = {};
  data.forEach((r) => {
    map[r.date] = {
      date: r.date,
      status: r.status,
      openingCash: Number(r.opening_cash || 0),
      actualClosingCash: Number(r.actual_closing_cash || 0),
      openedAt: r.opened_at,
      closedAt: r.closed_at,
      openedBy: r.opened_by,
      closedBy: r.closed_by,
      closeNotes: r.close_notes || "",
      closeSummary: r.close_summary || null,
      audit: r.audit || [],
    };
  });
  return map;
}
async function saveBusinessDay(day) {
  const row = {
    date: day.date,
    status: day.status,
    opening_cash: day.openingCash,
    actual_closing_cash: day.actualClosingCash,
    opened_at: day.openedAt,
    closed_at: day.closedAt,
    opened_by: day.openedBy,
    closed_by: day.closedBy,
    close_notes: day.closeNotes || "",
    close_summary: day.closeSummary || null,
    audit: day.audit || [],
  };
  const { error } = await supabase.from("business_days").upsert(row, { onConflict: "date" });
  if (error) { console.error("save business_day failed", error); return { ok: false, error }; }
  return { ok: true };
}

/* ---------------- audit log ---------------- */
// fire-and-forget: never blocks or breaks the action it's logging, even if the insert fails
async function logAudit(actor, action, details) {
  try {
    const { error } = await supabase.from("audit_log").insert({ actor: actor || "Unknown", action, details: details || null });
    if (error) console.error("audit log failed", error);
  } catch (e) {
    console.error("audit log failed", e);
  }
}
async function fetchAuditLog(limit = 500) {
  const { data, error } = await supabase.from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error) { console.error("fetch audit_log failed", error); return []; }
  return data;
}

/* ---------------- printable day-close report ---------------- */
const PAYMENT_LABELS = {
  cash: "Cash", fonepay: "FonePay", esewa: "eSewa", khalti: "Khalti",
  card: "Card", bank: "Bank Transfer", credit: "Credit",
};

function buildDayCloseReportHtml(businessDate, day, orders, expenses, purchases, cashDeposits, creditTransactions) {
  const paidOrders = orders.filter((o) => o.status === "paid" && (o.paidAt || o.createdAt || "").slice(0, 10) === businessDate);
  const voidedToday = orders.filter((o) => o.status === "cancelled" && o.cancelledFromPaid && (o.paidAt || o.createdAt || "").slice(0, 10) === businessDate);
  const dayExpenses = expenses.filter((e) => e.date === businessDate);
  const dayPurchases = purchases.filter((p) => p.date === businessDate);
  const dayDeposits = cashDeposits.filter((d) => d.date === businessDate);
  const dayCredit = (creditTransactions || []).filter((c) => c.date === businessDate);

  const totalSales = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalDiscount = paidOrders.reduce((s, o) => s + Number(o.discount || 0), 0);
  const totalExpense = dayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPurchase = dayPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const netForDay = totalSales - totalExpense - totalPurchase;

  const methodBreakdown = Object.keys(PAYMENT_LABELS)
    .filter((id) => id !== "credit")
    .map((id) => ({
      label: PAYMENT_LABELS[id],
      count: paidOrders.filter((o) => o.paymentMethod === id).length,
      total: paidOrders.filter((o) => o.paymentMethod === id).reduce((s, o) => s + Number(o.total || 0), 0),
    }))
    .filter((p) => p.count > 0);

  const cashSales = paidOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + Number(o.total || 0), 0);
  const cashExpenses = dayExpenses.filter((e) => e.paymentMethod === "cash").reduce((s, e) => s + Number(e.amount || 0), 0);
  const cashPurchases = dayPurchases.filter((p) => p.paymentMethod === "cash").reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const cashDeposited = dayDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const expectedCash = Number(day.openingCash || 0) + cashSales - cashExpenses - cashPurchases - cashDeposited;
  const actualCash = Number(day.actualClosingCash || 0);
  const cashDifference = actualCash - expectedCash;

  const creditSalesToday = dayCredit.filter((c) => c.type === "sale").reduce((s, c) => s + Number(c.amount || 0), 0);
  const creditRepaidToday = dayCredit.filter((c) => c.type === "repayment").reduce((s, c) => s + Number(c.amount || 0), 0);

  const topItems = (() => {
    const map = {};
    paidOrders.forEach((o) => o.items.forEach((it) => { map[it.name] = (map[it.name] || 0) + it.qty; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
  })();

  const expenseByCategory = (() => {
    const map = {};
    dayExpenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount || 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  })();

  const fmtMoney = (n) => "Rs " + Number(n || 0).toLocaleString("en-IN");
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
  const fmtDateLong = new Date(`${businessDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const generatedAt = new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

  const row = (a, b) => `<tr><td>${a}</td><td class="num">${b}</td></tr>`;
  const section = (title, inner) => `<div class="section"><h2>${title}</h2>${inner}</div>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Day Close Report — ${businessDate}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #14213D; max-width: 720px; margin: 0 auto; padding: 28px 24px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #6B7280; font-size: 12.5px; margin-bottom: 18px; }
  .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; padding: 12px 14px; background: #F6F8FB; border-radius: 8px; }
  .meta div { font-size: 12px; }
  .meta strong { display: block; font-size: 13.5px; color: #14213D; }
  .section { margin-bottom: 20px; page-break-inside: avoid; }
  .section h2 { font-size: 14px; border-bottom: 2px solid #14213D; padding-bottom: 4px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  td, th { padding: 5px 4px; border-bottom: 1px solid #E6E9F0; text-align: left; }
  td.num, th.num { text-align: right; }
  tr.total td { font-weight: 700; border-top: 2px solid #14213D; border-bottom: none; }
  .status-open { color: #15803D; font-weight: 700; }
  .status-closed { color: #991B1B; font-weight: 700; }
  .diff-ok { color: #15803D; font-weight: 700; }
  .diff-bad { color: #B91C1C; font-weight: 700; }
  .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
  .sig { width: 45%; text-align: center; }
  .sig .line { border-top: 1px solid #14213D; margin-top: 40px; padding-top: 6px; font-size: 11.5px; color: #6B7280; }
  .footer { margin-top: 24px; font-size: 10.5px; color: #9CA3AF; text-align: center; }
  .empty { color: #9CA3AF; font-style: italic; font-size: 12px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Parijat Cafe — Day Close Report</h1>
  <div class="sub">${fmtDateLong}</div>

  <div class="meta">
    <div>Status<strong class="${day.status === "open" ? "status-open" : "status-closed"}">${day.status === "open" ? "OPEN" : "CLOSED"}</strong></div>
    <div>Opened<strong>${fmtTime(day.openedAt)} by ${day.openedBy || "—"}</strong></div>
    <div>Closed<strong>${day.closedAt ? fmtTime(day.closedAt) + " by " + (day.closedBy || "—") : "—"}</strong></div>
    <div>Opening Cash<strong>${fmtMoney(day.openingCash)}</strong></div>
  </div>

  ${section("Sales Summary", `
    <table>
      <tr><th>Payment Method</th><th class="num">Orders</th><th class="num">Amount</th></tr>
      ${methodBreakdown.length ? methodBreakdown.map((m) => `<tr><td>${m.label}</td><td class="num">${m.count}</td><td class="num">${fmtMoney(m.total)}</td></tr>`).join("") : `<tr><td colspan="3" class="empty">No sales recorded for this date.</td></tr>`}
      <tr class="total"><td>Total Sales</td><td class="num">${paidOrders.length}</td><td class="num">${fmtMoney(totalSales)}</td></tr>
    </table>
  `)}

  ${section("Cash Reconciliation", `
    <table>
      ${row("Opening Cash in Drawer", fmtMoney(day.openingCash))}
      ${row("+ Cash Sales", fmtMoney(cashSales))}
      ${row("− Cash Expenses", fmtMoney(cashExpenses))}
      ${row("− Cash Purchases", fmtMoney(cashPurchases))}
      ${row("− Cash Deposited to Bank", fmtMoney(cashDeposited))}
      <tr class="total">${row("Expected Closing Cash", fmtMoney(expectedCash)).replace("<tr>", "").replace("</tr>", "")}</tr>
      ${row("Actual Cash Counted", day.status === "closed" ? fmtMoney(actualCash) : "Not yet closed")}
      ${day.status === "closed" ? `<tr><td>Difference</td><td class="num ${cashDifference === 0 ? "diff-ok" : "diff-bad"}">${fmtMoney(cashDifference)}${cashDifference === 0 ? " (matches)" : ""}</td></tr>` : ""}
    </table>
    ${day.closeNotes ? `<div style="margin-top:8px;font-size:12px;"><strong>Closing notes:</strong> ${day.closeNotes}</div>` : ""}
  `)}

  ${section("Discounts &amp; Credit", `
    <table>
      ${row("Total Discounts Given", fmtMoney(totalDiscount))}
      ${row("Credit Sales Today", fmtMoney(creditSalesToday))}
      ${row("Credit Repayments Received Today", fmtMoney(creditRepaidToday))}
    </table>
  `)}

  ${section("Expenses", `
    <table>
      <tr><th>Category</th><th class="num">Amount</th></tr>
      ${expenseByCategory.length ? expenseByCategory.map(([cat, amt]) => `<tr><td>${cat}</td><td class="num">${fmtMoney(amt)}</td></tr>`).join("") : `<tr><td colspan="2" class="empty">No expenses recorded.</td></tr>`}
      <tr class="total"><td>Total Expenses</td><td class="num">${fmtMoney(totalExpense)}</td></tr>
    </table>
  `)}

  ${section("Purchases", `
    <table>
      ${row("Total Purchase Spend", fmtMoney(totalPurchase))}
      ${row("Purchase Entries", dayPurchases.length)}
    </table>
  `)}

  ${section("Top Selling Items", `
    <table>
      <tr><th>Item</th><th class="num">Qty Sold</th></tr>
      ${topItems.length ? topItems.map(([name, qty]) => `<tr><td>${name}</td><td class="num">${qty}</td></tr>`).join("") : `<tr><td colspan="2" class="empty">No items sold.</td></tr>`}
    </table>
  `)}

  ${voidedToday.length ? section("Voided Bills (after payment)", `
    <table>
      <tr><th>Table</th><th class="num">Amount</th><th>Reason</th><th>Voided By</th></tr>
      ${voidedToday.map((o) => `<tr><td>${o.tableName}</td><td class="num">${fmtMoney(o.total)}</td><td>${o.cancelReason || "—"}</td><td>${o.voidedBy || "—"}</td></tr>`).join("")}
    </table>
  `) : ""}

  ${section("Net for the Day", `
    <table>
      ${row("Total Sales", fmtMoney(totalSales))}
      ${row("− Total Expenses", fmtMoney(totalExpense))}
      ${row("− Total Purchases", fmtMoney(totalPurchase))}
      <tr class="total">${row("Net", fmtMoney(netForDay)).replace("<tr>", "").replace("</tr>", "")}</tr>
    </table>
  `)}

  <div class="signatures">
    <div class="sig"><div class="line">Prepared by (Cashier/Manager)</div></div>
    <div class="sig"><div class="line">Verified by (Owner/Manager)</div></div>
  </div>

  <div class="footer">Generated ${generatedAt} · Parijat Cafe POS</div>

  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`;
}

function printDayCloseReport(businessDate, day, orders, expenses, purchases, cashDeposits, creditTransactions) {
  const html = buildDayCloseReportHtml(businessDate, day, orders, expenses, purchases, cashDeposits, creditTransactions);
  const win = window.open("", "_blank");
  if (!win) { alert("Please allow pop-ups for this site to print the report."); return; }
  win.document.write(html);
  win.document.close();
}

/* ---------------- small UI atoms ---------------- */
function Pill({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: "#F1F5F9", color: "#334155" },
    good: { bg: "#DCFCE7", color: "#15803D" },
    warn: { bg: "#FEF3C7", color: "#B45309" },
    bad: { bg: "#FEE2E2", color: "#B91C1C" },
    gold: { bg: "#DBEAFE", color: "#1D4ED8" },
  };
  const s = tones[tone] || tones.neutral;
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
function Card({ children, style, className = "", onClick }) {
  return (
    <div className={className} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, ...style }}>
      {children}
    </div>
  );
}
function Btn({ children, onClick, variant = "primary", style, disabled, type = "button" }) {
  const base = { padding: "9px 16px", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: "none", display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1 };
  const variants = {
    primary: { background: T.dusk, color: T.petal },
    gold: { background: T.gold, color: T.dusk },
    ghost: { background: "transparent", color: T.plum, border: `1px solid ${T.line}` },
    danger: { background: "#F6E1DA", color: T.red },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}
function Modal({ title, onClose, children, width = 460 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(36,27,56,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: T.dusk }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: T.plum, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { width: "100%", padding: "9px 11px", border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 13.5, fontFamily: "inherit" };

/* ---------------- toasts (surfaces save/sync failures instead of swallowing them) ---------------- */
function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  const toneStyle = {
    error: { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" },
    warn: { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
    success: { bg: "#DCFCE7", color: "#166534", border: "#BBF7D0" },
    info: { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  };
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, display: "flex", flexDirection: "column", gap: 8, maxWidth: 340 }}>
      {toasts.map((t) => {
        const s = toneStyle[t.tone] || toneStyle.info;
        return (
          <div key={t.id} style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 12.5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
            <button onClick={() => onDismiss(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", opacity: 0.6, flexShrink: 0 }}><X size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ================= LOGIN ================= */
function Login({ staff, onLogin, error }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const submit = () => {
    onLogin(username, password);
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: T.cream, fontFamily: "'Inter', Arial, sans-serif", padding: 20 }}>
      <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 32, width: 360, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <svg width="24" height="24" viewBox="0 0 40 40"><path d="M20 4C20 4 26 12 26 18C26 22.4 23.3 26 20 26C16.7 26 14 22.4 14 18C14 12 20 4 20 4Z" fill={T.gold} /></svg>
          <span style={{ fontWeight: 700, fontSize: 17, color: T.dusk }}>Parijat Cafe</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 22 }}>Sign in to the operations dashboard.</div>

        <Field label="Username">
          <input style={inputStyle} value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={handleKeyDown} autoFocus placeholder="e.g. owner" />
        </Field>
        <Field label="Password">
          <div style={{ position: "relative" }}>
            <input type={showPw ? "text" : "password"} style={{ ...inputStyle, paddingRight: 36 }} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={handleKeyDown} />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 8, top: 7, background: "none", border: "none", cursor: "pointer", color: T.plum }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>

        {error && <div style={{ fontSize: 12.5, color: T.red, background: "#FEE2E2", padding: "8px 10px", borderRadius: 8, marginBottom: 14 }}>{error}</div>}

        <Btn onClick={submit} variant="primary" style={{ width: "100%", justifyContent: "center", marginBottom: 16 }}>Sign In</Btn>

        <div style={{ fontSize: 11.5, color: T.plum, opacity: 0.7, background: T.cream, padding: 10, borderRadius: 8, lineHeight: 1.5 }}>
          First time here? Default owner login is <strong>owner</strong> / <strong>owner123</strong>. Sign in and change it (or add real staff) from Staff & Roles.
        </div>
      </div>
    </div>
  );
}

/* ================= FORCE PASSWORD CHANGE ================= */
function ForcePasswordChange({ currentUser, onDone, onLogout }) {
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setErr("");
    if (pw1.length < 6) { setErr("Password must be at least 6 characters."); return; }
    if (pw1 !== pw2) { setErr("Passwords don't match."); return; }
    setSaving(true);
    const { error: pwErr } = await supabase.rpc("update_staff_password", { p_id: currentUser.id, p_password: pw1 });
    if (pwErr) { setErr("Couldn't set password: " + pwErr.message); setSaving(false); return; }
    const { error: flagErr } = await supabase.rpc("clear_must_change_password", { p_id: currentUser.id });
    if (flagErr) { setErr("Password saved, but couldn't clear the reset flag: " + flagErr.message); setSaving(false); return; }
    logAudit(currentUser.name, "PASSWORD_CHANGED", { self: true });
    onDone({ ...currentUser, must_change_password: false });
  };

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: T.cream, fontFamily: "'Inter', Arial, sans-serif", padding: 20 }}>
      <div style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 14, padding: 32, width: 380, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <Lock size={20} color={T.gold} />
          <span style={{ fontWeight: 700, fontSize: 17, color: T.dusk }}>Set a New Password</span>
        </div>
        <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 22 }}>
          For security, {currentUser.name} needs to set a fresh password before continuing.
        </div>
        <Field label="New Password">
          <div style={{ position: "relative" }}>
            <input type={showPw ? "text" : "password"} style={{ ...inputStyle, paddingRight: 36 }} value={pw1} onChange={(e) => setPw1(e.target.value)} autoFocus />
            <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 8, top: 7, background: "none", border: "none", cursor: "pointer", color: T.plum }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <Field label="Confirm New Password">
          <input type={showPw ? "text" : "password"} style={inputStyle} value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        {err && <div style={{ fontSize: 12.5, color: T.red, background: "#FEE2E2", padding: "8px 10px", borderRadius: 8, marginBottom: 14 }}>{err}</div>}
        <Btn onClick={submit} variant="primary" disabled={saving} style={{ width: "100%", justifyContent: "center", marginBottom: 10 }}>{saving ? "Saving…" : "Set Password & Continue"}</Btn>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: T.plum, cursor: "pointer", fontSize: 12, width: "100%", textAlign: "center" }}>Log out instead</button>
      </div>
    </div>
  );
}

/* ================= BUSINESS DAY ================= */
const getBusinessDay = (days, date) => days[date] || {
  date,
  status: "closed",
  openingCash: 0,
  actualClosingCash: 0,
  openedAt: null,
  closedAt: null,
  openedBy: null,
  closedBy: null,
  closeNotes: "",
  closeSummary: null,
  audit: [],
};

function BusinessDayControl({
  businessDate, businessDay, orders, expenses, purchases, cashDeposits, creditTransactions, currentUser,
  onChangeDate, onOpenDay, onCloseDay, onReopenDay,
}) {
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [reopenModal, setReopenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const paidOrders = orders.filter((o) => o.status === "paid" && (o.paidAt || o.createdAt || "").slice(0, 10) === businessDate);
  const dayExpenses = expenses.filter((e) => e.date === businessDate);
  const dayPurchases = purchases.filter((p) => p.date === businessDate);
  const dayDeposits = cashDeposits.filter((d) => d.date === businessDate);

  const cashSales = paidOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + Number(o.total || 0), 0);
  const cashExpenses = dayExpenses.filter((e) => e.paymentMethod === "cash").reduce((s, e) => s + Number(e.amount || 0), 0);
  const cashPurchases = dayPurchases.filter((p) => p.paymentMethod === "cash").reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const cashDeposited = dayDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalSales = paidOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const expectedCash = Number(businessDay.openingCash || 0) + cashSales - cashExpenses - cashPurchases - cashDeposited;
  const difference = Number(actualCash || 0) - expectedCash;
  const isOwnerOrManager = ["owner", "manager"].includes(currentUser?.role);

  const formatDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${T.line}`, borderRadius: 8, padding: "7px 10px", background: "#fff" }}>
          <CalendarDays size={15} color={T.gold} />
          <input aria-label="Business date" type="date" value={businessDate} onChange={(e) => onChangeDate(e.target.value)} style={{ border: "none", outline: "none", fontFamily: "inherit", fontSize: 12.5, color: T.dusk }} />
        </div>
        <div style={{ textAlign: "right", minWidth: 105 }}>
          <div style={{ fontSize: 10, color: T.plum, opacity: 0.65, textTransform: "uppercase", letterSpacing: .5 }}>Business Day</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.dusk }}>{formatDay(businessDate)}</div>
        </div>
        <Pill tone={businessDay.status === "open" ? "good" : "bad"}>{businessDay.status === "open" ? "● Day Open" : "● Day Closed"}</Pill>
        <Btn variant="ghost" onClick={() => printDayCloseReport(businessDate, businessDay, orders, expenses, purchases, cashDeposits, creditTransactions)}><Printer size={14} /> Print Report</Btn>
        {businessDay.status === "open" ? (
          <Btn variant="danger" onClick={() => { setActualCash(""); setCloseNotes(""); setCloseModal(true); }}><Lock size={14} /> Close Day</Btn>
        ) : (
          <Btn variant="primary" onClick={() => { setOpeningCash(""); setOpenModal(true); }}><Unlock size={14} /> Open Day</Btn>
        )}
      </div>

      {openModal && (
        <Modal title={`Open Business Day · ${formatDay(businessDate)}`} onClose={() => setOpenModal(false)} width={430}>
          <div style={{ background: "#EFF6FF", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12.5, color: "#1E40AF" }}>
            Opening this date allows POS, expenses and purchases to be entered against this business day.
          </div>
          <Field label="Opening Cash in Drawer (Rs)">
            <input autoFocus type="number" min="0" style={inputStyle} value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} placeholder="e.g. 10000" />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              const amount = Number(openingCash);
              if (!Number.isFinite(amount) || amount < 0) return alert("Enter a valid opening cash amount.");
              onOpenDay(amount);
              setOpenModal(false);
            }}>Open Business Day</Btn>
          </div>
        </Modal>
      )}

      {closeModal && (
        <Modal title={`Close Business Day · ${formatDay(businessDate)}`} onClose={() => setCloseModal(false)} width={520}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
            {[
              ["Total Sales", money(totalSales)],
              ["Orders", paidOrders.length],
              ["Cash Sales", money(cashSales)],
              ["Cash Expenses", money(cashExpenses)],
              ["Cash Purchases", money(cashPurchases)],
              ["Cash Deposited", money(cashDeposited)],
            ].map(([label, value]) => <div key={label} style={{ background: T.cream, borderRadius: 8, padding: 12 }}><div style={{ fontSize: 11, color: T.plum, opacity: .7 }}>{label}</div><div style={{ fontSize: 16, fontWeight: 700, color: T.dusk }}>{value}</div></div>)}
          </div>
          <div style={{ background: "#F8FAFC", border: `1px solid ${T.line}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span>Opening Cash</span><strong>{money(businessDay.openingCash)}</strong></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}><span>Expected Closing Cash</span><strong>{money(expectedCash)}</strong></div>
            <div style={{ fontSize: 11.5, color: T.plum, opacity: .75 }}>Expected = opening cash + cash sales − cash expenses − cash purchases − cash deposits.</div>
          </div>
          <Field label="Actual Cash Counted (Rs)"><input autoFocus type="number" min="0" style={inputStyle} value={actualCash} onChange={(e) => setActualCash(e.target.value)} placeholder="Count the physical drawer cash" /></Field>
          {actualCash !== "" && <div style={{ background: difference === 0 ? "#DCFCE7" : "#FEE2E2", color: difference === 0 ? "#15803D" : "#B91C1C", borderRadius: 8, padding: 11, marginBottom: 14, fontSize: 13 }}><strong>{difference === 0 ? "Cash matches." : "Cash difference"}</strong> · {money(difference)}</div>}
          <Field label="Closing Notes"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder="Optional note about the closing count…" /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setCloseModal(false)}>Cancel</Btn>
            <Btn variant="danger" onClick={() => {
              const amount = Number(actualCash);
              if (!Number.isFinite(amount) || amount < 0) return alert("Enter the actual cash counted.");
              onCloseDay(amount, closeNotes, { expectedCash, totalSales, paidOrders: paidOrders.length, cashSales, cashExpenses, cashPurchases, cashDeposited });
              // print the report using the just-entered actual cash, even though state
              // hasn't re-rendered with the closed status yet
              printDayCloseReport(
                businessDate,
                { ...businessDay, status: "closed", actualClosingCash: amount, closeNotes },
                orders, expenses, purchases, cashDeposits, creditTransactions
              );
              setCloseModal(false);
            }}><Lock size={14} /> Confirm Close Day &amp; Print</Btn>
          </div>
        </Modal>
      )}

      {reopenModal && (
        <Modal title={`Reopen Business Day · ${formatDay(businessDate)}`} onClose={() => setReopenModal(false)} width={430}>
          <div style={{ background: "#FEF3C7", color: "#92400E", borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12.5 }}>
            Reopening a closed day is an administrative action and will be written to the audit log.
          </div>
          <Field label="Reason for Reopening"><textarea autoFocus style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="e.g. Correcting a wrong payment entry…" /></Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" onClick={() => setReopenModal(false)}>Cancel</Btn>
            <Btn variant="danger" disabled={!isOwnerOrManager || !reopenReason.trim()} onClick={() => { onReopenDay(reopenReason.trim()); setReopenModal(false); }}>Reopen Day</Btn>
          </div>
          {!isOwnerOrManager && <div style={{ fontSize: 11.5, color: T.red, marginTop: 8 }}>Only Owner or Manager can reopen a closed day.</div>}
        </Modal>
      )}

      {businessDay.status === "closed" && isOwnerOrManager && (
        <div style={{ marginTop: 7, textAlign: "right" }}>
          <button onClick={() => setReopenModal(true)} style={{ background: "none", border: "none", color: T.plum, cursor: "pointer", fontSize: 11.5, textDecoration: "underline" }}>Reopen this closed day</button>
        </div>
      )}
    </>
  );
}

/* ================= MAIN APP ================= */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // restored from localStorage after data loads, if a session exists
  const [loginError, setLoginError] = useState("");

  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryMovements, setInventoryMovements] = useState([]);
  const [waste, setWaste] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [cashDeposits, setCashDeposits] = useState([]);
  const [creditTransactions, setCreditTransactions] = useState([]);
  const [staff, setStaff] = useState([]);
  const [businessDate, setBusinessDate] = useState(today());
  const [businessDays, setBusinessDays] = useState({});

  // Always-current copy of every synced list. makePersist reads "before" from here instead of
  // from inside a setState updater (React may delay updaters, which used to make saves silently fail).
  const liveRef = useRef({});
  useEffect(() => { liveRef.current.menu = menu; }, [menu]);
  useEffect(() => { liveRef.current.tables = tables; }, [tables]);
  useEffect(() => { liveRef.current.orders = orders; }, [orders]);
  useEffect(() => { liveRef.current.inventory = inventory; }, [inventory]);
  useEffect(() => { liveRef.current.inventoryMovements = inventoryMovements; }, [inventoryMovements]);
  useEffect(() => { liveRef.current.waste = waste; }, [waste]);
  useEffect(() => { liveRef.current.expenses = expenses; }, [expenses]);
  useEffect(() => { liveRef.current.customers = customers; }, [customers]);
  useEffect(() => { liveRef.current.referrals = referrals; }, [referrals]);
  useEffect(() => { liveRef.current.purchases = purchases; }, [purchases]);
  useEffect(() => { liveRef.current.cashDeposits = cashDeposits; }, [cashDeposits]);
  useEffect(() => { liveRef.current.creditTransactions = creditTransactions; }, [creditTransactions]);

  // --- toasts: surfaces save/sync failures instead of swallowing them silently ---
  const [toasts, setToasts] = useState([]);
  const pushToast = (message, tone = "error", timeoutMs = 6000) => {
    const id = uid();
    setToasts((t) => (t.some((x) => x.message === message) ? t : [...t, { id, message, tone }]));
    if (timeoutMs) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), timeoutMs);
    return id;
  };
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
      const [m, t, o, inv, invMov, w, exp, cust, ref, purch, deposits, credit, days] = await Promise.all([
        fetchTable("menu"),
        fetchTable("tables"),
        fetchTable("orders"),
        fetchTable("inventory"),
        fetchTable("inventoryMovements"),
        fetchTable("waste"),
        fetchTable("expenses"),
        fetchTable("customers"),
        fetchTable("referrals"),
        fetchTable("purchases"),
        fetchTable("cashDeposits"),
        fetchTable("creditTransactions"),
        fetchBusinessDays(),
      ]);
      // seed empty tables on very first run so the app isn't blank
      setMenu(m.length ? m : SEED_MENU);
      setTables(t.length ? t : SEED_TABLES);
      setOrders(o);
      setInventory(inv.length ? inv : SEED_INVENTORY);
      setInventoryMovements(invMov);
      setWaste(w);
      setExpenses(exp);
      setCustomers(cust.length ? cust : SEED_CUSTOMERS);
      setReferrals(ref);
      setPurchases(purch);
      setCashDeposits(deposits);
      setCreditTransactions(credit);
      setBusinessDays(days);
      if (!m.length) syncTable("menu", [], SEED_MENU);
      if (!t.length) syncTable("tables", [], SEED_TABLES);
      if (!inv.length) syncTable("inventory", [], SEED_INVENTORY);
      if (!cust.length) syncTable("customers", [], SEED_CUSTOMERS);

      const { data: staffList } = await supabase.rpc("list_staff");
      setStaff(staffList || []);

      // restore a previous login session (if any) so refreshing doesn't force a re-login
      try {
        const savedId = localStorage.getItem("parijat_session_id");
        if (savedId && staffList) {
          const match = staffList.find((s) => s.id === savedId && s.active);
          if (match) {
            setCurrentUser(match);
            setActive(ROLE_ACCESS[match.role][0] || "overview");
          } else {
            localStorage.removeItem("parijat_session_id"); // account deleted/deactivated since last login
          }
        }
      } catch (e) { /* localStorage unavailable — just skip session restore */ }

      setLoading(false);
      } catch (e) {
        // Do NOT seed or render a half-empty app: a failed load must never look like a fresh install.
        console.error("initial load failed", e);
        setLoadError(e.message || "Couldn't reach the database.");
        setLoading(false);
      }
    })();
  }, []);

  // --- realtime sync: keeps every open screen/device in sync live, instead of only
  // loading once on mount. Without this, two staff on two devices can silently
  // overwrite each other's changes to the same order or table.
  //
  // Realtime channels can drop (network blips, Supabase-side hiccups, etc.) and
  // supabase-js does NOT automatically rejoin a channel that errored out — only
  // the underlying socket reconnects. So without explicit handling here, one
  // dropped connection means the app silently stops receiving live updates
  // until a manual refresh. This sets up auto-reconnect with backoff so a
  // transient blip recovers on its own within a few seconds. ---
  useEffect(() => {
    let channel = null;
    let reconnectTimer = null;
    let attempt = 0;
    let cancelled = false;

    const applyChange = (key, setter, fromDb) => (payload) => {
      // our own full-array upserts echo back as events for EVERY row, possibly out of order;
      // while we still have a save in flight for this table, those echoes are stale — skip them.
      if (syncQueues[key]) return;
      setter((prev) => {
        if (payload.eventType === "DELETE") {
          return prev.filter((row) => row.id !== payload.old.id);
        }
        const incoming = fromDb(payload.new);
        const idx = prev.findIndex((row) => row.id === incoming.id);
        if (idx === -1) return [...prev, incoming];
        const next = prev.slice();
        next[idx] = incoming;
        return next;
      });
    };

    const connect = () => {
      if (cancelled) return;
      // Detach the old channel FIRST. Removing it fires a CLOSED status on the old subscription;
      // without the identity check below, that stale CLOSED looked like a fresh outage and
      // scheduled yet another reconnect — an endless disconnect/reconnect loop.
      const old = channel;
      channel = null;
      if (old) supabase.removeChannel(old);

      const ch = supabase.channel("parijat-pos-realtime-" + Date.now()); // unique name per attempt avoids stale-topic reuse issues
      ch
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, applyChange("orders", setOrders, TABLE_MAP.orders.fromDb))
        .on("postgres_changes", { event: "*", schema: "public", table: "dining_tables" }, applyChange("tables", setTables, TABLE_MAP.tables.fromDb))
        .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, applyChange("menu", setMenu, TABLE_MAP.menu.fromDb))
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, applyChange("inventory", setInventory, TABLE_MAP.inventory.fromDb))
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements" }, applyChange("inventoryMovements", setInventoryMovements, TABLE_MAP.inventoryMovements.fromDb));
      channel = ch;
      ch.subscribe((status, err) => {
        if (cancelled || channel !== ch) return; // stale callback from a channel we already replaced
        if (status === "SUBSCRIBED") {
          if (attempt > 0) pushToast("Live sync reconnected.", "success", 3000);
          attempt = 0; // reset backoff once we're healthy again
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          console.warn("[realtime]", status, err ? (err.message || err) : "");
          attempt += 1;
          const delay = Math.min(30000, 1000 * 2 ** attempt); // 2s, 4s, 8s... capped at 30s
          if (attempt === 1) {
            pushToast("Live sync disconnected — trying to reconnect…", "warn", delay + 2000);
          }
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connect, delay);
        }
      });
    };

    connect();

    // Fallback safety net: even if the WebSocket never connects at all (blocked
    // by a firewall/antivirus, or an extended outage), silently re-fetch the
    // live-critical tables every 15s so the app still converges on its own
    // without anyone needing to manually refresh.
    const pollInterval = setInterval(async () => {
      try {
        if (hasPendingSync()) return; // a save is in flight — don't read mid-write
        const startedAt = Date.now();
        const [freshOrders, freshTables] = await Promise.all([fetchTable("orders"), fetchTable("tables")]);
        if (hasPendingSync() || lastLocalWriteAt >= startedAt) return; // a local change happened meanwhile: this read is stale
        if (!cancelled) {
          setOrders(freshOrders);
          setTables(freshTables);
        }
      } catch (e) { /* transient network error: keep current screen, try again next tick */ }
    }, 15000);

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist helpers — update local state immediately (optimistic), sync the change to
  // Supabase in the background, and if the sync fails: tell the user via a toast and
  // roll the local state back to what it was before, so the UI never lies about what
  // actually got saved.
  const makePersist = (key, setState) => (valueOrUpdater) => {
    const prev = liveRef.current[key] || [];
    const next = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
    liveRef.current[key] = next;      // chain rapid clicks off the newest value immediately
    lastLocalWriteAt = Date.now();
    setState(next);
    syncTable(key, prev, next).then((res) => {
      lastLocalWriteAt = Date.now();
      if (!res.ok) {
        liveRef.current[key] = prev;
        setState(prev); // roll back — the save didn't actually happen
        pushToast(`Couldn't save your last change to ${TABLE_MAP[key].table.replace(/_/g, " ")}. It's been reverted — please try again.${res.error?.message ? " (" + res.error.message + ")" : ""}`, "error");
      }
    });
  };

  const persist = {
    menu: makePersist("menu", setMenu),
    tables: makePersist("tables", setTables),
    orders: makePersist("orders", setOrders),
    inventory: makePersist("inventory", setInventory),
    inventoryMovements: makePersist("inventoryMovements", setInventoryMovements),
    waste: makePersist("waste", setWaste),
    expenses: makePersist("expenses", setExpenses),
    customers: makePersist("customers", setCustomers),
    referrals: makePersist("referrals", setReferrals),
    purchases: makePersist("purchases", setPurchases),
    cashDeposits: makePersist("cashDeposits", setCashDeposits),
    creditTransactions: makePersist("creditTransactions", setCreditTransactions),
    refreshStaff: async () => {
      const { data, error } = await supabase.rpc("list_staff");
      if (error) { pushToast("Couldn't refresh staff list: " + error.message, "error"); return; }
      setStaff(data || []);
    },
  };

  // After a server-side action (pay_order / void_order) the database is the source of truth.
  // Re-read what it touched into LOCAL state only (raw setters — no write-back to Supabase).
  const refreshAfterServerAction = async (orderId) => {
    try {
      const [o, t, inv, cust, cred] = await Promise.all([
        fetchTable("orders"), fetchTable("tables"), fetchTable("inventory"),
        fetchTable("customers"), fetchTable("creditTransactions"),
      ]);
      setOrders(o); setTables(t); setInventory(inv); setCustomers(cust); setCreditTransactions(cred);
      if (orderId) {
        const { data } = await supabase.from("inventory_movements").select("*").eq("order_id", orderId);
        if (data && data.length) {
          const rows = data.map(TABLE_MAP.inventoryMovements.fromDb);
          setInventoryMovements((cur) => {
            const byId = new Map(cur.map((r) => [r.id, r]));
            rows.forEach((r) => byId.set(r.id, r));
            return Array.from(byId.values());
          });
        }
      }
    } catch (e) {
      pushToast("Saved on the server, but the screen couldn't refresh: " + e.message + " (reload the page).", "warn");
    }
  };

  const currentBusinessDay = getBusinessDay(businessDays, businessDate);

  // updates local state immediately and saves just that one day's row to Supabase in the
  // background; rolls back and warns if the save fails, same pattern as persist.* above.
  const updateBusinessDay = (dateKey, updater) => {
    let prevDays;
    setBusinessDays((prev) => {
      prevDays = prev;
      const nextDay = updater(getBusinessDay(prev, dateKey));
      const next = { ...prev, [dateKey]: nextDay };
      saveBusinessDay(nextDay).then((res) => {
        if (!res.ok) {
          setBusinessDays(prevDays);
          pushToast("Couldn't save the business day change. It's been reverted — please try again.", "error");
        }
      });
      return next;
    });
  };

  const openBusinessDay = (openingCash) => {
    if (currentBusinessDay.status === "open") return;
    updateBusinessDay(businessDate, (day) => ({
      ...day,
      status: "open",
      openingCash: Number(openingCash),
      actualClosingCash: 0,
      openedAt: new Date().toISOString(),
      closedAt: null,
      openedBy: currentUser?.name || "Unknown",
      closedBy: null,
      closeNotes: "",
      audit: [...(day.audit || []), { action: "DAY_OPENED", at: new Date().toISOString(), by: currentUser?.name || "Unknown", openingCash: Number(openingCash) }],
    }));
    logAudit(currentUser?.name, "DAY_OPENED", { date: businessDate, openingCash: Number(openingCash) });
  };

  const closeBusinessDay = (actualClosingCash, closeNotes, summary) => {
    if (currentBusinessDay.status !== "open") return;
    updateBusinessDay(businessDate, (day) => ({
      ...day,
      status: "closed",
      actualClosingCash: Number(actualClosingCash),
      closedAt: new Date().toISOString(),
      closedBy: currentUser?.name || "Unknown",
      closeNotes: closeNotes || "",
      closeSummary: summary,
      audit: [...(day.audit || []), { action: "DAY_CLOSED", at: new Date().toISOString(), by: currentUser?.name || "Unknown", actualClosingCash: Number(actualClosingCash), ...summary, notes: closeNotes || "" }],
    }));
    logAudit(currentUser?.name, "DAY_CLOSED", { date: businessDate, actualClosingCash: Number(actualClosingCash), ...summary });
  };

  const reopenBusinessDay = (reason) => {
    updateBusinessDay(businessDate, (day) => ({
      ...day,
      status: "open",
      closedAt: null,
      closedBy: null,
      audit: [...(day.audit || []), { action: "DAY_REOPENED", at: new Date().toISOString(), by: currentUser?.name || "Unknown", reason }],
    }));
    logAudit(currentUser?.name, "DAY_REOPENED", { date: businessDate, reason });
  };

  const NAV = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Main" },
    { id: "orders", label: "Order & KOT", icon: ClipboardList, group: "Operate" },
    { id: "kds", label: "Kitchen Display", icon: ChefHat, group: "Operate" },
    { id: "tables", label: "Table & Space", icon: LayoutGrid, group: "Operate" },
    { id: "purchase", label: "Purchase", icon: Truck, group: "Operate" },
    { id: "inventory", label: "Inventory & Waste", icon: Package, group: "Operate" },
    { id: "accounting", label: "Accounting", icon: Wallet, group: "Operate" },
    { id: "menu", label: "Menu Management", icon: UtensilsCrossed, group: "Operate" },
    { id: "crm", label: "CRM", icon: Users, group: "Operate" },
    { id: "sales", label: "Sales Report", icon: BarChart3, group: "Grow" },
    { id: "qr", label: "Digital QR Menu", icon: QrCode, group: "Grow" },
    { id: "online", label: "Online Order", icon: ShoppingBag, group: "Grow" },
    { id: "loyalty", label: "Loyalty & Rewards", icon: Gift, group: "Grow" },
    { id: "refer", label: "Refer & Earn", icon: Share2, group: "Grow" },
    { id: "creditbook", label: "Credit Book", icon: CreditCard, group: "Operate" },
    { id: "staff", label: "Staff & Roles", icon: Shield, group: "Admin" },
    { id: "auditlog", label: "Audit Log", icon: Lock, group: "Admin" },
  ];
  const groups = ["Main", "Operate", "Grow", "Admin"];
  const allowed = currentUser ? (ROLE_ACCESS[currentUser.role] || []) : [];
  const visibleNav = NAV.filter((n) => allowed.includes(n.id));

  const login = async (username, password) => {
    const { data, error } = await supabase.rpc("login_staff", { p_username: username.trim(), p_password: password });
    if (error) {
      if (error.message && error.message.includes("ACCOUNT_LOCKED")) {
        const until = error.message.split(":")[1] || "shortly";
        setLoginError(`Too many failed attempts. This account is locked until ${until}.`);
      } else {
        setLoginError("Something went wrong reaching the server. Try again.");
      }
      logAudit(username, "LOGIN_FAILED", { reason: "error", message: error.message });
      return;
    }
    const found = data && data[0];
    if (!found) {
      setLoginError("Incorrect username or password.");
      logAudit(username, "LOGIN_FAILED", { reason: "bad_credentials" });
      return;
    }
    if (!found.active) { setLoginError("This account has been deactivated. Ask the owner to reactivate it."); return; }
    setLoginError("");
    setCurrentUser(found);
    logAudit(found.name, "LOGIN_SUCCESS", { role: found.role });
    try { localStorage.setItem("parijat_session_id", found.id); } catch (e) { /* ignore */ }
    setActive(ROLE_ACCESS[found.role][0] || "overview");
  };
  const logout = () => {
    if (currentUser) logAudit(currentUser.name, "LOGOUT", {});
    setCurrentUser(null);
    setActive("overview");
    try { localStorage.removeItem("parijat_session_id"); } catch (e) { /* ignore */ }
  };

  if (loadError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 500, gap: 12, fontFamily: "sans-serif", color: T.ink, padding: 20, textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>Couldn't load Parijat Cafe data</div>
        <div style={{ fontSize: 13, color: T.plum, maxWidth: 420 }}>{loadError}</div>
        <div style={{ fontSize: 12, color: T.plum }}>Nothing was changed. Check your connection and try again.</div>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: T.dusk, color: "#fff", cursor: "pointer" }}>Retry</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 500, fontFamily: "sans-serif", color: T.plum }}>
        Loading Parijat Cafe dashboard…
      </div>
    );
  }

  if (!currentUser) {
    return <><Login staff={staff} onLogin={login} error={loginError} /><ToastStack toasts={toasts} onDismiss={dismissToast} /></>;
  }

  if (currentUser.must_change_password) {
    return (
      <>
        <ForcePasswordChange
          currentUser={currentUser}
          onDone={(updatedUser) => setCurrentUser(updatedUser)}
          onLogout={logout}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </>
    );
  }

  const activeLabel = NAV.find((n) => n.id === active)?.label || "";

  return (
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", background: T.cream, minHeight: "100%", display: "flex", color: T.ink }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      {/* ---------- sidebar ---------- */}
      <div style={{
        width: 232, background: T.dusk, color: T.petal, flexShrink: 0, padding: "22px 14px",
        position: sidebarOpen ? "fixed" : "static", inset: sidebarOpen ? 0 : "auto", zIndex: 60,
        display: sidebarOpen ? "flex" : "flex", flexDirection: "column", overflowY: "auto"
      }} className="parijat-sidebar">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="22" height="22" viewBox="0 0 40 40"><path d="M20 4C20 4 26 12 26 18C26 22.4 23.3 26 20 26C16.7 26 14 22.4 14 18C14 12 20 4 20 4Z" fill={T.gold} /></svg>
            <span style={{ fontWeight: 700, fontSize: 15.5 }}>Parijat Cafe</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: T.petal, cursor: "pointer", display: sidebarOpen ? "block" : "none" }}><X size={18} /></button>
        </div>
        <div style={{ flex: 1 }}>
          {groups.filter((g) => visibleNav.some((n) => n.group === g)).map((g) => (
            <div key={g} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: "#8F82AE", padding: "0 10px 8px", fontWeight: 600 }}>{g}</div>
              {visibleNav.filter((n) => n.group === g).map((n) => {
                const Icon = n.icon;
                const isActive = active === n.id;
                return (
                  <div key={n.id} onClick={() => { setActive(n.id); setSidebarOpen(false); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer",
                      marginBottom: 2, background: isActive ? "rgba(47,111,237,0.18)" : "transparent",
                      color: isActive ? "#93BBFF" : "#D9D0EA", fontSize: 13.5, fontWeight: isActive ? 600 : 400,
                    }}>
                    <Icon size={16} />
                    {n.label}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
          <div style={{ fontSize: 11, color: "#9CA8C9", marginBottom: 10, textTransform: "capitalize" }}>{ROLES.find((r) => r.id === currentUser.role)?.label}</div>
          <button onClick={logout} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.06)", border: "none", color: T.petal, padding: "8px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer", width: "100%" }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>

      {/* ---------- main ---------- */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: `1px solid ${T.line}`, background: T.petal }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={() => setSidebarOpen(true)} className="parijat-hamburger" style={{ background: "none", border: "none", cursor: "pointer", color: T.dusk, display: "none" }}><MenuIcon size={20} /></button>
            <h2 style={{ fontFamily: "inherit", fontSize: 20, fontWeight: 600, color: T.dusk }}>{activeLabel}</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <LiveClock />
            <BusinessDayControl
              businessDate={businessDate}
              businessDay={currentBusinessDay}
              orders={orders}
              expenses={expenses}
              purchases={purchases}
              cashDeposits={cashDeposits}
              creditTransactions={creditTransactions}
              currentUser={currentUser}
              onChangeDate={setBusinessDate}
              onOpenDay={openBusinessDay}
              onCloseDay={closeBusinessDay}
              onReopenDay={reopenBusinessDay}
            />
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, background: currentBusinessDay.status === "open" ? "#ECFDF5" : "#FEF2F2", border: `1px solid ${currentBusinessDay.status === "open" ? "#BBF7D0" : "#FECACA"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {currentBusinessDay.status === "open" ? <CheckCircle2 size={16} color={T.sage} /> : <Lock size={16} color={T.red} />}
              <div><strong style={{ fontSize: 12.5, color: currentBusinessDay.status === "open" ? "#166534" : "#991B1B" }}>{currentBusinessDay.status === "open" ? "Business Day is OPEN" : "Business Day is CLOSED"}</strong><div style={{ fontSize: 11.5, color: T.plum }}>All transactions are assigned to {businessDate}.</div></div>
            </div>
            <div style={{ fontSize: 11.5, color: T.plum }}>{currentBusinessDay.status === "open" ? `Opened ${currentBusinessDay.openedAt ? new Date(currentBusinessDay.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}` : "POS and operational entries are locked."}</div>
          </div>
          {active === "overview" && <Overview orders={orders} tables={tables} inventory={inventory} expenses={expenses} customers={customers} businessDate={businessDate} />}
          {active === "orders" && <Orders menu={menu} tables={tables} orders={orders} setOrders={persist.orders} setTables={persist.tables} customers={customers} setCustomers={persist.customers} currentUser={currentUser} businessDay={currentBusinessDay} creditTransactions={creditTransactions} setCreditTransactions={persist.creditTransactions} inventory={inventory} setInventory={persist.inventory} purchases={purchases} inventoryMovements={inventoryMovements} refreshData={refreshAfterServerAction} />}
          {active === "kds" && <KDS orders={orders} setOrders={persist.orders} tables={tables} setTables={persist.tables} menu={menu} />}
          {active === "tables" && <TablesView tables={tables} setTables={persist.tables} orders={orders} />}
          {active === "purchase" && <PurchaseManagement purchases={purchases} setPurchases={persist.purchases} inventory={inventory} setInventory={persist.inventory} businessDay={currentBusinessDay} />}
          {active === "inventory" && <Inventory inventory={inventory} setInventory={persist.inventory} waste={waste} setWaste={persist.waste} businessDay={currentBusinessDay} />}
          {active === "accounting" && <Accounting expenses={expenses} setExpenses={persist.expenses} orders={orders} purchases={purchases} cashDeposits={cashDeposits} setCashDeposits={persist.cashDeposits} businessDay={currentBusinessDay} creditTransactions={creditTransactions} currentUser={currentUser} inventoryMovements={inventoryMovements} />}
          {active === "menu" && <MenuManagement menu={menu} setMenu={persist.menu} inventory={inventory} />}
          {active === "crm" && <CRM customers={customers} setCustomers={persist.customers} orders={orders} />}
          {active === "sales" && <SalesReport orders={orders} menu={menu} />}
          {active === "qr" && <QRMenu menu={menu} />}
          {active === "online" && <OnlineOrder menu={menu} orders={orders} setOrders={persist.orders} businessDay={currentBusinessDay} />}
          {active === "loyalty" && <Loyalty customers={customers} setCustomers={persist.customers} />}
          {active === "refer" && <ReferEarn customers={customers} referrals={referrals} setReferrals={persist.referrals} setCustomers={persist.customers} />}
          {active === "creditbook" && <CreditBook customers={customers} creditTransactions={creditTransactions} setCreditTransactions={persist.creditTransactions} currentUser={currentUser} businessDay={currentBusinessDay} />}
          {active === "staff" && <StaffManagement staff={staff} refreshStaff={persist.refreshStaff} currentUser={currentUser} />}
          {active === "auditlog" && <AuditLogView />}
        </div>
      </div>
      <style>{`
        @media (max-width: 860px) {
          .parijat-sidebar { display: none; }
          .parijat-hamburger { display: block !important; }
        }
      `}</style>
    </div>
  );
}

/* ================= OVERVIEW ================= */
function Overview({ orders, tables, inventory, expenses, customers, businessDate }) {
  const refDate = businessDate || today();
  const todaysOrders = orders.filter((o) => o.createdAt?.slice(0, 10) === refDate);
  const todaysSales = todaysOrders.filter((o) => o.status === "paid").reduce((s, o) => s + o.total, 0);
  const activeOrders = orders.filter((o) => o.status !== "paid" && o.status !== "cancelled").length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const lowStock = inventory.filter((i) => i.stock <= i.reorder).length;
  const todaysExpense = expenses.filter((e) => e.date === refDate).reduce((s, e) => s + Number(e.amount), 0);

  const stats = [
    { label: "Today's Sales", value: money(todaysSales), icon: TrendingUp, tone: "good" },
    { label: "Active Orders", value: activeOrders, icon: ClipboardList, tone: "gold" },
    { label: "Tables Occupied", value: `${occupied}/${tables.length}`, icon: LayoutGrid, tone: "neutral" },
    { label: "Low Stock Items", value: lowStock, icon: AlertTriangle, tone: lowStock ? "bad" : "good" },
    { label: "Today's Expense", value: money(todaysExpense), icon: TrendingDown, tone: "warn" },
    { label: "Customers", value: customers.length, icon: Users, tone: "neutral" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))", gap: 14, marginBottom: 24 }}>
        {stats.map((s) => (
          <Card key={s.label} style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 12, color: T.plum, opacity: 0.7, marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: T.dusk, fontFamily: "inherit" }}>{s.value}</div>
              </div>
              <div style={{ background: "#F4EEDD", borderRadius: 8, padding: 8 }}><s.icon size={16} color={T.gold} /></div>
            </div>
          </Card>
        ))}
      </div>
      <Card style={{ padding: 20 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 16, marginBottom: 14, color: T.dusk }}>Recent Orders</h3>
        {orders.length === 0 ? <Empty text="No orders yet — head to Order & KOT to create the first one." /> : (
          <OrderTable rows={orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6)} />
        )}
      </Card>
    </div>
  );
}
function Empty({ text }) {
  return <div style={{ padding: "26px 0", textAlign: "center", color: T.plum, opacity: 0.6, fontSize: 13.5 }}>{text}</div>;
}
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30); // refresh every 30s, no need for per-second ticking
    return () => clearInterval(t);
  }, []);
  const dateStr = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ fontSize: 12.5, color: T.plum, display: "flex", alignItems: "center", gap: 6 }}>
      <Clock size={13} />
      <span>{dateStr} · {timeStr}</span>
    </div>
  );
}
function OrderTable({ rows }) {
  const toneFor = { placed: "warn", preparing: "gold", ready: "good", served: "neutral", paid: "good", cancelled: "bad" };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ textAlign: "left", color: T.plum, opacity: 0.65, fontSize: 11, textTransform: "uppercase" }}>
          <th style={{ padding: "6px 8px" }}>Order</th><th>Table</th><th>Items</th><th>Total</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id} style={{ borderTop: `1px solid ${T.line}` }}>
            <td style={{ padding: "9px 8px", fontFamily: "monospace" }}>#{o.id.slice(0, 5)}</td>
            <td>{o.tableName}</td>
            <td>{o.items.reduce((s, i) => s + i.qty, 0)} items</td>
            <td>{money(o.total)}</td>
            <td><Pill tone={toneFor[o.status]}>{o.status}</Pill></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ================= ORDER & KOT ================= */
const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "fonepay", label: "FonePay" },
  { id: "esewa", label: "eSewa" },
  { id: "khalti", label: "Khalti" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank Transfer" },
  { id: "credit", label: "Credit" },
];


function Orders({ menu, tables, orders, setOrders, setTables, customers, setCustomers, currentUser, businessDay, creditTransactions, setCreditTransactions, inventory, setInventory, purchases, inventoryMovements, refreshData }) {
  const canManageMoney = currentUser && (currentUser.role === "owner" || currentUser.role === "manager"); // Discount & Void Bill are Owner/Manager only
  const [modal, setModal] = useState(false);
  const [tableId, setTableId] = useState("");
  const [cart, setCart] = useState({});
  const [itemSearch, setItemSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [payOrder, setPayOrder] = useState(null); // order pending payment-method selection
  const [addItemTarget, setAddItemTarget] = useState(null); // existing order we're adding more items to
  const [addCart, setAddCart] = useState({});
  const [addItemSearch, setAddItemSearch] = useState("");
  const [discountTarget, setDiscountTarget] = useState(null); // order being discounted
  const [discountType, setDiscountType] = useState("flat"); // "flat" (Rs) or "percent" (%)
  const [discountValue, setDiscountValue] = useState("");

  const addToCart = (item) => setCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
  const removeFromCart = (item) => setCart((c) => {
    const n = { ...c }; if (n[item.id] > 1) n[item.id]--; else delete n[item.id]; return n;
  });
  const cartTotal = Object.entries(cart).reduce((s, [id, qty]) => s + qty * (menu.find((m) => m.id === id)?.price || 0), 0);

  const placeOrder = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open the business day before creating an order."); return; }
    if (!tableId || Object.keys(cart).length === 0) return;
    const table = tables.find((t) => t.id === tableId);
    const items = Object.entries(cart).map(([id, qty]) => {
      const m = menu.find((mm) => mm.id === id);
      return { menuId: id, name: m.name, qty, price: m.price };
    });
    const order = { id: uid(), tableId, tableName: table.name, items, subtotal: cartTotal, discount: 0, total: cartTotal, status: "placed", createdAt: new Date().toISOString(), source: "dine-in" };
    setOrders((currentOrders) => [...currentOrders, order]);
    setTables(tables.map((t) => (t.id === tableId ? { ...t, status: "occupied", orderId: order.id } : t)));
    setCart({}); setTableId(""); setItemSearch(""); setModal(false);
  };

  // --- Add Item to an in-progress table (e.g. guest orders dessert after mains) ---
  const openAddItem = (order) => { setAddItemTarget(order); setAddCart({}); setAddItemSearch(""); };
  const addToAddCart = (item) => setAddCart((c) => ({ ...c, [item.id]: (c[item.id] || 0) + 1 }));
  const removeFromAddCart = (item) => setAddCart((c) => {
    const n = { ...c }; if (n[item.id] > 1) n[item.id]--; else delete n[item.id]; return n;
  });
  const addCartTotal = Object.entries(addCart).reduce((s, [id, qty]) => s + qty * (menu.find((m) => m.id === id)?.price || 0), 0);

  const confirmAddItems = () => {
    if (!addItemTarget || Object.keys(addCart).length === 0) return;
    // pull the freshest copy in case state moved on while the modal was open, and never mutate existing item objects
    const order = orders.find((o) => o.id === addItemTarget.id) || addItemTarget;
    const mergedItems = order.items.map((it) => ({ ...it })); // clone each item so we never mutate state in place
    Object.entries(addCart).forEach(([id, qty]) => {
      const m = menu.find((mm) => mm.id === id);
      const idx = mergedItems.findIndex((it) => it.menuId === id);
      if (idx >= 0) mergedItems[idx] = { ...mergedItems[idx], qty: mergedItems[idx].qty + qty };
      else mergedItems.push({ menuId: id, name: m.name, qty, price: m.price });
    });
    const newSubtotal = mergedItems.reduce((s, it) => s + it.qty * it.price, 0);
    const newTotal = Math.max(0, newSubtotal - (order.discount || 0));
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === order.id
      ? { ...o, items: mergedItems, subtotal: newSubtotal, total: newTotal, status: "placed" } // back to "placed" so kitchen/bar sees the new item
      : o)));
    setAddItemTarget(null); setAddCart({}); setAddItemSearch("");
  };

  // --- Remove Item from an in-progress bill (correcting a mistake without voiding the whole order) ---
  const [removeItemTarget, setRemoveItemTarget] = useState(null);
  const [removeDraftItems, setRemoveDraftItems] = useState([]); // working copy while the modal is open

  const openRemoveItem = (order) => {
    const fresh = orders.find((o) => o.id === order.id) || order;
    setRemoveItemTarget(fresh);
    setRemoveDraftItems(fresh.items.map((it) => ({ ...it }))); // clone so edits don't touch live state until confirmed
  };
  const decreaseDraftQty = (menuId) => {
    setRemoveDraftItems((items) => items
      .map((it) => (it.menuId === menuId ? { ...it, qty: it.qty - 1 } : it))
      .filter((it) => it.qty > 0));
  };
  const increaseDraftQty = (menuId) => {
    setRemoveDraftItems((items) => items.map((it) => (it.menuId === menuId ? { ...it, qty: it.qty + 1 } : it)));
  };
  const dropDraftItem = (menuId) => {
    setRemoveDraftItems((items) => items.filter((it) => it.menuId !== menuId));
  };
  const removeDraftTotal = removeDraftItems.reduce((s, it) => s + it.qty * it.price, 0);

  const confirmRemoveItems = () => {
    if (!removeItemTarget) return;
    if (removeDraftItems.length === 0) {
      alert("Removing every item would leave an empty bill — use Cancel or Void Bill instead if the whole order should go away.");
      return;
    }
    const newSubtotal = removeDraftItems.reduce((s, it) => s + it.qty * it.price, 0);
    const newDiscount = Math.min(removeItemTarget.discount || 0, newSubtotal); // re-clamp discount so it never exceeds the smaller subtotal
    const newTotal = Math.max(0, newSubtotal - newDiscount);
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === removeItemTarget.id
      ? { ...o, items: removeDraftItems, subtotal: newSubtotal, discount: newDiscount, total: newTotal }
      : o)));
    setRemoveItemTarget(null); setRemoveDraftItems([]);
  };

  // --- Discount ---
  const openDiscount = (order) => { setDiscountTarget(order); setDiscountType("flat"); setDiscountValue(order.discount ? String(order.discount) : ""); };
  const confirmDiscount = () => {
    const order = discountTarget;
    const subtotal = order.subtotal != null ? order.subtotal : order.total;
    let discountAmt = Number(discountValue) || 0;
    if (discountType === "percent") discountAmt = Math.round(subtotal * (discountAmt / 100));
    discountAmt = Math.min(Math.max(0, discountAmt), subtotal); // clamp between 0 and subtotal
    const newTotal = subtotal - discountAmt;
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === order.id ? { ...o, subtotal, discount: discountAmt, total: newTotal, discountBy: currentUser?.name || "Unknown" } : o)));
    logAudit(currentUser?.name, "DISCOUNT_APPLIED", { orderId: order.id, table: order.tableName, subtotal, discountAmt, newTotal });
    setDiscountTarget(null);
  };

  const advance = (order) => {
    const flow = ["placed", "preparing", "ready", "served", "paid"];
    const next = flow[flow.indexOf(order.status) + 1];
    if (!next) return;
    if (next === "paid") { setPayOrder(order); return; } // don't finalize yet — need payment method
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
  };

  const [creditStep, setCreditStep] = useState(null); // order awaiting a customer to attach the credit sale to
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [creditNewName, setCreditNewName] = useState("");
  const [creditNewPhone, setCreditNewPhone] = useState("");
  const [creditMode, setCreditMode] = useState("existing"); // "existing" CRM customer or "new" one entered on the spot

  const settlePayment = (order, method, customerOverride) => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Reopen it before taking payment."); return; }
    if (method === "credit") { setCreditStep(order); setCreditCustomerId(""); setCreditNewName(""); setCreditNewPhone(""); setCreditMode("existing"); return; } // needs a customer first
    finalizeSettlement(order, method, customerOverride);
  };

  const [paying, setPaying] = useState(false);

  // Payment is ONE atomic server call: stock, ledger, COGS, table, loyalty, credit-book.
  // The server is idempotent, so a double-tap can't deduct ingredients twice.
  const finalizeSettlement = async (order, method, customerNameOverride, customerId = null) => {
    if (paying) return false;
    const freshOrder = orders.find((o) => o.id === order.id) || order;
    if (freshOrder.status === "paid") { setPayOrder(null); return true; }
    setPaying(true);
    try {
      const { data, error } = await supabase.rpc("pay_order", {
        p_order_id: freshOrder.id,
        p_method: method,
        p_actor_id: currentUser?.id,
        p_customer_name: customerNameOverride || freshOrder.customerName || null,
        p_customer_id: customerId,
      });
      if (error) throw error;
      logAudit(currentUser?.name, "ORDER_PAID", { orderId: freshOrder.id, total: freshOrder.total, paymentMethod: method, cogs: data?.cogs_total, inventoryLines: data?.movement_count });
      await refreshData(freshOrder.id);
      setPayOrder(null);
      const warnings = [];
      if (data?.negative_stock_items?.length) warnings.push("Stock went negative for: " + data.negative_stock_items.join(", ") + ". Check inventory counts.");
      if (data?.uncosted_lines) warnings.push(data.uncosted_lines + " ingredient line(s) have no cost yet, so COGS for this bill is understated. Record a purchase for them.");
      if (data?.skipped_lines) warnings.push(data.skipped_lines + " recipe ingredient(s) no longer exist in Inventory and were skipped.");
      if (warnings.length) alert("Bill paid.\n\n" + warnings.join("\n\n"));
      return true;
    } catch (e) {
      alert("Payment was NOT recorded: " + (e.message || e) + "\n\nNothing was changed. Please try again.");
      return false;
    } finally {
      setPaying(false);
    }
  };

  const confirmCreditSale = async () => {
    const order = creditStep;
    let customerId = creditCustomerId;
    let customerName = "";

    if (creditMode === "existing") {
      const cust = customers.find((c) => c.id === creditCustomerId);
      if (!cust) { alert("Select a customer to attach this credit sale to."); return; }
      customerName = cust.name;
    } else {
      if (!creditNewName.trim()) { alert("Enter the customer's name."); return; }
      const newCust = { id: uid(), name: creditNewName.trim(), phone: creditNewPhone.trim(), notes: "", visits: 0, points: 0, referralCode: creditNewName.replace(/\s/g, "").slice(0, 6).toUpperCase() + Math.floor(Math.random() * 90 + 10) };
      // insert just this one row (awaited) so the server function can find it
      const { error } = await supabase.from("customers").insert(TABLE_MAP.customers.toDb(newCust));
      if (error) { alert("Couldn't create the customer: " + error.message); return; }
      customerId = newCust.id;
      customerName = newCust.name;
    }

    // the server writes the credit-book entry as part of the same transaction
    const ok = await finalizeSettlement(order, "credit", customerName, customerId);
    if (ok) {
      logAudit(currentUser?.name, "CREDIT_SALE", { orderId: order.id, customerName, amount: order.total });
      setCreditStep(null);
    }
  };

  const cancelOrder = (order) => {
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o)));
    setTables(tables.map((t) => (t.id === order.tableId ? { ...t, status: "free", orderId: null } : t)));
  };
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const openCancel = (order) => {
    if (order.status === "paid") {
      if (!canManageMoney) return; // safety check — paid-bill voiding is Owner/Manager only
      setVoidTarget(order); setVoidReason(""); return;
    }
    cancelOrder(order); // not-yet-paid orders cancel instantly, same as before — any role can do this
  };

  const confirmVoid = async () => {
    if (!voidReason.trim()) return;
    const order = voidTarget;
    try {
      // server restores stock from the ledger, reverses loyalty and the credit-book entry, atomically
      const { error } = await supabase.rpc("void_order", { p_order_id: order.id, p_reason: voidReason.trim(), p_actor_id: currentUser?.id });
      if (error) throw error;
      logAudit(currentUser?.name, "BILL_VOIDED", { orderId: order.id, table: order.tableName, total: order.total, reason: voidReason.trim() });
      await refreshData(order.id);
      setVoidTarget(null);
    } catch (e) {
      alert("Void was NOT recorded: " + (e.message || e) + "\n\nNothing was changed.");
    }
  };

  const visible = orders
    .filter((o) => filter === "active" ? !["paid", "cancelled"].includes(o.status) : true)
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first, explicit — never rely on array order alone
  const toneFor = { placed: "warn", preparing: "gold", ready: "good", served: "neutral", paid: "good", cancelled: "bad" };
  const nextLabel = { placed: "Send to Kitchen", preparing: "Mark Ready", ready: "Mark Served", served: "Mark Paid" };

  // group orders by calendar day so it's obvious which day you're looking at without exporting anything
  const dateLabel = (dateStr) => {
    const d = dateStr.slice(0, 10);
    if (d === today()) return "Today";
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === yesterday) return "Yesterday";
    return new Date(dateStr).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  };
  const timeLabel = (dateStr) => new Date(dateStr).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const groupedByDay = useMemo(() => {
    const groups = {};
    visible.forEach((o) => {
      const key = o.createdAt ? o.createdAt.slice(0, 10) : "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(o);
    });
    // sort explicitly by date descending — never rely on insertion order being correct
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = orders.map((o) => ({
      Date: o.createdAt ? o.createdAt.slice(0, 10) : "",
      Time: o.createdAt ? new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
      "Paid At": o.paidAt ? new Date(o.paidAt).toLocaleString() : "",
      Table: o.tableName, Source: o.source, Status: o.status,
      Items: o.items.map((it) => `${it.qty}x ${it.name}`).join(", "),
      "Payment Method": PAYMENT_METHODS.find((p) => p.id === o.paymentMethod)?.label || "",
      "Subtotal (Rs)": o.subtotal != null ? o.subtotal : o.total,
      "Discount (Rs)": o.discount || 0,
      "Total (Rs)": o.total,
      "Voided After Payment": o.cancelledFromPaid ? "Yes" : "",
      "Cancel Reason": o.cancelReason || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Orders");
    XLSX.writeFile(wb, `parijat-cafe-orders-${today()}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant={filter === "active" ? "gold" : "ghost"} onClick={() => setFilter("active")}>Active</Btn>
          <Btn variant={filter === "all" ? "gold" : "ghost"} onClick={() => setFilter("all")}>All</Btn>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
          <Btn variant="primary" disabled={businessDay.status !== "open"} onClick={() => setModal(true)}><Plus size={15} /> New Order</Btn>
        </div>
      </div>

      {visible.length === 0 ? <Card style={{ padding: 20 }}><Empty text="No orders here yet." /></Card> : (
        <div style={{ display: "grid", gap: 22 }}>
          {groupedByDay.map(([dateKey, dayOrders]) => (
            <div key={dateKey}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <strong style={{ fontSize: 13, color: T.dusk }}>{dateLabel(dayOrders[0].createdAt)}</strong>
                <span style={{ fontSize: 11.5, color: T.plum, opacity: 0.6 }}>{new Date(dayOrders[0].createdAt).toLocaleDateString()}</span>
                <Pill>{dayOrders.length} order{dayOrders.length !== 1 ? "s" : ""}</Pill>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                {dayOrders.map((o) => (
                  <Card key={o.id} style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                          <strong style={{ fontFamily: "inherit", color: T.dusk }}>{o.tableName}</strong>
                          <Pill tone={toneFor[o.status]}>{o.status}</Pill>
                          {o.source !== "dine-in" && <Pill>{o.source}</Pill>}
                          {o.status === "paid" && o.paymentMethod && (
                            <Pill tone="gold">{PAYMENT_METHODS.find((p) => p.id === o.paymentMethod)?.label || o.paymentMethod}</Pill>
                          )}
                          {o.status === "cancelled" && o.cancelledFromPaid && <Pill tone="bad">Voided after payment</Pill>}
                          {o.discount > 0 && <Pill tone="good">Discount applied</Pill>}
                        </div>
                        <div style={{ fontSize: 11.5, color: T.plum, opacity: 0.65, marginBottom: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span>Placed {timeLabel(o.createdAt)}</span>
                          {o.status === "paid" && o.paidAt && <span>· Paid {timeLabel(o.paidAt)}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: T.plum }}>
                          {o.items.map((it) => `${it.qty}× ${it.name}`).join(", ")}
                        </div>
                        {o.discount > 0 && (
                          <div style={{ fontSize: 12, color: T.plum, opacity: 0.75, marginTop: 4 }}>
                            Subtotal {money(o.subtotal != null ? o.subtotal : o.total)} · Discount −{money(o.discount)}{o.discountBy && ` (by ${o.discountBy})`}
                          </div>
                        )}
                        {o.cancelReason && <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>Reason: {o.cancelReason}{o.voidedBy && ` — voided by ${o.voidedBy}`}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontFamily: "inherit", color: T.dusk, marginBottom: 8 }}>{money(o.total)}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {!["paid", "cancelled"].includes(o.status) && <Btn variant="ghost" onClick={() => openAddItem(o)}><Plus size={14} /> Add Item</Btn>}
                          {!["paid", "cancelled"].includes(o.status) && o.items.length > 0 && <Btn variant="ghost" onClick={() => openRemoveItem(o)}><Trash2 size={13} /> Remove Item</Btn>}
                          {!["paid", "cancelled"].includes(o.status) && canManageMoney && <Btn variant="ghost" onClick={() => openDiscount(o)}>Discount</Btn>}
                          {nextLabel[o.status] && <Btn variant="gold" onClick={() => advance(o)}>{nextLabel[o.status]}</Btn>}
                          {o.status !== "cancelled" && (o.status !== "paid" || canManageMoney) && <Btn variant="danger" onClick={() => openCancel(o)}>{o.status === "paid" ? "Void Bill" : "Cancel"}</Btn>}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title="New Order" onClose={() => setModal(false)} width={640}>
          <Field label="Table">
            <select style={inputStyle} value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="">Select a table</option>
              {tables.filter((t) => t.status === "free").map((t) => <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>)}
            </select>
          </Field>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.plum, opacity: 0.5 }} />
            <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="Search menu…" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {menu.filter((m) => m.available && m.name.toLowerCase().includes(itemSearch.toLowerCase())).map((m) => (
                <div key={m.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: T.gold, marginTop: 2 }}>{money(m.price)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <button onClick={() => removeFromCart(m)} style={{ border: `1px solid ${T.line}`, background: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>–</button>
                    <span style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{cart[m.id] || 0}</span>
                    <button onClick={() => addToCart(m)} style={{ border: "none", background: T.dusk, color: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontFamily: "inherit", fontSize: 16 }}>Total: {money(cartTotal)}</strong>
            <Btn variant="primary" onClick={placeOrder} disabled={!tableId || cartTotal === 0}>Place Order</Btn>
          </div>
        </Modal>
      )}

      {payOrder && (
        <Modal title={`Settle ${payOrder.tableName} · ${money(payOrder.total)}`} onClose={() => setPayOrder(null)} width={380}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>Choose how the guest paid to close out this order.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {PAYMENT_METHODS.map((p) => (
              <button
                key={p.id}
                onClick={() => settlePayment(payOrder, p.id)}
                style={{
                  padding: "14px 10px", borderRadius: 8, border: `1px solid ${T.line}`, background: "#fff",
                  cursor: "pointer", fontSize: 13.5, fontWeight: 600, color: T.dusk, textAlign: "center",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = T.gold)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = T.line)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {creditStep && (
        <Modal title={`Credit Sale · ${creditStep.tableName} · ${money(creditStep.total)}`} onClose={() => setCreditStep(null)} width={440}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>
            This amount goes on the customer's tab instead of being collected now. It'll show up in the Credit Book until they pay it back.
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Btn variant={creditMode === "existing" ? "gold" : "ghost"} onClick={() => setCreditMode("existing")} style={{ flex: 1, justifyContent: "center" }}>Existing customer</Btn>
            <Btn variant={creditMode === "new" ? "gold" : "ghost"} onClick={() => setCreditMode("new")} style={{ flex: 1, justifyContent: "center" }}>New customer</Btn>
          </div>
          {creditMode === "existing" ? (
            <Field label="Customer">
              <select style={inputStyle} value={creditCustomerId} onChange={(e) => setCreditCustomerId(e.target.value)}>
                <option value="">Select customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ""}</option>)}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Customer Name"><input autoFocus style={inputStyle} value={creditNewName} onChange={(e) => setCreditNewName(e.target.value)} /></Field>
              <Field label="Phone"><input style={inputStyle} value={creditNewPhone} onChange={(e) => setCreditNewPhone(e.target.value)} placeholder="Optional" /></Field>
            </>
          )}
          <Btn variant="primary" onClick={confirmCreditSale} style={{ width: "100%", justifyContent: "center" }}>Confirm Credit Sale</Btn>
        </Modal>
      )}

      {voidTarget && (
        <Modal title={`Void Bill · ${voidTarget.tableName} · ${money(voidTarget.total)}`} onClose={() => setVoidTarget(null)} width={420}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>
            This bill was already marked Paid. Voiding it removes it from your sales and bank/cash totals, and reverses any loyalty points earned. A reason is required for the record.
          </div>
          <Field label="Reason for voiding">
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="e.g. Entered wrong table, guest complaint, duplicate bill…"
              autoFocus
            />
          </Field>
          <Btn variant="danger" onClick={confirmVoid} disabled={!voidReason.trim()} style={{ width: "100%", justifyContent: "center" }}>Confirm Void</Btn>
        </Modal>
      )}

      {addItemTarget && (
        <Modal title={`Add Item · ${addItemTarget.tableName}`} onClose={() => setAddItemTarget(null)} width={640}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 12 }}>
            These get added to the same bill. The ticket will reappear on Kitchen/Bar Display so the new item gets prepared.
          </div>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.plum, opacity: 0.5 }} />
            <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="Search menu…" value={addItemSearch} onChange={(e) => setAddItemSearch(e.target.value)} autoFocus />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto", marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {menu.filter((m) => m.available && m.name.toLowerCase().includes(addItemSearch.toLowerCase())).map((m) => (
                <div key={m.id} style={{ border: `1px solid ${T.line}`, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: T.gold, marginTop: 2 }}>{money(m.price)}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                    <button onClick={() => removeFromAddCart(m)} style={{ border: `1px solid ${T.line}`, background: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>–</button>
                    <span style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{addCart[m.id] || 0}</span>
                    <button onClick={() => addToAddCart(m)} style={{ border: "none", background: T.dusk, color: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontFamily: "inherit", fontSize: 16 }}>Adding: {money(addCartTotal)}</strong>
            <Btn variant="primary" onClick={confirmAddItems} disabled={addCartTotal === 0}>Add to Bill</Btn>
          </div>
        </Modal>
      )}

      {removeItemTarget && (
        <Modal title={`Remove Item · ${removeItemTarget.tableName}`} onClose={() => { setRemoveItemTarget(null); setRemoveDraftItems([]); }} width={480}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>
            Take an item off this bill without voiding the whole order. If a discount was applied, it's rechecked so it never exceeds the new subtotal.
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 14 }}>
            {removeDraftItems.length === 0 ? (
              <Empty text="No items left — close this and use Cancel or Void Bill instead." />
            ) : removeDraftItems.map((it) => (
              <div key={it.menuId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 4px", borderBottom: `1px solid ${T.line}` }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{it.name}</div>
                  <div style={{ fontSize: 11.5, color: T.plum, opacity: 0.7 }}>{money(it.price)} each</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button onClick={() => decreaseDraftQty(it.menuId)} style={{ border: `1px solid ${T.line}`, background: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>–</button>
                  <span style={{ minWidth: 16, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{it.qty}</span>
                  <button onClick={() => increaseDraftQty(it.menuId)} style={{ border: "none", background: T.dusk, color: "#fff", borderRadius: 6, width: 26, height: 26, cursor: "pointer" }}>+</button>
                  <button onClick={() => dropDraftItem(it.menuId)} style={{ background: "none", border: "none", cursor: "pointer", color: T.red, marginLeft: 4 }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontFamily: "inherit", fontSize: 16 }}>New Subtotal: {money(removeDraftTotal)}</strong>
            <Btn variant="danger" onClick={confirmRemoveItems} disabled={removeDraftItems.length === 0}>Save Changes</Btn>
          </div>
        </Modal>
      )}

      {discountTarget && (
        <Modal title={`Discount · ${discountTarget.tableName}`} onClose={() => setDiscountTarget(null)} width={380}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>
            Subtotal: {money(discountTarget.subtotal != null ? discountTarget.subtotal : discountTarget.total)}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Btn variant={discountType === "flat" ? "gold" : "ghost"} onClick={() => setDiscountType("flat")} style={{ flex: 1, justifyContent: "center" }}>Flat Rs</Btn>
            <Btn variant={discountType === "percent" ? "gold" : "ghost"} onClick={() => setDiscountType("percent")} style={{ flex: 1, justifyContent: "center" }}>Percentage %</Btn>
          </div>
          <Field label={discountType === "flat" ? "Discount Amount (Rs)" : "Discount (%)"}>
            <input type="number" style={inputStyle} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} autoFocus />
          </Field>
          <Btn variant="primary" onClick={confirmDiscount} style={{ width: "100%", justifyContent: "center" }}>Apply Discount</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= KDS ================= */
function KDS({ orders, setOrders, tables, setTables, menu }) {
  const [station, setStation] = useState("kitchen"); // "kitchen" or "bar"
  const cols = [
    { key: "placed", label: "New", icon: Clock },
    { key: "preparing", label: "Preparing", icon: Flame },
    { key: "ready", label: "Ready to Serve", icon: Check },
  ];
  const advance = (order, to) => {
    setOrders((currentOrders) => currentOrders.map((o) => (o.id === order.id ? { ...o, status: to } : o)));
  };

  const stationOf = (menuId) => menu.find((m) => m.id === menuId)?.station || "kitchen";
  // only show orders that actually contain at least one item for the selected station,
  // and within the ticket only list that station's items
  const relevantItems = (o) => o.items.filter((it) => stationOf(it.menuId) === station);
  const ordersForStation = (status) => orders.filter((o) => o.status === status && relevantItems(o).length > 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <Btn variant={station === "kitchen" ? "gold" : "ghost"} onClick={() => setStation("kitchen")}>Kitchen</Btn>
        <Btn variant={station === "bar" ? "gold" : "ghost"} onClick={() => setStation("bar")}>Bar & Beverage</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))", gap: 16 }}>
        {cols.map((col) => {
          const colOrders = ordersForStation(col.key);
          return (
            <div key={col.key}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <col.icon size={16} color={T.gold} />
                <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk }}>{col.label}</h3>
                <Pill>{colOrders.length}</Pill>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {colOrders.map((o) => {
                  const items = relevantItems(o);
                  const hasOtherStationItems = o.items.length > items.length;
                  return (
                    <Card key={o.id} style={{ padding: 14, borderLeft: `4px solid ${T.gold}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <strong>{o.tableName}</strong>
                        <span style={{ fontSize: 11, color: T.plum, opacity: 0.6 }}>{new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <ul style={{ fontSize: 13, color: T.plum, marginBottom: 8, paddingLeft: 16 }}>
                        {items.map((it, i) => <li key={i}>{it.qty}× {it.name}</li>)}
                      </ul>
                      {hasOtherStationItems && (
                        <div style={{ fontSize: 11, color: T.plum, opacity: 0.6, marginBottom: 10 }}>
                          This order also has items on the {station === "kitchen" ? "Bar" : "Kitchen"} board.
                        </div>
                      )}
                      {col.key === "placed" && <Btn variant="gold" onClick={() => advance(o, "preparing")} style={{ width: "100%", justifyContent: "center" }}>Start Preparing</Btn>}
                      {col.key === "preparing" && <Btn variant="gold" onClick={() => advance(o, "ready")} style={{ width: "100%", justifyContent: "center" }}>Mark Ready</Btn>}
                      {col.key === "ready" && <Btn variant="primary" onClick={() => advance(o, "served")} style={{ width: "100%", justifyContent: "center" }}>Mark Served</Btn>}
                    </Card>
                  );
                })}
                {colOrders.length === 0 && <div style={{ fontSize: 12.5, color: T.plum, opacity: 0.5, padding: "10px 0" }}>Nothing here.</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================= TABLE & SPACE ================= */
function TablesView({ tables, setTables, orders }) {
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(4);
  const toneFor = { free: "good", occupied: "bad", reserved: "warn" };

  const addTable = () => {
    if (!name) return;
    setTables([...tables, { id: uid(), name, capacity: Number(capacity), status: "free", orderId: null }]);
    setName(""); setCapacity(4); setModal(false);
  };
  const toggleReserve = (t) => {
    setTables(tables.map((x) => x.id === t.id ? { ...x, status: x.status === "reserved" ? "free" : x.status === "free" ? "reserved" : x.status } : x));
  };
  const removeTable = (t) => setTables(tables.filter((x) => x.id !== t.id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Add Table</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px,1fr))", gap: 14 }}>
        {tables.map((t) => {
          const order = orders.find((o) => o.id === t.orderId);
          return (
            <Card key={t.id} style={{ padding: 16, borderTop: `3px solid ${t.status === "occupied" ? T.red : t.status === "reserved" ? T.gold : T.sage}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <strong style={{ fontFamily: "inherit", fontSize: 18, color: T.dusk }}>{t.name}</strong>
                <button onClick={() => removeTable(t)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button>
              </div>
              <div style={{ fontSize: 12, color: T.plum, opacity: 0.7, marginBottom: 8 }}>Seats {t.capacity}</div>
              <Pill tone={toneFor[t.status]}>{t.status}</Pill>
              {order && <div style={{ fontSize: 11.5, color: T.plum, marginTop: 8 }}>{money(order.total)} · {order.status}</div>}
              {t.status !== "occupied" && (
                <div style={{ marginTop: 10 }}>
                  <Btn variant="ghost" onClick={() => toggleReserve(t)} style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                    {t.status === "reserved" ? "Clear reservation" : "Reserve"}
                  </Btn>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {modal && (
        <Modal title="Add Table" onClose={() => setModal(false)}>
          <Field label="Table Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. T11 or Courtyard-1" /></Field>
          <Field label="Seating Capacity"><input type="number" style={inputStyle} value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
          <Btn variant="primary" onClick={addTable} style={{ width: "100%", justifyContent: "center" }}>Add Table</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= INVENTORY & WASTE ================= */
function Inventory({ inventory, setInventory, waste, setWaste, businessDay }) {
  const [tab, setTab] = useState("stock");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", stock: "", reorder: "" });
  const [wasteForm, setWasteForm] = useState({ itemId: "", qty: "", reason: "" });
  const [wasteModal, setWasteModal] = useState(false);

  const addItem = () => {
    if (!form.name) return;
    setInventory([...inventory, { id: uid(), name: form.name, unit: form.unit, stock: Number(form.stock) || 0, reorder: Number(form.reorder) || 0, avgCost: 0 }]);
    setForm({ name: "", unit: "kg", stock: "", reorder: "" }); setModal(false);
  };
  const adjustStock = (id, delta) => setInventory(inventory.map((i) => i.id === id ? { ...i, stock: Math.max(0, i.stock + delta) } : i));
  const removeItem = (id) => setInventory(inventory.filter((i) => i.id !== id));

  const logWaste = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before logging waste."); return; }
    const item = inventory.find((i) => i.id === wasteForm.itemId);
    if (!item || !wasteForm.qty) return;
    setWaste([...waste, { id: uid(), itemName: item.name, qty: Number(wasteForm.qty), unit: item.unit, reason: wasteForm.reason || "Unspecified", date: today() }]);
    setInventory(inventory.map((i) => i.id === item.id ? { ...i, stock: Math.max(0, i.stock - Number(wasteForm.qty)) } : i));
    setWasteForm({ itemId: "", qty: "", reason: "" }); setWasteModal(false);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const stockSheet = inventory.map((i) => ({ Item: i.name, Stock: i.stock, Unit: i.unit, "Average Cost (Rs)": Number(i.avgCost || 0), "Stock Value (Rs)": Number(i.stock || 0) * Number(i.avgCost || 0), "Reorder Level": i.reorder, Status: i.stock <= i.reorder ? "Reorder now" : "Healthy" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stockSheet), "Stock");
    const wasteSheet = waste.map((w) => ({ Date: w.date, Item: w.itemName, Quantity: w.qty, Unit: w.unit, Reason: w.reason }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wasteSheet), "Waste Log");
    XLSX.writeFile(wb, `parijat-cafe-inventory-${today()}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant={tab === "stock" ? "gold" : "ghost"} onClick={() => setTab("stock")}>Stock</Btn>
          <Btn variant={tab === "waste" ? "gold" : "ghost"} onClick={() => setTab("waste")}>Waste Log</Btn>
        </div>
        {tab === "stock" ? <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Add Item</Btn> : <Btn variant="primary" onClick={() => setWasteModal(true)}><Plus size={15} /> Log Waste</Btn>}
      </div>

      {tab === "stock" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>Item</th><th>Stock</th><th>Avg Cost</th><th>Stock Value</th><th>Reorder Level</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {inventory.map((i) => (
                <tr key={i.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{i.name}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={() => adjustStock(i.id, -1)} style={{ border: `1px solid ${T.line}`, background: "#fff", borderRadius: 5, width: 22, height: 22, cursor: "pointer" }}>–</button>
                      {i.stock} {i.unit}
                      <button onClick={() => adjustStock(i.id, 1)} style={{ border: "none", background: T.dusk, color: "#fff", borderRadius: 5, width: 22, height: 22, cursor: "pointer" }}>+</button>
                    </div>
                  </td>
                  <td>{money(i.avgCost || 0)} / {i.unit}</td>
                  <td>{money(Number(i.stock || 0) * Number(i.avgCost || 0))}</td>
                  <td>{i.reorder} {i.unit}</td>
                  <td>{i.stock <= i.reorder ? <Pill tone="bad">Reorder now</Pill> : <Pill tone="good">Healthy</Pill>}</td>
                  <td><button onClick={() => removeItem(i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "waste" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {waste.length === 0 ? <Empty text="No waste logged. Good sign." /> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
                <th style={{ padding: "10px 14px" }}>Item</th><th>Qty</th><th>Reason</th><th>Date</th>
              </tr></thead>
              <tbody>
                {waste.slice().reverse().map((w) => (
                  <tr key={w.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "10px 14px" }}>{w.itemName}</td>
                    <td>{w.qty} {w.unit}</td>
                    <td>{w.reason}</td>
                    <td style={{ color: T.plum, opacity: 0.7 }}>{w.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {modal && (
        <Modal title="Add Inventory Item" onClose={() => setModal(false)}>
          <Field label="Item Name"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Unit">
            <select style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
              <option>kg</option><option>g</option><option>L</option><option>ml</option><option>pcs</option>
            </select>
          </Field>
          <Field label="Current Stock"><input type="number" style={inputStyle} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>
          <Field label="Reorder Level"><input type="number" style={inputStyle} value={form.reorder} onChange={(e) => setForm({ ...form, reorder: e.target.value })} /></Field>
          <Btn variant="primary" onClick={addItem} style={{ width: "100%", justifyContent: "center" }}>Add Item</Btn>
        </Modal>
      )}
      {wasteModal && (
        <Modal title="Log Waste" onClose={() => setWasteModal(false)}>
          <Field label="Item">
            <select style={inputStyle} value={wasteForm.itemId} onChange={(e) => setWasteForm({ ...wasteForm, itemId: e.target.value })}>
              <option value="">Select item</option>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </Field>
          <Field label="Quantity Wasted"><input type="number" style={inputStyle} value={wasteForm.qty} onChange={(e) => setWasteForm({ ...wasteForm, qty: e.target.value })} /></Field>
          <Field label="Reason"><input style={inputStyle} value={wasteForm.reason} onChange={(e) => setWasteForm({ ...wasteForm, reason: e.target.value })} placeholder="Spoilage, over-prep, spillage…" /></Field>
          <Btn variant="primary" onClick={logWaste} style={{ width: "100%", justifyContent: "center" }}>Log Waste</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= ACCOUNTING ================= */
function Accounting({ expenses, setExpenses, orders, purchases, cashDeposits, setCashDeposits, businessDay, creditTransactions, currentUser, inventoryMovements }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category: "Ingredients", description: "", amount: "", paymentMethod: "cash" });
  const [depositModal, setDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNotes, setDepositNotes] = useState("");
  const [detail, setDetail] = useState(null);
  const [pnlModal, setPnlModal] = useState(false);
  const [pnlFrom, setPnlFrom] = useState(businessDay?.date || today());
  const [pnlTo, setPnlTo] = useState(businessDay?.date || today());

  const revenue = orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.total || 0), 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPurchaseSpend = purchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const consumedItemIdsAll = new Set((inventoryMovements || []).filter((m) => m.type === "sale_cogs" || m.type === "void_reversal").map((m) => m.itemId));
  const recipeCogsAll = Math.max(0, -(inventoryMovements || []).filter((m) => m.type === "sale_cogs" || m.type === "void_reversal").reduce((s, m) => s + Number(m.totalCost || 0), 0));
  // Recipe-tracked ingredients use actual consumed cost. Historical/untracked
  // stock purchases continue to contribute their legacy COGS amount.
  const legacyCogsForUntrackedAll = purchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) === "cogs" && !consumedItemIdsAll.has(p.itemId)).reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const actualCogsAll = recipeCogsAll + legacyCogsForUntrackedAll;
  const operatingPurchasesAll = purchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) !== "cogs").reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const netProfit = revenue - actualCogsAll - totalExpense - operatingPurchasesAll;
  const totalDeposited = cashDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);

  const addExpense = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before adding an expense."); return; }
    if (!form.amount) return;
    setExpenses([...expenses, { id: uid(), category: form.category, description: form.description, amount: Number(form.amount), date: today(), paymentMethod: form.paymentMethod }]);
    setForm({ category: "Ingredients", description: "", amount: "", paymentMethod: "cash" }); setModal(false);
  };
  const removeExpense = (id) => setExpenses(expenses.filter((e) => e.id !== id));

  const addDeposit = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before logging a cash deposit."); return; }
    if (!depositAmount) return;
    setCashDeposits([...cashDeposits, { id: uid(), amount: Number(depositAmount), notes: depositNotes, date: today() }]);
    logAudit(currentUser?.name, "CASH_DEPOSIT", { amount: Number(depositAmount), notes: depositNotes });
    setDepositAmount(""); setDepositNotes(""); setDepositModal(false);
  };
  const removeDeposit = (id) => setCashDeposits(cashDeposits.filter((d) => d.id !== id));

  const paidOrders = orders.filter((o) => o.status === "paid");
  const creditRepayments = (creditTransactions || []).filter((c) => c.type === "repayment");
  const creditOutstanding = (creditTransactions || []).reduce((s, c) => s + (c.type === "sale" ? Number(c.amount || 0) : -Number(c.amount || 0)), 0);

  const methodBreakdown = PAYMENT_METHODS.filter((p) => p.id !== "credit").map((p) => {
    const moneyInFromOrders = paidOrders.filter((o) => o.paymentMethod === p.id).reduce((s, o) => s + Number(o.total || 0), 0);
    const moneyInFromRepayments = creditRepayments.filter((c) => c.paymentMethod === p.id).reduce((s, c) => s + Number(c.amount || 0), 0);
    const moneyIn = moneyInFromOrders + moneyInFromRepayments;
    const expenseOut = expenses.filter((e) => e.paymentMethod === p.id).reduce((s, e) => s + Number(e.amount || 0), 0);
    const purchaseOut = purchases.filter((pu) => pu.paymentMethod === p.id).reduce((s, pu) => s + Number(pu.totalCost || 0), 0);
    return { ...p, in: moneyIn, out: expenseOut + purchaseOut, net: moneyIn - expenseOut - purchaseOut };
  }).filter((p) => p.in > 0 || p.out > 0);

  const cashBalance = (methodBreakdown.find((p) => p.id === "cash")?.net || 0) - totalDeposited;
  const bankBalance = methodBreakdown.filter((p) => p.id !== "cash").reduce((s, p) => s + p.net, 0) + totalDeposited;

  const exportToExcel = (scope) => {
    const scoped = (arr, dateField = "date") => scope === "today" ? arr.filter((r) => (r[dateField] || "").slice(0, 10) === today()) : arr;
    const scopedOrders = scoped(paidOrders, "createdAt");
    const scopedExpenses = scoped(expenses);
    const scopedPurchases = scoped(purchases);
    const scopedMovements = (inventoryMovements || []).filter((m) => scope === "today" ? (m.date || m.createdAt || "").slice(0, 10) === today() : true);
    const scopedDeposits = scoped(cashDeposits);
    const scopedRepayments = scoped(creditRepayments);
    const rev = scopedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const exp = scopedExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const pur = scopedPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const consumedItemIdsScoped = new Set(scopedMovements.filter((m) => m.type === "sale_cogs" || m.type === "void_reversal").map((m) => m.itemId));
    const recipeCogs = Math.max(0, -scopedMovements.filter((m) => m.type === "sale_cogs" || m.type === "void_reversal").reduce((s, m) => s + Number(m.totalCost || 0), 0));
    const legacyCogsForUntracked = scopedPurchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) === "cogs" && !consumedItemIdsScoped.has(p.itemId)).reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const actualCogs = recipeCogs + legacyCogsForUntracked;
    const operatingPurchaseTotal = scopedPurchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) !== "cogs").reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const netAccounting = rev - exp - actualCogs - operatingPurchaseTotal;
    const dep = scopedDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
    const cashIn = scopedOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + Number(o.total || 0), 0) + scopedRepayments.filter((c) => c.paymentMethod === "cash").reduce((s, c) => s + Number(c.amount || 0), 0);
    const cashOut = scopedExpenses.filter((e) => e.paymentMethod === "cash").reduce((s, e) => s + Number(e.amount || 0), 0) + scopedPurchases.filter((p) => p.paymentMethod === "cash").reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const bankIn = scopedOrders.filter((o) => o.paymentMethod !== "cash" && o.paymentMethod !== "credit").reduce((s, o) => s + Number(o.total || 0), 0) + scopedRepayments.filter((c) => c.paymentMethod !== "cash").reduce((s, c) => s + Number(c.amount || 0), 0);
    const bankOut = scopedExpenses.filter((e) => e.paymentMethod !== "cash").reduce((s, e) => s + Number(e.amount || 0), 0) + scopedPurchases.filter((p) => p.paymentMethod !== "cash").reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const wb = XLSX.utils.book_new();
    const summarySheet = [
      { Metric: scope === "today" ? "Revenue Today (Rs)" : "Total Revenue (Rs)", Value: rev },
      { Metric: scope === "today" ? "Expenses Today (Rs)" : "Total Expenses (Rs)", Value: exp },
      { Metric: scope === "today" ? "Purchases Today (Rs)" : "Total Purchases (Rs)", Value: pur },
      { Metric: scope === "today" ? "Net Today (Rs)" : "Net Profit (Rs)", Value: netAccounting },
      { Metric: "Cash Deposited to Bank (Rs)", Value: dep },
      { Metric: "Cash Movement — In (Rs)", Value: cashIn }, { Metric: "Cash Movement — Out (Rs)", Value: cashOut },
      { Metric: "Bank Movement — In (Rs)", Value: bankIn }, { Metric: "Bank Movement — Out (Rs)", Value: bankOut },
      { Metric: "Credit Outstanding right now (Rs)", Value: creditOutstanding },
    ];
    if (scope === "all") { summarySheet.push({ Metric: "Cash in Hand right now (Rs)", Value: cashBalance }); summarySheet.push({ Metric: "Bank Balance right now (Rs)", Value: bankBalance }); }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");
    const expenseSheet = scopedExpenses.map((e) => ({ Date: e.date, Category: e.category, Description: e.description, "Amount (Rs)": e.amount, "Paid Via": PAYMENT_METHODS.find((p) => p.id === e.paymentMethod)?.label || e.paymentMethod }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseSheet), "Expenses");
    if (scopedDeposits.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scopedDeposits.map((d) => ({ Date: d.date, "Amount (Rs)": d.amount, Notes: d.notes }))), "Cash Deposits");
    XLSX.writeFile(wb, `parijat-cafe-accounting-${scope === "today" ? today() : "all"}.xlsx`);
  };

  const inRange = (value, from, to) => { const d = (value || "").slice(0, 10); return d >= from && d <= to; };
  const makePnl = () => {
    const sales = paidOrders.filter((o) => inRange(o.paidAt || o.createdAt, pnlFrom, pnlTo));
    const dayExpenses = expenses.filter((e) => inRange(e.date, pnlFrom, pnlTo));
    const dayPurchases = purchases.filter((p) => inRange(p.date, pnlFrom, pnlTo));
    const income = sales.reduce((s, o) => s + Number(o.total || 0), 0);
    const cogsMovements = (inventoryMovements || []).filter((m) => inRange(m.date || m.createdAt, pnlFrom, pnlTo) && (m.type === "sale_cogs" || m.type === "void_reversal"));
    const hasRecipeCogs = cogsMovements.length > 0;
    const recipeCogs = Math.max(0, -cogsMovements.reduce((s, m) => s + Number(m.totalCost || 0), 0));
    const consumedItemIdsRange = new Set(cogsMovements.map((m) => m.itemId));
    // Recipe-tracked ingredients use actual consumption; untracked stock items
    // retain the legacy purchase-based COGS treatment for this date range.
    const cogsPurchases = dayPurchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) === "cogs" && !consumedItemIdsRange.has(p.itemId));
    const operatingPurchases = dayPurchases.filter((p) => (p.costType || (p.itemId ? "cogs" : "operating")) !== "cogs");
    const cogs = recipeCogs + cogsPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
    const operating = dayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0) + operatingPurchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
    return { sales, dayExpenses, dayPurchases, cogsPurchases, operatingPurchases, cogsMovements, hasRecipeCogs, income, cogs, gross: income - cogs, operating, net: income - cogs - operating };
  };
  const printPnl = () => {
    const r = makePnl();
    const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
    const rows = (arr, name, amount) => arr.length ? arr.map((x) => `<tr><td>${esc(name(x))}</td><td class="num">${money(amount(x))}</td></tr>`).join("") : `<tr><td colspan="2" class="empty">None</td></tr>`;
    const html = `<!doctype html><html><head><title>Parijat Cafe P&L</title><style>body{font-family:Arial,sans-serif;color:#14213D;max-width:760px;margin:0 auto;padding:30px;font-size:13px}h1{margin:0 0 4px}h2{font-size:15px;border-bottom:2px solid #14213D;padding-bottom:5px;margin-top:24px}table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-bottom:1px solid #e5e7eb}.num{text-align:right}.total{font-weight:700;border-top:2px solid #14213D}.profit{font-size:18px;font-weight:700;padding:14px;background:#f6f8fb;margin-top:20px}.empty{color:#9ca3af;font-style:italic}@media print{body{padding:0}}</style></head><body><h1>Parijat Cafe — Profit & Loss Statement</h1><div>From ${esc(pnlFrom)} to ${esc(pnlTo)}</div><h2>INCOME</h2><table><tr><td>Food & Beverage Sales</td><td class="num">${money(r.income)}</td></tr><tr class="total"><td>Total Income</td><td class="num">${money(r.income)}</td></tr></table><h2>COST OF GOODS SOLD</h2><table>${(r.hasRecipeCogs ? rows(r.cogsMovements.filter((m)=>m.type === "sale_cogs"),(m)=>`${m.menuItemName || "Menu item"} — ${m.itemName}`,(m)=>Math.abs(Number(m.totalCost || 0))) : "") + (r.cogsPurchases.length ? rows(r.cogsPurchases,(p)=>`${p.category || "Stock"} — ${p.itemName || p.description || p.supplier || "Purchase"}`,(p)=>p.totalCost) : "") || `<tr><td colspan="2" class="empty">None</td></tr>`}<tr class="total"><td>Total Cost of Goods</td><td class="num">${money(r.cogs)}</td></tr></table><h2>GROSS PROFIT</h2><table><tr class="total"><td>Sales − COGS</td><td class="num">${money(r.gross)}</td></tr></table><h2>OPERATING EXPENSES</h2><table>${rows(r.dayExpenses,(e)=>`${e.category}${e.description?" — "+e.description:""}`,(e)=>e.amount)}${rows(r.operatingPurchases,(p)=>`${p.category || "Other"} — ${p.itemName || "Purchase"}`,(p)=>p.totalCost)}<tr class="total"><td>Total Operating Expenses</td><td class="num">${money(r.operating)}</td></tr></table><div class="profit">NET ${r.net >= 0 ? "PROFIT" : "LOSS"}: ${money(Math.abs(r.net))}</div><p style="color:#6b7280;font-size:11px;margin-top:24px">Generated ${new Date().toLocaleString()}</p><script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank", "width=850,height=900"); if (!w) return alert("Please allow pop-ups to print the P&L report."); w.document.write(html); w.document.close();
  };

  const cardStyle = { padding: 16, cursor: "pointer", transition: "transform .15s, box-shadow .15s" };
  const openDetail = (type) => setDetail(type);
  const detailRows = detail === "revenue" ? paidOrders.map((o) => ({ id: o.id, date: (o.paidAt || o.createdAt || "").slice(0, 16).replace("T", " "), description: `Order ${String(o.id).slice(0, 8)}`, amount: o.total, meta: PAYMENT_METHODS.find((p) => p.id === o.paymentMethod)?.label || o.paymentMethod }))
    : detail === "expenses" ? expenses.map((e) => ({ id: e.id, date: e.date, description: `${e.category}${e.description ? " — " + e.description : ""}`, amount: e.amount, meta: PAYMENT_METHODS.find((p) => p.id === e.paymentMethod)?.label || e.paymentMethod }))
    : detail === "purchases" ? purchases.map((p) => ({ id: p.id, date: p.date, description: p.description || p.supplier || "Purchase", amount: p.totalCost, meta: PAYMENT_METHODS.find((m) => m.id === p.paymentMethod)?.label || p.paymentMethod }))
    : detail === "credit" ? (creditTransactions || []).map((c) => ({ id: c.id, date: c.date, description: c.customerName || c.customer || "Credit", amount: c.type === "sale" ? Number(c.amount || 0) : -Number(c.amount || 0), meta: c.type }))
    : [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
        <Btn variant="gold" onClick={() => { setPnlFrom(businessDay?.date || today()); setPnlTo(businessDay?.date || today()); setPnlModal(true); }}><BarChart3 size={15} /> P&amp;L Report</Btn>
        <Btn variant="ghost" onClick={() => exportToExcel("today")}><Download size={15} /> Export Today</Btn>
        <Btn variant="primary" onClick={() => exportToExcel("all")}><Download size={15} /> Export All</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Card style={cardStyle} onClick={() => openDetail("revenue")}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Revenue</div><div style={{ fontSize: 22, fontWeight: 700, color: "#15803D" }}>{money(revenue)}</div><div style={{ fontSize: 11, color: T.gold, marginTop: 5 }}>Click to view sales →</div></Card>
        <Card style={cardStyle} onClick={() => openDetail("expenses")}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Expenses</div><div style={{ fontSize: 22, fontWeight: 700, color: T.red }}>{money(totalExpense)}</div><div style={{ fontSize: 11, color: T.gold, marginTop: 5 }}>Click to view expenses →</div></Card>
        <Card style={cardStyle} onClick={() => openDetail("purchases")}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Purchases</div><div style={{ fontSize: 22, fontWeight: 700, color: T.red }}>{money(totalPurchaseSpend)}</div><div style={{ fontSize: 11, color: T.gold, marginTop: 5 }}>Click to view purchases →</div></Card>
        <Card style={cardStyle} onClick={() => setPnlModal(true)}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Net Profit</div><div style={{ fontSize: 22, fontWeight: 700, color: netProfit >= 0 ? T.sage : T.red }}>{money(Math.abs(netProfit))}</div><div style={{ fontSize: 11, color: T.gold, marginTop: 5 }}>Click for P&amp;L →</div></Card>
        <Card style={cardStyle} onClick={() => openDetail("credit")}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Credit Outstanding</div><div style={{ fontSize: 22, fontWeight: 700, color: creditOutstanding > 0 ? T.red : T.dusk }}>{money(creditOutstanding)}</div><div style={{ fontSize: 11, color: T.gold, marginTop: 5 }}>Click to view credit →</div></Card>
      </div>

      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 10 }}><div><h3 style={{ fontSize: 15, color: T.dusk, marginBottom: 4 }}>Cash &amp; Bank Reconciliation</h3><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Cash sales minus cash spending vs. everything paid through card/FonePay/eSewa/Khalti/bank transfer.</div></div><Btn variant="gold" onClick={() => setDepositModal(true)}><Plus size={15} /> Log Cash Deposit</Btn></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18, marginTop: 14 }}>
          <div style={{ background: T.cream, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: T.plum }}>Cash in Hand</div><div style={{ fontSize: 20, fontWeight: 700, color: T.dusk }}>{money(cashBalance)}</div></div>
          <div style={{ background: T.cream, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: T.plum }}>Bank Balance</div><div style={{ fontSize: 20, fontWeight: 700, color: T.dusk }}>{money(bankBalance)}</div></div>
          <div style={{ background: T.cream, borderRadius: 10, padding: 14 }}><div style={{ fontSize: 11, color: T.plum }}>Total Deposited</div><div style={{ fontSize: 20, fontWeight: 700, color: T.dusk }}>{money(totalDeposited)}</div></div>
        </div>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: T.cream, textAlign: "left" }}><th style={{ padding: 9 }}>Method</th><th style={{ padding: 9, textAlign: "right" }}>In</th><th style={{ padding: 9, textAlign: "right" }}>Out</th><th style={{ padding: 9, textAlign: "right" }}>Net</th></tr></thead><tbody>{methodBreakdown.map((p) => <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}><td style={{ padding: 9 }}>{p.label}</td><td style={{ padding: 9, textAlign: "right", color: "#15803D" }}>{money(p.in)}</td><td style={{ padding: 9, textAlign: "right", color: T.red }}>{money(p.out)}</td><td style={{ padding: 9, textAlign: "right", fontWeight: 700 }}>{money(p.net)}</td></tr>)}</tbody></table></div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ fontFamily: "inherit", fontSize: 16, color: T.dusk }}>Expenses</h3><Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Add Expense</Btn></div>
      <Card style={{ padding: 0, overflow: "hidden" }}>{expenses.length === 0 ? <Empty text="No expenses recorded yet." /> : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}><thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}><th style={{ padding: "10px 14px" }}>Category</th><th>Description</th><th>Amount</th><th>Paid Via</th><th>Date</th><th></th></tr></thead><tbody>{expenses.slice().reverse().map((e) => <tr key={e.id} style={{ borderTop: `1px solid ${T.line}` }}><td style={{ padding: "10px 14px" }}><Pill>{e.category}</Pill></td><td>{e.description || "—"}</td><td>{money(e.amount)}</td><td>{PAYMENT_METHODS.find((p) => p.id === e.paymentMethod)?.label || "Cash"}</td><td style={{ opacity: 0.7 }}>{e.date}</td><td><button onClick={() => removeExpense(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td></tr>)}</tbody></table>}</Card>

      {modal && <Modal title="Add Expense" onClose={() => setModal(false)}><Field label="Category"><select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Ingredients</option><option>Rent</option><option>Utilities</option><option>Staff Wages</option><option>Maintenance</option><option>Marketing</option><option>Other</option></select></Field><Field label="Description"><input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field><Field label="Amount (Rs)"><input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field><Field label="Paid Via"><select style={inputStyle} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field><Btn variant="primary" onClick={addExpense} style={{ width: "100%", justifyContent: "center" }}>Add Expense</Btn></Modal>}
      {depositModal && <Modal title="Log Cash Deposit" onClose={() => setDepositModal(false)}><div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>Record cash you physically took from the till and deposited into the cafe's bank account. This moves the amount from Cash in Hand to Bank Balance.</div><Field label="Amount Deposited (Rs)"><input type="number" style={inputStyle} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} autoFocus /></Field><Field label="Notes"><input style={inputStyle} value={depositNotes} onChange={(e) => setDepositNotes(e.target.value)} placeholder="Optional — e.g. bank branch, slip number" /></Field><Btn variant="primary" onClick={addDeposit} style={{ width: "100%", justifyContent: "center" }}>Log Deposit</Btn></Modal>}

      {detail && <Modal title={detail === "revenue" ? "Revenue Details" : detail === "expenses" ? "Expense Details" : detail === "purchases" ? "Purchase Details" : "Credit Details"} onClose={() => setDetail(null)} width={760}><div style={{ maxHeight: "60vh", overflow: "auto" }}>{detailRows.length === 0 ? <Empty text="No records found." /> : <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}><thead><tr style={{ background: T.cream, textAlign: "left" }}><th style={{ padding: 9 }}>Date</th><th>Description</th><th>Type / Method</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead><tbody>{detailRows.slice().reverse().map((r) => <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}><td style={{ padding: 9 }}>{r.date || "—"}</td><td>{r.description}</td><td>{r.meta}</td><td style={{ textAlign: "right", fontWeight: 600, color: r.amount < 0 ? T.red : T.dusk }}>{money(r.amount)}</td></tr>)}</tbody></table>}</div></Modal>}

      {pnlModal && <Modal title="Profit & Loss Report" onClose={() => setPnlModal(false)} width={760}><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}><Field label="From Date"><input type="date" style={inputStyle} value={pnlFrom} onChange={(e) => setPnlFrom(e.target.value)} /></Field><Field label="To Date"><input type="date" style={inputStyle} value={pnlTo} onChange={(e) => setPnlTo(e.target.value)} /></Field></div>{(() => { const r = makePnl(); return <><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Card style={{ padding: 14 }}><div style={{ color: T.plum, fontSize: 11 }}>INCOME</div><div style={{ fontSize: 21, fontWeight: 700, color: "#15803D" }}>{money(r.income)}</div><div style={{ fontSize: 12, marginTop: 4 }}>Food &amp; Beverage Sales</div></Card><Card style={{ padding: 14 }}><div style={{ color: T.plum, fontSize: 11 }}>COGS / PURCHASES</div><div style={{ fontSize: 21, fontWeight: 700, color: T.red }}>{money(r.cogs)}</div><div style={{ fontSize: 12, marginTop: 4 }}>{r.hasRecipeCogs ? "Ingredients actually consumed from paid orders" : "Legacy direct stock purchase cost — add recipes for actual COGS"}</div></Card></div><div style={{ marginTop: 14, padding: 14, background: T.cream, borderRadius: 10 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span>Gross Profit</span><strong>{money(r.gross)}</strong></div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span>Operating Expenses</span><strong style={{ color: T.red }}>{money(r.operating)}</strong></div><div style={{ borderTop: `2px solid ${T.dusk}`, paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 17 }}><strong>NET {r.net >= 0 ? "PROFIT" : "LOSS"}</strong><strong style={{ color: r.net >= 0 ? "#15803D" : T.red }}>{money(Math.abs(r.net))}</strong></div></div><div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}><Btn variant="ghost" onClick={printPnl}><Printer size={15} /> Print / Save PDF</Btn><Btn variant="primary" onClick={() => setPnlModal(false)}>Close</Btn></div></> })()}</Modal>}
    </div>
  );
}

/* ================= MENU MANAGEMENT ================= */
function MenuManagement({ menu, setMenu, inventory }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Coffee & Brews", price: "", veg: true, station: "kitchen", recipe: [] });

  const openNew = () => { setEditing(null); setForm({ name: "", category: "Coffee & Brews", price: "", veg: true, station: "kitchen", recipe: [] }); setModal(true); };
  const openEdit = (m) => { setEditing(m.id); setForm({ ...m, station: m.station || "kitchen", recipe: Array.isArray(m.recipe) ? m.recipe.map((r) => ({ ...r })) : [] }); setModal(true); };
  const save = () => {
    if (!form.name || !form.price) return;
    const cleanRecipe = (form.recipe || []).filter((r) => r.inventoryItemId && Number(r.quantity) > 0).map((r) => ({ ...r, quantity: Number(r.quantity) }));
    const cleanForm = { ...form, price: Number(form.price), recipe: cleanRecipe };
    if (editing) setMenu(menu.map((m) => m.id === editing ? { ...m, ...cleanForm } : m));
    else setMenu([...menu, { id: uid(), ...cleanForm, available: true }]);
    setModal(false);
  };
  const addRecipeLine = () => {
    const first = inventory[0];
    if (!first) return;
    setForm((f) => ({ ...f, recipe: [...(f.recipe || []), { inventoryItemId: first.id, name: first.name, unit: first.unit, quantity: "" }] }));
  };
  const updateRecipeLine = (index, patch) => setForm((f) => ({ ...f, recipe: (f.recipe || []).map((r, i) => i === index ? { ...r, ...patch } : r) }));
  const removeRecipeLine = (index) => setForm((f) => ({ ...f, recipe: (f.recipe || []).filter((_, i) => i !== index) }));

  const toggleAvailable = (id) => setMenu(menu.map((m) => m.id === id ? { ...m, available: !m.available } : m));
  const remove = (id) => setMenu(menu.filter((m) => m.id !== id));

  const categories = [...new Set(menu.map((m) => m.category))];

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = menu.map((m) => ({ Name: m.name, Category: m.category, "Price (Rs)": m.price, Type: m.veg ? "Veg" : "Non-Veg", Station: m.station === "bar" ? "Bar & Beverage" : "Kitchen", Available: m.available ? "Yes" : "No" }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Menu");
    XLSX.writeFile(wb, `parijat-cafe-menu-${today()}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
        <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
        <Btn variant="primary" onClick={openNew}><Plus size={15} /> Add Menu Item</Btn>
      </div>
      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 22 }}>
          <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 10 }}>{cat}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 12 }}>
            {menu.filter((m) => m.category === cat).map((m) => (
              <Card key={m.id} style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 12.5, color: T.gold, marginTop: 2 }}>{money(m.price)}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                    <Pill tone={m.veg ? "good" : "bad"}>{m.veg ? "Veg" : "Non-Veg"}</Pill>
                    <Pill tone={m.station === "bar" ? "gold" : "neutral"}>{m.station === "bar" ? "Bar" : "Kitchen"}</Pill>
                  </div>
                </div>
                <div style={{ marginTop: 10, padding: 9, background: T.cream, borderRadius: 8, fontSize: 11.5, color: T.plum }}>
                  <strong>Recipe:</strong> {m.recipe?.length ? m.recipe.map((r) => `${r.quantity} ${r.unit} ${r.name}`).join(" · ") : "Not set — inventory/COGS will not auto-consume for this item."}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
                    <input type="checkbox" checked={m.available} onChange={() => toggleAvailable(m.id)} /> Available
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEdit(m)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.plum }}>Edit</button>
                    <button onClick={() => remove(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.red }}><Trash2 size={13} /></button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {modal && (
        <Modal title={editing ? "Edit Menu Item" : "New Menu Item"} onClose={() => setModal(false)}>
          <Field label="Name"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Category"><input style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Coffee & Brews" /></Field>
          <Field label="Price (Rs)"><input type="number" style={inputStyle} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Type">
            <select style={inputStyle} value={form.veg ? "veg" : "nonveg"} onChange={(e) => setForm({ ...form, veg: e.target.value === "veg" })}>
              <option value="veg">Veg</option><option value="nonveg">Non-Veg</option>
            </select>
          </Field>
          <Field label="Prepared At">
            <select style={inputStyle} value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })}>
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar & Beverage</option>
            </select>
          </Field>
          <div style={{ marginTop: 6, marginBottom: 14, padding: 12, border: `1px solid ${T.line}`, borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
              <div><strong style={{ fontSize: 13 }}>Recipe / Ingredients</strong><div style={{ fontSize: 11, color: T.plum, marginTop: 2 }}>Amount used for ONE menu item. Inventory is reduced when the order is paid.</div></div>
              <Btn variant="ghost" onClick={addRecipeLine} disabled={!inventory.length}><Plus size={14} /> Add ingredient</Btn>
            </div>
            {(form.recipe || []).map((r, index) => {
              const inv = inventory.find((i) => i.id === r.inventoryItemId);
              return <div key={index} style={{ display: "grid", gridTemplateColumns: "1.6fr .7fr auto", gap: 7, marginBottom: 7, alignItems: "center" }}>
                <select style={inputStyle} value={r.inventoryItemId} onChange={(e) => { const i = inventory.find((x) => x.id === e.target.value); updateRecipeLine(index, { inventoryItemId: i.id, name: i.name, unit: i.unit }); }}>
                  {inventory.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}><input type="number" min="0" step="any" style={inputStyle} value={r.quantity} onChange={(e) => updateRecipeLine(index, { quantity: e.target.value })} placeholder="Qty" /><span style={{ fontSize: 11, color: T.plum }}>{inv?.unit || r.unit}</span></div>
                <button onClick={() => removeRecipeLine(index)} style={{ border: "none", background: "none", color: T.red, cursor: "pointer" }}><Trash2 size={14} /></button>
              </div>;
            })}
            {!form.recipe?.length && <div style={{ fontSize: 12, color: T.plum, opacity: .7 }}>No recipe added yet.</div>}
          </div>
          <Btn variant="primary" onClick={save} style={{ width: "100%", justifyContent: "center" }}>{editing ? "Save Changes" : "Add Item"}</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= CRM ================= */
function CRM({ customers, setCustomers, orders }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", notes: "" });
  const [search, setSearch] = useState("");

  const add = () => {
    if (!form.name) return;
    setCustomers([...customers, { id: uid(), name: form.name, phone: form.phone, notes: form.notes, visits: 0, points: 0, referralCode: form.name.replace(/\s/g, "").slice(0, 6).toUpperCase() + Math.floor(Math.random() * 90 + 10) }]);
    setForm({ name: "", phone: "", notes: "" }); setModal(false);
  };
  const remove = (id) => setCustomers(customers.filter((c) => c.id !== id));
  const filtered = customers.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search));

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = customers.map((c) => ({ Name: c.name, Phone: c.phone, Visits: c.visits, Points: c.points, "Referral Code": c.referralCode, Notes: c.notes }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Customers");
    XLSX.writeFile(wb, `parijat-cafe-customers-${today()}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 320 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.plum, opacity: 0.5 }} />
          <input style={{ ...inputStyle, paddingLeft: 30 }} placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
          <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Add Customer</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
        {filtered.map((c) => (
          <Card key={c.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 700, fontFamily: "inherit", color: T.dusk }}>{c.name}</div>
                <div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>{c.phone}</div>
              </div>
              <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button>
            </div>
            <div style={{ display: "flex", gap: 16, margin: "12px 0" }}>
              <div><div style={{ fontSize: 18, fontWeight: 700, color: T.dusk }}>{c.visits}</div><div style={{ fontSize: 10.5, color: T.plum, opacity: 0.6, textTransform: "uppercase" }}>Visits</div></div>
              <div><div style={{ fontSize: 18, fontWeight: 700, color: T.gold }}>{c.points}</div><div style={{ fontSize: 10.5, color: T.plum, opacity: 0.6, textTransform: "uppercase" }}>Points</div></div>
            </div>
            {c.notes && <div style={{ fontSize: 12, color: T.plum, background: T.cream, padding: 8, borderRadius: 6 }}>{c.notes}</div>}
          </Card>
        ))}
      </div>
      {modal && (
        <Modal title="Add Customer" onClose={() => setModal(false)}>
          <Field label="Name"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Notes"><input style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Preferences, allergies…" /></Field>
          <Btn variant="primary" onClick={add} style={{ width: "100%", justifyContent: "center" }}>Add Customer</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= SALES REPORT ================= */
function SalesReport({ orders, menu }) {
  const paid = orders.filter((o) => o.status === "paid");
  const byDay = useMemo(() => {
    const map = {};
    paid.forEach((o) => { const d = o.createdAt.slice(0, 10); map[d] = (map[d] || 0) + o.total; });
    return Object.entries(map).sort().map(([date, total]) => ({ date: date.slice(5), total }));
  }, [paid]);
  const byItem = useMemo(() => {
    const map = {};
    paid.forEach((o) => o.items.forEach((it) => { map[it.name] = (map[it.name] || 0) + it.qty; }));
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, qty]) => ({ name, qty }));
  }, [paid]);
  const byCategory = useMemo(() => {
    const map = {};
    paid.forEach((o) => o.items.forEach((it) => {
      const cat = menu.find((m) => m.id === it.menuId)?.category || "Other";
      map[cat] = (map[cat] || 0) + it.qty * it.price;
    }));
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [paid, menu]);
  const colors = [T.gold, T.dusk, T.sage, T.plum, T.red, "#B8ADD1"];

  const exportToExcel = (scope) => {
    const scopedPaid = scope === "today" ? paid.filter((o) => o.createdAt.slice(0, 10) === today()) : paid;

    const wb = XLSX.utils.book_new();

    const ordersSheet = scopedPaid.map((o) => ({
      Date: o.createdAt.slice(0, 10),
      Time: new Date(o.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      Table: o.tableName,
      Source: o.source,
      Items: o.items.map((it) => `${it.qty}x ${it.name}`).join(", "),
      "Payment Method": PAYMENT_METHODS.find((p) => p.id === o.paymentMethod)?.label || o.paymentMethod || "",
      "Subtotal (Rs)": o.subtotal != null ? o.subtotal : o.total,
      "Discount (Rs)": o.discount || 0,
      "Total (Rs)": o.total,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ordersSheet), "Orders");

    const dayMap = {};
    scopedPaid.forEach((o) => { const d = o.createdAt.slice(0, 10); dayMap[d] = (dayMap[d] || 0) + o.total; });
    const dailySheet = Object.entries(dayMap).sort().map(([date, total]) => ({ Date: date, "Total Sales (Rs)": total }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailySheet), "Sales by Day");

    const itemMap = {};
    scopedPaid.forEach((o) => o.items.forEach((it) => { itemMap[it.name] = (itemMap[it.name] || 0) + it.qty; }));
    const itemSheet = Object.entries(itemMap).sort((a, b) => b[1] - a[1]).map(([name, qty]) => ({ Item: name, "Quantity Sold": qty }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemSheet), "Top Items");

    const catMap = {};
    scopedPaid.forEach((o) => o.items.forEach((it) => {
      const cat = menu.find((m) => m.id === it.menuId)?.category || "Other";
      catMap[cat] = (catMap[cat] || 0) + it.qty * it.price;
    }));
    const catSheet = Object.entries(catMap).map(([name, value]) => ({ Category: name, "Revenue (Rs)": value }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catSheet), "Revenue by Category");

    XLSX.writeFile(wb, `parijat-cafe-sales-report-${scope === "today" ? today() : "all"}.xlsx`);
  };

  if (paid.length === 0) {
    return <Card style={{ padding: 30 }}><Empty text="No completed sales yet. Mark an order as 'Paid' in Order & KOT to see reports here." /></Card>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={() => exportToExcel("today")}><Download size={15} /> Export Today</Btn>
        <Btn variant="primary" onClick={() => exportToExcel("all")}><Download size={15} /> Export All</Btn>
      </div>
      <Card style={{ padding: 20 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 14 }}>Sales Over Time</h3>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={byDay}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => money(v)} />
            <Line type="monotone" dataKey="total" stroke={T.gold} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        <Card style={{ padding: 20 }}>
          <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 14 }}>Top Selling Items</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byItem} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={T.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
              <Tooltip />
              <Bar dataKey="qty" fill={T.dusk} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card style={{ padding: 20 }}>
          <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 14 }}>Revenue by Category</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.name}>
                {byCategory.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => money(v)} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

/* ================= DIGITAL QR MENU ================= */
function QRMenu({ menu }) {
  const categories = [...new Set(menu.map((m) => m.category))];
  return (
    <div style={{ display: "flex", gap: 30, flexWrap: "wrap" }}>
      <Card style={{ padding: 24, textAlign: "center", height: "fit-content", width: 220 }}>
        <div style={{ width: 160, height: 160, margin: "0 auto 14px", background: `repeating-linear-gradient(45deg, ${T.dusk} 0 6px, #fff 6px 12px)`, borderRadius: 8, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ background: "#fff", padding: 10, borderRadius: 6 }}><QrCode size={48} color={T.dusk} /></div>
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: T.plum }}>Scan at the table to open Parijat Cafe's live menu — no app needed.</div>
      </Card>
      <div style={{ flex: 1, minWidth: 280 }}>
        <div style={{ background: T.dusk, color: T.petal, borderRadius: 14, padding: "26px 22px" }}>
          <div style={{ fontFamily: "inherit", fontSize: 20, marginBottom: 4 }}>Parijat Cafe</div>
          <div style={{ fontSize: 12, color: T.gold, marginBottom: 20 }}>Digital Menu · Updated live</div>
          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "#B8ADD1", marginBottom: 8 }}>{cat}</div>
              {menu.filter((m) => m.category === cat && m.available).map((m) => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px dashed rgba(255,255,255,0.12)", fontSize: 13.5 }}>
                  <span>{m.name}</span><span style={{ color: T.gold, fontFamily: "monospace" }}>{money(m.price)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================= ONLINE ORDER ================= */
function OnlineOrder({ menu, orders, setOrders, businessDay }) {
  const [cart, setCart] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [placed, setPlaced] = useState(false);
  const add = (m) => setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
  const sub = (m) => setCart((c) => { const n = { ...c }; if (n[m.id] > 1) n[m.id]--; else delete n[m.id]; return n; });
  const total = Object.entries(cart).reduce((s, [id, qty]) => s + qty * (menu.find((m) => m.id === id)?.price || 0), 0);

  const checkout = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before accepting an online order."); return; }
    const items = Object.entries(cart).map(([id, qty]) => {
      const m = menu.find((mm) => mm.id === id);
      return { menuId: id, name: m.name, qty, price: m.price };
    });
    setOrders((currentOrders) => [...currentOrders, { id: uid(), tableId: null, tableName: "Online", items, total, status: "placed", createdAt: new Date().toISOString(), source: "online", customerName }]);
    setCart({}); setPlaced(true);
    setTimeout(() => setPlaced(false), 3500);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 20 }}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
          {menu.filter((m) => m.available).map((m) => (
            <Card key={m.id} style={{ padding: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
              <div style={{ fontSize: 12, color: T.gold, margin: "4px 0 10px" }}>{money(m.price)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => sub(m)} style={{ border: `1px solid ${T.line}`, background: "#fff", borderRadius: 6, width: 24, height: 24, cursor: "pointer" }}>–</button>
                <span style={{ fontSize: 13 }}>{cart[m.id] || 0}</span>
                <button onClick={() => add(m)} style={{ border: "none", background: T.dusk, color: "#fff", borderRadius: 6, width: 24, height: 24, cursor: "pointer" }}>+</button>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Card style={{ padding: 18, height: "fit-content", position: "sticky", top: 0 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 12 }}>Your Order</h3>
        {Object.keys(cart).length === 0 ? <Empty text="Cart is empty." /> : (
          <div style={{ marginBottom: 14 }}>
            {Object.entries(cart).map(([id, qty]) => {
              const m = menu.find((mm) => mm.id === id);
              return <div key={id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}><span>{qty}× {m.name}</span><span>{money(qty * m.price)}</span></div>;
            })}
          </div>
        )}
        <Field label="Name"><input style={inputStyle} value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></Field>
        <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><strong>Total</strong><strong>{money(total)}</strong></div>
        <Btn variant="primary" onClick={checkout} disabled={total === 0 || !customerName} style={{ width: "100%", justifyContent: "center" }}>Place Online Order</Btn>
        {placed && <div style={{ marginTop: 10, fontSize: 12.5, color: "#15803D", textAlign: "center" }}>Order sent to the kitchen queue ✓</div>}
      </Card>
    </div>
  );
}

/* ================= LOYALTY & REWARDS ================= */
function Loyalty({ customers, setCustomers }) {
  const redeem = (c, pts, reward) => {
    if (c.points < pts) return;
    setCustomers(customers.map((x) => x.id === c.id ? { ...x, points: x.points - pts } : x));
    alert(`${c.name} redeemed: ${reward}`);
  };
  const rewards = [
    { pts: 100, label: "Free Masala Chiya" },
    { pts: 250, label: "Rs 200 off next bill" },
    { pts: 500, label: "Free dessert of choice" },
  ];
  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 10 }}>Program Rules</h3>
        <div style={{ fontSize: 13, color: T.plum }}>Customers earn <strong>1 point per Rs 100</strong> spent, credited automatically when an order is marked Paid.</div>
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          {rewards.map((r) => <Pill key={r.pts} tone="gold">{r.pts} pts → {r.label}</Pill>)}
        </div>
      </Card>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 }}>
        {customers.map((c) => (
          <Card key={c.id} style={{ padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ fontFamily: "inherit" }}>{c.name}</strong>
              <Pill tone="gold">{c.points} pts</Pill>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {rewards.map((r) => (
                <Btn key={r.pts} variant="ghost" disabled={c.points < r.pts} onClick={() => redeem(c, r.pts, r.label)} style={{ fontSize: 11, padding: "6px 10px" }}>{r.label}</Btn>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================= REFER & EARN ================= */
function ReferEarn({ customers, referrals, setReferrals, setCustomers }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ referrerId: "", refereeName: "", refereePhone: "" });

  const submit = () => {
    const referrer = customers.find((c) => c.id === form.referrerId);
    if (!referrer || !form.refereeName) return;
    setReferrals([...referrals, { id: uid(), referrerId: referrer.id, referrerName: referrer.name, refereeName: form.refereeName, refereePhone: form.refereePhone, status: "pending", date: today() }]);
    setForm({ referrerId: "", refereeName: "", refereePhone: "" }); setModal(false);
  };
  const reward = (r) => {
    setReferrals(referrals.map((x) => x.id === r.id ? { ...x, status: "rewarded" } : x));
    setCustomers(customers.map((c) => c.id === r.referrerId ? { ...c, points: c.points + 150 } : c));
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = referrals.map((r) => ({ Date: r.date, Referrer: r.referrerName, "New Guest": r.refereeName, Phone: r.refereePhone, Status: r.status }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Referrals");
    XLSX.writeFile(wb, `parijat-cafe-referrals-${today()}.xlsx`);
  };

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 8 }}>How it works</h3>
        <div style={{ fontSize: 13, color: T.plum }}>Every customer has a referral code. When a friend visits and mentions it, log it below — the referrer earns <strong>150 loyalty points</strong> once the visit is confirmed.</div>
      </Card>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk }}>Referral Codes</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
          <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Log Referral</Btn>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10, marginBottom: 24 }}>
        {customers.map((c) => (
          <Card key={c.id} style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>{c.name}</span>
            <span style={{ fontFamily: "monospace", fontSize: 12, background: T.cream, padding: "3px 8px", borderRadius: 6, color: T.dusk }}>{c.referralCode}</span>
          </Card>
        ))}
      </div>
      <h3 style={{ fontFamily: "inherit", fontSize: 15, color: T.dusk, marginBottom: 12 }}>Referral Log</h3>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {referrals.length === 0 ? <Empty text="No referrals logged yet." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}><th style={{ padding: "10px 14px" }}>Referrer</th><th>New Guest</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {referrals.slice().reverse().map((r) => (
                <tr key={r.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px" }}>{r.referrerName}</td>
                  <td>{r.refereeName}</td>
                  <td><Pill tone={r.status === "rewarded" ? "good" : "warn"}>{r.status}</Pill></td>
                  <td>{r.status === "pending" && <Btn variant="gold" onClick={() => reward(r)} style={{ fontSize: 11, padding: "5px 10px" }}>Confirm & Reward</Btn>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {modal && (
        <Modal title="Log Referral" onClose={() => setModal(false)}>
          <Field label="Referring Customer">
            <select style={inputStyle} value={form.referrerId} onChange={(e) => setForm({ ...form, referrerId: e.target.value })}>
              <option value="">Select customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.referralCode})</option>)}
            </select>
          </Field>
          <Field label="New Guest's Name"><input style={inputStyle} value={form.refereeName} onChange={(e) => setForm({ ...form, refereeName: e.target.value })} /></Field>
          <Field label="New Guest's Phone"><input style={inputStyle} value={form.refereePhone} onChange={(e) => setForm({ ...form, refereePhone: e.target.value })} /></Field>
          <Btn variant="primary" onClick={submit} style={{ width: "100%", justifyContent: "center" }}>Log Referral</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= CREDIT BOOK ================= */
function CreditBook({ customers, creditTransactions, setCreditTransactions, currentUser, businessDay }) {
  const [repayModal, setRepayModal] = useState(false);
  const [repayCustomerId, setRepayCustomerId] = useState("");
  const [repayAmount, setRepayAmount] = useState("");
  const [repayMethod, setRepayMethod] = useState("cash");
  const [repayNotes, setRepayNotes] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState(null);

  const balances = useMemo(() => {
    const map = {};
    creditTransactions.forEach((c) => {
      if (!map[c.customerId]) map[c.customerId] = { customerId: c.customerId, customerName: c.customerName, sales: 0, repayments: 0 };
      if (c.type === "sale") map[c.customerId].sales += c.amount;
      else map[c.customerId].repayments += c.amount;
    });
    return Object.values(map).map((b) => ({ ...b, balance: b.sales - b.repayments })).sort((a, b) => b.balance - a.balance);
  }, [creditTransactions]);

  const totalOutstanding = balances.reduce((s, b) => s + Math.max(0, b.balance), 0);

  const openRepay = (customerId) => {
    setRepayCustomerId(customerId || ""); setRepayAmount(""); setRepayMethod("cash"); setRepayNotes("");
    setRepayModal(true);
  };

  const confirmRepay = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before logging a repayment."); return; }
    const bal = balances.find((b) => b.customerId === repayCustomerId);
    if (!bal) { alert("Select a customer."); return; }
    if (!repayAmount || Number(repayAmount) <= 0) { alert("Enter a valid amount."); return; }
    setCreditTransactions([...creditTransactions, {
      id: uid(), customerId: repayCustomerId, customerName: bal.customerName, type: "repayment",
      amount: Number(repayAmount), paymentMethod: repayMethod, notes: repayNotes, date: today(), createdBy: currentUser?.name || "Unknown",
    }]);
    logAudit(currentUser?.name, "CREDIT_REPAYMENT", { customerName: bal.customerName, amount: Number(repayAmount), method: repayMethod });
    setRepayModal(false);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const balanceSheet = balances.map((b) => ({ Customer: b.customerName, "Total Credit Sales (Rs)": b.sales, "Total Repaid (Rs)": b.repayments, "Outstanding (Rs)": b.balance }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balanceSheet), "Balances");
    const txSheet = creditTransactions.slice().reverse().map((c) => ({
      Date: c.date, Customer: c.customerName, Type: c.type === "sale" ? "Credit Sale" : "Repayment",
      "Amount (Rs)": c.amount, "Paid Via": c.paymentMethod ? (PAYMENT_METHODS.find((p) => p.id === c.paymentMethod)?.label || c.paymentMethod) : "",
      Notes: c.notes, By: c.createdBy,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txSheet), "Transactions");
    XLSX.writeFile(wb, `parijat-cafe-credit-book-${today()}.xlsx`);
  };

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Outstanding Credit</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: totalOutstanding > 0 ? T.red : "#15803D" }}>{money(totalOutstanding)}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
            <Btn variant="primary" onClick={() => openRepay("")}><Plus size={15} /> Log Repayment</Btn>
          </div>
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
        {balances.length === 0 ? <Empty text="No credit sales yet. Settling a bill as 'Credit' in Order & KOT will show up here." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>Customer</th><th>Total Sold on Credit</th><th>Repaid</th><th>Outstanding</th><th></th>
            </tr></thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.customerId} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", fontWeight: 600 }}>{b.customerName}</td>
                  <td>{money(b.sales)}</td>
                  <td>{money(b.repayments)}</td>
                  <td style={{ fontWeight: 700, color: b.balance > 0 ? T.red : "#15803D" }}>{money(b.balance)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setExpandedCustomer(expandedCustomer === b.customerId ? null : b.customerId)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.plum }}>{expandedCustomer === b.customerId ? "Hide" : "History"}</button>
                      {b.balance > 0 && <button onClick={() => openRepay(b.customerId)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.gold, fontWeight: 600 }}>Log Repayment</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {expandedCustomer && (
        <Card style={{ padding: 18 }}>
          <h3 style={{ fontSize: 14, color: T.dusk, marginBottom: 12 }}>Transaction History — {balances.find((b) => b.customerId === expandedCustomer)?.customerName}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ textAlign: "left", color: T.plum, opacity: 0.65, fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "6px 4px" }}>Date</th><th>Type</th><th>Amount</th><th>Paid Via</th><th>Notes</th>
            </tr></thead>
            <tbody>
              {creditTransactions.filter((c) => c.customerId === expandedCustomer).slice().reverse().map((c) => (
                <tr key={c.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 4px", opacity: 0.7 }}>{c.date}</td>
                  <td><Pill tone={c.type === "sale" ? "bad" : "good"}>{c.type === "sale" ? "Credit Sale" : "Repayment"}</Pill></td>
                  <td>{money(c.amount)}</td>
                  <td>{c.paymentMethod ? (PAYMENT_METHODS.find((p) => p.id === c.paymentMethod)?.label || c.paymentMethod) : "—"}</td>
                  <td style={{ opacity: 0.75 }}>{c.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {repayModal && (
        <Modal title="Log Repayment" onClose={() => setRepayModal(false)}>
          <Field label="Customer">
            <select style={inputStyle} value={repayCustomerId} onChange={(e) => setRepayCustomerId(e.target.value)}>
              <option value="">Select customer</option>
              {balances.filter((b) => b.balance > 0).map((b) => <option key={b.customerId} value={b.customerId}>{b.customerName} (owes {money(b.balance)})</option>)}
            </select>
          </Field>
          <Field label="Amount Received (Rs)"><input type="number" style={inputStyle} value={repayAmount} onChange={(e) => setRepayAmount(e.target.value)} /></Field>
          <Field label="Received Via">
            <select style={inputStyle} value={repayMethod} onChange={(e) => setRepayMethod(e.target.value)}>
              {PAYMENT_METHODS.filter((p) => p.id !== "credit").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Notes"><input style={inputStyle} value={repayNotes} onChange={(e) => setRepayNotes(e.target.value)} placeholder="Optional" /></Field>
          <Btn variant="primary" onClick={confirmRepay} style={{ width: "100%", justifyContent: "center" }}>Log Repayment</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= AUDIT LOG ================= */
function AuditLogView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const data = await fetchAuditLog(500);
      setEntries(data);
      setLoading(false);
    })();
  }, []);

  const refresh = async () => {
    setLoading(true);
    const data = await fetchAuditLog(500);
    setEntries(data);
    setLoading(false);
  };

  const actionTone = (action) => {
    if (action.includes("FAILED") || action === "BILL_VOIDED" || action === "STAFF_DELETED" || action === "STAFF_DEACTIVATED") return "bad";
    if (action.includes("SUCCESS") || action === "DAY_OPENED" || action === "STAFF_CREATED" || action === "STAFF_REACTIVATED") return "good";
    if (action === "DAY_REOPENED" || action.includes("RESET") || action === "DISCOUNT_APPLIED") return "warn";
    return "neutral";
  };

  const actionOptions = useMemo(() => ["all", ...Array.from(new Set(entries.map((e) => e.action)))], [entries]);

  const filtered = entries.filter((e) => {
    if (actionFilter !== "all" && e.action !== actionFilter) return false;
    if (search && !(e.actor || "").toLowerCase().includes(search.toLowerCase()) && !e.action.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheet = filtered.map((e) => ({
      Date: new Date(e.at).toLocaleString(),
      Actor: e.actor,
      Action: e.action,
      Details: e.details ? JSON.stringify(e.details) : "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Audit Log");
    XLSX.writeFile(wb, `parijat-cafe-audit-log-${today()}.xlsx`);
  };

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ fontSize: 12.5, color: T.plum }}>
          A running record of sensitive actions — logins, discounts, voids, cash movements, staff changes, and business day open/close. This is app-level logging (see the Security notes your developer flagged) — good for accountability and catching mistakes, not a substitute for full database-level security.
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: T.plum, opacity: 0.5 }} />
            <input style={{ ...inputStyle, paddingLeft: 30, width: 220 }} placeholder="Search by staff or action…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select style={{ ...inputStyle, width: 200 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            {actionOptions.map((a) => <option key={a} value={a}>{a === "all" ? "All actions" : a}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={refresh}>Refresh</Btn>
          <Btn variant="primary" onClick={exportToExcel}><Download size={15} /> Export to Excel</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <Empty text="Loading audit log…" />
        ) : filtered.length === 0 ? (
          <Empty text="No matching audit entries yet." />
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>When</th><th>Staff</th><th>Action</th><th>Details</th>
            </tr></thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "9px 14px", opacity: 0.7, whiteSpace: "nowrap" }}>{new Date(e.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td style={{ fontWeight: 600 }}>{e.actor || "—"}</td>
                  <td><Pill tone={actionTone(e.action)}>{e.action}</Pill></td>
                  <td style={{ fontSize: 12, color: T.plum, opacity: 0.85, maxWidth: 360 }}>
                    {e.details ? Object.entries(e.details).filter(([k]) => k !== "message").map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function StaffManagement({ staff, refreshStaff, currentUser }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", username: "", password: "", role: "cashier" });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditing(null); setForm({ name: "", username: "", password: "", role: "cashier" }); setShowPw(false); setModal(true); };
  const openEdit = (s) => { setEditing(s.id); setForm({ name: s.name, username: s.username, password: "", role: s.role }); setShowPw(false); setModal(true); };

  const save = async () => {
    if (!form.name || !form.username) return;
    if (!editing && !form.password) { alert("Set a password for the new account."); return; }
    if (form.password && form.password.length < 6) { alert("Password must be at least 6 characters."); return; }
    const usernameTaken = staff.some((s) => s.username.toLowerCase() === form.username.trim().toLowerCase() && s.id !== editing);
    if (usernameTaken) { alert("That username is already taken — pick another."); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.rpc("update_staff", { p_id: editing, p_name: form.name, p_username: form.username, p_role: form.role });
      if (error) { alert("Couldn't save changes: " + error.message); setSaving(false); return; }
      if (form.password) {
        const { error: pwErr } = await supabase.rpc("update_staff_password", { p_id: editing, p_password: form.password });
        if (pwErr) { alert("Name/role saved, but password update failed: " + pwErr.message); }
        else logAudit(currentUser.name, "STAFF_PASSWORD_RESET", { targetId: editing, targetName: form.name });
      }
      logAudit(currentUser.name, "STAFF_UPDATED", { targetId: editing, name: form.name, username: form.username, role: form.role });
    } else {
      const { error } = await supabase.rpc("create_staff", { p_name: form.name, p_username: form.username, p_password: form.password, p_role: form.role, p_must_change_password: true });
      if (error) { alert("Couldn't create account: " + error.message); setSaving(false); return; }
      logAudit(currentUser.name, "STAFF_CREATED", { name: form.name, username: form.username, role: form.role });
    }
    await refreshStaff();
    setSaving(false);
    setModal(false);
  };

  const forceReset = async (s) => {
    if (!confirm(`Force ${s.name} to set a new password at their next login?`)) return;
    const { error } = await supabase.rpc("flag_must_change_password", { p_id: s.id });
    if (error) { alert("Couldn't flag account: " + error.message); return; }
    logAudit(currentUser.name, "STAFF_FORCED_RESET", { targetId: s.id, targetName: s.name });
    alert(`${s.name} will be asked to set a new password next time they log in.`);
  };

  const toggleActive = async (s) => {
    if (s.id === currentUser.id) { alert("You can't deactivate the account you're currently signed in with."); return; }
    const { error } = await supabase.rpc("set_staff_active", { p_id: s.id, p_active: !s.active });
    if (error) { alert("Couldn't update status: " + error.message); return; }
    logAudit(currentUser.name, s.active ? "STAFF_DEACTIVATED" : "STAFF_REACTIVATED", { targetId: s.id, targetName: s.name });
    await refreshStaff();
  };
  const remove = async (s) => {
    if (s.id === currentUser.id) { alert("You can't remove the account you're currently signed in with."); return; }
    const owners = staff.filter((x) => x.role === "owner" && x.active);
    if (s.role === "owner" && owners.length <= 1) { alert("At least one active Owner account must remain."); return; }
    const { error } = await supabase.rpc("delete_staff", { p_id: s.id });
    if (error) { alert("Couldn't remove account: " + error.message); return; }
    logAudit(currentUser.name, "STAFF_DELETED", { targetId: s.id, targetName: s.name });
    await refreshStaff();
  };

  const roleTone = { owner: "gold", manager: "good", cashier: "neutral", barista: "warn" };

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, color: T.dusk, marginBottom: 10 }}>What each role can see</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, fontSize: 12.5 }}>
          {ROLES.map((r) => (
            <div key={r.id}>
              <Pill tone={roleTone[r.id]}>{r.label}</Pill>
              <div style={{ color: T.plum, marginTop: 6, lineHeight: 1.5 }}>
                {r.id === "owner" && "Full access — every module, plus Staff & Roles and the Audit Log."}
                {r.id === "manager" && "Everything except Staff & Roles and the Audit Log."}
                {r.id === "cashier" && "Orders, Tables, Accounting, CRM, Sales, QR/Online, Loyalty, Refer, Credit Book."}
                {r.id === "barista" && "Kitchen Display and Order & KOT only."}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, color: T.dusk }}>Staff Accounts</h3>
        <Btn variant="primary" onClick={openNew}><Plus size={15} /> Create Staff ID</Btn>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
            <th style={{ padding: "10px 14px" }}>Name</th><th>Username</th><th>Role</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{s.name}{s.id === currentUser.id && <span style={{ fontSize: 11, color: T.plum, opacity: 0.6 }}> (you)</span>}</td>
                <td style={{ fontFamily: "monospace" }}>{s.username}</td>
                <td><Pill tone={roleTone[s.role]}>{ROLES.find((r) => r.id === s.role)?.label}</Pill></td>
                <td>{s.active ? <Pill tone="good">Active</Pill> : <Pill tone="bad">Deactivated</Pill>}</td>
                <td>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => openEdit(s)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.plum }}>Edit</button>
                    <button onClick={() => toggleActive(s)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.plum }}>{s.active ? "Deactivate" : "Reactivate"}</button>
                    <button onClick={() => forceReset(s)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.plum }}>Force Reset</button>
                    <button onClick={() => remove(s)} style={{ background: "none", border: "none", cursor: "pointer", color: T.red }}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modal && (
        <Modal title={editing ? "Edit Staff Account" : "Create Staff ID"} onClose={() => setModal(false)}>
          <Field label="Full Name"><input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Username"><input style={inputStyle} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="login username, no spaces" /></Field>
          <Field label={editing ? "New Password (leave blank to keep current)" : "Password"}>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} style={{ ...inputStyle, paddingRight: 36 }} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setShowPw((s) => !s)} style={{ position: "absolute", right: 8, top: 7, background: "none", border: "none", cursor: "pointer", color: T.plum }}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          <Field label="Role">
            <select style={inputStyle} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
          <Btn variant="primary" onClick={save} disabled={saving} style={{ width: "100%", justifyContent: "center" }}>{saving ? "Saving…" : editing ? "Save Changes" : "Create Staff ID"}</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= PURCHASE MANAGEMENT ================= */
function PurchaseManagement({ purchases, setPurchases, inventory, setInventory, businessDay }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ itemId: "", itemName: "", category: "Food Ingredients", quantity: "", unit: "kg", unitCost: "", supplier: "", notes: "", paymentMethod: "cash", costType: "cogs", trackInventory: true });
  const [mode, setMode] = useState("existing");

  const resetForm = () => setForm({ itemId: "", itemName: "", category: "Food Ingredients", quantity: "", unit: "kg", unitCost: "", supplier: "", notes: "", paymentMethod: "cash", costType: "cogs", trackInventory: true });
  const openNew = () => { resetForm(); setMode("existing"); setModal(true); };

  const onPickItem = (id) => {
    const item = inventory.find((i) => i.id === id);
    setForm((f) => ({ ...f, itemId: id, itemName: item ? item.name : "", unit: item ? item.unit : f.unit, costType: "cogs", trackInventory: true }));
  };

  const totalCost = (Number(form.quantity) || 0) * (Number(form.unitCost) || 0);

  const save = () => {
    if (businessDay.status !== "open") { alert("Business Day is closed. Open it before logging a purchase."); return; }
    if (!form.category || !form.itemName || Number(form.quantity) <= 0 || Number(form.unitCost) < 0) { alert("Please enter category, item, quantity and unit cost."); return; }
    if (mode === "existing" && !form.itemId) { alert("Please select the inventory item you are restocking."); return; }
    const trackInventory = mode === "existing" ? true : !!form.trackInventory;
    const entry = {
      id: uid(),
      itemId: trackInventory && mode === "existing" ? (form.itemId || null) : null,
      itemName: form.itemName.trim(),
      category: form.category,
      quantity: Number(form.quantity),
      unit: form.unit,
      unitCost: Number(form.unitCost),
      totalCost,
      supplier: form.supplier.trim(),
      notes: form.notes.trim(),
      date: today(),
      paymentMethod: form.paymentMethod,
      costType: trackInventory ? "cogs" : (form.costType || "operating"),
    };
    setPurchases((prev) => [...prev, entry]);

    // Existing stock is always increased. A new item can optionally be added to inventory.
    if (trackInventory) {
      if (entry.itemId) {
        setInventory((prev) => prev.map((i) => {
          if (i.id !== entry.itemId) return i;
          const oldStock = Number(i.stock || 0);
          const oldAvg = Number(i.avgCost || 0);
          const newStock = oldStock + entry.quantity;
          const effectiveOldAvg = oldAvg > 0 ? oldAvg : entry.unitCost;
          const newAvg = newStock > 0 ? ((oldStock * effectiveOldAvg) + (entry.quantity * entry.unitCost)) / newStock : entry.unitCost;
          return { ...i, stock: newStock, avgCost: newAvg };
        }));
      } else if (mode === "new") {
        const newItem = { id: uid(), name: entry.itemName, unit: entry.unit, stock: entry.quantity, reorder: 0, avgCost: entry.unitCost };
        entry.itemId = newItem.id;
        // Persist the purchase with its new inventory item relationship.
        setPurchases((prev) => prev.map((p) => p.id === entry.id ? { ...p, itemId: newItem.id } : p));
        setInventory((prev) => [...prev, newItem]);
      }
    }
    setModal(false);
  };

  const remove = (id) => setPurchases((prev) => prev.filter((p) => p.id !== id));
  const totalSpend = purchases.reduce((s, p) => s + Number(p.totalCost || 0), 0);
  const thisMonthSpend = purchases.filter((p) => p.date.slice(0, 7) === today().slice(0, 7)).reduce((s, p) => s + Number(p.totalCost || 0), 0);

  const exportToExcel = (scope) => {
    const scoped = scope === "today" ? purchases.filter((p) => p.date === today()) : purchases;
    const wb = XLSX.utils.book_new();
    const sheet = scoped.map((p) => ({
      Date: p.date, Category: p.category || "Other", Item: p.itemName, Quantity: p.quantity, Unit: p.unit,
      "Per Unit (Rs)": p.unitCost, "Total Cost (Rs)": p.totalCost, "Accounting": p.costType === "cogs" ? "Stock / COGS" : "Operating / Other",
      Supplier: p.supplier, "Paid Via": PAYMENT_METHODS.find((pm) => pm.id === p.paymentMethod)?.label || "Cash", Notes: p.notes,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheet), "Purchases");
    XLSX.writeFile(wb, `parijat-cafe-purchases-${scope === "today" ? today() : "all"}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Purchase Spend</div><div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{money(totalSpend)}</div></Card>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>This Month</div><div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{money(thisMonthSpend)}</div></Card>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Purchase Entries</div><div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{purchases.length}</div></Card>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <Btn variant="primary" onClick={openNew}><Plus size={15} /> Log Purchase</Btn>
        <div style={{ display: "flex", gap: 8 }}><Btn variant="ghost" onClick={() => exportToExcel("today")}><Download size={15} /> Export Today</Btn><Btn variant="ghost" onClick={() => exportToExcel("all")}><Download size={15} /> Export All</Btn></div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {purchases.length === 0 ? <Empty text="No purchases logged yet. Log a purchase to track stock and supplier spend." /> : (
          <div style={{ overflowX: "auto" }}><table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}><th style={{ padding: "10px 14px" }}>Date</th><th>Category</th><th>Item</th><th>Unit</th><th>Qty</th><th>Per Unit</th><th>Total</th><th>Type</th><th>Paid Via</th><th>Supplier</th><th></th></tr></thead>
            <tbody>{purchases.slice().reverse().map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "10px 14px", opacity: 0.7 }}>{p.date}</td><td>{p.category || "Other"}</td><td style={{ fontWeight: 600 }}>{p.itemName}</td><td>{p.unit}</td><td>{p.quantity}</td><td>{money(p.unitCost)}</td><td>{money(p.totalCost)}</td><td><Pill tone={p.costType === "cogs" ? "good" : "warn"}>{p.costType === "cogs" ? "Stock / COGS" : "Operating"}</Pill></td><td>{PAYMENT_METHODS.find((pm) => pm.id === p.paymentMethod)?.label || "Cash"}</td><td>{p.supplier || "—"}</td><td><button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>

      {modal && (
        <Modal title="Log a Purchase" onClose={() => setModal(false)}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Btn variant={mode === "existing" ? "gold" : "ghost"} onClick={() => { setMode("existing"); setForm((f) => ({ ...f, costType: "cogs", trackInventory: true })); }} style={{ flex: 1, justifyContent: "center" }}>Restock existing item</Btn>
            <Btn variant={mode === "new" ? "gold" : "ghost"} onClick={() => { setMode("new"); setForm((f) => ({ ...f, itemId: "", costType: "operating", trackInventory: false })); }} style={{ flex: 1, justifyContent: "center" }}>New / one-off item</Btn>
          </div>

          <Field label="Category">
            <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {PURCHASE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>

          {mode === "existing" ? (
            <Field label="Inventory Item"><select style={inputStyle} value={form.itemId} onChange={(e) => onPickItem(e.target.value)}><option value="">Select item</option>{inventory.map((i) => <option key={i.id} value={i.id}>{i.name} (currently {i.stock} {i.unit})</option>)}</select></Field>
          ) : (
            <Field label="Item Name"><input style={inputStyle} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="e.g. Surya Cigarettes, Disposable Cups" /></Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><Field label="Unit"><select style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}><option>kg</option><option>g</option><option>L</option><option>ml</option><option>pcs</option><option>box</option><option>pack</option><option>dozen</option></select></Field><Field label="Quantity"><input type="number" min="0" step="any" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field></div>
          <Field label="Per Unit Cost (Rs)"><input type="number" min="0" step="any" style={inputStyle} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></Field>

          {mode === "new" && <>
            <Field label="Stock / Accounting Treatment"><select style={inputStyle} value={form.costType} onChange={(e) => setForm({ ...form, costType: e.target.value, trackInventory: e.target.value === "cogs" })}><option value="operating">Operating / Other Purchase — do not add to inventory</option><option value="cogs">Stock / Cost of Goods — add to inventory</option></select></Field>
            {form.costType === "cogs" && <div style={{ padding: 10, background: "#F0FDF4", border: `1px solid ${T.sage}33`, borderRadius: 8, fontSize: 12, color: T.plum, marginBottom: 12 }}>This new item will be added to inventory and its purchase cost will be treated as stock/COGS.</div>}
          </>}

          <Field label="Paid Via"><select style={inputStyle} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label="Supplier"><input style={inputStyle} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Notes"><input style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><span style={{ fontSize: 13, color: T.plum }}>Total cost</span><strong style={{ fontFamily: "inherit", fontSize: 16 }}>{money(totalCost)}</strong></div>
          <Btn variant="primary" onClick={save} style={{ width: "100%", justifyContent: "center" }}>Save Purchase</Btn>
        </Modal>
      )}
    </div>
  );
}
