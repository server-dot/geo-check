import JsonLd from './JsonLd';

// FAQPage 標記：跟頁面上 FaqAccordion 吃同一份 items，問答內容不會兩邊不一致。
export default function FaqJsonLd({ items }: { items: { q: string; a: string }[] }) {
  return (
    <JsonLd
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((i) => ({
          '@type': 'Question',
          name: i.q,
          acceptedAnswer: { '@type': 'Answer', text: i.a },
        })),
      }}
    />
  );
}
