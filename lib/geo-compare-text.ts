// 前端畫面和後端抽引文共用（這個檔不能 import 任何後端模組）
// 冒號結尾＝引言句，真正的內容在後面的表格／清單：剪掉「…包括：」那段，前半句還看得懂才留（剪完仍是原文的開頭，核對不受影響）
export function trimLeadIn(q: string): string {
  if (!/[：:]\s*$/.test(q)) return q;
  let t = q.replace(/[：:]\s*$/, '');
  const i = Math.max(t.lastIndexOf('，'), t.lastIndexOf(','));
  if (i > 0 && /(包括|包含|如下|以下|寫明|例如|有)$/.test(t.slice(i + 1))) t = t.slice(0, i);
  return t.replace(/\s+/g, '').length >= 6 && !/(包括|包含|如下|以下|寫明|例如)$/.test(t) ? t.trim() : '';
}
