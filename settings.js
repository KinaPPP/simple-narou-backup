import {effectivePreference,normalizePreference,preferenceKey} from './preferences.mjs';
const $=id=>document.getElementById(id);
let data={};
function option(label,value){const node=document.createElement('option');node.textContent=label;node.value=value;return node;}
async function init(){
  try {
    data=await chrome.storage.local.get(null);
    const owners=new Set(Object.values(data).map(value=>value?.ownerId).filter(value=>/^\d+$/.test(String(value))));
    $('owner').replaceChildren(...[...owners].map(id=>option(id,id)));
    if(!owners.size){$('status').textContent='ユーザーIDの控えがありません。公式ダウンロード画面から設定を記録するか、原稿をバックアップしてください。';$('save').disabled=$('inherit').disabled=true;return;}
    chooseOwner();
  }catch(error){$('status').textContent=error.message;}
}
function chooseOwner(){
  const ownerId=$('owner').value;const works=new Map();
  for(const value of Object.values(data).filter(value=>value?.ownerId===ownerId)) {
    if(value.category==='作品一覧')for(const work of value.data?.entries||[])works.set(String(work.id),work.title);
    if(value.workId)works.set(String(value.workId),value.title||'作品ID '+value.workId);
    if(value.category==='作品情報'&&value.data?.id)works.set(String(value.data.id),value.title);
  }
  $('work').replaceChildren(option('全作品共通','default'),...[...works].map(([id,title])=>option(title+'（ID:'+id+'）',id)));
  show();
}
function show(){
  const ownerId=$('owner').value,workId=$('work').value;
  const value=effectivePreference(data,ownerId,workId==='default'?null:workId);
  $('encoding').value=value.settings.encoding;$('bom').checked=value.settings.bom;$('lineEnding').value=value.settings.lineEnding;
  $('inherit').disabled=workId==='default'||!data[preferenceKey(ownerId,workId)];
  $('status').textContent='表示中の設定：'+value.source;
}
$('save').onclick=async()=>{
 try{
  const ownerId=$('owner').value,workId=$('work').value;
  const settings=normalizePreference({encoding:$('encoding').value,bom:$('bom').checked,lineEnding:$('lineEnding').value});
  const key=preferenceKey(ownerId,workId);
  const value={ownerId,workId,settings,title:$('work').selectedOptions[0].textContent,savedAt:new Date().toISOString()};
  await chrome.storage.local.set({[key]:value});data[key]=value;show();$('status').textContent='設定を端末内に保存しました。';
 }catch(error){$('status').textContent='保存できませんでした。'+error.message;}
};
$('inherit').onclick=async()=>{
 try{const key=preferenceKey($('owner').value,$('work').value);await chrome.storage.local.remove(key);delete data[key];show();}catch(error){$('status').textContent=error.message;}
};
$('owner').onchange=chooseOwner;$('work').onchange=show;init();
