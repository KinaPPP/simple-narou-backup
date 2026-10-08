(() => {
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const names = {title:'作品タイトル',subtitle:'エピソードタイトル',novel:'本文',preface:'前書き',postscript:'後書き',freememo:'フリーメモ',biggenre:'大ジャンル',genre:'小ジャンル',ex:'あらすじ',keyword:'キーワード',writer:'作者名',noveltype:'作品種別',end:'完結設定',age_limit:'年齢制限',isr15:'R15',iszankoku:'残酷な描写',isbl:'ボーイズラブ',isgl:'ガールズラブ',istensei:'異世界転生',istenni:'異世界転移',aitype:'AI利用状況',ainote:'AI利用メモ',preface1:'前書きテンプレート',postscript1:'後書きテンプレート1',postscript2:'後書きテンプレート2',x_preface1:'X前書きテンプレート',x_postscript1:'X後書きテンプレート1',x_postscript2:'X後書きテンプレート2'};
  function safeUrl(value, base) {
    try {
      const url = new URL(value, base);
      if (url.origin !== 'https://syosetu.com') return null;
      if (![...url.searchParams.keys()].every(key => ['p','page','filter','nowcategory','order'].includes(key))) return null;
      url.hash = '';
      if(url.searchParams.get('p')==='1') url.searchParams.delete('p');
      url.searchParams.sort();
      return url.href;
    } catch { return null; }
  }
  function links(doc, base) {
    return [...doc.querySelectorAll('a[href]')].map(node => ({node, text:text(node), url:safeUrl(node.getAttribute('href'),base)})).filter(item=>item.url);
  }
  function pages(doc, base) {
    return [...new Set(links(doc,base).filter(item => item.node.closest('.c-up-pager') || item.node.rel === 'next').map(item=>item.url))];
  }
  function main(doc) {
    const root = doc.querySelector('.l-main') || doc.querySelector('.l-container') || doc.body;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,iframe,.c-up-aside,.l-aside,nav,button,input,select,textarea,.c-up-dropdown,[data-narou-backup]').forEach(node=>node.remove());
    return clone.textContent.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
  }
  function editWorkId(doc,base){
    const url=safeUrl(base,base);if(!url)return null;
    const path=new URL(url).pathname;
    const direct=path.match(/^\/(?:(?:usernovelmanage|draftnovelmanage)\/(?:updateinput|receptionsupdateinput)|(?:usernoveldatamanage|draftepisode)\/updateinput)\/ncode\/(\d+)(?:\/(?:noveldataid|draftepisodeid|episodeid)\/\d+)?\/$/);
    if(direct)return direct[1];
    if(!/^\/draftepisode\/updateinput\/draftepisodeid\/\d+\/$/.test(path))return null;
    const root=doc.querySelector('.c-up-breadcrumb')||doc.querySelector('.l-main');
    if(!root)return null;
    const ids=new Set(links(root,base).flatMap(item=>{const id=new URL(item.url).pathname.match(/^\/(?:usernovelmanage|draftnovelmanage)\/top\/ncode\/(\d+)\/$/)?.[1];return id?[id]:[];}));
    return ids.size===1?[...ids][0]:null;
  }
  function ownerId(doc) {
    const node = [...doc.querySelectorAll('.l-header a[href]')].find(node=>/^https:\/\/mypage\.syosetu\.com\/\d+\/?$/.test(node.getAttribute('href') || ''));
    return node?.getAttribute('href').match(/\.com\/(\d+)/)[1] || null;
  }
  function list(doc,base) {
    return [...doc.querySelectorAll('.c-up-novel-item')].map(row=>{
      const node = row.querySelector('.c-up-novel-item__title a[href]');
      const url = safeUrl(node?.getAttribute('href'),base);
      if (!url || !/\/(?:usernovelmanage|draftnovelmanage)\/top\/ncode\/\d+\//.test(url)) return null;
      const copy = node.cloneNode(true);
      copy.querySelectorAll('span').forEach(e=>e.remove());
      return {id:new URL(url).pathname.match(/ncode\/(\d+)/)[1],title:text(copy),url,summary:text(row),publication:new URL(base).pathname.includes('draftlist')?'未投稿':'投稿済み'};
    }).filter(Boolean);
  }
  function form(doc) {
    return [...doc.querySelectorAll('form input,form textarea,form select')].filter(node=>{
      if (!node.name || ['password','submit','button','file','reset'].includes(node.type)) return false;
      // Hidden anti-CSRF fields, account identifiers and tokens are never exported.
      if (node.type === 'hidden') return /^(keyword|keyword_array|recommend_keyword_array|free_keyword)(\[\])?$/.test(node.name);
      return true;
    }).map(node=>({name:node.name,label:names[node.name] || text(node.labels?.[0]) || node.name,
      type:node.type,value:node.value,disabled:node.disabled,
      ...(['radio','checkbox'].includes(node.type)?{checked:node.checked,optionLabel:text(node.labels?.[0])}:{}),
      ...(node.tagName === 'SELECT'?{selectedText:[...node.selectedOptions].map(o=>text(o))}:{})}));
  }
  function formFields(controls) {
    return controls.filter(control=>!['radio','checkbox'].includes(control.type)||control.checked).map(control=>({
      label:control.label, value:control.selectedText?control.selectedText.join(' / ')+' ['+control.value+']':control.value
    }));
  }
  function metadata(doc) {
    return [...doc.querySelectorAll('.p-up-novelinfo__group')].map(node=>({label:text(node.querySelector('.p-up-novelinfo__label')),value:text(node.querySelector('.p-up-novelinfo__content'))}));
  }
  function bookmarks(doc) {
    return [...doc.querySelectorAll('.p-up-bookmark-item')].map(row=>{
      const title = row.querySelector('.p-up-bookmark-item__title a');
      const author = row.querySelector('a[href*="mypage.syosetu.com"]');
      return {title:text(title),url:title?.getAttribute('href'),author:text(author),authorUrl:author?.getAttribute('href'),summary:text(row.querySelector('.p-up-bookmark-item__info')),readingPosition:[...row.querySelectorAll('.p-up-bookmark-item__button-group a')].map(a=>({label:text(a),url:a.getAttribute('href')})),category:text(doc.querySelector('.p-up-bookmark-category__select option[selected]') || doc.querySelector('.p-up-bookmark-category__select option'))};
    });
  }
  function users(doc) {
    return [...doc.querySelectorAll('.p-up-favuser-item')].map(row=>{
      const node = row.querySelector('a[href*="mypage.syosetu.com"]');
      return {name:text(node),url:node?.getAttribute('href'),summary:text(row)};
    });
  }
  globalThis.NarouParser = {text,safeUrl,links,pages,main,editWorkId,ownerId,list,form,formFields,metadata,bookmarks,users};
})();
