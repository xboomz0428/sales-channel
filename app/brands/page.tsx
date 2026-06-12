"use client";

import { useState } from "react";
import { Phone, MessageCircle, Mail, Globe, MapPin, Plus, Calendar } from "lucide-react";

interface Brand {
  id: number;
  name: string;
  industry: string;
  stores: number;
  cities: string;
  tax_id: string;
  owner: string;
  channels: { type: string; value: string; verified?: boolean }[];
}

interface Contact {
  id: number;
  name: string;
  title: string;
  mobile?: string;
  email?: string;
  line?: string;
}

interface Outreach {
  id: number;
  date: string;
  channel: string;
  note: string;
  nextAction?: string;
}

const mockBrand: Brand = {
  id: 1,
  name: "6星集足體養生會館",
  industry: "養生會館",
  stores: 9,
  cities: "北/中/南",
  tax_id: "16830000",
  owner: "江○○",
  channels: [
    { type: "phone", value: "02-2234-5678", verified: true },
    { type: "line", value: "@6starsfootcare", verified: true },
    { type: "facebook", value: "6starsfootcare.tw" },
    { type: "website", value: "www.6stars.com" },
    { type: "email", value: "contact@6stars.com", verified: false },
  ],
};

const mockContacts: Contact[] = [
  { id: 1, name: "王經理", title: "店長", mobile: "0912-345-678", line: "kingwang" },
];

const mockOutreach: Outreach[] = [
  { id: 1, date: "2026-06-10", channel: "line", note: "詢問打樣流程", nextAction: "等待報價" },
  { id: 2, date: "2026-05-28", channel: "phone", note: "首次接觸，表達興趣" },
];

export default function BrandPage() {
  const [selectedTab, setSelectedTab] = useState<"info" | "contacts" | "outreach">("info");
  const [brand] = useState(mockBrand);
  const [contacts] = useState(mockContacts);
  const [outreach] = useState(mockOutreach);

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div>
        <h1 className="page-title">{brand.name}</h1>
        <p className="text-muted mt-2">{brand.industry} · {brand.stores} 分店</p>
      </div>

      {/* 桌機版：三欄布局 */}
      <div className="d-only grid grid-cols-3 gap-6">
        {/* 左欄：基本資料 */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-4">基本資料</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted mb-1">統一編號</p>
                <p className="font-medium">{brand.tax_id}</p>
              </div>
              <div>
                <p className="text-muted mb-1">負責人</p>
                <p className="font-medium">{brand.owner}</p>
              </div>
              <div>
                <p className="text-muted mb-1">城市</p>
                <p className="font-medium">{brand.cities}</p>
              </div>
              <div>
                <p className="text-muted mb-1">分店數</p>
                <p className="font-medium">{brand.stores}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="section-title mb-4">聯繫管道</h3>
            <div className="space-y-2">
              {brand.channels.map((ch) => (
                <div key={ch.type} className="flex items-center justify-between p-2 bg-[var(--surface-2)] rounded-lg text-sm">
                  <span className="text-muted">{ch.type}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ch.value}</span>
                    {ch.verified && <span className="text-xs text-green-600">✓</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 中欄：窗口卡片 */}
        <div className="space-y-4">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">聯絡窗口</h3>
              <button className="btn-secondary p-2" title="新增窗口">
                <Plus size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div key={contact.id} className="p-3 bg-[var(--surface-2)] rounded-lg">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-xs text-muted mt-1">{contact.title}</p>
                  <div className="space-y-1 mt-2 text-sm">
                    {contact.mobile && <p className="text-muted">📱 {contact.mobile}</p>}
                    {contact.email && <p className="text-muted">📧 {contact.email}</p>}
                    {contact.line && <p className="text-muted">💬 {contact.line}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 右欄：聯繫紀錄 */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-4">聯繫紀錄</h3>
            <div className="space-y-3 text-sm">
              {outreach.map((log) => (
                <div key={log.id} className="pb-3 border-b border-[var(--border)] last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-muted">{log.date}</span>
                    <span className="text-xs badge badge-contacted">{log.channel}</span>
                  </div>
                  <p className="text-muted">{log.note}</p>
                  {log.nextAction && (
                    <p className="text-xs text-primary mt-1">下步: {log.nextAction}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 手機版：Tabs */}
      <div className="m-only">
        {/* 聯繫按鈕 */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[var(--border)] p-4 flex gap-2 z-50">
          <a href="tel:02-2234-5678" className="btn-primary flex-1">
            <Phone size={18} />
            撨號
          </a>
          <a href="https://lin.ee/6starsfootcare" className="btn-primary flex-1">
            <MessageCircle size={18} />
            LINE
          </a>
        </div>

        <div className="pb-24">
          {/* 標籤頁 */}
          <div className="flex gap-2 mb-4 border-b border-[var(--border)]">
            {["info", "contacts", "outreach"].map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab as any)}
                className={`px-4 py-3 text-sm font-medium transition-all ${
                  selectedTab === tab
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted"
                }`}
              >
                {tab === "info" ? "資料" : tab === "contacts" ? "窗口" : "紀錄"}
              </button>
            ))}
          </div>

          {/* 基本資料標籤 */}
          {selectedTab === "info" && (
            <div className="space-y-3">
              {[
                { label: "統編", value: brand.tax_id },
                { label: "負責人", value: brand.owner },
                { label: "城市", value: brand.cities },
                { label: "分店數", value: brand.stores },
              ].map((item) => (
                <div key={item.label} className="card p-4">
                  <p className="text-sm text-muted mb-1">{item.label}</p>
                  <p className="font-medium">{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* 窗口標籤 */}
          {selectedTab === "contacts" && (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <div key={contact.id} className="card p-4">
                  <p className="font-medium">{contact.name}</p>
                  <p className="text-sm text-muted mt-1">{contact.title}</p>
                  <div className="space-y-2 mt-3">
                    {contact.mobile && (
                      <a
                        href={`tel:${contact.mobile}`}
                        className="flex items-center gap-2 text-primary text-sm"
                      >
                        <Phone size={16} />
                        {contact.mobile}
                      </a>
                    )}
                    {contact.line && (
                      <a
                        href={`https://lin.ee/${contact.line}`}
                        className="flex items-center gap-2 text-primary text-sm"
                      >
                        <MessageCircle size={16} />
                        {contact.line}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 紀錄標籤 */}
          {selectedTab === "outreach" && (
            <div className="space-y-3">
              {outreach.map((log) => (
                <div key={log.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted">{log.date}</span>
                    <span className="text-xs badge badge-contacted">{log.channel}</span>
                  </div>
                  <p className="font-medium">{log.note}</p>
                  {log.nextAction && (
                    <p className="text-sm text-primary mt-2">下步: {log.nextAction}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
