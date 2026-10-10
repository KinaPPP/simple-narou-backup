import test from 'node:test';
import assert from 'node:assert/strict';
import {settingSchema,compareSettingSchema,schemaKey} from '../settings-schema.mjs';
const record=controls=>({siteId:'narou',ownerId:'123',category:'作品設定',url:'https://syosetu.com/novelmanage/updateinput/ncode/1/',data:{controls}});
test('settings values, selected choices, hidden tokens and order do not trigger change',()=>{
 const before=settingSchema(record([{name:'a',type:'radio',label:'AI利用',value:'0'},{name:'token',type:'hidden',value:'secret'}]));
 const after=settingSchema(record([{name:'token',type:'hidden',value:'new'},{name:'a',type:'radio',label:'AI利用',value:'1',checked:true}]));
 assert.equal(compareSettingSchema(before,after),null);
 assert.equal(compareSettingSchema(null,after),null);
 assert.ok(!JSON.stringify(after).includes('secret'));
});
test('added, removed and changed input types produce names without manuscript values',()=>{
 const before=settingSchema(record([{name:'a',type:'text',label:'あらすじ',value:'private'},{name:'old',type:'radio',label:'旧項目'}]));
 const after=settingSchema(record([{name:'a',type:'textarea',label:'あらすじ',value:'private2'},{name:'new',type:'checkbox',label:'新項目'}]));
 const diff=compareSettingSchema(before,after);
 assert.deepEqual(new Set(diff.added),new Set(['あらすじ','新項目']));
 assert.deepEqual(new Set(diff.removed),new Set(['あらすじ','旧項目']));
 assert.ok(!JSON.stringify(diff).includes('private'));
 assert.notEqual(schemaKey(record([])),schemaKey({...record([]),ownerId:'456'}));
});
