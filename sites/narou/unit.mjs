import {narouWorkId} from './work-id.mjs';
export const narouUnit=Object.freeze({
  id:'narou',name:'小説家になろう',contractVersion:1,
  managementOrigins:['https://syosetu.com'],
  entryPaths:['/user/top/','/usernovel/list/','/usernovel/draftlist/'],
  editPathPattern:/^\/(?:(?:usernovelmanage|draftnovelmanage)\/(?:updateinput|receptionsupdateinput)\/ncode\/\d+|(?:usernoveldatamanage|draftepisode)\/updateinput\/ncode\/\d+\/(?:noveldataid|draftepisodeid|episodeid)\/\d+|draftepisode\/updateinput\/draftepisodeid\/\d+|userblogmanage\/updateinput\/blogkey\/\d+|novelinitialsetting\/updateinput)\/$/,
  accountIdPattern:/^\d+$/,
  workIdPattern:/^\d+$/,
  scripts:{account:['sites/narou/parser.js','sites/narou/runtime.js'],
    collect:['sites/narou/parser.js','sites/narou/bulk.js','sites/narou/runtime.js'],
    edit:['sites/narou/parser.js','sites/narou/capture.js','sites/narou/runtime.js']},
  viewScripts:['sites/narou/organized.js'],viewGlobal:'NarouOrganized',
  capabilities:{works:true,body:true,settings:true,bookmarks:true,following:true,announcements:true,editHistory:true,officialDownloadSettings:true},
  recordWorkId:narouWorkId,
  normalize(record){
    const kinds={'作品一覧':'work-list','作品情報':'work','エピソード':'episode','作品設定':'settings','章設定':'chapter','テンプレート':'defaults','ブックマーク':'bookmarks','カテゴリ':'bookmark-categories','お気に入りユーザ':'following','活動報告':'announcement','取得結果':'report'};
    const kind=kinds[record.category]||'edit-history';
    const workId=narouWorkId(record);
    const pageId=record.url.match(/(?:noveldataid|draftepisodeid|episodeid|blogkey)\/(\d+)/)?.[1];
    return {...record,...(workId&&kind==='edit-history'?{data:{...record.data,workId}}:{}),siteId:'narou',schemaVersion:2,kind,entity:{...(workId?{workId:String(workId)}:{}),...(pageId?{id:pageId}:{})}};
  }
});
