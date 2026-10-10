import {errorCode} from './diagnostics.mjs';
export async function recordDiagnostic(kind,value,stage='source'){
 try{if(value?.name==='AbortError')return;const {sourceContext:c}=await chrome.storage.session.get('sourceContext');if(!c?.ownerId)return;
  const text=String(value?.message||value||'');const http=Number(text.match(/HTTP\s*(\d{3})/)?.[1]);
  await chrome.runtime.sendMessage({type:'diagnosticEvent',siteId:c.siteId||'narou',ownerId:c.ownerId,event:{kind,stage,code:errorCode(value),http}});
 }catch{/* Diagnostics never interrupt acquisition or saving. */}
}
