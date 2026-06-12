"use client";

import { useState } from "react";
import { Search, Plus, Filter } from "lucide-react";
import Card from "@/components/Card";

interface Lead {
  id: number;
  name: string;
  address: string;
  phone: string;
  status: "新增" | "跟進中" | "成交" | "未決定";
  industry: string;
  lastContact?: string;
}

const mockLeads: Lead[] = [
  {
    id: 1,
    name: "範例商家一號",
    address: "台北市信義區",
    phone: "02-1234-5678",
    status: "新增",
    industry: "餐飲",
    lastContact: "2024-06-10",
  },
  {
    id: 2,
    name: "範例商家二號",
    address: "台中市西屯區",
    phone: "04-5678-9012",
    status: "跟進中",
    industry: "美容",
  },
  {
    id: 3,
    name: "範例商家三號",
    address: "高雄市左營區",
    phone: "07-9012-3456",
    status: "成交",
    industry: "零售",
  },
];

const statusColor = {
  新增: "bg-blue-100 text-blue-800",
  跟進中: "bg-yellow-100 text-yellow-800",
  成交: "bg-green-100 text-green-800",
  未決定: "bg-gray-100 text-gray-800",
};

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [leads] = useState(mockLeads);

  const filteredLeads = leads.filter(
    (lead) =>
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.address.includes(searchTerm) ||
      lead.industry.includes(searchTerm)
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">名單總覽</h1>
          <p className="text-gray-600 mt-1">共 {leads.length} 筆名單</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={20} />
          新增名單
        </button>
      </div>

      <Card title="搜尋與過濾">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-3 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="搜尋商家名稱、地址或產業..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Filter size={20} />
            篩選
          </button>
        </div>
      </Card>

      <div className="mt-6 bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                商家名稱
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                地址
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                產業
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                電話
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                狀態
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-gray-200 hover:bg-gray-50"
              >
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {lead.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {lead.address}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {lead.industry}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {lead.phone}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                      statusColor[lead.status]
                    }`}
                  >
                    {lead.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <a href="#" className="text-blue-600 hover:underline">
                    查看詳情
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
