// 把作戰清單的 xlsx 交給 Drive 轉成 Google 試算表（放在本人的雲端硬碟，不開分享）
export async function uploadAsSheet(accessToken: string, name: string, xlsx: Buffer): Promise<string> {
  const b = `gc${Date.now().toString(36)}`;
  const body = Buffer.concat([
    Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: 'application/vnd.google-apps.spreadsheet' })}\r\n--${b}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
    xlsx,
    Buffer.from(`\r\n--${b}--`),
  ]);
  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${b}` },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(60_000),
  });
  const d = (await res.json()) as { webViewLink?: string; error?: { message?: string } };
  if (!res.ok || !d.webViewLink || !d.webViewLink.startsWith('https://docs.google.com/')) {
    console.error('drive upload', res.status, d.error?.message);
    throw new Error('建立 Google 試算表失敗，可以先下載 Excel');
  }
  return d.webViewLink;
}
