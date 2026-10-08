import {getSite} from './sites/registry.mjs';
export const DEFAULT_PREFERENCE = Object.freeze({encoding:'utf-8',bom:false,lineEnding:'crlf'});
export function normalizePreference(value) {
  if(!value || !['utf-8','utf-16le','utf-16be','shift_jis','euc-jp','jis'].includes(value.encoding) ||
     typeof value.bom!=='boolean' || !['crlf','cr','lf'].includes(value.lineEnding)) throw new Error('ダウンロード設定の形式が不正です。');
  return {encoding:value.encoding,bom:value.bom,lineEnding:value.lineEnding};
}
export function preferenceKey(ownerId,workId='default',siteId='narou') {
  const unit=getSite(siteId);
  if(!unit||!unit.accountIdPattern.test(String(ownerId)) || (workId!=='default'&&!unit.workIdPattern.test(String(workId)))) throw new Error('サイト・ユーザーID・作品IDを確認してください。');
  return 'download-preference:'+(siteId==='narou'?'':siteId+':')+ownerId+':'+workId;
}
export function effectivePreference(data,ownerId,workId,siteId='narou') {
  const individual=workId?data[preferenceKey(ownerId,workId,siteId)]:null;
  const common=data[preferenceKey(ownerId,'default',siteId)];
  return {settings:normalizePreference(individual?.settings||common?.settings||DEFAULT_PREFERENCE),source:individual?'作品別':common?'共通':'初期値'};
}
