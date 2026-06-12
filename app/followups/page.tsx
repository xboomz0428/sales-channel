"use client";

import { useState } from "react";
import { Clock, Check, Phone, Mail } from "lucide-react";
import Card from "@/components/Card";

interface FollowUp {
  id: number;
  companyName: string;
  contactPerson: string;
  method: "電話" | "郵件" | "LINE";
  status: "未開始" | "進行中" | "已完成";
  dueTime: string;
  notes?: string;
}

const mockFollowUps: FollowUp[] = [
  {
    id: 1,
    companyName: "範例商家一號",
    contactPerson: "陳經理",
    method: "電話",
    status: "未開始",
    dueTime: "10:00 AM",
    notes: "確認採購需求",
  },
  {
    id: 2,
    companyName: "範例商家二號",
    contactPerson: "王主任",
    method: "郵件",
    status: "進行中",
    dueTime: "02:00 PM",
    notes: "送出產品資料",
  },
  {
    id: 3,
    companyName: "範例商家三號",
    contactPerson: "李店長",
    method: "LINE",
    status: "已完成",
    dueTime: "11:30 AM",
    notes: "討論合作細節",
  },
];

const methodIcon = {
  電話: Phone,
  郵件: Mail,
  LINE: Clock,
};

const statusColor = {
  未開始: "bg-gray-100 text-gray-800",
  進行中: "bg-blue-100 text-blue-800",
  已完成: "bg-green-100 text-green-800",
};

export default function FollowUpsPage() {
  const [followUps, setFollowUps] = useState(mockFollowUps);

  const toggleStatus = (id: number) => {
    setFollowUps(
      followUps.map((fu) =>
        fu.id === id
          ? {
              ...fu,
              status:
                fu.status === "未開始"
                  ? "進行中"
                  : fu.status === "進行中"
                  ? "已完成"
                  : "未開始",
            }
          : fu
      )
    );
  };

  const completedCount = followUps.filter((f) => f.status === "已完成").length;
  const pendingCount = followUps.filter((f) => f.status === "未開始").length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">今日跟進</h1>
        <p className="text-gray-600 mt-1">
          {new Date().toLocaleDateString("zh-TW")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card title="總跟進數">
          <div className="flex items-center gap-4">
            <Clock className="w-12 h-12 text-blue-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {followUps.length}
              </p>
              <p className="text-sm text-gray-600">項任務</p>
            </div>
          </div>
        </Card>

        <Card title="待進行">
          <div className="flex items-center gap-4">
            <Clock className="w-12 h-12 text-yellow-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {pendingCount}
              </p>
              <p className="text-sm text-gray-600">項任務</p>
            </div>
          </div>
        </Card>

        <Card title="已完成">
          <div className="flex items-center gap-4">
            <Check className="w-12 h-12 text-green-600" />
            <div>
              <p className="text-3xl font-bold text-gray-900">
                {completedCount}
              </p>
              <p className="text-sm text-gray-600">項任務</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {followUps.map((followUp) => {
          const MethodIcon = methodIcon[followUp.method];

          return (
            <Card key={followUp.id} title={followUp.companyName}>
              <div className="flex gap-6">
                <div className="flex-1">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">聯繫人</p>
                      <p className="font-medium text-gray-900">
                        {followUp.contactPerson}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">聯繫方式</p>
                      <div className="flex items-center gap-2 mt-1">
                        <MethodIcon size={16} className="text-gray-600" />
                        <p className="font-medium text-gray-900">
                          {followUp.method}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">預定時間</p>
                      <p className="font-medium text-gray-900">
                        {followUp.dueTime}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">狀態</p>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${
                          statusColor[followUp.status]
                        }`}
                      >
                        {followUp.status}
                      </span>
                    </div>
                  </div>

                  {followUp.notes && (
                    <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
                      <p className="text-sm text-gray-600">備註</p>
                      <p className="text-gray-900 mt-1">{followUp.notes}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => toggleStatus(followUp.id)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    followUp.status === "已完成"
                      ? "bg-green-100 text-green-700 hover:bg-green-200"
                      : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  }`}
                >
                  {followUp.status === "已完成" ? "✓ 已完成" : "標記完成"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
