import {savedDirectory,chooseDirectory} from './save-directory.mjs';
export const defaults={format:'json',encoding:'utf-8',bom:true,lineEnding:'crlf',viewer:true};
export async function downloadSettings(){const data=await chrome.storage.local.get('zip-download-settings');return {...defaults,...data['zip-download-settings']};}
export function setupDownloadSettings(){const $=id=>document.getElementById(id),dialog=$('downloadDialog');if(!dialog)return;
 $('chooseDirectory').onclick=async()=>{try{const h=await chooseDirectory();$('directoryName').textContent=h.name;$('directoryStatus').textContent='このフォルダへ続けて保存します。';}catch(error){$('directoryStatus').textContent=error.name==='AbortError'?'フォルダ選択をキャンセルしました。':error.message;}};
 const state=()=>{$('outputEncoding').disabled=$('outputFormat').value==='json';$('outputLine').disabled=$('outputFormat').value==='json';};$('outputFormat').onchange=state;
 $('settings').onclick=async()=>{const s=await downloadSettings();$('outputFormat').value=s.format;$('outputEncoding').value=s.encoding;$('outputBom').checked=s.bom;$('outputLine').value=s.lineEnding;$('outputViewer').checked=s.viewer!==false;state();$('directoryName').textContent=(await savedDirectory())?.name||'未指定（初回保存時に指定）';$('directoryStatus').textContent='';dialog.showModal();};
 $('saveDownload').onclick=async event=>{event.preventDefault();try{await chrome.storage.local.set({'zip-download-settings':{format:$('outputFormat').value,encoding:$('outputEncoding').value,bom:$('outputBom').checked,lineEnding:$('outputLine').value,viewer:$('outputViewer').checked}});dialog.close();}catch(error){$('status').textContent=error.message;}};
}
