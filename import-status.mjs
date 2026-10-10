// Only presentation changes: keep the original message text and import behavior.
export function setupImportStatus(){
 for(const node of document.querySelectorAll('.drop-messages [role="status"],.drop-messages [role="alert"]')){
  const update=()=>{
   const text=node.textContent;
   node.dataset.level=/読み込(?:みでき|め)ません|破損|衝突|失敗|エラー/.test(text)?'error':/不足|未取得|重複|読み飛ば|対象外/.test(text)?'warning':'normal';
  };
  update();new MutationObserver(update).observe(node,{childList:true,characterData:true,subtree:true});
 }
}
