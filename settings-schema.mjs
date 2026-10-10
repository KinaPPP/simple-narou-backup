export function settingSchema(record){
 if(record.category!=='作品設定'||!Array.isArray(record.data?.controls))return null;
 const groups=new Map();
 for(const c of record.data.controls){
  if(!c.name||['hidden','submit','button','reset'].includes(c.type))continue;
  const key=c.name+'|'+c.type;
  if(!groups.has(key))groups.set(key,{name:c.name,type:c.type,label:c.label||c.name});
 }
 return [...groups.values()].sort((a,b)=>(a.name+'|'+a.type).localeCompare(b.name+'|'+b.type));
}
export function schemaKey(record){return 'settings-schema:'+record.siteId+':'+record.ownerId+':'+new URL(record.data?.sourceUrl||record.url).pathname;}
export function compareSettingSchema(previous,next){
 if(!previous)return null;
 const keys=items=>new Set(items.map(c=>c.name+'|'+c.type));
 const before=keys(previous),after=keys(next);
 const added=next.filter(c=>!before.has(c.name+'|'+c.type)).map(c=>c.label);
 const removed=previous.filter(c=>!after.has(c.name+'|'+c.type)).map(c=>c.label);
 return added.length||removed.length?{added,removed}:null;
}
