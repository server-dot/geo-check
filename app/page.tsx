import type { Metadata } from "next";
import { AI_BOTS } from "@/lib/geo-ai-crawlers";
import { DEEP_AUDIT_KEYS } from "@/lib/geo-audit-rules";
import HomeClient from "./HomeClient";
import { countAudits } from "@/lib/audit-log";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// 「已檢測 N 個網站」= CHECKED_COUNT（開始記錄之前的基數）+ 紀錄檔裡成功的筆數。每分鐘更新一次。
export const revalidate = 60;

export default async function Page() {
  const checkedCount = Number(process.env.CHECKED_COUNT ?? 250) + (await countAudits());
  return <HomeClient botCount={AI_BOTS.length} checkCount={DEEP_AUDIT_KEYS.length} checkedCount={checkedCount} />;
}
