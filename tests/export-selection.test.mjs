import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRecords,selectMetadata,belongsToSelection} from '../export-selection.mjs';
const scope={ownerId:'123',siteId:'narou',workId:'1'};
const row=(category,workId,ownerId='123')=>({id:crypto.randomUUID(),ownerId,siteId:'narou',category,url:'https://syosetu.com/page/'+category,title:'test',fields:[],data:{workId},savedAt:new Date().toISOString()});
test('selected work keeps every version but excludes other works, global records, and other accounts',()=>{
 const records=[row('エピソード','1'),row('エピソード','1'),row('作品設定','1'),row('エピソード','2'),row('ブックマーク'),row('取得結果'),row('エピソード','1','456')];
 assert.deepEqual(selectRecords(records,scope),records.slice(0,3));assert.equal(selectRecords(records,null),records);
});
test('work information and explicitly associated activity are retained',()=>{
 const info=row('作品情報');info.data={id:'1'};const blog=row('活動報告');const associations={['123|'+blog.url]:'1'};
 assert.deepEqual(selectRecords([info,blog],scope,associations),[info,blog]);
 assert.equal(belongsToSelection({ownerId:'456',siteId:'narou',category:'活動報告',url:blog.url},scope,associations),false);
});
test('metadata does not include settings or associations for unrelated works',()=>{
 const preferences=[{ownerId:'123',siteId:'narou',workId:'1'},{ownerId:'123',workId:'2'},{ownerId:'456',workId:'1'}];
 assert.deepEqual(selectMetadata(preferences,{'123|one':'1','123|two':'2','456|one':'1'},scope),{preferences:[preferences[0]],associations:{'123|one':'1'}});
});
