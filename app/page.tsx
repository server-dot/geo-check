import type { Metadata } from "next";
import { DEEP_AUDIT_KEYS } from "@/lib/geo-audit-rules";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Page() {
  const checkedCount = Number(process.env.CHECKED_COUNT ?? 250);
  return <HomeClient checkCount={DEEP_AUDIT_KEYS.length} checkedCount={checkedCount} />;
}
