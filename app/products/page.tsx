"use client";

import React, { useEffect, useMemo, useState } from "react";
import { C } from "@/lib/design";
import MobileTabBar from "@/components/MobileTabBar";
import { COMPANY } from "@/lib/company";

// ── 型別 ─────────────────────────────────────────────
interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  spec: string | null;
  unit: string;
  list_price: number;
  channel_price: number;
  cost_price: number;
  min_order: number;
  lead_days: number;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}
interface QuoteItem {
  id?: string;
  product_id?: string | null;
  name: string;
  sku?: string | null;
  spec?: string | null;
  unit?: string;
  unit_price: number;
  list_price?: number | null;
  qty: number;
  amount?: number;
}
interface Quote {
  id: string;
  quote_no: string | null;
  brand_id: string | null;
  customer_name: string | null;
  sales_rep?: string | null;
  buyer_tax_id?: string | null;
  buyer_contact?: string | null;
  buyer_phone?: string | null;
  show_list_price?: boolean;
  title: string;
  status: string;
  valid_days: number;
  subtotal: number;
  discount_pct: number;
  discount_amt: number;
  total: number;
  note: string | null;
  created_at: string;
  brands?: { name?: string } | null;
  quote_items?: QuoteItem[];
}
interface BrandLite { id: string; name: string; email?: string | null }
interface Category { id: string; name: string; color: string; sort_order: number; count?: number }

const CAT_COLORS = ["#8FAAA4", "#5E8880", "#A66A4F", "#5B7C99", "#B8860B", "#7A4FB0", "#C0392B", "#4A6B50", "#D97706", "#06808A"];

const QUOTE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  draft: { label: "草稿", bg: "#F0EEE8", fg: "#8A8678" },
  sent: { label: "已寄出", bg: "#E3ECF2", fg: "#5B7C99" },
  accepted: { label: "已接受", bg: "#DCE9DC", fg: "#4A6B50" },
  expired: { label: "已過期", bg: "#F3E4DC", fg: "#A66A4F" },
  rejected: { label: "已婉拒", bg: "#F3E4DC", fg: "#A66A4F" },
};

const money = (n: number) => `NT$${(n || 0).toLocaleString()}`;
const emptyProduct = (): Partial<Product> => ({
  name: "", sku: "", category: "", spec: "", unit: "組",
  list_price: 0, channel_price: 0, cost_price: 0, min_order: 1, lead_days: 7, description: "",
});

