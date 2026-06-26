/**
 * 我方公司基本資料（報價單、郵件等共用）。
 * 來源：好漢草產品清單抬頭 / 官網。
 */
export const COMPANY = {
  name: "威斯邁國際有限公司",
  brand: "HeroHerb 好漢草 — 漢方良品",
  taxId: "",   // 統一編號（請於 lib/company.ts 填入正確統編後顯示）
  phone: "(02)2631-8499",
  fax: "(02)2631-9577",
  email: "service@wesmilegood.com",
  website: "www.heroherb.co",
  address: "",  // 公司地址（請填入後顯示）
} as const;
