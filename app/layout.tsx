import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import JsonLd from "@/components/seo/JsonLd";
import { ORG, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// 子頁的 title 只寫自己那段，後綴由 template 補；canonical 各頁自己給相對路徑，
// 靠 metadataBase 組成完整網址（範例站 14 頁全沒 canonical 是健檢抓出來的缺項）。
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_TAGLINE}｜${SITE_NAME}`,
    template: `%s｜${SITE_TAGLINE}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "zh_TW",
    images: ["/geocheck-logo.webp"],
  },
  // Search Console 的驗證碼由環境變數給，沒設就不輸出這個 meta
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// GA4：NEXT_PUBLIC_GA_ID 沒設就完全不載入，本機開發不會打到正式的評估 ID
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

// 全站共用的 Organization／WebSite 標記。Organization 帶 address 是刻意的：
// 健檢的「店家資訊」項目看到 Organization 有地址就不會再叫純線上服務補 LocalBusiness。
const SITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${ORG.url}#organization`,
      name: ORG.name,
      url: ORG.url,
      logo: ORG.logo,
      telephone: ORG.telephone,
      email: ORG.email,
      description: ORG.description,
      address: { "@type": "PostalAddress", ...ORG.address },
      openingHours: ORG.openingHours,
      sameAs: ORG.sameAs,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: `${SITE_NAME} ${SITE_TAGLINE}`,
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      inLanguage: "zh-Hant",
      publisher: { "@id": `${ORG.url}#organization` },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <JsonLd data={SITE_JSONLD} />
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <Script id="ga4">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
        {children}
      </body>
    </html>
  );
}