export default function ProductsPage() {
  const [tab, setTab] = useState<"products" | "quotes">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [brands, setBrands] = useState<BrandLite[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"card" | "list">("card");

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("products_view") : null;
    if (saved === "card" || saved === "list") setView(saved);
  }, []);
  const changeView = (v: "card" | "list") => {
    setView(v);
    try { window.localStorage.setItem("products_view", v); } catch { /* localStorage 不可用時忽略 */ }
  };

  const loadCategories = () => {
    fetch("/api/product-categories")
      .then((r) => r.json())
      .then((d) => { if (d.success) setCategories(d.data); })
      .catch(() => {});
  };

  // 產品編輯
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null);
  // 報價單建立
  const [quoteBuilder, setQuoteBuilder] = useState(false);
  // 報價單檢視
  const [viewQuote, setViewQuote] = useState<Quote | null>(null);
  // xlsx 匯入
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const importRef = React.useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/products/import", { method: "POST", body: form });
      const d = await res.json();
      if (d.success) {
        setImportMsg({ ok: true, text: `匯入完成：新增 ${d.inserted} 筆、更新 ${d.updated} 筆${d.failed ? `、失敗 ${d.failed} 筆` : ""}，共 ${d.total} 筆` });
        loadProducts();
      } else {
        setImportMsg({ ok: false, text: d.error || "匯入失敗" });
      }
    } catch {
      setImportMsg({ ok: false, text: "連線失敗" });
    }
    setImporting(false);
    if (importRef.current) importRef.current.value = "";
    setTimeout(() => setImportMsg(null), 10000);
  };

  const loadProducts = () => {
    fetch("/api/products?all=true")
      .then((r) => r.json())
      .then((d) => { if (d.success) setProducts(d.data); })
      .catch(() => {});
  };
  const loadQuotes = () => {
    fetch("/api/quotes")
      .then((r) => r.json())
      .then((d) => { if (d.success) setQuotes(d.data); })
      .catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      fetch("/api/products?all=true").then((r) => r.json()),
      fetch("/api/quotes").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/product-categories").then((r) => r.json()),
    ])
      .then(([p, q, b, c]) => {
        if (p.success) setProducts(p.data);
        if (q.success) setQuotes(q.data);
        if (b.success) setBrands((b.data || []).map((x: Record<string, unknown>) => ({ id: x.id, name: x.name, email: x.email })));
        if (c.success) setCategories(c.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* Top bar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>產品與報價</h1>
        <span className="d-only" style={{ fontSize: 13, color: C.muted }}>— 維護產品資料、快速建立客製化報價單</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {tab === "products" ? (
            <>
              <input ref={importRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImport} />
              <button onClick={() => importRef.current?.click()} disabled={importing} className="pressable"
                style={{ padding: "7px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, cursor: importing ? "default" : "pointer" }}>
                {importing ? "匯入中…" : "📥 匯入 xlsx"}
              </button>
              <button onClick={() => setEditProduct(emptyProduct())} className="pressable"
                style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                ＋ 新增產品
              </button>
            </>
          ) : (
            <button onClick={() => setQuoteBuilder(true)} className="pressable"
              style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              ＋ 新增報價單
            </button>
          )}
        </div>
      </div>

      {importMsg && (
        <div style={{ padding: "10px 20px", background: importMsg.ok ? C.successBg : C.dangerBg, borderBottom: `1px solid ${C.border}`, fontSize: 13, color: importMsg.ok ? C.success : C.danger, flexShrink: 0 }}>
          {importMsg.ok ? "✓ " : "✗ "}{importMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0, alignItems: "center" }}>
        {([["products", `產品資料（${products.length}）`], ["quotes", `報價單（${quotes.length}）`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: tab === k ? 700 : 400, border: "none", background: tab === k ? C.p50 : "transparent", color: tab === k ? C.primary : C.muted, cursor: "pointer" }}>
            {label}
          </button>
        ))}
        {/* 檢視切換：卡片 / 列表 */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 2, padding: 2, background: C.surf2, borderRadius: 9 }}>
          {([["card", "▦ 卡片"], ["list", "☰ 列表"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => changeView(v)}
              title={v === "card" ? "卡片檢視" : "列表檢視"}
              style={{ padding: "5px 12px", borderRadius: 7, fontSize: 12.5, fontWeight: view === v ? 700 : 400, border: "none", background: view === v ? C.surface : "transparent", color: view === v ? C.primary : C.muted, cursor: "pointer", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,.08)" : "none" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 90px", background: C.bg }}>
        {loading ? (
          <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>載入中…</div>
        ) : tab === "products" ? (
          <ProductGrid products={products} categories={categories} view={view} onEdit={setEditProduct} onChanged={loadProducts} onCatChanged={loadCategories} />
        ) : (
          <QuoteList quotes={quotes} view={view} onView={setViewQuote} />
        )}
      </div>

      {editProduct && (
        <ProductModal
          product={editProduct}
          categories={categories}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); loadProducts(); loadCategories(); }}
        />
      )}
      {quoteBuilder && (
        <QuoteBuilder
          products={products.filter((p) => p.is_active)}
          brands={brands}
          onClose={() => setQuoteBuilder(false)}
          onSaved={() => { setQuoteBuilder(false); loadQuotes(); setTab("quotes"); }}
        />
      )}
      {viewQuote && (
        <QuoteView quote={viewQuote} onClose={() => setViewQuote(null)} onChanged={() => loadQuotes()} />
      )}

      <MobileTabBar />
    </>
  );
}

// ── 產品卡片網格（依分類分組、可拖拉改分類）──────────
function ProductGrid({ products, categories, view, onEdit, onChanged, onCatChanged }: {
  products: Product[]; categories: Category[]; view: "card" | "list"; onEdit: (p: Product) => void; onChanged: () => void; onCatChanged: () => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null); // 拖到哪個分類（"" = 未分類）
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const colorOf = (catName: string | null) => categories.find((c) => c.name === catName)?.color || C.border;

  const toggleSel = (id: string) => setSelected((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const clearSel = () => setSelected(new Set());
  const setGroupSel = (ids: string[], on: boolean) => setSelected((s) => {
    const n = new Set(s);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    return n;
  });

  const reassign = async (productId: string, catName: string | null) => {
    setDragId(null); setOverCat(null);
    const p = products.find((x) => x.id === productId);
    if (!p || (p.category || "") === (catName || "")) return;
    await fetch(`/api/products/${productId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: catName }),
    });
    onChanged();
  };

  // 批次移動已勾選產品到指定分類（"" = 未分類）
  const bulkMove = async (catName: string) => {
    if (selected.size === 0) return;
    const res = await fetch(`/api/products/bulk`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], category: catName || null }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "移動失敗"); return; }
    clearSel();
    onChanged();
  };

  // 分組：依分類順序 + 未分類；空分類也顯示（可拖入）
  const groups: { name: string; color: string; items: Product[] }[] = [
    ...categories.map((c) => ({ name: c.name, color: c.color, items: products.filter((p) => p.category === c.name) })),
    { name: "", color: C.muted, items: products.filter((p) => !p.category || !categories.some((c) => c.name === p.category)) },
  ];

  if (products.length === 0 && categories.length === 0) {
    return (
      <>
        <CategoryBar categories={categories} onChanged={onCatChanged} />
        <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>尚無產品，點右上「新增產品」或「📥 匯入 xlsx」開始建立。</div>
      </>
    );
  }

  return (
    <>
      <CategoryBar categories={categories} onChanged={onCatChanged} />
      <div style={{ fontSize: 12, color: C.muted, margin: "4px 0 14px" }}>💡 拖拉產品卡片到其他分類即可改變分類，或勾選多個產品批次移動</div>

      {groups.map((g) => {
        if (g.name === "" && g.items.length === 0) return null; // 未分類沒東西就不顯示
        const isOver = overCat === g.name && dragId;
        const groupIds = g.items.map((p) => p.id);
        const allSelInGroup = groupIds.length > 0 && groupIds.every((id) => selected.has(id));
        return (
          <div
            key={g.name || "__none__"}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overCat !== g.name) setOverCat(g.name); } }}
            onDrop={() => dragId && reassign(dragId, g.name || null)}
            style={{ marginBottom: 22, padding: 8, borderRadius: 14, background: isOver ? `${g.color}18` : "transparent", outline: isOver ? `2px dashed ${g.color}` : "none", transition: "background 150ms" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, paddingLeft: 4 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: g.name ? g.color : C.border }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{g.name || "未分類"}</span>
              <span style={{ fontSize: 11, color: C.muted }}>（{g.items.length}）</span>
              {g.items.length > 0 && (
                <button onClick={() => setGroupSel(groupIds, !allSelInGroup)}
                  style={{ fontSize: 11, color: C.primary, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>
                  {allSelInGroup ? "取消全選" : "全選此組"}
                </button>
              )}
            </div>
            {g.items.length === 0 ? (
              <div style={{ fontSize: 12, color: C.muted, padding: "14px 0", textAlign: "center", border: `1px dashed ${C.border}`, borderRadius: 10 }}>
                拖拉產品到這裡加入「{g.name}」
              </div>
            ) : view === "list" ? (
              <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                  <thead>
                    <tr style={{ fontSize: 11, color: C.muted, textAlign: "left", background: C.surf2 }}>
                      <th style={{ padding: "8px 10px", width: 32 }}></th>
                      <th style={{ padding: "8px 10px" }}>產品</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>通路價</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>建議售價</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>毛利</th>
                      <th style={{ padding: "8px 10px", textAlign: "center" }}>狀態</th>
                      <th style={{ padding: "8px 10px", textAlign: "right" }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((p) => (
                      <ProductRow
                        key={p.id} p={p} accent={colorOf(p.category)}
                        dragging={dragId === p.id}
                        selected={selected.has(p.id)}
                        onToggleSelect={() => toggleSel(p.id)}
                        onDragStart={() => setDragId(p.id)}
                        onDragEnd={() => { setDragId(null); setOverCat(null); }}
                        onEdit={onEdit} onChanged={onChanged}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {g.items.map((p) => (
                  <ProductCard
                    key={p.id} p={p} accent={colorOf(p.category)}
                    dragging={dragId === p.id}
                    selected={selected.has(p.id)}
                    onToggleSelect={() => toggleSel(p.id)}
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => { setDragId(null); setOverCat(null); }}
                    onEdit={onEdit} onChanged={onChanged}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* 批次操作列（有勾選才出現，固定底部） */}
      {selected.size > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: 78, transform: "translateX(-50%)", zIndex: 400, background: C.text, color: "white", borderRadius: 14, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 12px 32px rgba(0,0,0,.28)", flexWrap: "wrap", maxWidth: "94vw" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>已選 {selected.size} 個</span>
          <select defaultValue="" onChange={(e) => { if (e.target.value !== "") { bulkMove(e.target.value === "__none__" ? "" : e.target.value); e.target.value = ""; } }}
            style={{ padding: "7px 10px", borderRadius: 9, border: "none", fontSize: 13, background: "white", color: C.text, cursor: "pointer", fontWeight: 600 }}>
            <option value="">移動到分類…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value="__none__">未分類</option>
          </select>
          <button onClick={clearSel} style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid rgba(255,255,255,.3)", background: "transparent", color: "white", fontSize: 13, cursor: "pointer" }}>取消選取</button>
        </div>
      )}
    </>
  );
}

// ── 單一產品卡片 ─────────────────────────────────────
function ProductCard({ p, accent, dragging, selected, onToggleSelect, onDragStart, onDragEnd, onEdit, onChanged }: {
  p: Product; accent: string; dragging: boolean; selected: boolean; onToggleSelect: () => void; onDragStart: () => void; onDragEnd: () => void; onEdit: (p: Product) => void; onChanged: () => void;
}) {
  const margin = p.channel_price > 0 ? Math.round(((p.channel_price - p.cost_price) / p.channel_price) * 100) : 0;
  const toggleActive = async () => {
    await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !p.is_active }) });
    onChanged();
  };
  const deleteProduct = async () => {
    if (!confirm(`確定永久刪除「${p.name}」？此操作無法復原。\n（若只是暫時不用，建議改用「停用」）`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "刪除失敗"); return; }
    onChanged();
  };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ background: selected ? `${accent}10` : C.surface, border: selected ? `1px solid ${accent}` : `1px solid ${C.border}`, borderLeft: `4px solid ${accent}`, borderRadius: 14, padding: 16, opacity: dragging ? 0.4 : (p.is_active ? 1 : 0.55), cursor: "grab", boxShadow: selected ? `0 0 0 2px ${accent}33` : "none" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <input type="checkbox" checked={selected} onChange={onToggleSelect} onClick={(e) => e.stopPropagation()}
            title="勾選以批次操作" style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", accentColor: accent }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{p.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
              {p.sku ? `${p.sku}` : ""}{p.spec ? `${p.sku ? " · " : ""}${p.spec}` : ""}
            </div>
          </div>
        </div>
        {p.category && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: `${accent}22`, color: accent, whiteSpace: "nowrap", fontWeight: 700 }}>{p.category}</span>}
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: C.muted }}>通路價</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>{money(p.channel_price)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.muted }}>建議售價</div>
          <div style={{ fontSize: 14, color: C.muted, textDecoration: "line-through", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{money(p.list_price)}</div>
        </div>
        {margin > 0 && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.muted }}>毛利</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.success, marginTop: 2 }}>{margin}%</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
        最低 {p.min_order} {p.unit} · 交期 {p.lead_days} 天
      </div>
      {p.description && <div style={{ fontSize: 12, color: C.text, marginTop: 8, lineHeight: 1.5 }}>{p.description}</div>}

      <div style={{ display: "flex", gap: 6, marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
        <button onClick={() => onEdit(p)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, cursor: "pointer" }}>編輯</button>
        <button onClick={toggleActive} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: p.is_active ? "#D97706" : C.success, fontSize: 12, cursor: "pointer" }}>
          {p.is_active ? "停用" : "啟用"}
        </button>
        <button onClick={deleteProduct} title="永久刪除" style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.danger, fontSize: 12, cursor: "pointer" }}>刪除</button>
      </div>
    </div>
  );
}

// ── 單一產品列（列表檢視）────────────────────────────
function ProductRow({ p, accent, dragging, selected, onToggleSelect, onDragStart, onDragEnd, onEdit, onChanged }: {
  p: Product; accent: string; dragging: boolean; selected: boolean; onToggleSelect: () => void; onDragStart: () => void; onDragEnd: () => void; onEdit: (p: Product) => void; onChanged: () => void;
}) {
  const margin = p.channel_price > 0 ? Math.round(((p.channel_price - p.cost_price) / p.channel_price) * 100) : 0;
  const toggleActive = async () => {
    await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !p.is_active }) });
    onChanged();
  };
  const deleteProduct = async () => {
    if (!confirm(`確定永久刪除「${p.name}」？此操作無法復原。\n（若只是暫時不用，建議改用「停用」）`)) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "刪除失敗"); return; }
    onChanged();
  };
  const td: React.CSSProperties = { padding: "9px 10px", borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.text, verticalAlign: "middle" };
  const iconBtn: React.CSSProperties = { padding: "4px 8px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surface, fontSize: 12, cursor: "pointer" };
  return (
    <tr draggable onDragStart={onDragStart} onDragEnd={onDragEnd}
      style={{ background: selected ? `${accent}10` : "transparent", opacity: dragging ? 0.4 : (p.is_active ? 1 : 0.55), cursor: "grab" }}>
      <td style={{ ...td, textAlign: "center" }}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} onClick={(e) => e.stopPropagation()} style={{ width: 15, height: 15, cursor: "pointer", accentColor: accent }} />
      </td>
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: accent, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{p.sku || ""}{p.spec ? `${p.sku ? " · " : ""}${p.spec}` : ""}</div>
          </div>
        </div>
      </td>
      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>{money(p.channel_price)}</td>
      <td style={{ ...td, textAlign: "right", color: C.muted, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>{money(p.list_price)}</td>
      <td style={{ ...td, textAlign: "right", color: margin > 0 ? C.success : C.muted, fontWeight: 600 }}>{margin > 0 ? `${margin}%` : "—"}</td>
      <td style={{ ...td, textAlign: "center" }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: p.is_active ? C.successBg : C.surf2, color: p.is_active ? C.success : C.muted }}>
          {p.is_active ? "啟用中" : "已停用"}
        </span>
      </td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-flex", gap: 5 }}>
          <button onClick={() => onEdit(p)} style={iconBtn}>編輯</button>
          <button onClick={toggleActive} style={{ ...iconBtn, color: p.is_active ? "#D97706" : C.success }}>{p.is_active ? "停用" : "啟用"}</button>
          <button onClick={deleteProduct} style={{ ...iconBtn, color: C.danger }}>刪除</button>
        </div>
      </td>
    </tr>
  );
}

// ── 分類管理列（新增/改名/換色/刪除/排序）────────────
function CategoryBar({ categories, onChanged }: { categories: Category[]; onChanged: () => void }) {
  const [editId, setEditId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(CAT_COLORS[0]);
  const [err, setErr] = useState("");
  // 分類拖拉排序：本地順序副本，拖放即時重排再持久化
  const [localCats, setLocalCats] = useState<Category[]>(categories);
  const [dragCatId, setDragCatId] = useState<string | null>(null);
  useEffect(() => { setLocalCats(categories); }, [categories]);

  const onDropCat = async (targetId: string) => {
    if (!dragCatId || dragCatId === targetId) { setDragCatId(null); return; }
    const from = localCats.findIndex((c) => c.id === dragCatId);
    const to = localCats.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) { setDragCatId(null); return; }
    const next = [...localCats];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocalCats(next);
    setDragCatId(null);
    await fetch("/api/product-categories", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: next.map((c, i) => ({ id: c.id, sort_order: i })) }),
    });
    onChanged();
  };

  const startAdd = () => { setAdding(true); setEditId(null); setDraftName(""); setDraftColor(CAT_COLORS[categories.length % CAT_COLORS.length]); setErr(""); };
  const startEdit = (c: Category) => { setEditId(c.id); setAdding(false); setDraftName(c.name); setDraftColor(c.color); setErr(""); };
  const close = () => { setEditId(null); setAdding(false); setErr(""); };

  const save = async () => {
    const name = draftName.trim();
    if (!name) { setErr("請輸入分類名稱"); return; }
    const url = "/api/product-categories";
    const res = await fetch(url, {
      method: adding ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adding ? { name, color: draftColor } : { id: editId, name, color: draftColor }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { setErr(d.error || "儲存失敗"); return; }
    close(); onChanged();
  };
  const del = async (c: Category) => {
    if (!confirm(`刪除分類「${c.name}」？\n此分類的 ${c.count || 0} 個產品會變成「未分類」（產品不會被刪除）。`)) return;
    const res = await fetch(`/api/product-categories?id=${c.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "刪除失敗"); return; }
    close(); onChanged();
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>分類：</span>
        {localCats.map((c) => (
          <button key={c.id} onClick={() => startEdit(c)}
            draggable
            onDragStart={() => setDragCatId(c.id)}
            onDragEnd={() => setDragCatId(null)}
            onDragOver={(e) => { if (dragCatId) e.preventDefault(); }}
            onDrop={() => onDropCat(c.id)}
            title="拖拉可排序，點擊可編輯"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, border: editId === c.id ? `2px solid ${c.color}` : `1px solid ${C.border}`, background: editId === c.id ? `${c.color}14` : C.surface, cursor: "grab", fontSize: 12.5, opacity: dragCatId === c.id ? 0.4 : 1 }}>
            <span style={{ color: C.muted, fontSize: 11, cursor: "grab" }}>⠿</span>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color }} />
            <span style={{ color: C.text, fontWeight: 600 }}>{c.name}</span>
            <span style={{ color: C.muted }}>{c.count ?? 0}</span>
          </button>
        ))}
        <button onClick={startAdd}
          style={{ padding: "5px 11px", borderRadius: 999, border: `1px dashed ${C.border}`, background: "transparent", color: C.primary, cursor: "pointer", fontSize: 12.5, fontWeight: 700 }}>
          ＋ 新增分類
        </button>
      </div>

      {(adding || editId) && (
        <div style={{ marginTop: 10, padding: 14, borderRadius: 12, background: C.surface, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10, maxWidth: 460 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{adding ? "新增分類" : "編輯分類"}</div>
          <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="分類名稱（例：足浴系列）"
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            style={{ padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, fontSize: 14, background: C.surf2, color: C.text }} />
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>卡片顏色</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {CAT_COLORS.map((col) => (
                <button key={col} onClick={() => setDraftColor(col)} title={col}
                  style={{ width: 26, height: 26, borderRadius: 8, background: col, border: draftColor === col ? "3px solid #2f3d2f" : "1px solid rgba(0,0,0,.15)", cursor: "pointer" }} />
              ))}
              <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer", background: C.surf2 }} title="自訂顏色">
                🎨<input type="color" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
              </label>
            </div>
          </div>
          {err && <div style={{ fontSize: 12, color: C.danger }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
            {!adding && editId ? (
              <button onClick={() => { const c = categories.find((x) => x.id === editId); if (c) del(c); }}
                style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.danger, fontSize: 13, cursor: "pointer" }}>刪除</button>
            ) : <span />}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={close} style={{ padding: "8px 16px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, cursor: "pointer" }}>取消</button>
              <button onClick={save} style={{ padding: "8px 18px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>儲存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 產品編輯 Modal ───────────────────────────────────
function ProductModal({ product, categories, onClose, onSaved }: { product: Partial<Product>; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Partial<Product>>(product);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Product, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const isEdit = !!product.id;

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    const url = isEdit ? `/api/products/${product.id}` : "/api/products";
    await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    onSaved();
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 11px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, boxSizing: "border-box", background: C.surface, color: C.text };
  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 4 };

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "18px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{isEdit ? "編輯產品" : "新增產品"}</div>
      </div>
      <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={labelStyle}>產品名稱 *</label>
          <input style={inputStyle} value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="艾草淨化包" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>產品編號</label><input style={inputStyle} value={form.sku || ""} onChange={(e) => set("sku", e.target.value)} placeholder="HH-AC-30" /></div>
          <div>
            <label style={labelStyle}>分類</label>
            <input style={inputStyle} list="cat-list" value={form.category || ""} onChange={(e) => set("category", e.target.value)} placeholder="選擇或輸入新分類" />
            <datalist id="cat-list">
              {categories.map((c) => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>規格</label><input style={inputStyle} value={form.spec || ""} onChange={(e) => set("spec", e.target.value)} placeholder="30入/盒" /></div>
          <div><label style={labelStyle}>單位</label><input style={inputStyle} value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} placeholder="盒" /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>建議售價</label><input type="number" style={inputStyle} value={form.list_price ?? ""} onChange={(e) => set("list_price", e.target.value)} /></div>
          <div><label style={labelStyle}>通路價</label><input type="number" style={inputStyle} value={form.channel_price ?? ""} onChange={(e) => set("channel_price", e.target.value)} /></div>
          <div><label style={labelStyle}>成本</label><input type="number" style={inputStyle} value={form.cost_price ?? ""} onChange={(e) => set("cost_price", e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>最低起訂量</label><input type="number" style={inputStyle} value={form.min_order ?? ""} onChange={(e) => set("min_order", e.target.value)} /></div>
          <div><label style={labelStyle}>交期（工作天）</label><input type="number" style={inputStyle} value={form.lead_days ?? ""} onChange={(e) => set("lead_days", e.target.value)} /></div>
        </div>
        <div>
          <label style={labelStyle}>產品說明</label>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.description || ""} onChange={(e) => set("description", e.target.value)} placeholder="產品特色、適用對象…" />
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, cursor: "pointer" }}>取消</button>
        <button onClick={save} disabled={saving || !form.name} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: form.name ? C.primary : C.surf2, color: form.name ? "white" : C.muted, fontSize: 13, fontWeight: 700, cursor: form.name ? "pointer" : "default" }}>
          {saving ? "儲存中…" : "儲存"}
        </button>
      </div>
    </Overlay>
  );
}

// ── 報價單建立器 ─────────────────────────────────────
function QuoteBuilder({ products, brands, onClose, onSaved }: { products: Product[]; brands: BrandLite[]; onClose: () => void; onSaved: () => void }) {
  const [brandId, setBrandId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [discountPct, setDiscountPct] = useState(0);
  const [note, setNote] = useState("付款條件：月結 30 天　|　運費：滿 5,000 免運");
  const [validDays, setValidDays] = useState(30);
  const [saving, setSaving] = useState(false);
  // 我方業務 + 對方公司資訊（皆非必填）
  const [salesRep, setSalesRep] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [showListPrice, setShowListPrice] = useState(false);

  const addProduct = (p: Product) => {
    setItems((prev) => {
      const exist = prev.find((it) => it.product_id === p.id);
      if (exist) return prev.map((it) => it.product_id === p.id ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, spec: p.spec, unit: p.unit, unit_price: p.channel_price, list_price: p.list_price, qty: Math.max(1, p.min_order) }];
    });
  };
  const updateItem = (i: number, patch: Partial<QuoteItem>) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const subtotal = useMemo(() => items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.qty) || 0), 0), [items]);
  const discountAmt = Math.round((subtotal * discountPct) / 100);
  const total = subtotal - discountAmt;

  const filteredBrands = brandSearch
    ? brands.filter((b) => b.name.includes(brandSearch)).slice(0, 8)
    : [];

  const save = async () => {
    if (items.length === 0) return;
    setSaving(true);
    await fetch("/api/quotes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand_id: brandId || null,
        customer_name: customerName || (brands.find((b) => b.id === brandId)?.name) || null,
        sales_rep: salesRep || null,
        buyer_tax_id: buyerTaxId || null,
        buyer_contact: buyerContact || null,
        buyer_phone: buyerPhone || null,
        show_list_price: showListPrice,
        discount_pct: discountPct, note, valid_days: validDays, items,
      }),
    });
    setSaving(false);
    onSaved();
  };

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, boxSizing: "border-box", background: C.surface, color: C.text };

  return (
    <Overlay onClose={onClose} wide>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>新增報價單</div>
      </div>
      <div style={{ display: "flex", flex: 1, overflow: "hidden", flexWrap: "wrap" }}>
        {/* 左：產品目錄 */}
        <div style={{ flex: "1 1 240px", borderRight: `1px solid ${C.border}`, overflowY: "auto", padding: 14, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>點選加入報價</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {products.map((p) => (
              <button key={p.id} onClick={() => addProduct(p)} className="pressable"
                style={{ textAlign: "left", padding: "9px 11px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{money(p.channel_price)} / {p.unit}{p.spec ? ` · ${p.spec}` : ""}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 右：報價內容 */}
        <div style={{ flex: "2 1 360px", overflowY: "auto", padding: 16, minWidth: 0 }}>
          {/* 客戶（對方公司名稱） */}
          <div style={{ marginBottom: 10, position: "relative" }}>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 4 }}>對方公司名稱</label>
            <input style={inputStyle} value={brandId ? (brands.find((b) => b.id === brandId)?.name || customerName) : brandSearch}
              onChange={(e) => { setBrandSearch(e.target.value); setBrandId(""); setCustomerName(e.target.value); }}
              placeholder="搜尋名單或直接輸入客戶名稱…" />
            {filteredBrands.length > 0 && !brandId && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 9, marginTop: 4, zIndex: 10, maxHeight: 180, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.08)" }}>
                {filteredBrands.map((b) => (
                  <div key={b.id} onClick={() => { setBrandId(b.id); setCustomerName(b.name); setBrandSearch(""); }}
                    style={{ padding: "8px 11px", fontSize: 13, cursor: "pointer", color: C.text }} className="pressable">
                    {b.name}{b.email ? <span style={{ color: C.muted, fontSize: 11 }}> · {b.email}</span> : ""}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 對方公司其他資訊 + 我方業務（皆非必填，可收折） */}
          <details style={{ marginBottom: 14, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <summary style={{ padding: "8px 11px", fontSize: 12, color: C.muted, cursor: "pointer", background: C.surf2, fontWeight: 600 }}>客戶聯絡資訊／我方業務（選填）</summary>
            <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <div><label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 3 }}>對方統一編號</label><input style={inputStyle} value={buyerTaxId} onChange={(e) => setBuyerTaxId(e.target.value)} placeholder="8 碼統編" /></div>
              <div><label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 3 }}>聯絡窗口</label><input style={inputStyle} value={buyerContact} onChange={(e) => setBuyerContact(e.target.value)} placeholder="姓名／職稱" /></div>
              <div><label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 3 }}>聯絡電話</label><input style={inputStyle} value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} placeholder="電話／手機" /></div>
              <div><label style={{ fontSize: 10, color: C.muted, display: "block", marginBottom: 3 }}>報價業務（我方）</label><input style={inputStyle} value={salesRep} onChange={(e) => setSalesRep(e.target.value)} placeholder="承辦業務姓名" /></div>
            </div>
          </details>

          {/* 標準售價顯示開關 */}
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontSize: 12.5, color: C.text, cursor: "pointer" }}>
            <input type="checkbox" checked={showListPrice} onChange={(e) => setShowListPrice(e.target.checked)} style={{ width: 15, height: 15, cursor: "pointer", accentColor: C.primary }} />
            在報價單顯示「標準售價」欄
          </label>

          {/* 品項 */}
          {items.length === 0 ? (
            <div style={{ textAlign: "center", color: C.muted, padding: "30px 0", fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10 }}>← 從左側點選產品加入</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: `1px solid ${C.border}`, borderRadius: 9, background: C.surf2 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{it.sku ? `型號 ${it.sku}` : ""}{it.sku && it.spec ? " · " : ""}{it.spec || ""}</div>
                  </div>
                  {showListPrice && (
                    <div style={{ width: 70, textAlign: "right" }} title="標準售價">
                      <div style={{ fontSize: 9, color: C.muted }}>標準售價</div>
                      <div style={{ fontSize: 12, color: C.muted, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>{it.list_price != null ? money(it.list_price) : "—"}</div>
                    </div>
                  )}
                  <input type="number" value={it.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                    style={{ width: 76, padding: "5px 7px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, textAlign: "right", background: C.surface, color: C.text }} title="單價" />
                  <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                  <input type="number" value={it.qty} onChange={(e) => updateItem(i, { qty: Number(e.target.value) })}
                    style={{ width: 54, padding: "5px 7px", borderRadius: 7, border: `1px solid ${C.border}`, fontSize: 12, textAlign: "right", background: C.surface, color: C.text }} title="數量" />
                  <div style={{ width: 84, textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text, fontVariantNumeric: "tabular-nums" }}>{money((it.unit_price || 0) * (it.qty || 0))}</div>
                  <button onClick={() => removeItem(i)} style={{ border: "none", background: "none", color: C.danger, cursor: "pointer", fontSize: 15 }}>✕</button>
                </div>
              ))}
            </div>
          )}

          {/* 折扣 + 合計 */}
          <div style={{ marginTop: 14, padding: 12, background: C.surf2, borderRadius: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginBottom: 6 }}>
              <span>小計</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: C.muted, marginBottom: 6 }}>
              <span>折扣 <input type="number" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} style={{ width: 48, padding: "3px 6px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, textAlign: "right", background: C.surface, color: C.text }} /> %</span>
              <span style={{ color: C.danger, fontVariantNumeric: "tabular-nums" }}>-{money(discountAmt)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4 }}>
              <span>總計</span><span style={{ color: C.primary, fontVariantNumeric: "tabular-nums" }}>{money(total)}</span>
            </div>
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 4 }}>報價有效天數</label>
              <input type="number" style={inputStyle} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 4 }}>備註</label>
            <textarea style={{ ...inputStyle, minHeight: 54, resize: "vertical" }} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: C.muted }}>共 {items.length} 項 · 總計 <strong style={{ color: C.primary }}>{money(total)}</strong></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.muted, fontSize: 13, cursor: "pointer" }}>取消</button>
          <button onClick={save} disabled={saving || items.length === 0} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: items.length ? C.primary : C.surf2, color: items.length ? "white" : C.muted, fontSize: 13, fontWeight: 700, cursor: items.length ? "pointer" : "default" }}>
            {saving ? "建立中…" : "建立報價單"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── 報價單列表 ───────────────────────────────────────
function QuoteList({ quotes, view, onView }: { quotes: Quote[]; view: "card" | "list"; onView: (q: Quote) => void }) {
  if (quotes.length === 0) {
    return <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>尚無報價單，點右上「新增報價單」開始建立。</div>;
  }

  if (view === "list") {
    const td: React.CSSProperties = { padding: "10px 12px", borderTop: `1px solid ${C.border}`, fontSize: 13, color: C.text };
    return (
      <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 12, background: C.surface }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.muted, textAlign: "left", background: C.surf2 }}>
              <th style={{ padding: "8px 12px" }}>客戶</th>
              <th style={{ padding: "8px 12px" }}>報價單號</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>項數</th>
              <th style={{ padding: "8px 12px" }}>日期</th>
              <th style={{ padding: "8px 12px", textAlign: "center" }}>狀態</th>
              <th style={{ padding: "8px 12px", textAlign: "right" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => {
              const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
              return (
                <tr key={q.id} onClick={() => onView(q)} className="pressable" style={{ cursor: "pointer" }}>
                  <td style={{ ...td, fontWeight: 600 }}>{q.customer_name || q.brands?.name || "未指定客戶"}</td>
                  <td style={{ ...td, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{q.quote_no}</td>
                  <td style={{ ...td, textAlign: "center", color: C.muted }}>{q.quote_items?.length || 0}</td>
                  <td style={{ ...td, color: C.muted }}>{new Date(q.created_at).toLocaleDateString("zh-TW")}</td>
                  <td style={{ ...td, textAlign: "center" }}>
                    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>
                    {money(q.total)}{q.discount_amt > 0 && <span style={{ fontSize: 10, color: C.muted, fontWeight: 400 }}> 折{q.discount_pct}%</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {quotes.map((q) => {
        const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
        return (
          <div key={q.id} onClick={() => onView(q)} className="pressable"
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{q.customer_name || q.brands?.name || "未指定客戶"}</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 999, background: st.bg, color: st.fg }}>{st.label}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                {q.quote_no} · {q.quote_items?.length || 0} 項 · {new Date(q.created_at).toLocaleDateString("zh-TW")}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.primary, fontVariantNumeric: "tabular-nums" }}>{money(q.total)}</div>
              {q.discount_amt > 0 && <div style={{ fontSize: 11, color: C.muted }}>折 {q.discount_pct}%</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── 報價單檢視 ───────────────────────────────────────
function QuoteView({ quote, onClose, onChanged }: { quote: Quote; onClose: () => void; onChanged: () => void }) {
  const [status, setStatus] = useState(quote.status);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const items = quote.quote_items || [];

  const updateStatus = async (s: string) => {
    setStatus(s);
    await fetch(`/api/quotes/${quote.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: s }),
    });
    onChanged();
  };

  const deleteQuote = async () => {
    if (!confirm(`確定刪除報價單「${quote.quote_no || ""}」？此操作無法復原。`)) return;
    const res = await fetch(`/api/quotes/${quote.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.success) { alert(d.error || "刪除失敗"); return; }
    onChanged();
    onClose();
  };

  const sendEmail = async () => {
    setSending(true);
    setSendMsg(null);
    try {
      const res = await fetch(`/api/quotes/${quote.id}/send`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("sent");
        setSendMsg({ ok: true, text: `已寄出至 ${data.to}` });
        onChanged();
      } else {
        setSendMsg({ ok: false, text: data.error || "寄送失敗" });
      }
    } catch {
      setSendMsg({ ok: false, text: "連線失敗" });
    } finally {
      setSending(false);
    }
  };

  const copyText = () => {
    const lines = [
      `【${quote.title}】${quote.quote_no || ""}`,
      `客戶：${quote.customer_name || quote.brands?.name || ""}`,
      "",
      ...items.map((it) => `${it.name}${it.spec ? `（${it.spec}）` : ""}　${money(it.unit_price)} × ${it.qty} = ${money((it.unit_price || 0) * it.qty)}`),
      "",
      `小計：${money(quote.subtotal)}`,
      ...(quote.discount_amt > 0 ? [`折扣（${quote.discount_pct}%）：-${money(quote.discount_amt)}`] : []),
      `總計：${money(quote.total)}`,
      "",
      quote.note || "",
      `報價有效 ${quote.valid_days} 天`,
    ];
    navigator.clipboard.writeText(lines.join("\n"));
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{quote.customer_name || quote.brands?.name || "報價單"}</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{quote.quote_no}</div>
        </div>
        <select value={status} onChange={(e) => updateStatus(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, background: C.surface, color: C.text }}>
          {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>
      <div style={{ padding: 20, overflowY: "auto" }}>
        {/* 我方 / 對方公司資訊 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ background: C.surf2, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>賣方（我方）</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{COMPANY.name}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.6 }}>
              {COMPANY.taxId && <div>統編：{COMPANY.taxId}</div>}
              {COMPANY.address && <div>{COMPANY.address}</div>}
              <div>電話：{COMPANY.phone}</div>
              {quote.sales_rep && <div>報價業務：{quote.sales_rep}</div>}
            </div>
          </div>
          <div style={{ background: C.surf2, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, marginBottom: 4 }}>買方（客戶）</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{quote.customer_name || quote.brands?.name || "—"}</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.6 }}>
              {quote.buyer_tax_id && <div>統編：{quote.buyer_tax_id}</div>}
              {quote.buyer_contact && <div>窗口：{quote.buyer_contact}</div>}
              {quote.buyer_phone && <div>電話：{quote.buyer_phone}</div>}
              {!quote.buyer_tax_id && !quote.buyer_contact && !quote.buyer_phone && <div style={{ color: C.muted }}>—</div>}
            </div>
          </div>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ fontSize: 11, color: C.muted, textAlign: "left" }}>
              <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}` }}>品項</th>
              <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}` }}>型號</th>
              {quote.show_list_price && <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>標準售價</th>}
              <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>單價</th>
              <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>數量</th>
              <th style={{ padding: "6px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>總價</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} style={{ fontSize: 13, color: C.text }}>
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}` }}>
                  {it.name}{it.spec ? <span style={{ color: C.muted, fontSize: 11 }}> {it.spec}</span> : ""}
                </td>
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}`, fontSize: 11, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{it.sku || "—"}</td>
                {quote.show_list_price && <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right", color: C.muted, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>{it.list_price != null ? money(it.list_price) : "—"}</td>}
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(it.unit_price)}</td>
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right" }}>{it.qty} {it.unit}</td>
                <td style={{ padding: "9px 4px", borderBottom: `1px solid ${C.border}`, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{money((it.unit_price || 0) * it.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14, marginLeft: "auto", maxWidth: 240 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.muted, marginBottom: 5 }}>
            <span>小計</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{money(quote.subtotal)}</span>
          </div>
          {quote.discount_amt > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: C.danger, marginBottom: 5 }}>
              <span>折扣 {quote.discount_pct}%</span><span style={{ fontVariantNumeric: "tabular-nums" }}>-{money(quote.discount_amt)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <span>總計</span><span style={{ color: C.primary, fontVariantNumeric: "tabular-nums" }}>{money(quote.total)}</span>
          </div>
        </div>

        {quote.note && <div style={{ marginTop: 14, padding: 12, background: C.surf2, borderRadius: 10, fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{quote.note}</div>}
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>報價有效 {quote.valid_days} 天</div>
        {sendMsg && (
          <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 9, fontSize: 12.5, background: sendMsg.ok ? C.successBg : C.dangerBg, color: sendMsg.ok ? C.success : C.danger }}>
            {sendMsg.ok ? "✓ " : "✕ "}{sendMsg.text}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={deleteQuote} title="刪除報價單" style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.danger, fontSize: 13, cursor: "pointer", marginRight: "auto" }}>🗑 刪除</button>
        <button onClick={copyText} style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, cursor: "pointer" }}>📋 複製</button>
        <button onClick={() => window.open(`/quotes/${quote.id}/print`, "_blank")}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, cursor: "pointer" }} title="開啟專業報價單列印頁（可存 PDF）">
          🖨 PDF
        </button>
        <button onClick={() => window.location.href = `/api/quotes/${quote.id}/export?format=excel`}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: "#217346", fontSize: 13, fontWeight: 700, cursor: "pointer" }} title="下載 Excel 報價單">
          📊 Excel
        </button>
        <button onClick={() => window.location.href = `/api/quotes/${quote.id}/export?format=word`}
          style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}`, background: C.surface, color: "#2B579A", fontSize: 13, fontWeight: 700, cursor: "pointer" }} title="下載 Word 報價單">
          📝 Word
        </button>
        <button onClick={sendEmail} disabled={sending} style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: sending ? C.surf2 : C.accent, color: sending ? C.muted : C.accentDk, fontSize: 13, fontWeight: 700, cursor: sending ? "default" : "pointer" }}>
          {sending ? "寄送中…" : "✉ 寄出"}
        </button>
        <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: C.primary, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>關閉</button>
      </div>
    </Overlay>
  );
}

// ── 共用 Overlay ─────────────────────────────────────
function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(46,69,53,.4)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 510, width: wide ? "94vw" : "92vw", maxWidth: wide ? 880 : 520, maxHeight: "90vh", background: C.surface, borderRadius: 18, boxShadow: "0 24px 64px rgba(21,20,26,.22)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {children}
      </div>
    </>
  );
}
