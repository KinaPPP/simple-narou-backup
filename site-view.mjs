import {siteUnits,findSite,getSite} from './sites/registry.mjs';
const loaded=new Map();
async function loadView(unit){
  if(!loaded.has(unit.id))loaded.set(unit.id,(async()=>{
    for(const path of unit.viewScripts){await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=chrome.runtime.getURL(path);script.onload=resolve;script.onerror=()=>reject(new Error(unit.name+'の表示ユニットを読み込めません。'));document.head.append(script);});}
    if(typeof globalThis[unit.viewGlobal]?.render!=='function')throw new Error('表示ユニットの契約にrenderがありません。');
  })());
  await loaded.get(unit.id);return globalThis[unit.viewGlobal];
}
export async function renderSiteRecords(records,container,options){
  const groups=new Map();
  for(const record of records){const id=record.siteId||findSite(record.url)?.id||'narou';if(!getSite(id))throw new Error('未対応サイトのデータです：'+id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(record);}
  if(!groups.size)groups.set(siteUnits[0].id,[]);
  const preferred=container.dataset.siteId;
  const id=groups.has(preferred)?preferred:groups.keys().next().value;
  const view=await loadView(getSite(id));
  if(groups.size===1){container.dataset.siteId=id;view.render(groups.get(id),container,options);return;}
  container.replaceChildren();const label=document.createElement('label');label.textContent='サイト ';const select=document.createElement('select');select.setAttribute('aria-label','表示するバックアップのサイト');
  for(const key of groups.keys()){const option=document.createElement('option');option.value=key;option.textContent=getSite(key).name;option.selected=key===id;select.append(option);}label.append(select);
  const content=document.createElement('div');container.append(label,content);view.render(groups.get(id),content,options);
  select.onchange=async()=>{container.dataset.siteId=select.value;await renderSiteRecords(records,container,options);};
}
