import { getCfgMany } from "@/lib/settings";
import { DEFAULT_COMPANY, COMPANY_KEYS, CompanyInfo } from "@/lib/company";

/**
 * 讀取我方公司資料：優先 app_settings（設定頁可改），缺值用 DEFAULT_COMPANY。
 * 僅供 server 端使用（API route、匯出）。
 */
export async function getCompany(): Promise<CompanyInfo> {
  const cfg = await getCfgMany(Object.values(COMPANY_KEYS));
  const pick = (k: keyof CompanyInfo) => {
    const v = cfg[COMPANY_KEYS[k]];
    return v && v.trim() !== "" ? v : DEFAULT_COMPANY[k];
  };
  return {
    name: pick("name"),
    brand: pick("brand"),
    taxId: pick("taxId"),
    phone: pick("phone"),
    fax: pick("fax"),
    email: pick("email"),
    website: pick("website"),
    address: pick("address"),
  };
}
