"use client";

import { useState } from "react";
import { Phone, MessageCircle, Mail, Globe, Share2 } from "lucide-react";

interface Brand {
  id: number;
  name: string;
  stores: number;
  industry: string;
  cities: string;
  score: number;
  status: "new" | "contacted" | "sampling" | "won";
  tax_id?: string;
  owner?: string;
}

const mockBrands: Brand[] = [
  {
    id: 1,
    name: "6星集足體養生會館",
    stores: 9,
    industry: "養生會館",
    cities: "北/中/南",
    score: 92,
    status: "sampling",
    tax_id: "16830000",
    owner: "江○○",
  },
];

export default function BrandsPage() {
  const [selectedBrand] = useState<Brand>(mockBrands[0]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">品牌詳情</h1>
        <p className="text-muted mt-2">{selectedBrand.name}</p>
      </div>

      {/* Mobile: Tabs */}
      <div className="m-only space-y-4">
        {/* Contact Buttons */}
        <div className="flex gap-2">
          <button className="btn-primary flex-1 flex items-center justify-center gap-2">
            <Phone size={18} />
            撨號
          </button>
          <button className="btn-primary flex-1 flex items-center justify-center gap-2">
            <MessageCircle size={18} />
            LINE
          </button>
        </div>

        {/* Basic Info */}
        <div className="card">
          <h3 className="section-title mb-3">基本資料</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">分店數</span>
              <span className="font-medium">{selectedBrand.stores}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">產業</span>
              <span className="font-medium">{selectedBrand.industry}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">城市</span>
              <span className="font-medium">{selectedBrand.cities}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">統編</span>
              <span className="font-medium">{selectedBrand.tax_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">負責人</span>
              <span className="font-medium">{selectedBrand.owner}</span>
            </div>
          </div>
        </div>

        {/* Contact Methods */}
        <div className="card">
          <h3 className="section-title mb-3">聯繫管道</h3>
          <div className="space-y-2">
            {[
              { icon: Globe, name: "官網", value: "www.example.com" },
              { icon: Share2, name: "粉專", value: "@example" },
              { icon: Mail, name: "Email", value: "contact@example.com" },
            ].map((method, i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-[8px] bg-[color:var(--surface-2)]">
                <method.icon size={16} className="text-[color:var(--primary)]" />
                <div className="flex-1">
                  <p className="text-xs text-muted">{method.name}</p>
                  <p className="text-sm font-medium text-[color:var(--text)]">{method.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: 3-Column Layout */}
      <div className="d-only grid grid-cols-3 gap-6">
        {/* Left: Basic Info */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-4">基本資料</h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted mb-1">統編</p>
                <p className="font-medium">{selectedBrand.tax_id}</p>
              </div>
              <div>
                <p className="text-muted mb-1">負責人</p>
                <p className="font-medium">{selectedBrand.owner}</p>
              </div>
              <div>
                <p className="text-muted mb-1">分店數</p>
                <p className="font-medium">{selectedBrand.stores}</p>
              </div>
              <div>
                <p className="text-muted mb-1">城市</p>
                <p className="font-medium">{selectedBrand.cities}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Middle: Contacts */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-4">聯繫人</h3>
            <button className="btn-primary w-full">+ 新增聯繫人</button>
            <div className="mt-4 space-y-3">
              <div className="p-3 bg-[color:var(--surface-2)] rounded-[10px]">
                <p className="font-medium text-sm">王經理</p>
                <p className="text-xs text-muted mt-1">業務</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Contact Timeline */}
        <div className="space-y-4">
          <div className="card">
            <h3 className="section-title mb-4">聯繫紀錄</h3>
            <div className="space-y-2 text-xs border-l-2 border-[color:var(--primary)] pl-4">
              <div>
                <p className="font-medium text-[color:var(--text)]">初次接觸</p>
                <p className="text-muted">2026-04-10</p>
              </div>
              <div>
                <p className="font-medium text-[color:var(--text)]">打樣協議</p>
                <p className="text-muted">2026-05-15</p>
              </div>
              <div>
                <p className="font-medium text-[color:var(--text)]">待下步行動</p>
                <p className="text-muted">下次跟進: 2026-06-20</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Notes Modal Placeholder */}
      <div className="m-only card">
        <h3 className="section-title mb-3">30秒快速記錄</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <button className="flex-1 py-2 rounded-[10px] bg-[color:var(--primary-50)] text-[color:var(--primary)] font-medium text-sm">
              有興趣
            </button>
            <button className="flex-1 py-2 rounded-[10px] bg-[color:var(--surface-2)] text-[color:var(--text)] font-medium text-sm">
              再約
            </button>
            <button className="flex-1 py-2 rounded-[10px] bg-[color:var(--danger)] bg-opacity-10 text-[color:var(--danger)] font-medium text-sm">
              拒絕
            </button>
          </div>
          <input
            type="text"
            placeholder="快速備註..."
            className="input text-sm"
          />
        </div>
      </div>
    </div>
  );
}
