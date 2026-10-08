(() => {
  // Site-owned globals are hidden behind the common unit contract.
  globalThis.NovelSiteUnit={
    id:'narou',contractVersion:1,
    account(doc){
      const node=[...doc.querySelectorAll('.l-header a[href]')].find(node=>/^https:\/\/mypage\.syosetu\.com\/\d+\/?$/.test(node.getAttribute('href')||''));
      return {siteId:'narou',ownerId:globalThis.NarouParser.ownerId(doc),userName:node?.textContent?.trim()||''};
    },
    startCollection(options){return globalThis.narouBulkBackup.start(options);},
    collectionStatus(){return globalThis.narouBulkBackup?.getStatus()||null;},
    pauseCollection(){return globalThis.narouBulkBackup?.stop();},
    editFields(){return globalThis.narouLocalBackup.fields();},
    startEditHistory(indices){return globalThis.narouLocalBackup.start(indices);},
    officialDownloadSettings(doc){
      if(!/^\/backup\/top\/ncode\/\d+\/$/.test(location.pathname))throw new Error('公式の「テキスト形式でダウンロード」画面を開いてください。');
      const workId=location.pathname.match(/ncode\/(\d+)/)?.[1];
      return {ownerId:globalThis.NarouParser.ownerId(doc),workId,title:doc.querySelector('.c-up-title-area__title')?.textContent?.trim()||'作品ID '+workId,
        settings:{encoding:doc.querySelector('form select[name="encoding"]')?.value,bom:doc.querySelector('form input[name="bom"]')?.checked??null,lineEnding:doc.querySelector('form input[name="return_code"]:checked')?.value}};
    }
  };
})();
