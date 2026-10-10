import test from 'node:test';import assert from 'node:assert/strict';
import {cleanDiagnostic,createDiagnosticStore,diagnosticKey,publicReportURL,reportText,reportSummary,errorCode} from '../diagnostics.mjs';
import {removeAcquiredData} from '../reset-data.mjs';
test('diagnostics retain only enumerated reasons and numbers, never manuscript or private identifiers',()=>{
 const secret='private manuscript and csrf token';const event={kind:'request_error',stage:'episode',code:'HTTP',http:503,workNumber:2,episodeNumber:4,ownerId:'123',url:'https://syosetu.com/draftepisode/updateinput/draftepisodeid/SECRET/',message:secret,title:secret,body:secret};
 const clean=cleanDiagnostic(event,'2026-10-10T03:00:00Z');assert.deepEqual(clean,{at:'2026-10-10T03:00:00Z',kind:'request_error',stage:'episode',code:'HTTP',workNumber:2,episodeNumber:4,http:503});
 const cp={workPlan:[{title:secret,id:'private'}],scans:{'private URL':[]},pages:2,options:{includeBody:true},doneWorks:[]};
 const text=reportText({version:'1.1.0',events:[{...event,at:clean.at}],summary:reportSummary(cp)});assert.doesNotMatch(text,/private|SECRET|csrf|503.*123/);assert.match(text,/HTTP 503/);
 assert.equal(errorCode(new Error('HTTP 429 private URL')),'HTTP');assert.equal(errorCode(new Error(secret)),'UNKNOWN');
 assert.doesNotThrow(()=>reportText({events:[{kind:'started',at:'2026-99-99T99:99:99Z'},null]}));
});
test('ZIP diagnostics disclose counts only and timestamps require opt-in',()=>{
 const events=[{at:'2026-10-10T03:00:00Z',kind:'request_error',stage:'inventory',code:'HTTP',http:503}];
 const importStatus={lastImportFailed:true,fileName:'PRIVATE FILE',ownerId:'SECRET',archive:{total:10,verified:3,damaged:1,missingRecords:2,missingParts:1,fileName:'SECRET'}};
 const text=reportText({version:'1.1.0',events,importStatus});assert.match(text,/読み込み失敗：あり/);assert.match(text,/未検証 6件/);assert.match(text,/破損 1件/);assert.match(text,/不足分割ZIP 1個/);assert.doesNotMatch(text,/PRIVATE|SECRET|2026|12:00/);
 assert.match(reportText({version:'1.1.0',events,includeTimes:true}),/2026\/10\/10 12:00:00/);
});
test('concurrent diagnostics keep their order, cap at 200, isolate accounts, and are removed by reset',async()=>{
 const data={};const storage={get:async k=>k?{[k]:data[k]}:{...data},set:async v=>Object.assign(data,v),remove:async ks=>ks.forEach(k=>delete data[k])};const append=createDiagnosticStore(storage);
 await Promise.all(Array.from({length:205},(_,i)=>append('narou','123',{kind:'scan',pages:i,stage:'inventory',code:'NONE'})));
 assert.equal(data[diagnosticKey('narou','123')].events.length,200);assert.equal(data[diagnosticKey('narou','123')].events[0].pages,5);assert.equal(data[diagnosticKey('narou','123')].events.at(-1).pages,204);
 await append('narou','456',{kind:'started'});assert.equal(data[diagnosticKey('narou','456')].events.length,1);await assert.rejects(append('evil','123',{kind:'started'}));await removeAcquiredData(storage);assert.equal(Object.keys(data).length,0);
});
test('public URL opt-in accepts public pages only and report never accepts unsafe link schemes or private editors',()=>{
 for(const u of ['https://mypage.syosetu.com/793702/','https://ncode.syosetu.com/n5132gu/','https://ncode.syosetu.com/n5132gu/2/'])assert.equal(publicReportURL(u),u);
 for(const u of ['javascript:alert(1)','https://mypage.syosetu.com.evil.test/123/','https://a@myPage.syosetu.com/123/','https://syosetu.com/user/top/','https://syosetu.com/draftepisode/updateinput/draftepisodeid/1/','https://mypage.syosetu.com/123/?token=secret','https://mypage.syosetu.com/123/#secret'])assert.equal(publicReportURL(u),null);
 assert.doesNotMatch(reportText({version:'1.1.0',publicURL:'javascript:SECRET'}),/SECRET/);
 assert.equal(publicReportURL('https://mypage.syosetu.com/mypage/top/userid/793702/'),'https://mypage.syosetu.com/793702/');
 assert.equal(publicReportURL('https://syosetu.com/user/top/?ref=header'),null);
 assert.equal(publicReportURL('https://mypage.syosetu.com/mypage/top/userid/793702/?token=secret'),null);
 const normalized=reportText({version:'1.1.0',publicURL:'https://mypage.syosetu.com/mypage/top/userid/793702/'});assert.match(normalized,/https:\/\/mypage.syosetu.com\/793702\//);assert.doesNotMatch(normalized,/userid/);
});
