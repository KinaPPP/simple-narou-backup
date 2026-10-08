import {recordIndex} from './archive.mjs';
export function belongsToSelection(entry,scope,associations={}){
 if(!scope)return true;
 if(entry.ownerId!==scope.ownerId||(entry.siteId||'narou')!==scope.siteId)return false;
 return (entry.workId||recordIndex(entry).workId)===scope.workId||entry.category==='活動報告'&&associations[entry.ownerId+'|'+entry.url]===scope.workId;
}
export function selectRecords(records,scope,associations={}){
 if(!scope)return records;
 return records.filter(r=>belongsToSelection(recordIndex(r),scope,associations));
}
export function selectMetadata(preferences,associations,scope){
 if(!scope)return {preferences,associations};
 return {preferences:preferences.filter(p=>p.ownerId===scope.ownerId&&(p.siteId||'narou')===scope.siteId&&String(p.workId)===scope.workId),associations:Object.fromEntries(Object.entries(associations).filter(([key,id])=>key.startsWith(scope.ownerId+'|')&&String(id)===scope.workId))};
}
export function selectionWarnings(entries,scope){
 if(!scope)return [];
 const count=entries.filter(e=>e.ownerId===scope.ownerId&&(e.siteId||'narou')===scope.siteId&&!e.workId&&!recordIndex(e).workId&&(!e.category||e.category==='編集履歴')).length;
 return count?['作品を判別できない編集履歴 '+count+'件は含まれていません。「全部保存」で保存してください。']:[];
}
