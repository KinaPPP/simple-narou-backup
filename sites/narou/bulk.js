(() => {
  const version='0.6.3';
  if(globalThis.narouBulkBackup?.version===version)return;
  if(globalThis.narouBulkBackup?.getStatus?.().running||globalThis.narouBulkBackup?.getStatus?.().waiting)throw new Error('旧版の取得が動いています。一時停止してから再開してください。');
  const P = globalThis.NarouParser;
  let running = false;
  let controller;
  let panel;
  let status;
  let lastRequest = 0;
  let requests = 0;
  let ownerId;
  let limits;
  let currentReport;
  let resumeTimer;
  let resumeAt=null;
  let phase='idle';
  const root = 'https://syosetu.com';
  const sourcePaths = ['/usernovel/list/','/usernovel/draftlist/','/favnovelmain/list/','/favuser/list/','/userblog/list/','/novelinitialsetting/updateinput/'];
  function readable(url) {
    const path = new URL(url).pathname;
    return sourcePaths.includes(path) || /^\/(?:usernovelmanage|draftnovelmanage)\/(?:top|updateinput|receptionsupdateinput)\/ncode\/\d+\/$/.test(path) ||
      /^\/(?:usernoveldatamanage|draftepisode)\/(?:top|updateinput)\/ncode\/\d+\/(?:noveldataid|draftepisodeid|episodeid)\/\d+\/$/.test(path) ||
      /^\/draftepisode\/updateinput\/draftepisodeid\/\d+\/$/.test(path) || /^\/novelchapter\/list\/ncode\/\d+\/$/.test(path) || /^\/userblogmanage\/updateinput\/blogkey\/\d+\/$/.test(path);
  }
  function badge(state){phase=state;chrome.runtime.sendMessage({type:'backupStatus',siteId:'narou',ownerId,state,message:status?.textContent||''}).catch(()=>{});}
  function update(value) { status.textContent = value; if(running&&!resumeAt)badge('running'); }
  async function page(url) {
    if (!P.safeUrl(url,root) || !readable(url)) throw new Error('取得対象外のURLです。');
    if (controller.signal.aborted) throw new Error('停止しました');
    const spacing=limits.waitSeconds*1000+Math.floor(Math.random()*3001);
    const wait = lastRequest?Math.max(0,spacing-(Date.now()-lastRequest)):0;
    if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
    if (controller.signal.aborted) throw new Error('停止しました');
    if (requests >= limits.maxPages) throw new Error('この回の取得ページ上限に達しました。続きは後日再開できます。');
    requests++;
    lastRequest = Date.now();
    const timeout = setTimeout(()=>controller.abort('通信時間超過'),30000);
    let response;
    try { response = await fetch(url,{credentials:'same-origin',signal:controller.signal,redirect:'follow',cache:'no-store'}); }
    catch(error){controller.abort(error.message);throw error;}
    finally { clearTimeout(timeout); }
    function fail(message){controller.abort(message);throw new Error(message);}
    if (!response.ok) fail('取得エラー HTTP '+response.status);
    if (!P.safeUrl(response.url,root) || !readable(response.url)) fail('ログイン期限切れ、または別画面へ移動しました。');
    const doc = new DOMParser().parseFromString(await response.text(),'text/html');
    if (doc.querySelector('input[type="password"]')) fail('再ログインが必要です。');
    if (!doc.querySelector('.l-container')) fail('ページ形式を認識できません。');
    if(P.ownerId(doc)!==ownerId) fail('ログインしているユーザーが変わったか、識別できません。');
    return doc;
  }
  async function scan(url, visit) {
    const queue=[url], seen=new Set();
    while(queue.length) {
      const current=queue.shift();
      if(seen.has(current)) continue;
      if(seen.size>=200) throw new Error('一覧が200ページを超えました。');
      seen.add(current);
      if(currentReport.scans[current]) {
        queue.push(...currentReport.scans[current]);
        continue;
      }
      const doc=await page(current);
      await visit(doc,current);
      const nextPages=P.pages(doc,current).filter(next=>new URL(next).pathname===new URL(url).pathname);
      currentReport.scans[current]=nextPages;
      await checkpoint();
      for(const next of nextPages) {
        if(new URL(next).pathname===new URL(url).pathname && !seen.has(next)) queue.push(next);
      }
    }
  }
  function mount(options) {
    panel?.remove();
    if(options.quiet){status={textContent:''};return;}
    panel=document.createElement('div');
    panel.dataset.narouBackup='true';
    panel.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2147483647';
    const shadow=panel.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent='section{width:350px;background:#fff;color:#183e37;border:2px solid #17796e;border-radius:12px;padding:16px;font:14px/1.6 sans-serif;box-shadow:0 3px 24px #0003}button{padding:6px 10px;margin:8px 8px 0 0;cursor:pointer}';
    const section=document.createElement('section');
    const heading=document.createElement('strong'); heading.textContent='シンプルになろう（バックアップ）';
    status=document.createElement('p');
    const stop=document.createElement('button'); stop.textContent='取得を停止'; stop.onclick=()=>controller.abort('利用者による停止');
    const library=document.createElement('button'); library.textContent='保存結果を開く';
    library.onclick=()=>chrome.runtime.sendMessage({type:'openLibrary'});
    section.append(heading,status,stop,library); shadow.append(style,section);document.documentElement.append(panel);
  }
  function preview() {
    return {works:P.list(document,location.href),isEntry:['/user/top/','/usernovel/list/','/usernovel/draftlist/'].includes(location.pathname)};
  }
  async function checkpoint() {
    const response=await chrome.runtime.sendMessage({type:'checkpoint',siteId:'narou',ownerId,report:currentReport});
    if(!response?.ok) throw new Error('継続情報を保存できません。 '+(response?.error||''));
  }
  async function start(options) {
    if(running||resumeAt) throw new Error('このページですでに取得中、または自動再開を待っています。');
    if(!preview().isEntry) throw new Error('ログイン済みのユーザーホーム、または作品一覧を開いてください。');
    ownerId=P.ownerId(document);
    if(!ownerId) throw new Error('ログイン中のユーザーIDを確認できません。');
    clearTimeout(resumeTimer);resumeAt=null;
    let saved=null;
    if(options.resume) {
      const response=await chrome.runtime.sendMessage({type:'resume',siteId:'narou',ownerId});
      if(!response?.ok||!response.checkpoint||response.checkpoint.complete) throw new Error('再開できる途中のバックアップはありません。');
      saved=response.checkpoint;
      // Upgrade a legacy three-work checkpoint when the normal full-account
      // continuation is requested. Keep page checkpoints and saved originals.
      if(options.allWorks&&saved.options?.works&&!saved.options.selectedWorkIds)saved.options={...saved.options,allWorks:true,excludeWorkIds:options.excludeWorkIds||[]};
      if(options.autoContinue!==undefined)saved.options.autoContinue=options.autoContinue;
    }
    limits={maxPages:Math.max(5,Math.min(100,Number(options.maxPages)||30)),waitSeconds:Math.max(3,Math.min(60,Number(options.waitSeconds)||5))};
    running=true;controller=new AbortController();requests=0;lastRequest=0;mount(options);
    update('作品一覧と保存対象を確認しています。');
    const effective=saved?.options||options;
    run(effective,saved).then(async()=>{
      const onlyLimit=currentReport?.failures?.length>0&&currentReport.failures.every(item=>item.error.includes('この回の取得ページ上限'));
      if(effective.autoContinue&&onlyLimit&&!controller.signal.aborted){
        resumeAt=Date.now()+90000;currentReport.autoResumeAt=resumeAt;await checkpoint();
        update(limits.maxPages+'ページ分を取得しました。約1分30秒休んで自動再開します。');badge('waiting');
        resumeTimer=setTimeout(()=>{resumeAt=null;start({...effective,resume:true,quiet:options.quiet,maxPages:limits.maxPages,waitSeconds:limits.waitSeconds}).catch(error=>update(error.message));},90000);
      }else badge(currentReport?.complete?(effective.inventoryOnly?'ready':'complete'):controller.signal.reason==='利用者による停止'?'paused':'error');
    }).catch(error=>{resumeAt=null;update(error.message);badge('error');}).finally(()=>running=false);
    return {ok:true};
  }
  async function run(options,saved) {
    const runId=saved?.runId || crypto.randomUUID();
    const report=saved || {runId,ownerId,startedAt:new Date().toISOString(),complete:false,options,works:[],pages:0,failures:[],limitations:[],scans:{},workPlan:[],episodePlans:{},doneWorks:[],donePages:[],collectionCounts:{},collectionExpected:{}};
    currentReport=report;
    report.complete=false;report.inventoryChecks??={};
    report.autoResumeAt=null;report.doneSelectedWorks??=[];report.workCoverage??={};
    // Re-evaluate failed pages on each retry; saved pages and counts are retained.
    report.failures=[];
    report.finishedAt=null;
    await checkpoint();
    function inventory(url) {
      let check=report.inventoryChecks[url];
      if(!check?.validated){
        for(const scanned of Object.keys(report.scans))if(new URL(scanned).pathname===new URL(url).pathname)delete report.scans[scanned];
        check=report.inventoryChecks[url]={expected:check?.expected??null,pages:{},validated:false,expectedSeen:false};
      }
      return check;
    }
    function validateInventory(url,check,label) {
      const count=new Set(Object.values(check.pages).flat()).size;
      check.recognized=count;check.validated=check.expected===null||count===check.expected;
      if(!check.validated)report.failures.push({item:label,error:'件数不一致（一覧'+check.expected+'／取得'+count+'）'});
    }
    async function save(title,category,url,data,fields) {
      const result=await chrome.runtime.sendMessage({type:'saveSnapshot',snapshot:{siteId:'narou',title,category,runId,ownerId,url,fields:fields?.length?fields:[{label:category,value:JSON.stringify(data,null,2)}],data:{sourceUrl:url,...data}}});
      if(!result?.ok){controller.abort('端末内への保存失敗');throw new Error(result?.error||'端末内への保存に失敗しました。');}
      report.pages++;
    }
    async function collection(path,category,extract) {
      const url=root+path;
      let count=report.collectionCounts[url]||0,expected=report.collectionExpected[url]??null;
      await scan(url,async(doc,current)=>{
        update(category+'を取得中 ／ '+report.pages+'ページ保存済み');
        const entries=extract(doc);
        const total=P.main(doc).match(/全([\d,]+)件中/);
        if(total && expected===null) expected=Number(total[1].replaceAll(',',''));
        count+=entries.length;
        await save(category,category,current,{entries,text:P.main(doc)},[{label:category,value:P.main(doc)}]);
        report.collectionCounts[url]=count;
        report.collectionExpected[url]=expected;
      });
      if(expected!==null && count!==expected) throw new Error(category+'の件数不一致（一覧'+expected+'件／取得'+count+'件）');
      return count;
    }
    async function attempt(label,fn) {
      try { await fn(); }
      catch(error) {
        report.failures.push({item:label,error:error.message});
        if(controller.signal.aborted || /上限|ログイン|保存できません|HTTP/.test(error.message)) throw error;
      }
    }
    try {
      if(options.works||options.inventoryOnly) {
        const works=new Map(report.workPlan.map(work=>[work.id,work]));
        for(const path of ['/usernovel/list/','/usernovel/draftlist/']) {
          const inventoryUrl=root+path,check=inventory(inventoryUrl);let expected=check.expected,found=new Set(Object.values(check.pages).flat());
          await scan(root+path,async(doc,url)=>{
            const entries=P.list(doc,url);
            const total=P.main(doc).match(/全([\d,]+)件中/);
            if(total&&!check.expectedSeen){expected=Number(total[1].replaceAll(',',''));check.expectedSeen=true;}
            check.expected=expected;check.pages[url]=entries.map(work=>work.id);
            for(const work of entries){works.set(work.id,work);found.add(work.id);}
            if(!entries.length && expected!==0 && !/作品.*(?:ありません|存在しません)|全0件/.test(P.main(doc))) {
              // Empty draft tabs can be explicitly labelled 未投稿0 in the tab itself.
              const tabPattern=path.includes('draftlist')?/未投稿\s*0/:/投稿済\s*0/;
              if(!P.links(doc,url).some(item=>new URL(item.url).pathname===path&&tabPattern.test(item.text))) throw new Error('作品一覧を認識できません。');
            }
            report.workPlan=[...works.values()];
            await save('作品一覧','作品一覧',url,{entries},[{label:'作品一覧',value:JSON.stringify(entries,null,2)}]);
          });
          validateInventory(inventoryUrl,check,'作品一覧 '+path);await checkpoint();
        }
        const offset=Math.max(0,(Number(options.startIndex)||1)-1);
        const excluded=new Set((options.excludeWorkIds||[]).map(String));
        const selectedIds=Array.isArray(options.selectedWorkIds)?new Set(options.selectedWorkIds.map(String)):null;
        const entries=options.inventoryOnly?[]:selectedIds?[...works.values()].filter(work=>selectedIds.has(String(work.id))&&!excluded.has(String(work.id))):options.allWorks?[...works.values()].filter(work=>!excluded.has(String(work.id))):[...works.values()].slice(offset,offset+Math.max(1,Math.min(100,Number(options.workCount)||3)));
        if(!options.inventoryOnly&&!options.allWorks&&!selectedIds&&works.size&&!entries.length) throw new Error('開始する作品番号が作品数を超えています。');
        if(selectedIds&&[...selectedIds].some(id=>!works.has(id)))throw new Error('選択した作品が現在の一覧にありません。一覧を読み直してください。');
        report.scope={first:options.allWorks&&entries.length?[...works.keys()].indexOf(entries[0].id)+1:offset+1,count:entries.length,totalWorks:works.size,mode:options.allWorks?'remaining':'range',workIds:entries.map(work=>work.id)};
        report.limitations=[options.allWorks?'全作品を対象に、取得済み作品を除く'+entries.length+'作品を取得します。':'今回の対象は作品一覧の'+(offset+1)+'番目から'+entries.length+'作品です。範囲外の作品は別の回に保存してください。'];
        for(let index=0;index<entries.length;index++) {
          const work=entries[index];
          if(report.doneWorks.includes(work.id)||report.doneSelectedWorks.includes(work.id)) continue;
          update('作品 '+(index+1)+'/'+entries.length+'：'+work.title);
          await attempt(work.title,async()=>{
            const failuresBefore=report.failures.length;
            const first=await page(work.url);
            const links=P.links(first,work.url);
            const metadata=P.metadata(first);
            const count=links.find(item=>/^下書き/.test(item.text));
            const expectedPublished=Number(links.find(item=>/^投稿済/.test(item.text))?.text.match(/\d+/)?.[0]??NaN);
            const expectedDraft=Number(count?.text.match(/\d+/)?.[0]??NaN);
            const result={...work,metadata,draftCount:Number.isFinite(expectedDraft)?expectedDraft:null,episodeCount:0};
            const old=report.works.find(item=>item.id===work.id);
            if(old) Object.assign(result,{episodeCount:old.episodeCount});
            report.works=report.works.filter(item=>item.id!==work.id);report.works.push(result);
            await save(work.title,'作品情報',work.url,result,[{label:'投稿状態',value:work.publication},...metadata]);
            if(options.includeSettings!==false){
            const settings=links.filter(item=>/\/(?:usernovelmanage|draftnovelmanage)\/(?:updateinput|receptionsupdateinput)\//.test(item.url));
            const uniqueSettings=[...new Set(settings.map(item=>item.url))];
            if(!uniqueSettings.length) report.failures.push({item:work.title,error:'作品設定へのリンクが見つかりません'});
            for(const url of uniqueSettings) {
              if(report.donePages.includes(url)) continue;
              await attempt(work.title+'の設定',async()=>{
                const doc=await page(url);const controls=P.form(doc);
                if(!controls.length) throw new Error('作品設定の入力欄を取得できません。');
                await save(work.title,'作品設定',url,{workId:work.id,controls},P.formFields(controls));
                report.donePages.push(url);await checkpoint();
              });
            }
            }
            if(options.includeBody!==false){
            const episodes=new Map((report.episodePlans[work.id]||[]).map(item=>[item.url,item]));
            async function episodeList(url,state) {
              await scan(url,async(doc,current)=>{
                for(const item of P.links(doc,current).filter(item=>/\/(?:usernoveldatamanage|draftepisode)\/updateinput\//.test(item.url))) {
                  if(readable(item.url)) episodes.set(item.url,{url:item.url,state});
                  else report.failures.push({item:work.title,error:'未対応のエピソードURL形式'});
                }
                report.episodePlans[work.id]=[...episodes.values()];
              });
            }
            await episodeList(work.url,work.publication==='未投稿'?'下書き':'投稿済み');
            if(count&&expectedDraft!==0) await episodeList(count.url,'下書き');
            for(const [expected,state] of [[expectedPublished,'投稿済み'],[expectedDraft,'下書き']]) {
              const actual=[...episodes.values()].filter(item=>item.state===state).length;
              if(Number.isFinite(expected)&&actual!==expected) report.failures.push({item:work.title,error:state+'エピソードの件数不一致（一覧'+expected+'／取得'+actual+'）'});
            }
            if(!episodes.size && (!Number.isFinite(expectedPublished)||expectedPublished>0||expectedDraft>0)) throw new Error('エピソード編集リンクが見つかりません。');
            for(const episode of episodes.values()) {
              if(report.donePages.includes(episode.url)) continue;
              await attempt(work.title+'のエピソード',async()=>{
                const doc=await page(episode.url); const controls=P.form(doc);
                if(!controls.some(control=>control.name==='novel')) throw new Error('本文欄を取得できません。');
                await save(work.title+' ／ '+(controls.find(control=>control.name==='subtitle')?.value||'エピソード'),'エピソード',episode.url,{workId:work.id,state:episode.state,order:[...episodes.keys()].indexOf(episode.url),controls},P.formFields(controls));
                result.episodeCount++;
                report.donePages.push(episode.url);await checkpoint();
              });
            }
            }
            for(const item of links.filter(item=>options.includeSettings!==false&&/\/novelchapter\/list\//.test(item.url))) {
              if(report.donePages.includes(item.url)) continue;
              await attempt(work.title+'の章',async()=>{const doc=await page(item.url);await save(work.title,'章設定',item.url,{workId:work.id,text:P.main(doc)},[{label:'章設定',value:P.main(doc)}]);report.donePages.push(item.url);await checkpoint();});
            }
            if(report.failures.length===failuresBefore){
              report.doneSelectedWorks.push(work.id);
              report.workCoverage[work.id]={body:options.includeBody!==false,settings:options.includeSettings!==false};
              if(options.includeBody!==false&&options.includeSettings!==false)report.doneWorks.push(work.id);
            }
            await checkpoint();
          });
        }
        if(!options.inventoryOnly&&options.includeSettings!==false)await attempt('共通テンプレート',async()=>{
          const url=root+'/novelinitialsetting/updateinput/';const doc=await page(url);const controls=P.form(doc);
          if(!controls.some(control=>control.name==='preface1')) throw new Error('テンプレート欄を取得できません。');
          await save('作品初期設定・共通テンプレート','テンプレート',url,{controls},P.formFields(controls));
        });
      }
      if(options.favorites) {
        await attempt('ブックマーク',async()=>{
          const first=await page(root+'/favnovelmain/list/');
          const categories=report.bookmarkCategories || [...first.querySelectorAll('.p-up-bookmark-category__select option')].map(option=>({name:P.text(option),url:P.safeUrl(option.value,root)})).filter(item=>item.url);
          report.bookmarkCategories=categories;
          await save('ブックマークカテゴリ','カテゴリ',root+'/favnovelmain/list/',{categories});
          for(const category of categories.length?categories:[{url:root+'/favnovelmain/list/'}]) {
            await collection(new URL(category.url).pathname+new URL(category.url).search,'ブックマーク',P.bookmarks);
          }
          report.limitations.push('ブックマークは作品名・URL・作者・カテゴリ・一覧に表示された読書位置を保存。個別設定画面のメモ・公開設定などは未取得。');
        });
        await attempt('お気に入りユーザ',()=>collection('/favuser/list/','お気に入りユーザ',P.users));
      }
      if(options.announcements) {
        await attempt('自分の活動報告',async()=>{
          const inventoryUrl=root+'/userblog/list/',check=inventory(inventoryUrl);const entries=new Map((report.blogPlan||[]).map(item=>[item.url,item]));let expected=check.expected;
          await scan(root+'/userblog/list/',async(doc,url)=>{
            const total=P.main(doc).match(/全([\d,]+)件中/);
            if(total&&!check.expectedSeen){expected=Number(total[1].replaceAll(',',''));check.expectedSeen=true;}
            check.expected=expected;check.pages[url]=[];
            for(const row of doc.querySelectorAll('.p-up-blog-item')) {
              const node=row.querySelector('a[href*="/userblogmanage/updateinput/"]');
              const target=P.safeUrl(node?.getAttribute('href'),url);
              if(target&&readable(target)){check.pages[url].push(target);entries.set(target,{url:target,title:P.text(row.querySelector('.p-up-blog-item__title')),date:P.text(row.querySelector('.p-up-blog-item__date'))});}
            }
            report.blogPlan=[...entries.values()];
          });
          validateInventory(inventoryUrl,check,'活動報告一覧');await checkpoint();
          for(const item of entries.values()) {
            if(report.donePages.includes(item.url)) continue;
            update('活動報告：'+item.title);
            await attempt(item.title,async()=>{
              const doc=await page(item.url);
              // Read the author's editor, which contains no reader comments.
              const controls=P.form(doc).filter(field=>['title','textarea','kokai_form'].includes(field.name));
              if(!controls.some(field=>field.name==='textarea')) throw new Error('活動報告の本文欄が見つかりません。');
              await save(item.title,'活動報告',item.url,{...item,controls},[{label:'日時',value:item.date},...P.formFields(controls)]);
              report.donePages.push(item.url);await checkpoint();
            });
          }
          report.limitations.push('活動報告は作者の本文（現在の編集内容）・タイトル・日時・公開設定のみ。読者コメントと作者のコメント返信は取得しません。');
        });
      }
      report.complete=report.failures.length===0&&Object.values(report.inventoryChecks).every(check=>check.validated);
    } catch(error) {report.failures.push({item:'一括取得',error:error.message});}
    report.finishedAt=new Date().toISOString();
    report.lastRequestCount=requests;
    try {
      await checkpoint();
      await save('バックアップ結果','取得結果',location.href,report,[{label:'取得結果',value:JSON.stringify(report,null,2)}]);
      update((report.complete?'今回の対象範囲の取得が終了しました。':'途中まで取得しました。「続きから取得」で再開できます。')+' '+report.pages+(options.archive?'ページをZIPへ保存。詳細ページで保存状況を確認してください。':'ページをChrome内に保存。全体の残りを確認し、JSON・テキストを書き出してください。'));
    } catch(error) { report.complete=false;throw new Error('結果の保存に失敗しました。既に保存したページを書き出してください。 '+error.message); }
  }
  globalThis.narouBulkBackup={version,preview,start,reset:()=>{if(running||resumeAt)throw new Error('取得中です。');clearTimeout(resumeTimer);currentReport=null;ownerId=null;phase='idle';if(status)status.textContent='取得データをリセットしました。';},getStatus:()=>({version,phase,running,waiting:!!resumeAt,resumeAt,inventoryOnly:!!currentReport?.options?.inventoryOnly,message:status?.textContent||'',pages:currentReport?.pages||0,ownerId,complete:currentReport?.complete||false,finishedAt:currentReport?.finishedAt||null}),stop:()=>{clearTimeout(resumeTimer);resumeAt=null;if(currentReport){currentReport.autoResumeAt=null;checkpoint().catch(()=>{});}if(running)controller.abort('利用者による停止');else update('自動再開を停止しました。「続きから取得」で再開できます。');badge('paused');}};
})();

