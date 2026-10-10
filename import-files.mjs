export function selectImportFiles(value){
 const all=Array.from(value),zips=all.filter(f=>f.name.toLowerCase().endsWith('.zip'));
 if(zips.length)return {files:zips,ignored:all.length-zips.length};
 const json=all.filter(f=>f.name.toLowerCase().endsWith('.json'));
 if(json.length!==1)throw new Error(json.length?'JSONは1つずつ読み込んでください。':'このアプリで保存したZIPまたはJSONを選んでください。');
 return {files:json,ignored:all.length-1};
}
export function ignoredFilesNote(count){return count?'対象外のファイル'+count+'個は読み飛ばしました。':'';}
