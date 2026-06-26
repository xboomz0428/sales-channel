/**
 * 我方公司基本資料（報價單、郵件等共用）。
 * 預設值為 fallback；實際值可在「設定 → 公司資料」修改，存於 app_settings。
 * 此檔為純常數（無 server 相依），可安全於 client 端 import。
 */
export interface CompanyInfo {
  name: string;
  brand: string;
  taxId: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  address: string;
  logo: string;
}

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "威斯邁國際有限公司",
  brand: "HeroHerb 好漢草 — 漢方良品",
  taxId: "",
  phone: "(02)2631-8499",
  fax: "(02)2631-9577",
  email: "service@wesmilegood.com",
  website: "www.heroherb.co",
  address: "",
  logo: "",
};

/** app_settings 對應 key */
export const COMPANY_KEYS: Record<keyof CompanyInfo, string> = {
  name: "COMPANY_NAME",
  brand: "COMPANY_BRAND",
  taxId: "COMPANY_TAX_ID",
  phone: "COMPANY_PHONE",
  fax: "COMPANY_FAX",
  email: "COMPANY_EMAIL",
  website: "COMPANY_WEBSITE",
  address: "COMPANY_ADDRESS",
  logo: "COMPANY_LOGO_URL",
};
