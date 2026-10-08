import {newFile} from './save-directory.mjs';
export async function saveOfflineViewer(directory,settings){
 if(settings.viewer===false)return null;
 const response=await fetch(chrome.runtime.getURL('simple-narou-zipviewer.html'));
 if(!response.ok)throw new Error('ビューアーHTMLを読み込めません。');
 const content=await response.text();
 for(let i=0;i<1000;i++){
  const name='simple-narou-zipviewer'+(i?'-'+i:'')+'.html';
  try{await directory.getFileHandle(name);continue;}catch(error){if(error.name!=='NotFoundError')throw error;}
  const handle=await newFile(directory,name),writer=await handle.createWritable();
  try{await writer.write(content);await writer.close();return name;}catch(error){try{await writer.abort();}catch{}throw error;}
 }
 throw new Error('同名のビューアーHTMLが多すぎます。別の保存先を選んでください。');
}
