import React, { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, ClipboardList, LayoutGrid, Package, Wallet, UtensilsCrossed,
  Users, ChefHat, BarChart3, QrCode, ShoppingBag, Gift, Share2, Plus, X, Trash2,
  Check, Clock, Flame, AlertTriangle, TrendingUp, TrendingDown, Search, Menu as MenuIcon, Shield, Eye, EyeOff, LogOut, Truck
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

/* ---------------- seed data ---------------- */
const SEED_MENU = [
  { id: uid(), name: "Dusk Pour-Over", category: "Coffee & Brews", price: 320, veg: true, available: true, station: "bar" },
  { id: uid(), name: "Parijat Cardamom Latte", category: "Coffee & Brews", price: 280, veg: true, available: true, station: "bar" },
  { id: uid(), name: "Himalayan Cold Brew", category: "Coffee & Brews", price: 260, veg: true, available: true, station: "bar" },
  { id: uid(), name: "Masala Chiya", category: "Coffee & Brews", price: 150, veg: true, available: true, station: "bar" },
  { id: uid(), name: "Sekuwa Skewers", category: "Small Plates", price: 420, veg: false, available: true, station: "kitchen" },
  { id: uid(), name: "Momo Trio", category: "Small Plates", price: 380, veg: false, available: true, station: "kitchen" },
  { id: uid(), name: "Aloo Sadeko Toast", category: "Small Plates", price: 240, veg: true, available: true, station: "kitchen" },
  { id: uid(), name: "Sel Roti Stack", category: "Sweet", price: 260, veg: true, available: true, station: "kitchen" },
  { id: uid(), name: "Malai Cheesecake", category: "Sweet", price: 340, veg: true, available: true, station: "kitchen" },
  { id: uid(), name: "Jasmine Kulfi", category: "Sweet", price: 220, veg: true, available: true, station: "bar" },
];
const SEED_TABLES = Array.from({ length: 10 }, (_, i) => ({
  id: uid(), name: "T" + (i + 1), capacity: i % 3 === 0 ? 2 : 4, status: "free", orderId: null,
}));
const SEED_INVENTORY = [
  { id: uid(), name: "Coffee Beans (Arabica)", unit: "kg", stock: 8, reorder: 5 },
  { id: uid(), name: "Whole Milk", unit: "L", stock: 14, reorder: 10 },
  { id: uid(), name: "Chicken (for Sekuwa)", unit: "kg", stock: 3, reorder: 4 },
  { id: uid(), name: "Momo Flour", unit: "kg", stock: 12, reorder: 6 },
  { id: uid(), name: "Cardamom", unit: "g", stock: 400, reorder: 200 },
  { id: uid(), name: "Cream Cheese", unit: "kg", stock: 2, reorder: 3 },
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
// which modules each role can see. "staff" (Staff Management) is owner-only.
const ROLE_ACCESS = {
  owner: ["overview", "orders", "kds", "tables", "purchase", "inventory", "accounting", "menu", "crm", "sales", "qr", "online", "loyalty", "refer", "staff"],
  manager: ["overview", "orders", "kds", "tables", "purchase", "inventory", "accounting", "menu", "crm", "sales", "qr", "online", "loyalty", "refer"],
  cashier: ["overview", "orders", "tables", "accounting", "crm", "sales", "qr", "online", "loyalty", "refer"],
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
    toDb: (m) => ({ id: m.id, name: m.name, category: m.category, price: m.price, veg: m.veg, available: m.available, station: m.station || "kitchen" }),
    fromDb: (r) => ({ id: r.id, name: r.name, category: r.category, price: Number(r.price), veg: r.veg, available: r.available, station: r.station || "kitchen" }),
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
    }),
    fromDb: (r) => ({
      id: r.id, tableId: r.table_id, tableName: r.table_name, items: r.items, total: Number(r.total),
      status: r.status, source: r.source, customerName: r.customer_name,
      paymentMethod: r.payment_method, createdAt: r.created_at, paidAt: r.paid_at,
      cancelReason: r.cancel_reason, cancelledFromPaid: r.cancelled_from_paid,
      subtotal: r.subtotal != null ? Number(r.subtotal) : Number(r.total), discount: Number(r.discount || 0),
    }),
  },
  inventory: {
    table: "inventory_items",
    toDb: (i) => ({ id: i.id, name: i.name, unit: i.unit, stock: i.stock, reorder: i.reorder }),
    fromDb: (r) => ({ id: r.id, name: r.name, unit: r.unit, stock: Number(r.stock), reorder: Number(r.reorder) }),
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
      payment_method: p.paymentMethod || "cash",
    }),
    fromDb: (r) => ({
      id: r.id, itemId: r.item_id, itemName: r.item_name, quantity: Number(r.quantity), unit: r.unit,
      unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost), supplier: r.supplier, notes: r.notes, date: r.date,
      paymentMethod: r.payment_method || "cash",
    }),
  },
  cashDeposits: {
    table: "cash_deposits",
    toDb: (d) => ({ id: d.id, amount: d.amount, notes: d.notes || null, date: d.date }),
    fromDb: (r) => ({ id: r.id, amount: Number(r.amount), notes: r.notes, date: r.date }),
  },
};

