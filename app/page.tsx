import { AI_BOTS } from "@/lib/geo-ai-crawlers";
import { DEEP_AUDIT_KEYS } from "@/lib/geo-audit-rules";
import HomeClient from "./HomeClient";

export default function Page() {
  const checkedCount = Number(process.env.CHECKED_COUNT ?? 250);
  return <HomeClient botCount={AI_BOTS.length} checkCount={DEEP_AUDIT_KEYS.length} checkedCount={checkedCount} />;
}
