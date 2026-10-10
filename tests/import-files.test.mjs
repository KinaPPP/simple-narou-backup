import test from 'node:test';
import assert from 'node:assert/strict';
import {selectImportFiles,ignoredFilesNote} from '../import-files.mjs';
const file=name=>({name});
test('フォルダを全選択してもZIPを優先しHTML・JSON・TXTを数えて読み飛ばす',()=>{
 const zip=file('001.ZIP'),other=file('000.zip');
 const result=selectImportFiles([file('viewer.html'),file('saved.json'),zip,file('saved.txt'),other]);
 assert.deepEqual(result,{files:[zip,other],ignored:3});
 assert.match(ignoredFilesNote(result.ignored),/3個/);
});
test('ZIPなしでは1つのJSONと対象外ファイルを選択できる',()=>{
 const json=file('saved.JSON');assert.deepEqual(selectImportFiles([file('viewer.html'),json]),{files:[json],ignored:1});
});
test('対象外のみ・複数JSONを黙って読み込まない',()=>{
 assert.throws(()=>selectImportFiles([file('viewer.html')]),/ZIPまたはJSON/);
 assert.throws(()=>selectImportFiles([file('a.json'),file('b.json')]),/1つずつ/);
});
