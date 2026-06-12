import { redirect } from "next/navigation";

// 客情維護已整合進「今日跟進」（對照 reference 導航結構）
export default function CarePage() {
  redirect("/followups");
}
