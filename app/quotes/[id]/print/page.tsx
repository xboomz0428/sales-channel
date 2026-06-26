"use client";

import { useEffect, useState, use } from "react";
import { DEFAULT_COMPANY, CompanyInfo } from "@/lib/company";

interface QuoteItem {
  id: string;
  name: string;
  sku: string | null;
  spec: string | null;
  unit: string;
  unit_price: number;
  list_price: number | null;
  qty: number;
  amount: number;
  sort_order: number;
}
interface Quote {
  id: string;
  quote_no: string | null;
  customer_name: string | null;
  sales_rep: string | null;
  buyer_tax_id: string | null;
  buyer_contact: string | null;
  buyer_phone: string | null;
  show_list_price: boolean;
  title: string;
  valid_days: number;
  subtotal: number;
  discount_pct: number;
  discount_amt: number;
  total: number;
  note: string | null;
  created_at: string;
  brands: { name?: string; email?: string } | null;
  quote_items: QuoteItem[];
}

const money = (n: number) => `NT$ ${(n || 0).toLocaleString()}`;

export default function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [company, setCompany] = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/quotes/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setQuote(d.data); else setError(d.error); })
      .catch(() => setError("載入失敗"));
    fetch(`/api/company`).then((r) => r.json()).then((d) => { if (d.success) setCompany(d.data); }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (quote) {
      document.title = `報價單 ${quote.quote_no || quote.id} — ${quote.customer_name || ""}`;
    }
  }, [quote]);

  if (error) return <div style={{ padding: 40, color: "red" }}>{error}</div>;
  if (!quote) return <div style={{ padding: 40, color: "#888" }}>載入中…</div>;

  const items = [...quote.quote_items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const customerName = quote.customer_name || quote.brands?.name || "";
  const issueDate = new Date(quote.created_at).toLocaleDateString("zh-TW");
  const expiryDate = new Date(new Date(quote.created_at).getTime() + quote.valid_days * 86400000).toLocaleDateString("zh-TW");

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; background: #f0ede6; }
        .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: white; box-shadow: 0 4px 32px rgba(0,0,0,.12); }
        .header { background: #2E4535; color: white; padding: 32px 40px 24px; }
        .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .company-name { font-size: 22px; font-weight: 800; letter-spacing: 1px; }
        .brand-tagline { font-size: 13px; color: #9DC4A8; margin-top: 4px; }
        .quote-label { text-align: right; }
        .quote-title { font-size: 28px; font-weight: 900; letter-spacing: 3px; }
        .quote-no { font-size: 12px; color: #9DC4A8; margin-top: 4px; }
        .accent-bar { height: 4px; background: linear-gradient(90deg, #7DB892, #B5D4C0); margin-top: 20px; border-radius: 2px; }
        .body { padding: 32px 40px; }
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 28px; }
        .meta-card { background: #F5F3EE; border-radius: 10px; padding: 14px 18px; }
        .meta-label { font-size: 10px; font-weight: 700; color: #8A8678; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .meta-value { font-size: 16px; font-weight: 700; color: #2E4535; }
        .meta-sub { font-size: 12px; color: #666; margin-top: 2px; }
        .section-title { font-size: 11px; font-weight: 700; color: #8A8678; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; border-bottom: 2px solid #2E4535; padding-bottom: 6px; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #2E4535; }
        thead th { color: white; font-size: 11px; font-weight: 700; padding: 10px 12px; text-align: left; letter-spacing: 0.5px; }
        thead th.right { text-align: right; }
        tbody tr:nth-child(even) { background: #F9F8F5; }
        tbody td { padding: 11px 12px; font-size: 13px; color: #333; border-bottom: 1px solid #EEECE8; vertical-align: top; }
        tbody td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .spec { font-size: 11px; color: #888; margin-top: 2px; }
        .total-section { margin-top: 20px; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #555; border-bottom: 1px solid #EEECE8; }
        .total-final { display: flex; justify-content: space-between; padding: 14px 18px; background: #2E4535; border-radius: 10px; margin-top: 12px; color: white; }
        .total-final-label { font-size: 16px; font-weight: 700; }
        .total-final-value { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; }
        .note-box { margin-top: 24px; background: #F5F3EE; border-left: 4px solid #7DB892; padding: 14px 16px; border-radius: 0 8px 8px 0; }
        .note-label { font-size: 10px; font-weight: 700; color: #8A8678; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }
        .note-text { font-size: 12px; color: #555; line-height: 1.7; white-space: pre-wrap; }
        .footer { border-top: 1px solid #E5E2DC; padding: 16px 40px; background: #FAFAF8; display: flex; justify-content: space-between; align-items: center; }
        .footer-left { font-size: 11px; color: #888; line-height: 1.8; }
        .footer-right { font-size: 11px; color: #888; text-align: right; }
        .stamp { width: 70px; height: 70px; border-radius: 50%; border: 3px solid #2E4535; display: flex; align-items: center; justify-content: center; flex-direction: column; color: #2E4535; }
        .stamp-text { font-size: 9px; font-weight: 700; text-align: center; line-height: 1.4; letter-spacing: 0.5px; }
        .no-print { position: fixed; bottom: 24px; right: 24px; display: flex; gap: 10px; z-index: 100; }
        .btn { padding: 12px 24px; border-radius: 10px; border: none; font-size: 14px; font-weight: 700; cursor: pointer; }
        .btn-print { background: #2E4535; color: white; }
        .btn-close { background: #F5F3EE; color: #2E4535; }
        @media print {
          body { background: white; }
          .page { box-shadow: none; width: 100%; }
          .no-print { display: none; }
        }
      `}</style>

      <div className="no-print">
        <button className="btn btn-close" onClick={() => window.close()}>✕ 關閉</button>
        <button className="btn btn-print" onClick={() => window.print()}>🖨 列印 / 儲存 PDF</button>
      </div>

      <div className="page">
        {/* Header */}
        <div className="header">
          <div className="header-top">
            <div>
              <div className="company-name">{company.name}</div>
              <div className="brand-tagline">{company.brand}</div>
            </div>
            <div className="quote-label">
              <div className="quote-title">報 價 單</div>
              <div className="quote-no">{quote.quote_no}</div>
            </div>
          </div>
          <div className="accent-bar" />
        </div>

        {/* Body */}
        <div className="body">
          {/* Meta info */}
          <div className="meta-grid">
            <div className="meta-card">
              <div className="meta-label">買方（客戶）</div>
              <div className="meta-value">{customerName || "——"}</div>
              <div className="meta-sub">
                {quote.buyer_tax_id && <div>統一編號：{quote.buyer_tax_id}</div>}
                {quote.buyer_contact && <div>聯絡窗口：{quote.buyer_contact}</div>}
                {quote.buyer_phone && <div>聯絡電話：{quote.buyer_phone}</div>}
                {quote.brands?.email && <div>{quote.brands.email}</div>}
              </div>
            </div>
            <div className="meta-card">
              <div className="meta-label">賣方（我方）</div>
              <div className="meta-value">{company.name}</div>
              <div className="meta-sub">
                {company.taxId && <div>統一編號：{company.taxId}</div>}
                {company.address && <div>{company.address}</div>}
                <div>電話：{company.phone}</div>
                {quote.sales_rep && <div>報價業務：{quote.sales_rep}</div>}
              </div>
            </div>
            <div className="meta-card">
              <div className="meta-label">報價日期</div>
              <div className="meta-value">{issueDate}</div>
              <div className="meta-sub">有效期限：{expiryDate}（{quote.valid_days} 天）</div>
            </div>
          </div>

          {/* Items table */}
          <div className="section-title">品項明細</div>
          <table>
            <thead>
              <tr>
                <th style={{ width: quote.show_list_price ? "32%" : "40%" }}>品項名稱</th>
                <th>型號</th>
                <th>規格</th>
                {quote.show_list_price && <th className="right">通路價格</th>}
                <th className="right">進貨價格</th>
                <th className="right">數量</th>
                <th className="right">總價</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id || i}>
                  <td>{it.name}</td>
                  <td><div className="spec">{it.sku || "—"}</div></td>
                  <td><div className="spec">{it.spec || "—"}</div></td>
                  {quote.show_list_price && <td className="right" style={{ color: "#999" }}>{it.list_price != null ? money(it.list_price) : "—"}</td>}
                  <td className="right">{money(it.unit_price)}</td>
                  <td className="right">{it.qty} {it.unit}</td>
                  <td className="right" style={{ fontWeight: 700 }}>{money(it.unit_price * it.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="total-section">
            <div style={{ maxWidth: 320, marginLeft: "auto" }}>
              <div className="total-final">
                <span className="total-final-label">總計金額</span>
                <span className="total-final-value">{money(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* Note */}
          {quote.note && (
            <div className="note-box">
              <div className="note-label">備註說明</div>
              <div className="note-text">{quote.note}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="footer">
          <div className="footer-left">
            <div>{company.name}{company.taxId ? `　統編：${company.taxId}` : ""}</div>
            <div>電話：{company.phone}　傳真：{company.fax}</div>
            <div>{company.email}　|　{company.website}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="footer-right">
              <div>本報價單有效期 {quote.valid_days} 天</div>
              <div>如有疑問請洽業務人員</div>
            </div>
            <div className="stamp">
              <div className="stamp-text">威斯邁<br />國際<br />有限公司</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
