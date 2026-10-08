import {findSite,getSite,checkpointKey,legacyCheckpointKey} from './sites/registry.mjs';
export {findSite,getSite,checkpointKey,legacyCheckpointKey};
export function allowedUrl(value){return !!findSite(value);}
export function backupEntryUrl(value){const unit=findSite(value);return !!unit&&unit.entryPaths.includes(new URL(value).pathname);}
export function validateSnapshot(value, senderUrl) {
  if (!allowedUrl(senderUrl) || !value || !Array.isArray(value.fields) ||
      !value.fields.length || value.fields.length > 100) throw new Error('保存対象を確認できません。');
  const fields = value.fields.map(field => {
    if (!field || typeof field.label !== 'string' || typeof field.value !== 'string' ||
        field.label.length > 500) throw new Error('原稿データの形式が不正です。');
    return {label: field.label, value: field.value};
  });
  if (JSON.stringify(fields).length > 4000000) throw new Error('原稿が大きすぎます。分けて保存してください。');
  if (value.url && !allowedUrl(value.url)) throw new Error('保存元URLが不正です。');
  const unit=findSite(senderUrl);
  if(value.siteId&&value.siteId!==unit.id)throw new Error('保存元とサイト識別子が一致しません。');
  if(value.url&&findSite(value.url)?.id!==unit.id)throw new Error('別サイトの原稿を混ぜて保存できません。');
  const url = new URL(value.url || senderUrl);
  // Query strings may contain tokens. Only the page path is retained.
  const record = {url: url.origin + url.pathname, title: String(value.title || '無題').slice(0, 500), fields};
  if (typeof value.category === 'string') record.category = value.category.slice(0, 100);
  if (typeof value.runId === 'string') record.runId = value.runId.slice(0, 100);
  if (value.ownerId !== undefined) {
    if (!unit.accountIdPattern.test(String(value.ownerId))) throw new Error('ユーザーIDが不正です。');
    record.ownerId = String(value.ownerId);
  }
  if (value.data !== undefined) {
    const json = JSON.stringify(value.data);
    if (json.length > 4000000) throw new Error('1ページのデータが大きすぎます。');
    record.data = JSON.parse(json);
  }
  return unit.normalize(record);
}

export function archiveText(records) {
  return '\uFEFF' + records.map(record => [
    '========================================', record.title,
    '保存日時: ' + record.savedAt, '編集画面: ' + record.url,
    ...record.fields.flatMap(field => ['\n【' + field.label + '】', field.value])
  ].join('\n')).join('\n\n');
}
