import { LEVEL, CATEGORY, type CheckResult } from './geo-audit-rules';

// ── GEO 深度健檢：Schema 完整度規則層 ─────────────────────
// 跟 stacktools 的 lib/site-audit-schema.ts 同一套邏輯：純規則核對 JSON-LD 欄位完整度，
// 取代原本丟一段文字叫 AI 猜「夠不夠」的做法。依 Google 結構化資料指南列出的關鍵欄位，
// 缺什麼就列什麼，不再是「建議人工複核」的空話。

export const LOCAL_TYPES = ['LocalBusiness', 'Store', 'Restaurant', 'Dentist', 'MedicalClinic', 'HealthAndBeautyBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'JewelryStore'];
const ARTICLE_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];
const PRODUCT_TYPES = ['Product'];
export const ORG_TYPES = ['Organization'];

type JsonLdNode = Record<string, unknown>;

function nodeTypes(node: JsonLdNode): string[] {
  const t = node['@type'];
  if (typeof t === 'string') return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

// 逐欄位檢查的單一結果：給「結構化資料」專區的逐欄位表格用（label＋實際值＋有沒有填），
// missingLabel 是這個欄位沒填時要接在「缺：」後面的說明字串——通常跟 label 一樣，
// 但像圖片這種欄位，沒填的原因不只一種（完全沒放 vs 放了但格式不對），要不同措辭。
interface FieldCheck {
  label: string;
  value: string;
  present: boolean;
  missingLabel?: string;
}

// 把 JSON-LD 欄位值轉成人看得懂的字串：字串／數字直接用，陣列逐一轉完接起來，
// 常見巢狀物件（PostalAddress、OpeningHoursSpecification、Offer、ImageObject…）
// 挑幾個常見子欄位組出可讀字串，其餘物件退而求其次列出前幾個字串/數字欄位，
// 不要因為格式沒猜對就顯示「未設定」──那樣會誤導成「沒填」，其實只是這裡沒解析出來。
function displayValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(displayValue).filter(Boolean).join('、');
  if (typeof v !== 'object') return '';

  const o = v as JsonLdNode;
  if (typeof o.streetAddress === 'string' || typeof o.addressLocality === 'string') {
    return [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .join(' ');
  }
  if (typeof o.opens === 'string' && typeof o.closes === 'string') {
    const days = Array.isArray(o.dayOfWeek)
      ? o.dayOfWeek.map(String).join('、')
      : typeof o.dayOfWeek === 'string'
        ? o.dayOfWeek
        : '';
    return `${days} ${o.opens}–${o.closes}`.trim();
  }
  if (typeof o.price === 'string' || typeof o.price === 'number') {
    const currency = typeof o.priceCurrency === 'string' ? o.priceCurrency : '';
    return `${currency} ${o.price}`.trim();
  }
  if (typeof o.name === 'string' && o.name.trim()) return o.name.trim();
  if (typeof o.url === 'string' && o.url.trim()) return o.url.trim();
  if (typeof o.contentUrl === 'string' && o.contentUrl.trim()) return o.contentUrl.trim();

  const flat = Object.entries(o)
    .filter(([k]) => !k.startsWith('@'))
    .map(([, val]) => (typeof val === 'string' ? val : typeof val === 'number' ? String(val) : ''))
    .filter(Boolean);
  return flat.slice(0, 3).join(' ');
}

// LocalBusiness 家族逐欄位檢查：地址、電話、營業時間、圖片網址格式
function localBizFieldChecks(node: JsonLdNode): FieldCheck[] {
  const images = imageCandidates(node.image);
  const imageFormatBad = images.length > 0 && !images.some(isAbsoluteUrl);
  return [
    { label: '地址', value: displayValue(node.address), present: truthy(node.address) },
    { label: '電話', value: displayValue(node.telephone), present: truthy(node.telephone) },
    {
      label: '營業時間',
      value: displayValue(node.openingHours) || displayValue(node.openingHoursSpecification),
      present: truthy(node.openingHours) || truthy(node.openingHoursSpecification),
    },
    {
      label: '圖片網址',
      value: images.join('、'),
      present: !imageFormatBad,
      missingLabel: '圖片網址格式（需為完整網址 http(s)://，相對路徑爬蟲抓不到）',
    },
  ];
}

// Product 逐欄位檢查：售價/庫存、圖片
function productFieldChecks(node: JsonLdNode): FieldCheck[] {
  const images = imageCandidates(node.image);
  return [
    { label: '售價/庫存 (offers)', value: displayValue(node.offers), present: truthy(node.offers) },
    {
      label: '圖片',
      value: images.join('、'),
      present: images.length > 0 && images.some(isAbsoluteUrl),
      missingLabel:
        images.length === 0 ? '圖片' : '圖片網址格式（需為完整網址 http(s)://，相對路徑爬蟲抓不到）',
    },
  ];
}

// Article 逐欄位檢查：作者、發布日期
function articleFieldChecks(node: JsonLdNode): FieldCheck[] {
  return [
    { label: '作者', value: displayValue(node.author), present: truthy(node.author) },
    { label: '發布日期', value: displayValue(node.datePublished), present: truthy(node.datePublished) },
  ];
}

// Organization 逐欄位檢查：跟 stacktools schema-check 同一組欄位（名稱、網址、Logo、
// 聯絡方式、簡介、社群連結）——這是「結構化資料」專區真正最常出現的主卡片，
// 幾乎每個網站都會有 Organization 節點，這組欄位決定 AI／搜尋引擎認不認得出你是誰。
function organizationFieldChecks(node: JsonLdNode): FieldCheck[] {
  const logos = imageCandidates(node.logo);
  const logoFormatBad = logos.length > 0 && !logos.some(isAbsoluteUrl);
  return [
    { label: '名稱', value: displayValue(node.name), present: truthy(node.name) },
    { label: '網址', value: displayValue(node.url), present: truthy(node.url) },
    {
      label: 'Logo 圖片網址',
      value: logos.join('、'),
      present: logos.length > 0 && !logoFormatBad,
      missingLabel:
        logos.length === 0 ? 'Logo 圖片網址' : 'Logo 圖片網址格式（需為完整網址 http(s)://，相對路徑爬蟲抓不到）',
    },
    { label: '電話', value: displayValue(node.telephone), present: truthy(node.telephone) },
    { label: 'Email', value: displayValue(node.email), present: truthy(node.email) },
    { label: '簡介', value: displayValue(node.description), present: truthy(node.description) },
    { label: '社群/外部連結', value: displayValue(node.sameAs), present: truthy(node.sameAs) },
  ];
}

function missingLabelsOf(checks: FieldCheck[]): string[] {
  return checks.filter((f) => !f.present).map((f) => f.missingLabel ?? f.label);
}

function missingLocalBizFields(node: JsonLdNode): string[] {
  return missingLabelsOf(localBizFieldChecks(node));
}

function missingProductFields(node: JsonLdNode): string[] {
  return missingLabelsOf(productFieldChecks(node));
}

function missingArticleFields(node: JsonLdNode): string[] {
  return missingLabelsOf(articleFieldChecks(node));
}

// 目前有逐欄位規則的型別家族只有這四種（跟 Google 結構化資料指南列的關鍵欄位對齊，
// 也是跟 stacktools schema-check 一致的範圍）；其餘型別（WebPage、BreadcrumbList、
// WebSite、ImageObject、CollectionPage、Person…）沒有業務意義上的「必填欄位」可查，
// 只是技術性的容器/輔助節點——不虛構我們沒有依據的必填欄位判斷，也不用每個型別
// 都各自佔一張卡片：這種型別在 buildSchemaTypeCards() 裡直接跳過，不產生卡片
// （小積木反饋：8 張卡片大部分只是「有偵測到」，看不懂也沒有要處理的事，喧賓奪主）。
function fieldChecksFor(type: string, node: JsonLdNode): FieldCheck[] | null {
  if (ORG_TYPES.includes(type)) return organizationFieldChecks(node);
  if (LOCAL_TYPES.includes(type)) return localBizFieldChecks(node);
  if (PRODUCT_TYPES.includes(type)) return productFieldChecks(node);
  if (ARTICLE_TYPES.includes(type)) return articleFieldChecks(node);
  return null;
}

export interface SchemaPage {
  url: string;
  jsonLdNodes: JsonLdNode[];
}

// 「Local Business 標籤設定」：逐頁檢查 LocalBusiness 家族節點的關鍵欄位完整度
export function buildLocalBizCheck(pages: SchemaPage[]): CheckResult {
  const base = { key: 'localbiz', level: LEVEL.EFFICIENCY, category: CATEGORY.LOCAL_BRAND, item: 'Local Business 標籤設定' };
  const foundTypes = new Set<string>();
  const details: { url: string; note: string }[] = [];
  let deployedPages = 0;
  let completePages = 0;

  for (const p of pages) {
    const localNodes = p.jsonLdNodes.filter((n) => nodeTypes(n).some((t) => LOCAL_TYPES.includes(t)));
    if (localNodes.length === 0) continue;
    deployedPages++;
    for (const n of localNodes) nodeTypes(n).forEach((t) => LOCAL_TYPES.includes(t) && foundTypes.add(t));
    // 一頁可能有多個 LocalBusiness 節點，取欄位缺最少的那個當這頁的代表結果
    const bestMissing = localNodes.map(missingLocalBizFields).sort((a, b) => a.length - b.length)[0];
    if (bestMissing.length === 0) {
      completePages++;
    } else {
      details.push({ url: p.url, note: `LocalBusiness 缺：${bestMissing.join('、')}` });
    }
  }

  if (deployedPages === 0) {
    // 沒有 LocalBusiness 家族標籤不等於網站有問題——LocalBusiness 是給
    // 「有實體可到訪地點」的商家用的加分標籤，純線上服務／無店面業者本來
    // 就不適用，硬加反而是語意上不準確的宣告。這裡不直接判定失敗：
    // 如果 Organization 已經帶 address（純粹揭露聯絡地址，不等於「這裡是
    // 商家可到訪地點」），代表聯絡資訊這件事已經做了，直接算過關；完全
    // 查不到任何地址，才用 warn 提醒（不是 fail），把「要不要加」的判斷
    // 留給網站經營者自己決定業務型態。
    const hasOrgAddress = pages.some((p) =>
      p.jsonLdNodes.some((n) => nodeTypes(n).includes('Organization') && truthy(n.address))
    );
    if (hasOrgAddress) {
      return {
        ...base,
        status: 'ok',
        advice: '未部署 LocalBusiness 標籤，但 Organization 已帶聯絡地址——LocalBusiness 是給有實體可到訪地點的商家用的加分標籤，純線上服務不需要加',
        evidence: 'Organization 已含 address',
      };
    }
    return {
      ...base,
      status: 'warn',
      advice: '全站未偵測到 LocalBusiness 標籤，也沒有其他管道揭露聯絡地址。如果有實體門市或可到訪地點，建議部署 LocalBusiness 標籤方便在地搜尋收錄；純線上服務可以不用理會這項',
      evidence: '（無）',
    };
  }
  const typesText = [...foundTypes].join('、');
  if (completePages === deployedPages) {
    return { ...base, status: 'ok', advice: `全站已部署 ${typesText} 標籤，地址、電話、營業時間欄位皆完整（${completePages}/${deployedPages} 頁）`, evidence: `${completePages}/${deployedPages} 頁欄位完整` };
  }
  return {
    ...base,
    status: 'warn',
    advice: `全站已部署 ${typesText} 標籤，但 ${deployedPages - completePages}/${deployedPages} 頁欄位不完整，例如：${details.slice(0, 3).map((d) => d.note).join('；')}，建議補齊`,
    evidence: `${completePages}/${deployedPages} 頁欄位完整`,
    details,
  };
}

// image/logo 常見是純字串網址，也常見包成 ImageObject（url/contentUrl），也常見是陣列（多張圖／不同比例）；
// 統一攤平成候選網址陣列，方便判斷「有沒有填」和「網址格式對不對」
function imageCandidates(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(imageCandidates);
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  if (v && typeof v === 'object') {
    const o = v as JsonLdNode;
    const u = typeof o.url === 'string' ? o.url : typeof o.contentUrl === 'string' ? o.contentUrl : '';
    return u.trim() ? [u.trim()] : [];
  }
  return [];
}

// Google 要求 image/logo 一定要是絕對網址，相對路徑（如 /img/logo.png）爬蟲抓不到
function isAbsoluteUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

// 「結構化數據 (Schema)」：純規則判斷全站 JSON-LD 完整度，不再叫 AI 猜
export function buildSchemaCompletenessCheck(pages: SchemaPage[]): CheckResult {
  const base = { key: 'schema', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '結構化資料 (Schema)' };
  const allTypes = new Set<string>();
  const details: { url: string; note: string }[] = [];
  let importantNodeCount = 0;
  let incompleteCount = 0;

  for (const p of pages) {
    for (const node of p.jsonLdNodes) {
      const types = nodeTypes(node);
      types.forEach((t) => allTypes.add(t));
      let missing: string[] = [];
      let label = '';
      if (types.some((t) => LOCAL_TYPES.includes(t))) { missing = missingLocalBizFields(node); label = 'LocalBusiness'; }
      else if (types.some((t) => PRODUCT_TYPES.includes(t))) { missing = missingProductFields(node); label = 'Product'; }
      else if (types.some((t) => ARTICLE_TYPES.includes(t))) { missing = missingArticleFields(node); label = 'Article'; }
      else continue;
      importantNodeCount++;
      if (missing.length) {
        incompleteCount++;
        details.push({ url: p.url, note: `${label} 缺：${missing.join('、')}` });
      }
    }
  }

  if (allTypes.size === 0) {
    return { ...base, status: 'fail', advice: '全站原始碼找不到任何 JSON-LD 結構化資料，建議依頁面性質部署 LocalBusiness / Product / Article / BreadcrumbList 等 Schema', evidence: '（無）' };
  }
  const typesText = [...allTypes].join('、');
  if (importantNodeCount === 0) {
    return { ...base, status: 'warn', advice: `全站偵測到 ${typesText}，但未偵測到 LocalBusiness / Product / Article 等關鍵型別，建議依頁面性質補上對應 Schema`, evidence: typesText };
  }
  if (incompleteCount === 0) {
    return { ...base, status: 'ok', advice: `全站偵測到 ${typesText}，關鍵型別（LocalBusiness / Product / Article）欄位皆完整`, evidence: typesText };
  }
  return {
    ...base,
    status: 'warn',
    advice: `全站偵測到 ${typesText}，其中 ${incompleteCount}/${importantNodeCount} 個關鍵節點欄位不完整，例如：${details.slice(0, 3).map((d) => d.note).join('；')}，建議補齊`,
    evidence: typesText,
    details,
  };
}

// ── 「結構化資料」專區：業務上有意義的型別各自一張卡片 ─────────────────
// 跟上面兩個 buildXCheck() 給的「一句話總結」不同，這裡要給逐型別、逐欄位的細節，
// 是「缺什麼幫你補」這個賣點功能的地基（見 memory：geo-check-todo）。只有
// fieldChecksFor() 認得的型別（Organization／LocalBusiness 家族／Product／Article）
// 才會產生卡片——WebPage、BreadcrumbList 這類純技術容器型別直接跳過，見上面
// fieldChecksFor() 的說明。

export interface SchemaFieldRow {
  label: string;
  value: string;
  present: boolean;
  suggestedValue?: string; // AI 從頁面內容裡找到的建議值（見 geo-schema-complete.ts），只在 present:false 時才有意義
}

export interface SchemaTypeCard {
  type: string;
  pageCount: number; // 這個型別出現在幾個不同頁面
  fields: SchemaFieldRow[];
  incompletePages: { url: string; note: string }[];
  sampleNode: JsonLdNode; // 代表節點，給「展開看原始 JSON-LD」用
  sampleUrl: string; // sampleNode 所在的頁面，給 geo-schema-complete.ts 找內文用
}

export function buildSchemaTypeCards(pages: SchemaPage[]): SchemaTypeCard[] {
  const byType = new Map<string, { url: string; node: JsonLdNode }[]>();
  for (const p of pages) {
    for (const node of p.jsonLdNodes) {
      for (const t of nodeTypes(node)) {
        const arr = byType.get(t) ?? [];
        arr.push({ url: p.url, node });
        byType.set(t, arr);
      }
    }
  }

  const cards: SchemaTypeCard[] = [];
  for (const [type, entries] of byType) {
    const pageCount = new Set(entries.map((e) => e.url)).size;

    if (fieldChecksFor(type, entries[0].node) === null) continue;

    // 同一頁可能有多個同型別節點，每頁取欄位缺最少的那個代表這一頁；
    // 全站則取「缺最少」的那個節點代表卡片的欄位表格＋原始 JSON-LD。
    const perPage = new Map<string, JsonLdNode>();
    for (const { url, node } of entries) {
      const missing = missingLabelsOf(fieldChecksFor(type, node)!).length;
      const existing = perPage.get(url);
      const existingMissing = existing ? missingLabelsOf(fieldChecksFor(type, existing)!).length : Infinity;
      if (missing < existingMissing) perPage.set(url, node);
    }

    const incompletePages: { url: string; note: string }[] = [];
    let bestNode = entries[0].node;
    let bestUrl = entries[0].url;
    let bestMissingCount = Infinity;
    for (const [url, node] of perPage) {
      const missing = missingLabelsOf(fieldChecksFor(type, node)!);
      if (missing.length > 0) incompletePages.push({ url, note: `缺：${missing.join('、')}` });
      if (missing.length < bestMissingCount) {
        bestMissingCount = missing.length;
        bestNode = node;
        bestUrl = url;
      }
    }

    cards.push({
      type,
      pageCount,
      fields: fieldChecksFor(type, bestNode)!,
      incompletePages,
      sampleNode: bestNode,
      sampleUrl: bestUrl,
    });
  }

  // Organization 是幾乎每個網站都會有、最該優先看的主卡片，排最前面；
  // 其餘依 LocalBusiness／Product／Article 這個順序排（跟 fieldChecksFor 的檢查順序一致）
  const priority = (type: string) =>
    ORG_TYPES.includes(type) ? 0 : LOCAL_TYPES.includes(type) ? 1 : PRODUCT_TYPES.includes(type) ? 2 : 3;
  return cards.sort((a, b) => priority(a.type) - priority(b.type));
}