// fetch a whole table fresh from Supabase, mapped to the app's JS shape
async function fetchTable(key) {
  const { table, fromDb } = TABLE_MAP[key];
  const { data, error } = await supabase.from(table).select("*");
  if (error) { console.error("fetch failed", table, error); return []; }
  return data.map(fromDb);
}

// reconcile the whole in-memory array back to Supabase: upsert everything present,
// delete anything that used to be in oldArr but isn't in newArr anymore
async function syncTable(key, oldArr, newArr) {
  const { table, toDb } = TABLE_MAP[key];
  const newIds = new Set(newArr.map((r) => r.id));
  const toDelete = oldArr.filter((r) => !newIds.has(r.id)).map((r) => r.id);
  if (newArr.length) {
    const { error } = await supabase.from(table).upsert(newArr.map(toDb));
    if (error) console.error("upsert failed", table, error);
  }
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) console.error("delete failed", table, error);
  }
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
function Card({ children, style, className = "" }) {
  return (
    <div className={className} style={{ background: "#fff", border: `1px solid ${T.line}`, borderRadius: 12, ...style }}>
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

/* ================= MAIN APP ================= */
export default function App() {
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null); // restored from localStorage after data loads, if a session exists
  const [loginError, setLoginError] = useState("");

  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [waste, setWaste] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [cashDeposits, setCashDeposits] = useState([]);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    (async () => {
      const [m, t, o, inv, w, exp, cust, ref, purch, deposits] = await Promise.all([
        fetchTable("menu"),
        fetchTable("tables"),
        fetchTable("orders"),
        fetchTable("inventory"),
        fetchTable("waste"),
        fetchTable("expenses"),
        fetchTable("customers"),
        fetchTable("referrals"),
        fetchTable("purchases"),
        fetchTable("cashDeposits"),
      ]);
      // seed empty tables on very first run so the app isn't blank
      setMenu(m.length ? m : SEED_MENU);
      setTables(t.length ? t : SEED_TABLES);
      setOrders(o);
      setInventory(inv.length ? inv : SEED_INVENTORY);
      setWaste(w);
      setExpenses(exp);
      setCustomers(cust.length ? cust : SEED_CUSTOMERS);
      setReferrals(ref);
      setPurchases(purch);
      setCashDeposits(deposits);
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
    })();
  }, []);

  // persist helpers — update local state immediately, sync the change to Supabase in the background
  const persist = {
    menu: (v) => { const prev = menu; setMenu(v); syncTable("menu", prev, v); },
    tables: (v) => { const prev = tables; setTables(v); syncTable("tables", prev, v); },
    orders: (v) => { const prev = orders; setOrders(v); syncTable("orders", prev, v); },
    inventory: (v) => { const prev = inventory; setInventory(v); syncTable("inventory", prev, v); },
    waste: (v) => { const prev = waste; setWaste(v); syncTable("waste", prev, v); },
    expenses: (v) => { const prev = expenses; setExpenses(v); syncTable("expenses", prev, v); },
    customers: (v) => { const prev = customers; setCustomers(v); syncTable("customers", prev, v); },
    referrals: (v) => { const prev = referrals; setReferrals(v); syncTable("referrals", prev, v); },
    purchases: (v) => { const prev = purchases; setPurchases(v); syncTable("purchases", prev, v); },
    cashDeposits: (v) => { const prev = cashDeposits; setCashDeposits(v); syncTable("cashDeposits", prev, v); },
    refreshStaff: async () => {
      const { data } = await supabase.rpc("list_staff");
      setStaff(data || []);
    },
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
    { id: "staff", label: "Staff & Roles", icon: Shield, group: "Admin" },
  ];
  const groups = ["Main", "Operate", "Grow", "Admin"];
  const allowed = currentUser ? (ROLE_ACCESS[currentUser.role] || []) : [];
  const visibleNav = NAV.filter((n) => allowed.includes(n.id));

  const login = async (username, password) => {
    const { data, error } = await supabase.rpc("login_staff", { p_username: username.trim(), p_password: password });
    if (error) { setLoginError("Something went wrong reaching the server. Try again."); return; }
    const found = data && data[0];
    if (!found) { setLoginError("Incorrect username or password."); return; }
    if (!found.active) { setLoginError("This account has been deactivated. Ask the owner to reactivate it."); return; }
    setLoginError("");
    setCurrentUser(found);
    try { localStorage.setItem("parijat_session_id", found.id); } catch (e) { /* ignore */ }
    setActive(ROLE_ACCESS[found.role][0] || "overview");
  };
  const logout = () => {
    setCurrentUser(null);
    setActive("overview");
    try { localStorage.removeItem("parijat_session_id"); } catch (e) { /* ignore */ }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 500, fontFamily: "sans-serif", color: T.plum }}>
        Loading Parijat Cafe dashboard…
      </div>
    );
  }

  if (!currentUser) {
    return <Login staff={staff} onLogin={login} error={loginError} />;
  }

  const activeLabel = NAV.find((n) => n.id === active)?.label || "";

  return (
    <div style={{ fontFamily: "'Inter', Arial, sans-serif", background: T.cream, minHeight: "100%", display: "flex", color: T.ink }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LiveClock />
            <Pill tone="good">● Live</Pill>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {active === "overview" && <Overview orders={orders} tables={tables} inventory={inventory} expenses={expenses} customers={customers} />}
          {active === "orders" && <Orders menu={menu} tables={tables} orders={orders} setOrders={persist.orders} setTables={persist.tables} customers={customers} setCustomers={persist.customers} currentUser={currentUser} />}
          {active === "kds" && <KDS orders={orders} setOrders={persist.orders} tables={tables} setTables={persist.tables} menu={menu} />}
          {active === "tables" && <TablesView tables={tables} setTables={persist.tables} orders={orders} />}
          {active === "purchase" && <PurchaseManagement purchases={purchases} setPurchases={persist.purchases} inventory={inventory} setInventory={persist.inventory} />}
          {active === "inventory" && <Inventory inventory={inventory} setInventory={persist.inventory} waste={waste} setWaste={persist.waste} />}
          {active === "accounting" && <Accounting expenses={expenses} setExpenses={persist.expenses} orders={orders} purchases={purchases} cashDeposits={cashDeposits} setCashDeposits={persist.cashDeposits} />}
          {active === "menu" && <MenuManagement menu={menu} setMenu={persist.menu} />}
          {active === "crm" && <CRM customers={customers} setCustomers={persist.customers} orders={orders} />}
          {active === "sales" && <SalesReport orders={orders} menu={menu} />}
          {active === "qr" && <QRMenu menu={menu} />}
          {active === "online" && <OnlineOrder menu={menu} orders={orders} setOrders={persist.orders} />}
          {active === "loyalty" && <Loyalty customers={customers} setCustomers={persist.customers} />}
          {active === "refer" && <ReferEarn customers={customers} referrals={referrals} setReferrals={persist.referrals} setCustomers={persist.customers} />}
          {active === "staff" && <StaffManagement staff={staff} refreshStaff={persist.refreshStaff} currentUser={currentUser} />}
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
function Overview({ orders, tables, inventory, expenses, customers }) {
  const todaysOrders = orders.filter((o) => o.createdAt?.slice(0, 10) === today());
  const todaysSales = todaysOrders.filter((o) => o.status === "paid").reduce((s, o) => s + o.total, 0);
  const activeOrders = orders.filter((o) => o.status !== "paid" && o.status !== "cancelled").length;
  const occupied = tables.filter((t) => t.status === "occupied").length;
  const lowStock = inventory.filter((i) => i.stock <= i.reorder).length;
  const todaysExpense = expenses.filter((e) => e.date === today()).reduce((s, e) => s + Number(e.amount), 0);

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
          <OrderTable rows={orders.slice(-6).reverse()} />
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
];

function Orders({ menu, tables, orders, setOrders, setTables, customers, setCustomers, currentUser }) {
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
    if (!tableId || Object.keys(cart).length === 0) return;
    const table = tables.find((t) => t.id === tableId);
    const items = Object.entries(cart).map(([id, qty]) => {
      const m = menu.find((mm) => mm.id === id);
      return { menuId: id, name: m.name, qty, price: m.price };
    });
    const order = { id: uid(), tableId, tableName: table.name, items, subtotal: cartTotal, discount: 0, total: cartTotal, status: "placed", createdAt: new Date().toISOString(), source: "dine-in" };
    setOrders([...orders, order]);
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
    setOrders(orders.map((o) => (o.id === order.id
      ? { ...o, items: mergedItems, subtotal: newSubtotal, total: newTotal, status: "placed" } // back to "placed" so kitchen/bar sees the new item
      : o)));
    setAddItemTarget(null); setAddCart({}); setAddItemSearch("");
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
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, subtotal, discount: discountAmt, total: newTotal } : o)));
    setDiscountTarget(null);
  };

  const advance = (order) => {
    const flow = ["placed", "preparing", "ready", "served", "paid"];
    const next = flow[flow.indexOf(order.status) + 1];
    if (!next) return;
    if (next === "paid") { setPayOrder(order); return; } // don't finalize yet — need payment method
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
  };

  const settlePayment = (order, method) => {
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: "paid", paymentMethod: method, paidAt: new Date().toISOString() } : o)));
    setTables(tables.map((t) => (t.id === order.tableId ? { ...t, status: "free", orderId: null } : t)));
    // loyalty points: 1 point per Rs 100
    const cust = customers.find((c) => c.name === order.customerName);
    if (cust) {
      setCustomers(customers.map((c) => c.id === cust.id ? { ...c, points: c.points + Math.floor(order.total / 100), visits: c.visits + 1 } : c));
    }
    setPayOrder(null);
  };
  const cancelOrder = (order) => {
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: "cancelled" } : o)));
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

  const confirmVoid = () => {
    if (!voidReason.trim()) return;
    const order = voidTarget;
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: "cancelled", cancelReason: voidReason.trim(), cancelledFromPaid: true } : o)));
    // reverse any loyalty points/visit that were credited when it was paid
    const cust = customers.find((c) => c.name === order.customerName);
    if (cust) {
      setCustomers(customers.map((c) => c.id === cust.id
        ? { ...c, points: Math.max(0, c.points - Math.floor(order.total / 100)), visits: Math.max(0, c.visits - 1) }
        : c));
    }
    setVoidTarget(null);
  };

  const visible = orders.filter((o) => filter === "active" ? !["paid", "cancelled"].includes(o.status) : true).slice().reverse();
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
    return Object.entries(groups); // already in descending order since `visible` is reversed and grouped in that order
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
          <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> New Order</Btn>
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
                            Subtotal {money(o.subtotal != null ? o.subtotal : o.total)} · Discount −{money(o.discount)}
                          </div>
                        )}
                        {o.cancelReason && <div style={{ fontSize: 12, color: T.red, marginTop: 4 }}>Reason: {o.cancelReason}</div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700, fontFamily: "inherit", color: T.dusk, marginBottom: 8 }}>{money(o.total)}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {!["paid", "cancelled"].includes(o.status) && <Btn variant="ghost" onClick={() => openAddItem(o)}><Plus size={14} /> Add Item</Btn>}
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
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status: to } : o)));
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
function Inventory({ inventory, setInventory, waste, setWaste }) {
  const [tab, setTab] = useState("stock");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", unit: "kg", stock: "", reorder: "" });
  const [wasteForm, setWasteForm] = useState({ itemId: "", qty: "", reason: "" });
  const [wasteModal, setWasteModal] = useState(false);

  const addItem = () => {
    if (!form.name) return;
    setInventory([...inventory, { id: uid(), name: form.name, unit: form.unit, stock: Number(form.stock) || 0, reorder: Number(form.reorder) || 0 }]);
    setForm({ name: "", unit: "kg", stock: "", reorder: "" }); setModal(false);
  };
  const adjustStock = (id, delta) => setInventory(inventory.map((i) => i.id === id ? { ...i, stock: Math.max(0, i.stock + delta) } : i));
  const removeItem = (id) => setInventory(inventory.filter((i) => i.id !== id));

  const logWaste = () => {
    const item = inventory.find((i) => i.id === wasteForm.itemId);
    if (!item || !wasteForm.qty) return;
    setWaste([...waste, { id: uid(), itemName: item.name, qty: Number(wasteForm.qty), unit: item.unit, reason: wasteForm.reason || "Unspecified", date: today() }]);
    setInventory(inventory.map((i) => i.id === item.id ? { ...i, stock: Math.max(0, i.stock - Number(wasteForm.qty)) } : i));
    setWasteForm({ itemId: "", qty: "", reason: "" }); setWasteModal(false);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const stockSheet = inventory.map((i) => ({ Item: i.name, Stock: i.stock, Unit: i.unit, "Reorder Level": i.reorder, Status: i.stock <= i.reorder ? "Reorder now" : "Healthy" }));
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
              <th style={{ padding: "10px 14px" }}>Item</th><th>Stock</th><th>Reorder Level</th><th>Status</th><th></th>
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
function Accounting({ expenses, setExpenses, orders, purchases, cashDeposits, setCashDeposits }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ category: "Ingredients", description: "", amount: "", paymentMethod: "cash" });
  const [depositModal, setDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositNotes, setDepositNotes] = useState("");

  const revenue = orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.total, 0);
  const totalExpense = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalPurchaseSpend = purchases.reduce((s, p) => s + Number(p.totalCost), 0);
  const profit = revenue - totalExpense - totalPurchaseSpend;
  const totalDeposited = cashDeposits.reduce((s, d) => s + Number(d.amount), 0);

  const addExpense = () => {
    if (!form.amount) return;
    setExpenses([...expenses, { id: uid(), category: form.category, description: form.description, amount: Number(form.amount), date: today(), paymentMethod: form.paymentMethod }]);
    setForm({ category: "Ingredients", description: "", amount: "", paymentMethod: "cash" }); setModal(false);
  };
  const removeExpense = (id) => setExpenses(expenses.filter((e) => e.id !== id));

  const addDeposit = () => {
    if (!depositAmount) return;
    setCashDeposits([...cashDeposits, { id: uid(), amount: Number(depositAmount), notes: depositNotes, date: today() }]);
    setDepositAmount(""); setDepositNotes(""); setDepositModal(false);
  };
  const removeDeposit = (id) => setCashDeposits(cashDeposits.filter((d) => d.id !== id));

  const paidOrders = orders.filter((o) => o.status === "paid");

  // full cash/bank reconciliation: money IN from paid orders, money OUT from expenses + purchases, per payment method
  const methodBreakdown = PAYMENT_METHODS.map((p) => {
    const moneyIn = paidOrders.filter((o) => o.paymentMethod === p.id).reduce((s, o) => s + o.total, 0);
    const expenseOut = expenses.filter((e) => e.paymentMethod === p.id).reduce((s, e) => s + Number(e.amount), 0);
    const purchaseOut = purchases.filter((pu) => pu.paymentMethod === p.id).reduce((s, pu) => s + Number(pu.totalCost), 0);
    return { ...p, in: moneyIn, out: expenseOut + purchaseOut, net: moneyIn - expenseOut - purchaseOut };
  }).filter((p) => p.in > 0 || p.out > 0);

  // cash deposits move money OUT of the till and INTO the bank — not revenue or expense, just a transfer
  const cashBalance = (methodBreakdown.find((p) => p.id === "cash")?.net || 0) - totalDeposited;
  const bankBalance = methodBreakdown.filter((p) => p.id !== "cash").reduce((s, p) => s + p.net, 0) + totalDeposited;

  const exportToExcel = (scope) => {
    const scoped = (arr, dateField = "date") => scope === "today" ? arr.filter((r) => (r[dateField] || "").slice(0, 10) === today()) : arr;
    const scopedOrders = scoped(paidOrders, "createdAt");
    const scopedExpenses = scoped(expenses);
    const scopedPurchases = scoped(purchases);
    const scopedDeposits = scoped(cashDeposits);

    const rev = scopedOrders.reduce((s, o) => s + o.total, 0);
    const exp = scopedExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const pur = scopedPurchases.reduce((s, p) => s + Number(p.totalCost), 0);
    const dep = scopedDeposits.reduce((s, d) => s + Number(d.amount), 0);
    const cashIn = scopedOrders.filter((o) => o.paymentMethod === "cash").reduce((s, o) => s + o.total, 0);
    const cashOut = scopedExpenses.filter((e) => e.paymentMethod === "cash").reduce((s, e) => s + Number(e.amount), 0)
      + scopedPurchases.filter((p) => p.paymentMethod === "cash").reduce((s, p) => s + Number(p.totalCost), 0);
    const bankIn = scopedOrders.filter((o) => o.paymentMethod !== "cash").reduce((s, o) => s + o.total, 0);
    const bankOut = scopedExpenses.filter((e) => e.paymentMethod !== "cash").reduce((s, e) => s + Number(e.amount), 0)
      + scopedPurchases.filter((p) => p.paymentMethod !== "cash").reduce((s, p) => s + Number(p.totalCost), 0);

    const wb = XLSX.utils.book_new();
    const summarySheet = [
      { Metric: scope === "today" ? "Revenue Today (Rs)" : "Total Revenue (Rs)", Value: rev },
      { Metric: scope === "today" ? "Expenses Today (Rs)" : "Total Expenses (Rs)", Value: exp },
      { Metric: scope === "today" ? "Purchases Today (Rs)" : "Total Purchases (Rs)", Value: pur },
      { Metric: scope === "today" ? "Net Today (Rs)" : "Net Profit (Rs)", Value: rev - exp - pur },
      { Metric: "Cash Deposited to Bank (Rs)", Value: dep },
      { Metric: "Cash Movement — In (Rs)", Value: cashIn },
      { Metric: "Cash Movement — Out (Rs)", Value: cashOut },
      { Metric: "Bank Movement — In (Rs)", Value: bankIn },
      { Metric: "Bank Movement — Out (Rs)", Value: bankOut },
    ];
    if (scope === "all") {
      summarySheet.push({ Metric: "Cash in Hand right now (Rs)", Value: cashBalance });
      summarySheet.push({ Metric: "Bank Balance right now (Rs)", Value: bankBalance });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");

    const expenseSheet = scopedExpenses.map((e) => ({
      Date: e.date, Category: e.category, Description: e.description, "Amount (Rs)": e.amount,
      "Paid Via": PAYMENT_METHODS.find((p) => p.id === e.paymentMethod)?.label || e.paymentMethod,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseSheet), "Expenses");

    if (scopedDeposits.length > 0) {
      const depositSheet = scopedDeposits.map((d) => ({ Date: d.date, "Amount (Rs)": d.amount, Notes: d.notes }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(depositSheet), "Cash Deposits");
    }

    XLSX.writeFile(wb, `parijat-cafe-accounting-${scope === "today" ? today() : "all"}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14, gap: 8 }}>
        <Btn variant="ghost" onClick={() => exportToExcel("today")}><Download size={15} /> Export Today</Btn>
        <Btn variant="primary" onClick={() => exportToExcel("all")}><Download size={15} /> Export All</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14, marginBottom: 20 }}>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Revenue</div><div style={{ fontSize: 22, fontWeight: 700, color: "#15803D", fontFamily: "inherit" }}>{money(revenue)}</div></Card>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Expenses</div><div style={{ fontSize: 22, fontWeight: 700, color: T.red, fontFamily: "inherit" }}>{money(totalExpense)}</div></Card>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Total Purchases</div><div style={{ fontSize: 22, fontWeight: 700, color: T.red, fontFamily: "inherit" }}>{money(totalPurchaseSpend)}</div></Card>
        <Card style={{ padding: 16 }}><div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Net Profit</div><div style={{ fontSize: 22, fontWeight: 700, color: T.dusk, fontFamily: "inherit" }}>{money(profit)}</div></Card>
      </div>

      <Card style={{ padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 15, color: T.dusk, marginBottom: 4 }}>Cash & Bank Reconciliation</h3>
            <div style={{ fontSize: 12, color: T.plum, opacity: 0.7 }}>Cash sales minus cash spending vs. everything paid through card/FonePay/eSewa/Khalti/bank transfer.</div>
          </div>
          <Btn variant="gold" onClick={() => setDepositModal(true)}><Plus size={15} /> Log Cash Deposit</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 18, marginTop: 14 }}>
          <div style={{ background: T.cream, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: T.plum, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Cash in Hand</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{money(cashBalance)}</div>
          </div>
          <div style={{ background: T.cream, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: T.plum, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Bank Balance</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{money(bankBalance)}</div>
          </div>
          <div style={{ background: T.cream, borderRadius: 8, padding: 14 }}>
            <div style={{ fontSize: 11, color: T.plum, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.4 }}>Total Deposited to Bank</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.dusk }}>{money(totalDeposited)}</div>
          </div>
        </div>
        {methodBreakdown.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: cashDeposits.length ? 18 : 0 }}>
            <thead><tr style={{ textAlign: "left", color: T.plum, opacity: 0.65, fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ padding: "6px 4px" }}>Method</th><th>In</th><th>Out</th><th>Net</th>
            </tr></thead>
            <tbody>
              {methodBreakdown.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "8px 4px" }}>{p.label}</td>
                  <td style={{ color: "#15803D" }}>{money(p.in)}</td>
                  <td style={{ color: T.red }}>{money(p.out)}</td>
                  <td style={{ fontWeight: 600 }}>{money(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cashDeposits.length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.plum, marginBottom: 8 }}>Cash Deposits to Bank</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {cashDeposits.slice().reverse().map((d) => (
                  <tr key={d.id} style={{ borderTop: `1px solid ${T.line}` }}>
                    <td style={{ padding: "6px 4px", opacity: 0.7 }}>{d.date}</td>
                    <td style={{ padding: "6px 4px" }}>{d.notes || "—"}</td>
                    <td style={{ padding: "6px 4px", fontWeight: 600 }}>{money(d.amount)}</td>
                    <td style={{ padding: "6px 4px", textAlign: "right" }}><button onClick={() => removeDeposit(d.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "inherit", fontSize: 16, color: T.dusk }}>Expenses</h3>
        <Btn variant="primary" onClick={() => setModal(true)}><Plus size={15} /> Add Expense</Btn>
      </div>
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {expenses.length === 0 ? <Empty text="No expenses recorded yet." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}><th style={{ padding: "10px 14px" }}>Category</th><th>Description</th><th>Amount</th><th>Paid Via</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {expenses.slice().reverse().map((e) => (
                <tr key={e.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px" }}><Pill>{e.category}</Pill></td>
                  <td>{e.description || "—"}</td>
                  <td>{money(e.amount)}</td>
                  <td>{PAYMENT_METHODS.find((p) => p.id === e.paymentMethod)?.label || "Cash"}</td>
                  <td style={{ opacity: 0.7 }}>{e.date}</td>
                  <td><button onClick={() => removeExpense(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {modal && (
        <Modal title="Add Expense" onClose={() => setModal(false)}>
          <Field label="Category">
            <select style={inputStyle} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Ingredients</option><option>Rent</option><option>Utilities</option><option>Staff Wages</option><option>Maintenance</option><option>Marketing</option><option>Other</option>
            </select>
          </Field>
          <Field label="Description"><input style={inputStyle} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Amount (Rs)"><input type="number" style={inputStyle} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
          <Field label="Paid Via">
            <select style={inputStyle} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Btn variant="primary" onClick={addExpense} style={{ width: "100%", justifyContent: "center" }}>Add Expense</Btn>
        </Modal>
      )}

      {depositModal && (
        <Modal title="Log Cash Deposit" onClose={() => setDepositModal(false)}>
          <div style={{ fontSize: 12.5, color: T.plum, marginBottom: 14 }}>
            Record cash you physically took from the till and deposited into the cafe's bank account. This moves the amount from Cash in Hand to Bank Balance.
          </div>
          <Field label="Amount Deposited (Rs)"><input type="number" style={inputStyle} value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} autoFocus /></Field>
          <Field label="Notes"><input style={inputStyle} value={depositNotes} onChange={(e) => setDepositNotes(e.target.value)} placeholder="Optional — e.g. bank branch, slip number" /></Field>
          <Btn variant="primary" onClick={addDeposit} style={{ width: "100%", justifyContent: "center" }}>Log Deposit</Btn>
        </Modal>
      )}
    </div>
  );
}

/* ================= MENU MANAGEMENT ================= */
function MenuManagement({ menu, setMenu }) {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Coffee & Brews", price: "", veg: true, station: "kitchen" });

  const openNew = () => { setEditing(null); setForm({ name: "", category: "Coffee & Brews", price: "", veg: true, station: "kitchen" }); setModal(true); };
  const openEdit = (m) => { setEditing(m.id); setForm({ ...m, station: m.station || "kitchen" }); setModal(true); };
  const save = () => {
    if (!form.name || !form.price) return;
    if (editing) setMenu(menu.map((m) => m.id === editing ? { ...m, ...form, price: Number(form.price) } : m));
    else setMenu([...menu, { id: uid(), ...form, price: Number(form.price), available: true }]);
    setModal(false);
  };
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
function OnlineOrder({ menu, orders, setOrders }) {
  const [cart, setCart] = useState({});
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [placed, setPlaced] = useState(false);
  const add = (m) => setCart((c) => ({ ...c, [m.id]: (c[m.id] || 0) + 1 }));
  const sub = (m) => setCart((c) => { const n = { ...c }; if (n[m.id] > 1) n[m.id]--; else delete n[m.id]; return n; });
  const total = Object.entries(cart).reduce((s, [id, qty]) => s + qty * (menu.find((m) => m.id === id)?.price || 0), 0);

  const checkout = () => {
    const items = Object.entries(cart).map(([id, qty]) => {
      const m = menu.find((mm) => mm.id === id);
      return { menuId: id, name: m.name, qty, price: m.price };
    });
    setOrders([...orders, { id: uid(), tableId: null, tableName: "Online", items, total, status: "placed", createdAt: new Date().toISOString(), source: "online", customerName }]);
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

/* ================= STAFF & ROLES ================= */
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
    const usernameTaken = staff.some((s) => s.username.toLowerCase() === form.username.trim().toLowerCase() && s.id !== editing);
    if (usernameTaken) { alert("That username is already taken — pick another."); return; }
    setSaving(true);
    if (editing) {
      const { error } = await supabase.rpc("update_staff", { p_id: editing, p_name: form.name, p_username: form.username, p_role: form.role });
      if (error) { alert("Couldn't save changes: " + error.message); setSaving(false); return; }
      if (form.password) {
        const { error: pwErr } = await supabase.rpc("update_staff_password", { p_id: editing, p_password: form.password });
        if (pwErr) { alert("Name/role saved, but password update failed: " + pwErr.message); }
      }
    } else {
      const { error } = await supabase.rpc("create_staff", { p_name: form.name, p_username: form.username, p_password: form.password, p_role: form.role });
      if (error) { alert("Couldn't create account: " + error.message); setSaving(false); return; }
    }
    await refreshStaff();
    setSaving(false);
    setModal(false);
  };

  const toggleActive = async (s) => {
    if (s.id === currentUser.id) { alert("You can't deactivate the account you're currently signed in with."); return; }
    const { error } = await supabase.rpc("set_staff_active", { p_id: s.id, p_active: !s.active });
    if (error) { alert("Couldn't update status: " + error.message); return; }
    await refreshStaff();
  };
  const remove = async (s) => {
    if (s.id === currentUser.id) { alert("You can't remove the account you're currently signed in with."); return; }
    const owners = staff.filter((x) => x.role === "owner" && x.active);
    if (s.role === "owner" && owners.length <= 1) { alert("At least one active Owner account must remain."); return; }
    const { error } = await supabase.rpc("delete_staff", { p_id: s.id });
    if (error) { alert("Couldn't remove account: " + error.message); return; }
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
                {r.id === "owner" && "Full access — every module, plus Staff & Roles."}
                {r.id === "manager" && "Everything except Staff & Roles."}
                {r.id === "cashier" && "Orders, Tables, Accounting, CRM, Sales, QR/Online, Loyalty, Refer."}
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
function PurchaseManagement({ purchases, setPurchases, inventory, setInventory }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ itemId: "", itemName: "", quantity: "", unit: "kg", unitCost: "", supplier: "", notes: "", paymentMethod: "cash" });
  const [mode, setMode] = useState("existing"); // "existing" inventory item, or "new" one-off item

  const openNew = () => {
    setForm({ itemId: "", itemName: "", quantity: "", unit: "kg", unitCost: "", supplier: "", notes: "", paymentMethod: "cash" });
    setMode("existing");
    setModal(true);
  };

  const onPickItem = (id) => {
    const item = inventory.find((i) => i.id === id);
    setForm({ ...form, itemId: id, itemName: item ? item.name : "", unit: item ? item.unit : form.unit });
  };

  const totalCost = (Number(form.quantity) || 0) * (Number(form.unitCost) || 0);

  const save = () => {
    if (!form.itemName || !form.quantity || !form.unitCost) return;
    const entry = {
      id: uid(),
      itemId: mode === "existing" ? form.itemId || null : null,
      itemName: form.itemName,
      quantity: Number(form.quantity),
      unit: form.unit,
      unitCost: Number(form.unitCost),
      totalCost,
      supplier: form.supplier,
      notes: form.notes,
      date: today(),
      paymentMethod: form.paymentMethod,
    };
    setPurchases([...purchases, entry]);

    // if this purchase matches an existing inventory item, bump its stock automatically
    if (entry.itemId) {
      setInventory(inventory.map((i) => (i.id === entry.itemId ? { ...i, stock: i.stock + entry.quantity } : i)));
    }
    setModal(false);
  };

  const remove = (id) => setPurchases(purchases.filter((p) => p.id !== id));

  const totalSpend = purchases.reduce((s, p) => s + p.totalCost, 0);
  const thisMonthSpend = purchases.filter((p) => p.date.slice(0, 7) === today().slice(0, 7)).reduce((s, p) => s + p.totalCost, 0);

  const exportToExcel = (scope) => {
    const scoped = scope === "today" ? purchases.filter((p) => p.date === today()) : purchases;
    const wb = XLSX.utils.book_new();
    const sheet = scoped.map((p) => ({
      Date: p.date, Item: p.itemName, Quantity: p.quantity, Unit: p.unit,
      "Unit Cost (Rs)": p.unitCost, "Total Cost (Rs)": p.totalCost, Supplier: p.supplier,
      "Paid Via": PAYMENT_METHODS.find((pm) => pm.id === p.paymentMethod)?.label || "Cash", Notes: p.notes,
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
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" onClick={() => exportToExcel("today")}><Download size={15} /> Export Today</Btn>
          <Btn variant="ghost" onClick={() => exportToExcel("all")}><Download size={15} /> Export All</Btn>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {purchases.length === 0 ? <Empty text="No purchases logged yet. Log a restock to track supplier spend." /> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead><tr style={{ background: "#F6F0E1", textAlign: "left" }}>
              <th style={{ padding: "10px 14px" }}>Date</th><th>Item</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th>Paid Via</th><th>Supplier</th><th></th>
            </tr></thead>
            <tbody>
              {purchases.slice().reverse().map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "10px 14px", opacity: 0.7 }}>{p.date}</td>
                  <td style={{ fontWeight: 600 }}>{p.itemName}</td>
                  <td>{p.quantity} {p.unit}</td>
                  <td>{money(p.unitCost)}</td>
                  <td>{money(p.totalCost)}</td>
                  <td>{PAYMENT_METHODS.find((pm) => pm.id === p.paymentMethod)?.label || "Cash"}</td>
                  <td>{p.supplier || "—"}</td>
                  <td><button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.plum, opacity: 0.5 }}><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {modal && (
        <Modal title="Log a Purchase" onClose={() => setModal(false)}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <Btn variant={mode === "existing" ? "gold" : "ghost"} onClick={() => setMode("existing")} style={{ flex: 1, justifyContent: "center" }}>Restock existing item</Btn>
            <Btn variant={mode === "new" ? "gold" : "ghost"} onClick={() => { setMode("new"); setForm({ ...form, itemId: "" }); }} style={{ flex: 1, justifyContent: "center" }}>New / one-off item</Btn>
          </div>

          {mode === "existing" ? (
            <Field label="Inventory Item">
              <select style={inputStyle} value={form.itemId} onChange={(e) => onPickItem(e.target.value)}>
                <option value="">Select item</option>
                {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} (currently {i.stock} {i.unit})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Item Name"><input style={inputStyle} value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} placeholder="e.g. Disposable cups" /></Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Quantity"><input type="number" style={inputStyle} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></Field>
            <Field label="Unit">
              <select style={inputStyle} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                <option>kg</option><option>g</option><option>L</option><option>ml</option><option>pcs</option>
              </select>
            </Field>
          </div>
          <Field label="Unit Cost (Rs)"><input type="number" style={inputStyle} value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} /></Field>
          <Field label="Paid Via">
            <select style={inputStyle} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Supplier"><input style={inputStyle} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Optional" /></Field>
          <Field label="Notes"><input style={inputStyle} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional" /></Field>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: T.plum }}>Total cost</span>
            <strong style={{ fontFamily: "inherit", fontSize: 16 }}>{money(totalCost)}</strong>
          </div>
          <Btn variant="primary" onClick={save} style={{ width: "100%", justifyContent: "center" }}>Save Purchase</Btn>
        </Modal>
      )}
    </div>
  );
}
