import { LEVEL, CATEGORY, type CheckResult } from './geo-audit-rules';

// ── GEO 深度健檢：Schema 完整度規則層 ─────────────────────
// 跟 stacktools 的 lib/site-audit-schema.ts 同一套邏輯：純規則核對 JSON-LD 欄位完整度，
// 取代原本丟一段文字叫 AI 猜「夠不夠」的做法。依 Google 結構化資料指南列出的關鍵欄位，
// 缺什麼就列什麼，不再是「建議人工複核」的空話。

export const LOCAL_TYPES = ['LocalBusiness', 'Store', 'Restaurant', 'Dentist', 'MedicalClinic', 'HealthAndBeautyBusiness', 'ProfessionalService', 'HomeAndConstructionBusiness', 'JewelryStore'];
const ARTICLE_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];
const PRODUCT_TYPES = ['Product'];

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

// LocalBusiness 家族關鍵欄位：地址、電話、營業時間
function missingLocalBizFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.address)) missing.push('地址');
  if (!truthy(node.telephone)) missing.push('電話');
  if (!truthy(node.openingHours) && !truthy(node.openingHoursSpecification)) missing.push('營業時間');
  const images = imageCandidates(node.image);
  if (images.length && !images.some(isAbsoluteUrl)) missing.push('圖片網址格式（需為完整網址 http(s)://，相對路徑爬蟲抓不到）');
  return missing;
}

// Product 關鍵欄位：售價/庫存、圖片
function missingProductFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.offers)) missing.push('售價/庫存 (offers)');
  const images = imageCandidates(node.image);
  if (images.length === 0) missing.push('圖片');
  else if (!images.some(isAbsoluteUrl)) missing.push('圖片網址格式（需為完整網址 http(s)://，相對路徑爬蟲抓不到）');
  return missing;
}

// Article 關鍵欄位：作者、發布日期
function missingArticleFields(node: JsonLdNode): string[] {
  const missing: string[] = [];
  if (!truthy(node.author)) missing.push('作者');
  if (!truthy(node.datePublished)) missing.push('發布日期');
  return missing;
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
  const base = { key: 'schema', level: LEVEL.EFFICIENCY, category: CATEGORY.TECH, item: '結構化數據 (Schema)' };
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
