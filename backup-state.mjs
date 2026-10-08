export function backupState(records,checkpoint,ownerId,requirements={}){
  const siteId=requirements.siteId||'narou';
  const own=records.filter(record=>record.ownerId===ownerId&&(record.siteId||'narou')===siteId);
  const reports=own.filter(record=>record.category==='取得結果').sort((a,b)=>a.savedAt.localeCompare(b.savedAt)).map(record=>record.data);
  const current=checkpoint?.ownerId===ownerId&&(checkpoint.siteId||'narou')===siteId?checkpoint:reports.at(-1);
  const works=new Map();
  for(const record of own.filter(record=>record.category==='作品一覧').sort((a,b)=>a.savedAt.localeCompare(b.savedAt)))for(const work of record.data?.entries||[])works.set(String(work.id),work);
  const knownPlan=current?.scope&&Array.isArray(current.workPlan)?current.workPlan:[...reports].reverse().find(report=>report.scope&&Array.isArray(report.workPlan))?.workPlan;
  if(knownPlan){works.clear();for(const work of knownPlan)works.set(String(work.id),work);}
  const coverage=new Map();
  for(const report of [...reports,current].filter(Boolean)){
    for(const id of report.doneWorks||[])coverage.set(String(id),{body:true,settings:true});
    for(const [id,value] of Object.entries(report.workCoverage||{})){const before=coverage.get(id)||{};coverage.set(id,{body:before.body||value.body,settings:before.settings||value.settings});}
  }
  const done=new Set([...coverage].filter(([,value])=>(requirements.includeBody===false||value.body)&&(requirements.includeSettings===false||value.settings)).map(([id])=>id));
  const workNeeded=requirements.includeBody!==false||requirements.includeSettings!==false;
  const target=workNeeded?[...works.values()].filter(work=>!requirements.selectedWorkIds||requirements.selectedWorkIds.includes(String(work.id))):[];
  const remaining=target.filter(work=>!done.has(String(work.id)));
  const completed=target.filter(work=>done.has(String(work.id)));
  const favoritesComplete=reports.some(report=>report.complete&&report.options?.favorites);
  const announcementsComplete=reports.some(report=>report.complete&&report.options?.announcements);
  const worksComplete=requirements.includeBody===false&&requirements.includeSettings===false||(target.length>0||!!knownPlan&&!requirements.selectedWorkIds)&&!remaining.length;
  const pending=!!current&&!current.complete;
  return {current,works:[...works.values()],inventoryKnown:!!knownPlan||own.some(record=>record.category==='作品一覧'),total:target.length,completed,remaining,doneIds:[...done],favoritesComplete,announcementsComplete,pending,
    allComplete:(workNeeded||requirements.includeOther!==false)&&worksComplete&&(requirements.includeOther===false||favoritesComplete&&announcementsComplete)&&!pending};
}
