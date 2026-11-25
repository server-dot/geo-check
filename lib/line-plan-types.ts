// 產品線作戰清單（公司內部用）：前後端共用的型別。
import type { RecommendVisibility } from './geo-recommend-visibility';
export interface LineCandidate {
  name: string; // 產品線，例如「清潔」
  pages: string[]; // 這條線在官網上的頁
  keywords: { keyword: string; words: string[] }[]; // 客人會搜的字＋頁面上該出現的字（洗面乳、粉刺）
}
export type Tri = 'yes' | 'no' | 'unknown';
export interface PageRead {
  url: string;
  readable: boolean;
  title: string;
  description: string;
  h1: string;
  headings: string[];
  text: string; // 只有這頁自己的內容（選單、頁尾、推薦商品已扣掉）
  links: string[]; // 內容裡的站內連結
  hasFaq: boolean;
  jsonLd: string[];
  imgTotal: number;
  imgNoAlt: number;
}
export interface KeywordStatus {
  line: string;
  keyword: string;
  words: string[];
  page: string; // 由哪頁負責
  rank: number | null | 'failed'; // 第一頁沒有＝null
  top: { rank: number; domain: string; url: string; title: string; isSelf: boolean; isPlatform: boolean }[]; // Google 第一頁
  ai: { engine: string; state: 'named' | 'not' | 'failed' | 'absent' }[];
  verdict: string;
}
export interface PlanTodo {
  priority: '高' | '中' | '低';
  line: string;
  keyword: string;
  category: '頁面文字' | '內容缺口' | '站內連結' | '媒體曝光' | '宣稱與口碑';
  url: string;
  now: string;
  todo: string;
  suggest: string;
  basis: string;
  effort: '低' | '中' | '高';
  role: '文案' | '工程' | '公關' | '法規';
  accept: string;
}
export interface PageWord {
  page: string;
  url: string;
  word: string;
  title: Tri;
  h1: Tri;
  body: Tri;
  currentTitle: string;
}
export interface RivalRow {
  item: string;
  self: string;
  selfUrl: string;
  cells: { text: string; url: string }[]; // 跟 LinePlan.rivalSites 同順序
  action: '要追' | '可主打' | '不一定' | '無法判定';
}
export interface MediaRow {
  site: string;
  url: string;
  type: string;
  mentions: string;
  advice: string;
  aiCited: boolean;
}
export interface RivalSite {
  name: string;
  url: string;
  from: '指定' | 'AI 推薦的同業' | 'Google 第一頁';
  readable: boolean;
}
export interface LinePlan {
  brand: string;
  rivalSites: RivalSite[];
  checkedAt: string;
  pagesRead: number;
  pagesFailed: number;
  keywords: KeywordStatus[];
  todos: PlanTodo[];
  pageWords: PageWord[];
  rivals: RivalRow[];
  media: MediaRow[];
  forum: { question: string; site: string; title: string; link: string }[];
  analysis: RecommendVisibility | null; // 跟報告同一套分析，題目換成這次的關鍵字
  notes: string[]; // 哪些步驟失敗、沒查到
}
export interface LinePlanInput {
  picks: { line: string; pages: string[]; keyword: string; words: string[] }[];
  rivals: { name: string; url: string }[]; // 指定要比的（其他同業自動找）
}
export const MAX_LINE_KEYWORDS = 8;
export const MAX_NAMED_RIVALS = 3;
// 估價用（11-24）：每個字問三家 AI 約 0.11、Google 比對 0.03；定位、評價、對到哪頁等分析約 0.3；媒體、對手官網、論壇搜尋約 0.15
export const estimateUsd = (n: number) => Math.round((n * 0.14 + 0.45) * 100) / 100;
export const pageName = (p: { title: string; url: string }) => p.title.replace(/【[^】]*】/g, '').split(/[｜|]/)[0].trim().slice(0, 24) || p.url;
