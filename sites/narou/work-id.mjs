export function narouWorkId(record){
 const explicit=record.category==='作品情報'?record.data?.id:record.data?.workId||record.entity?.workId;
 if(/^\d+$/.test(String(explicit||'')))return String(explicit);
 try{
  const url=new URL(record.url);
  if(url.origin!=='https://syosetu.com'||url.username||url.password)return '';
  return url.pathname.match(/^\/(?:(?:usernovelmanage|draftnovelmanage)\/(?:top|updateinput|receptionsupdateinput)|(?:usernoveldatamanage|draftepisode)\/updateinput)\/ncode\/(\d+)(?:\/(?:noveldataid|draftepisodeid|episodeid)\/\d+)?\/$/)?.[1]||'';
 }catch{return '';}
}
