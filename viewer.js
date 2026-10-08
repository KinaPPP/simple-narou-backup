(() => {
  const $=id=>document.getElementById(id);
  let archive=null;
  function validRecord(record){return record&&typeof record.title==='string'&&typeof record.savedAt==='string'&&Array.isArray(record.fields)&&record.fields.every(field=>typeof field.label==='string'&&typeof field.value==='string');}
  async function load(file){
    try{
      if(!file)return;
      if(file.size>60*1024*1024)throw new Error('ファイルが大きすぎます（上限60MB）。');
      const data=JSON.parse(await file.text());
      const knownFormat=data.format==='narou-local-backup'&&data.version===1||data.format==='novel-site-backup'&&data.version===2;
      if(!knownFormat||!Array.isArray(data.records)||!data.records.every(validRecord))throw new Error('この拡張機能で保存したJSONを選んでください。');
      if(data.records.some(record=>record.siteId&&record.siteId!=='narou'))throw new Error('この単体ビューアーはなろう用です。対応サイトの表示ユニットを含む拡張機能で確認してください。');
      const associations=Object.fromEntries(Object.entries(data.blogAssociations||{}).filter(([,value])=>typeof value==='string'&&/^(?:\d+)?$/.test(value)));
      const preferences=Array.isArray(data.downloadPreferences)?data.downloadPreferences.filter(value=>value&&/^\d+$/.test(String(value.ownerId))&&value.settings&&typeof value.settings.encoding==='string'):[];
      archive={...data,blogAssociations:associations};
      NarouOrganized.render(data.records,$('organized'),{preferences,associations,onAssociation:value=>{archive.blogAssociations=value;}});
      $('fileName').textContent=file.name+' ／ '+data.records.length+'ページ・履歴';
      $('message').className='';$('message').textContent='表示内容はバックアップ時点の控えです。本文欄を開いてコピーできます。';$('app').hidden=false;
    }catch(error){archive=null;$('app').hidden=true;$('message').textContent=error.message;$('message').className='error';}
  }
  $('export').onclick=()=>{
    if(!archive)return;
    const url=URL.createObjectURL(new Blob([JSON.stringify({...archive,exportedAt:new Date().toISOString()},null,2)],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='simple-narou-backup-organized.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  };
  $('file').onchange=event=>load(event.target.files[0]);
  $('drop').ondragover=event=>{event.preventDefault();$('drop').classList.add('drag');};
  $('drop').ondragleave=()=> $('drop').classList.remove('drag');
  $('drop').ondrop=event=>{event.preventDefault();$('drop').classList.remove('drag');load(event.dataTransfer.files[0]);};
})();
