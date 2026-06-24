// 郵件模板可用變數（共用：server 端替換 + client 端編輯器說明）

export const TEMPLATE_VARS: { key: string; label: string; desc: string }[] = [
  { key: "品牌名", label: "{{品牌名}}", desc: "品牌名稱" },
  { key: "公司名稱", label: "{{公司名稱}}", desc: "工商登記的公司全名" },
  { key: "產業", label: "{{產業}}", desc: "品牌所屬產業分類" },
  { key: "負責人", label: "{{負責人}}", desc: "工商登記負責人" },
  { key: "統編", label: "{{統編}}", desc: "統一編號" },
  { key: "收件人Email", label: "{{收件人Email}}", desc: "收件人的 Email 地址" },
  { key: "寄件人", label: "{{寄件人}}", desc: "寄件人名稱（設定值）" },
  { key: "今天日期", label: "{{今天日期}}", desc: "寄送當天日期，如 2026/06/24" },
];
