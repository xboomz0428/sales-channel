"use client";

import { Building2, MapPin, Users } from "lucide-react";
import Card from "@/components/Card";

interface Brand {
  id: number;
  name: string;
  storeCount: number;
  industry: string;
  locations: string[];
  status: "開發中" | "已合作" | "未決定";
}

const mockBrands: Brand[] = [
  {
    id: 1,
    name: "連鎖品牌一號",
    storeCount: 15,
    industry: "餐飲",
    locations: ["台北", "台中", "高雄"],
    status: "開發中",
  },
  {
    id: 2,
    name: "連鎖品牌二號",
    storeCount: 8,
    industry: "美容",
    locations: ["台北", "新北"],
    status: "已合作",
  },
  {
    id: 3,
    name: "連鎖品牌三號",
    storeCount: 12,
    industry: "零售",
    locations: ["台北", "台中", "台南", "高雄"],
    status: "未決定",
  },
];

export default function BrandsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">品牌詳情</h1>
        <p className="text-gray-600 mt-1">連鎖品牌與關係企業管理</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockBrands.map((brand) => (
          <Card key={brand.id} title={brand.name}>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">產業</p>
                <p className="font-medium text-gray-900">{brand.industry}</p>
              </div>

              <div className="flex items-start gap-2">
                <Users className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">分店數</p>
                  <p className="font-medium text-gray-900">{brand.storeCount} 家</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-600">營運位置</p>
                  <p className="text-sm text-gray-900">
                    {brand.locations.join(", ")}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    brand.status === "已合作"
                      ? "bg-green-100 text-green-800"
                      : brand.status === "開發中"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {brand.status}
                </span>
              </div>

              <div className="pt-2">
                <a href="#" className="text-blue-600 text-sm hover:underline">
                  查看所有分店 →
                </a>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
