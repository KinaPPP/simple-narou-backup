import {narouUnit} from './narou/unit.mjs';
// Register reviewed, working units here. A placeholder is never a supported site.
export const siteUnits=Object.freeze([narouUnit]);
export function findSite(value){
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.port)return null;return siteUnits.find(unit=>unit.managementOrigins.includes(url.origin))||null;}catch{return null;}
}
export function getSite(id){return siteUnits.find(unit=>unit.id===id)||null;}
export function checkpointKey(siteId,ownerId){
  const unit=getSite(siteId);if(!unit||!unit.accountIdPattern.test(String(ownerId)))throw new Error('サイト・ユーザーIDを確認してください。');
  return 'checkpoint:'+siteId+':'+ownerId;
}
export function legacyCheckpointKey(siteId,ownerId){return siteId==='narou'?'checkpoint:'+ownerId:null;}
