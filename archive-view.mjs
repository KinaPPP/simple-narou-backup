export function historyEntries(entries,page=0,size=100){
 const sorted=[...entries].sort((a,b)=>String(a.savedAt).localeCompare(String(b.savedAt)));
 const pages=Math.max(1,Math.ceil(sorted.length/size)),current=Math.max(0,Math.min(page,pages-1));
 const end=sorted.length-current*size;
 return {entries:sorted.slice(Math.max(0,end-size),end),page:current,pages,total:sorted.length};
}
