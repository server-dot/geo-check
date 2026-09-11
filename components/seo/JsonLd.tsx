// JSON-LD 用原生 <script>，不用 next/script（那是給要執行的 JS 用的）。
// JSON.stringify 不會跳脫 <，照 Next 文件把它換成 < 防 XSS。
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
