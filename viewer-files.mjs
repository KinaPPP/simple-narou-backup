import {openArchive} from './archive.mjs';

async function equalFiles(a,b){
 if(a.size!==b.size)return false;
 // Compare bounded chunks: a large ZIP is never loaded into memory at once.
 for(let offset=0;offset<a.size;offset+=65536){
  const x=new Uint8Array(await a.slice(offset,offset+65536).arrayBuffer()),y=new Uint8Array(await b.slice(offset,offset+65536).arrayBuffer());
  if(x.some((value,i)=>value!==y[i]))return false;
 }
 return true;
}
export class ViewerFiles{
 constructor(){this.entries=new Map();this.warnings=new Set();}
 clear(){this.entries.clear();this.warnings.clear();}
 async add(files){
  let added=0,duplicates=0;
  for(const file of files){
   try{
    const a=await openArchive(file),m=a.manifest,key=[m.siteId,m.ownerId,m.backupId,m.archiveSet?.index||'single'].join('|');
    const previous=this.entries.get(key);
    if(previous){if(await equalFiles(previous.file,file)){duplicates++;continue;}throw new Error('同じバックアップ・分割番号で内容が異なります。先に読み込んだZIPを保持しました。差し替える場合は「読み込みをクリア」してください。');}
    if(this.entries.size>=1000)throw new Error('保持できるZIPは1000個までです。別のフォルダを読む前にクリアしてください。');
    this.entries.set(key,{file,manifest:m});added++;
   }catch(error){this.warnings.add(file.name+'：'+error.message);}
  }
  return {added,duplicates,entries:[...this.entries.values()],warnings:[...this.warnings]};
 }
}
