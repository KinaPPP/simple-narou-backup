// Progress is measured by completed works; the page total is not known in advance.
export function gaugeState({state={},manifest,coverage}={}){
 const report=manifest?.checkpoint||coverage?.current;
 const plan=report?.workPlan||[];
 const selected=report?.options?.selectedWorkIds;
 const total=manifest?plan.filter(w=>!selected||selected.includes(String(w.id))).length:coverage?.total||0;
 const done=manifest?new Set([...(report?.doneSelectedWorks||[]),...(report?.doneWorks||[])].map(String)).size:coverage?.completed?.length||0;
 const completed=manifest?!!manifest.complete:!!coverage?.allComplete&&!state.inventoryOnly&&!state.running&&!state.waiting;
 const percent=completed?100:total?Math.min(99,Math.floor(Math.min(done,total)/total*100)):0;
 const errors=manifest?.integrityErrors?.size||0;
 const warning=manifest?.missingParts?.length||manifest?.missing?.length||report?.failures?.some(f=>!f.error?.includes('この回の取得ページ上限'))||state.phase==='warning';
 const level=state.phase==='error'||errors?'error':warning?'warning':state.phase==='paused'||state.waiting||coverage?.pending&&!state.running?'paused':'running';
 return {percent,level};
}
