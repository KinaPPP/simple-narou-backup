(() => {
  const make=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
  const source=record=>record.data?.sourceUrl||record.url||'';
  const associationKey=record=>(record.ownerId||'未識別')+'|'+source(record);
  function settingTitle(record){
    if(record.category!=='作品設定')return record.category||'編集履歴';
    return /\/receptionsupdateinput\//.test(source(record))?'公開・受付設定':'作品情報の編集';
  }
  function receptionRows(record){
    const names={notkansou:'感想受付',notreview:'レビュー受付',notpoint:'評価受付',notpointview:'評価公開',notreport:'誤字報告受付',notsearch:'検索除外設定',_is_masterpiece:'代表作品設定'};
    const groups=new Map();
    for(const control of record.data?.controls||[]){if(!groups.has(control.name))groups.set(control.name,[]);groups.get(control.name).push(control);}
    return [...groups].map(([name,controls])=>{
      const first=controls[0],label=names[name]||name;
      if(first.type==='radio'){
        const chosen=controls.filter(control=>control.checked);
        return {label,value:chosen.length?chosen.map(control=>control.optionLabel||control.label||'表示名未取得').join(' ／ '):'未選択'};
      }
      if(first.type==='checkbox')return {label,value:first.checked?(first.optionLabel||first.label||'設定する'):'設定しない'};
      return {label,value:first.selectedText?.join(' ／ ')||first.value||'未入力'};
    });
  }
  function workSettingRows(record){
    const controls=record.data?.controls||[],rows=[];
    const get=name=>controls.filter(control=>control.name===name);
    const selected=name=>get(name).find(control=>control.checked);
    const choiceNames={noveltype:{'1':'連載作品','2':'短編作品'},age_limit:{'1':'全年齢','3':'R18（18歳未満閲覧禁止）'},aitype:{'0':'不使用','1':'補助的利用','2':'間接利用','3':'直接使用'}};
    function add(name,label){
      const group=get(name);if(!group.length)return;
      const control=group[0];let value;
      if(control.type==='radio'){
        const chosen=selected(name);
        value=chosen?(chosen.optionLabel||choiceNames[name]?.[chosen.value]||(chosen.label!==label?chosen.label:'表示名未取得（内部値：'+chosen.value+'）')):'未選択';
      }else if(control.type==='checkbox')value=name==='media_support'?(control.checked?'希望する':'希望しない'):name==='is_monetized'?(control.checked?'有効':'無効'):(control.checked?'チェックあり':'チェックなし');
      else value=control.selectedText?.join(' ／ ')??control.value;
      rows.push({label,value,multiline:control.type==='textarea'});
    }
    add('title','作品タイトル');add('writer_radio','作者名の表示');add('writer','作者名');add('noveltype','作品種別');add('end','完結設定');add('age_limit','年齢制限');add('isr15','セルフレイティング（R15）');
    if(selected('age_limit')?.value==='3')add('nocgenre','R18部門');
    add('aitype','AI利用状況設定');if((selected('aitype')&&selected('aitype').value!=='0')||get('ainote').some(control=>control.value))add('ainote','AI利用メモ');add('classification','作品分類');
    // Show the branch that applies to this work; unused branches remain in raw data.
    if(selected('classification')?.value==='2'){add('ff_type','二次創作の種類');add('ff_keyword','二次創作の対象作品');add('ff_ncode','原作のNコード');}
    if(selected('classification')?.value==='3'){add('trpg_replay_type','TRPGリプレイの種類');add('trpg_replay_keyword_id','対象作品');add('official_scenario','公式シナリオ');add('scenario_author','シナリオ作者');add('scenario_name','シナリオ名');}
    add('biggenre','大ジャンル');add('genre','小ジャンル');add('ex','あらすじ');
    const elements=['iszankoku','isbl','isgl','istensei','istenni'].flatMap(name=>get(name).map(control=>(control.checked?'☑ ':'☐ ')+(control.optionLabel||control.label)));
    if(elements.length)rows.push({label:'作品に含まれる要素',value:elements.join('\n')});
    const keywords=controls.filter(control=>control.type==='checkbox'&&/keyword.*array/.test(control.name)&&control.checked).map(control=>control.value);
    if(controls.some(control=>/keyword.*array/.test(control.name)&&control.type==='checkbox'))rows.push({label:'キーワード選択',value:keywords.length?[...new Set(keywords)].join(' ／ '):'選択なし'});
    add('unique_keyword_array','キーワード入力');add('free_keyword','キーワード自由入力');add('keyword','キーワード');
    add('media_support','メディア化打診のサポート');add('is_monetized','収益化設定');
    return rows;
  }
  function consolidatedSettings(records){
    const groups=new Map();
    for(const record of records){
      // Compare exact field values, including empty strings and duplicate fields,
      // independently of their order and the URL used to reach the form.
      const fields=record.fields.map(field=>[field.label,field.value]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
      // Checked states and named inputs can contain distinctions not in the
      // visible fields. Preserve those distinctions when structured data exists.
      const controls=Array.isArray(record.data?.controls)?record.data.controls.map(control=>({name:control.name,type:control.type,value:control.value,checked:control.checked,disabled:control.disabled,selectedText:control.selectedText})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):null;
      const key=JSON.stringify([record.ownerId||'未識別',String(record.data?.workId||''),record.category,fields,controls]);
      const existing=groups.get(key);
      if(!existing){groups.set(key,{...record,mergedSources:[source(record)]});continue;}
      const mergedSources=[...new Set([...existing.mergedSources,source(record)])];
      groups.set(key,{...(record.savedAt>existing.savedAt?record:existing),mergedSources});
    }
    return [...groups.values()];
  }
  function model(all,owner){
    const selected=all.filter(record=>(record.ownerId||'未識別')===owner).sort((a,b)=>a.savedAt.localeCompare(b.savedAt));
    const latest=new Map();
    for(const record of selected)latest.set((record.category||'編集履歴')+'|'+source(record),record);
    const records=[...latest.values()],works=new Map();
    const lists=records.filter(r=>r.category==='作品一覧').sort((a,b)=>{
      const left=new URL(source(a),'https://syosetu.com'),right=new URL(source(b),'https://syosetu.com');
      return Number(left.pathname.includes('draftlist'))-Number(right.pathname.includes('draftlist')) || Number(left.searchParams.get('p')||left.searchParams.get('page')||1)-Number(right.searchParams.get('p')||right.searchParams.get('page')||1);
    });
    for(const record of lists)for(const work of record.data?.entries||[])works.set(String(work.id),{...works.get(String(work.id)),...work});
    for(const record of records.filter(r=>r.category==='作品情報'))if(record.data?.id)works.set(String(record.data.id),{...works.get(String(record.data.id)),...record.data});
    return {records,works:[...works.values()],history:selected};
  }
  function copyAction(area,button,value){
    let timer;button.onclick=async()=>{clearTimeout(timer);area.focus();area.select();try{await navigator.clipboard.writeText(value);button.textContent='コピーしました';timer=setTimeout(()=>button.textContent='この欄をコピー',2000);}catch{button.textContent='選択した文字をCtrl+Cでコピー';}};
  }
  function card(record,label=settingTitle(record)){
    const item=make('details',undefined,'backup-card');
    const summary=make('summary');summary.append(make('span','【'+label+'】','badge badge-'+(label==='エピソード'?'episode':label==='告知ページ'?'blog':'setting')),make('span',record.title));
    const id=source(record).match(/(?:noveldataid|draftepisodeid|episodeid|blogkey)\/(\d+)/)?.[1];
    summary.append(make('small',(record.data?.state?' ／ '+record.data.state:'')+(record.savedAt?' ／ 保存 '+new Date(record.savedAt).toLocaleString('ja-JP'):'')+(id?' ／ ページID:'+id:''),'meta'));
    item.append(summary);
    item.addEventListener('toggle',()=>{
      if(!item.open||item.dataset.loaded)return;
      const settings=record.category==='作品設定'&&record.data?.controls?.length?(/\/receptionsupdateinput\//.test(source(record))?receptionRows(record):workSettingRows(record)):[];
      if(settings.length){
        const table=make('table',undefined,'backup-settings'),body=make('tbody');
        for(const field of settings){
          const row=make('tr'),heading=make('th',field.label),cell=make('td');heading.setAttribute('scope','row');
          if(field.multiline){
            const area=make('textarea');area.readOnly=true;area.value=field.value;area.rows=field.value.length>150?8:3;area.setAttribute('aria-label',field.label);
            const copy=make('button','この欄をコピー','secondary');copyAction(area,copy,field.value);
            cell.append(area,copy);
          }else cell.textContent=field.value===''?'未入力':field.value;
          row.append(heading,cell);body.append(row);
        }
        table.append(body);item.append(table,make('p','バックアップ時点の設定です。変更・送信はできません。','note'));
        const raw=make('details');raw.append(make('summary','保存元・内部値を確認'),make('p',record.mergedSources?.join(' ／ ')||source(record),'meta'),make('pre',JSON.stringify(record.data.controls,null,2)));item.append(raw);
        item.dataset.loaded='true';return;
      }
      item.append(make('p',record.mergedSources?.length>1?'同一内容の保存元：'+record.mergedSources.join(' ／ '):source(record),'meta'));
      for(const field of record.fields){
        const box=make('section',undefined,'backup-field'),area=make('textarea');area.readOnly=true;area.value=field.value;area.rows=field.value.length>150?10:3;area.setAttribute('aria-label',field.label);
        const copy=make('button','この欄をコピー','secondary');copyAction(area,copy,field.value);
        box.append(make('h3',field.label),area,copy);item.append(box);
      }
      item.dataset.loaded='true';
    });
    return item;
  }
  function render(all,container,{preferences=[],associations={},onAssociation,onSelect}={}){
    container.replaceChildren();
    let owner=container.dataset.owner||all[0]?.ownerId||'未識別',active=container.dataset.activeKey||'';
    const owners=[...new Set([...all.map(r=>r.ownerId||'未識別'),...preferences.map(p=>String(p.ownerId))])];
    if(!owners.length){container.append(make('p','まだ保存データがありません。'));return;}
    if(!owners.includes(owner))owner=owners[0];
    const select=make('select');select.setAttribute('aria-label','ユーザーID');
    for(const id of owners){const option=make('option',id);option.value=id;select.append(option);}select.value=owner;
    const ownerLabel=make('label','ユーザーID ');ownerLabel.append(select);
    const tabs=make('div',undefined,'backup-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','作品と保存項目');
    const panel=make('section',undefined,'backup-panel');panel.id='backup-panel';panel.setAttribute('role','tabpanel');
    const jump=make('select');jump.setAttribute('aria-label','作品へ移動');const jumpLabel=make('label','作品へ移動 ');jumpLabel.append(jump);
    container.append(ownerLabel,make('p','作品は取得したなろうの一覧順です。本文・設定を未取得の作品も一覧に表示します。','note'),jumpLabel,tabs,panel);
    function choose(key){active=key;container.dataset.activeKey=active;if(onSelect)onSelect(active);else draw();}
    function draw(){
      const data=model(all,owner),records=data.records;
      const entries=[...data.works.map(work=>({key:'work:'+work.id,title:work.title,work})),...['ブックマーク','お気に入りユーザ','活動報告','共通設定','取得結果','取得履歴'].map(title=>({key:title,title}))];
      if(!entries.some(entry=>entry.key===active))active=entries[0].key;
      container.dataset.activeKey=active;container.dataset.owner=owner;
      jump.replaceChildren();const blank=make('option','作品を選択');blank.value='';jump.append(blank);for(const work of data.works){const option=make('option',work.title);option.value='work:'+work.id;jump.append(option);}jump.value=active.startsWith('work:')?active:'';jump.onchange=()=>{if(jump.value)choose(jump.value);};
      tabs.replaceChildren();
      for(const entry of entries){const button=make('button',entry.title,'secondary');button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-selected',String(entry.key===active));button.onclick=()=>choose(entry.key);tabs.append(button);}
      tabs.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...tabs.children],current=buttons.indexOf(document.activeElement);const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons[index].click();tabs.children[index].focus();};
      const selected=entries.find(entry=>entry.key===active);panel.replaceChildren(make('h2',selected.title));
      if(selected.work){
        const work=selected.work,id=String(work.id),related=records.filter(r=>String(r.data?.workId)===id);
        panel.append(make('p','作品ID:'+id+' ／ '+(work.publication||'投稿状態不明')+' ／ ユーザーID:'+owner,'meta'));
        if(work.metadata?.length){const info=make('details');info.append(make('summary','作品情報'));for(const field of work.metadata)info.append(make('p',field.label+'：'+field.value));panel.append(info);}
        const episodes=related.filter(r=>r.category==='エピソード').sort((a,b)=>(a.data?.order??0)-(b.data?.order??0));
        panel.append(make('h3','エピソード（本文） '+episodes.length+'件'));
        const episodeCards=episodes.map(record=>card(record));if(episodes.length>1){const episodePicker=make('select');episodePicker.setAttribute('aria-label','エピソードへ移動');const prompt=make('option','エピソードへ移動');prompt.value='';episodePicker.append(prompt);episodes.forEach((record,i)=>{const option=make('option',(i+1)+'：'+record.title);option.value=String(i);episodePicker.append(option);});episodePicker.onchange=()=>{if(episodePicker.value==='')return;const item=episodeCards[Number(episodePicker.value)];item.open=true;item.scrollIntoView({behavior:'smooth',block:'start'});};panel.append(episodePicker);}
        for(const item of episodeCards)panel.append(item);
        if(!episodes.length)panel.append(make('p','本文は未取得です。指定した作品範囲と取得結果を確認してください。'));
        panel.append(make('h3','作品設定・章設定'));
        for(const record of consolidatedSettings(related.filter(r=>['作品設定','章設定'].includes(r.category))))panel.append(card(record));
        panel.append(make('p','前書き・後書きは各エピソード内、共通テンプレートは「共通設定」で確認できます。','note'));
        const blogs=records.filter(r=>r.category==='活動報告'&&String(associations[associationKey(r)]||r.data?.workId||'')===id);
        panel.append(make('h3','告知ページ（活動報告） '+blogs.length+'件'));
        for(const record of blogs)panel.append(card(record,'告知ページ'));
        if(!blogs.length)panel.append(make('p','「活動報告」タブで、この作品に関連する報告を選択できます。','note'));
      }else if(['ブックマーク','お気に入りユーザ'].includes(active)){
        const unique=new Map();for(const record of records.filter(r=>r.category===active))for(const entry of record.data?.entries||[])unique.set(entry.url||JSON.stringify(entry),{record,entry});
        panel.append(make('p',unique.size+'件'));
        for(const {record,entry} of unique.values())panel.append(card({...record,title:entry.title||entry.name||'名称不明',fields:Object.entries(entry).map(([label,value])=>({label,value:typeof value==='string'?value:JSON.stringify(value,null,2)??''}))},active));
      }else if(active==='活動報告'){
        panel.append(make('p','作品との関連は自動で推測せず、下の選択で指定します。作者の本文だけを表示します。','note'));
        for(const record of records.filter(r=>r.category==='活動報告')){
          const row=make('section'),label=make('label','関連作品 '),picker=make('select');picker.setAttribute('aria-label',record.title+'の関連作品');
          const empty=make('option','関連なし／未指定');empty.value='';picker.append(empty);
          for(const work of data.works){const option=make('option',work.title);option.value=String(work.id);picker.append(option);}
          const key=associationKey(record);picker.value=associations[key]||record.data?.workId||'';
          picker.onchange=async()=>{const value=picker.value,previous=associations[key];associations[key]=value;try{if(onAssociation)await onAssociation({...associations});draw();}catch(error){if(previous===undefined)delete associations[key];else associations[key]=previous;picker.value=previous||'';row.append(make('p','関連付けを保存できませんでした：'+error.message));}};
          label.append(picker);row.append(label,card(record,'告知ページ'));panel.append(row);
        }
      }else if(active==='共通設定'){
        for(const record of records.filter(r=>['テンプレート','カテゴリ'].includes(r.category)))panel.append(card(record));
        for(const preference of preferences.filter(p=>String(p.ownerId)===owner))panel.append(card({title:preference.workId==='default'?'全作品共通':preference.title||'作品ID '+preference.workId,savedAt:preference.savedAt||preference.updatedAt||'',fields:[{label:'ダウンロード設定の控え',value:JSON.stringify(preference.settings,null,2)}]},'設定の控え'));
      }else{
        const rows=active==='取得履歴'?[...data.history].reverse():records.filter(r=>r.category==='取得結果');
        for(const record of rows)panel.append(card(record));
      }
      if(panel.children.length===1)panel.append(make('p','この項目の保存データはありません。'));
    }
    select.onchange=()=>{owner=select.value;active='';draw();};draw();
  }
  globalThis.NarouOrganized={model,render,associationKey,consolidatedSettings,settingTitle,receptionRows,workSettingRows};
})();
