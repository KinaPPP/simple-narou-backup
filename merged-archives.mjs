import {openArchive} from './archive.mjs';
import {openArchives} from './archive-set.mjs';

function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
// Merge is a read-only view. It never creates a resumable collection checkpoint.
export async function openMergedArchives(files){
 if(!files.length)throw new Error('ZIPを選んでください。');
 const sets=new Map();let identity;
 for(const file of files){const a=await openArchive(file),m=a.manifest,key=m.siteId+'|'+m.ownerId;if(identity&&identity!==key)throw new Error('別のサイト・アカウントは合成できません。');identity=key;if(!sets.has(m.backupId))sets.set(m.backupId,[]);sets.get(m.backupId).push(file);}
 const sources=[];for(const group of sets.values())sources.push(await openArchives(group));
 sources.sort((a,b)=>String(a.manifest.updatedAt||a.manifest.createdAt).localeCompare(String(b.manifest.updatedAt||b.manifest.createdAt)));
 if(sources.length===1)return sources[0];
 const locations=new Map(),indexes=new Map(),conflicts=new Set(),works=new Map(),integrityErrors=new Map(),verifiedIds=new Set(),preferences=new Map(),associations={};
 const missingParts=[],missing=[];
 for(const a of sources){
  for(const n of a.missingParts||[])missingParts.push(a.fileName+'：'+String(n).padStart(3,'0'));
  missing.push(...a.missing.map(n=>a.fileName+'：'+n));
  for(const w of a.manifest.works)works.set(String(w.id),{...works.get(String(w.id)),...w});
  for(const p of a.manifest.downloadPreferences||[])preferences.set(p.url||canonical(p),p);
  Object.assign(associations,a.manifest.blogAssociations||{});
  for(const e of a.manifest.records){
   if(conflicts.has(e.id))continue;
   if(indexes.has(e.id)){
    try{const old=await locations.get(e.id).record(indexes.get(e.id)),next=await a.record(e);if(canonical(old)!==canonical(next))throw new Error('同じ履歴IDの内容が異なります。');}
    catch(error){conflicts.add(e.id);indexes.delete(e.id);locations.delete(e.id);integrityErrors.set(e.id,'履歴ID '+e.id+'：'+error.message);}
   }else{indexes.set(e.id,e);locations.set(e.id,a);}
  }
 }
 const last=sources.at(-1).manifest,manifest={...last,backupId:'merged-view',records:[...indexes.values()].sort((a,b)=>String(a.savedAt).localeCompare(String(b.savedAt))),works:[...works.values()],checkpoint:null,complete:false,downloadPreferences:[...preferences.values()],blogAssociations:associations};delete manifest.archiveSet;delete manifest.partLabels;
 return {manifest,sources,merged:true,missing,missingParts,integrityErrors,verifiedIds,fileName:files.map(f=>f.name).join('、'),async record(entry){try{const r=await locations.get(entry.id).record(entry);verifiedIds.add(entry.id);return r;}catch(error){integrityErrors.set(entry.id,error.message);throw error;}}};
}
