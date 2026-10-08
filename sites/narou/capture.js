(() => {
  if (globalThis.narouLocalBackup) return;
  let candidates = [];
  let selected = [];
  let timer;
  let heartbeat;
  let lastSignature = null;
  let pending = Promise.resolve();
  let panel;
  let status;
  let generation = 0;

  function fields() {
    const nodes = [...document.querySelectorAll('textarea, input[type="text"], input:not([type])')]
      .filter(node => !node.disabled && !node.readOnly && node.getClientRects().length);
    candidates = nodes;
    return nodes.map((node, index) => {
      const label = [...(node.labels || [])].map(item => item.innerText).join(' ').trim() ||
        node.getAttribute('aria-label') || node.placeholder || node.name || node.id || '入力欄 ' + (index + 1);
      return {index, label: label.slice(0, 500), value: node.value};
    });
  }

  function update(text) { if (status) status.textContent = text; }
  function save() {
    const session = generation;
    const workId=globalThis.NarouParser.editWorkId(document,location.href);
    const snapshot = {...(workId?{data:{workId}}:{}),title: document.title, ownerId:globalThis.NarouParser.ownerId(document), fields: selected.map(item => ({label: item.label, value: item.node.value}))};
    const signature = JSON.stringify(snapshot);
    if (!snapshot.fields.length) return Promise.resolve();
    pending = pending.catch(() => {}).then(async () => {
      if (session !== generation || signature === lastSignature) return;
      if (selected.some(item => !item.node.isConnected)) {
        update('編集欄が切り替わりました。拡張機能で対象を選び直してください。');
        return;
      }
      update('端末内に保存中…');
      try {
        const result = await chrome.runtime.sendMessage({type: 'saveSnapshot', snapshot});
        if (!result?.ok) throw new Error(result?.error || '応答がありません。');
        lastSignature = signature;
        update('端末内に保存済み ' + new Date(result.savedAt).toLocaleTimeString('ja-JP') + ' ／ ファイルへの書き出しも行ってください');
      } catch (error) { update(error.message); throw error; }
    });
    return pending;
  }
  function input(event) {
    if (!selected.some(item => item.node === event.target)) return;
    update('変更あり・まだ保存されていません');
    clearTimeout(timer);
    timer = setTimeout(() => save().catch(() => {}), 1000);
  }
  function stop() {
    generation++;
    clearTimeout(timer);
    clearInterval(heartbeat);
    document.removeEventListener('input', input);
    document.removeEventListener('change', input);
    selected = [];
    panel?.remove();
    panel = null;
    lastSignature = null;
  }
  function start(indices) {
    if(!globalThis.NarouParser.ownerId(document)) throw new Error('ログイン中のユーザーを確認できません。');
    stop();
    selected = indices.map(index => ({node: candidates[index], label: fieldsLabel(index)}));
    if (!selected.length || selected.some(item => !item.node?.isConnected)) throw new Error('対象を読み取り直してください。');
    panel = document.createElement('div');
    // Shadow DOM keeps the status panel independent of the site's styles.
    const shadow = panel.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = ':host{position:fixed;bottom:12px;right:12px;z-index:2147483647}section{max-width:330px;padding:12px;background:#fff;color:#162e38;border:2px solid #17796e;border-radius:10px;font:13px/1.6 sans-serif;box-shadow:0 4px 20px #0002}button{margin-top:6px;margin-right:8px;padding:5px 9px;cursor:pointer}';
    const section = document.createElement('section');
    status = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'シンプルになろう（バックアップ）：' + selected.length + '欄を保存';
    const saveButton = document.createElement('button');
    saveButton.textContent = '今すぐ保存';
    saveButton.onclick = () => save().catch(() => {});
    const stopButton = document.createElement('button');
    stopButton.textContent = '保存を停止';
    stopButton.onclick = stop;
    section.append(title, status, saveButton, stopButton);
    shadow.append(style, section);
    document.documentElement.append(panel);
    document.addEventListener('input', input);
    document.addEventListener('change', input);
    heartbeat = setInterval(() => save().catch(() => {}), 5000);
    return save().then(() => ({ok: true}));
  }
  function fieldsLabel(index) {
    const node = candidates[index];
    return ([...(node?.labels || [])].map(item => item.innerText).join(' ').trim() ||
      node?.getAttribute('aria-label') || node?.placeholder || node?.name || node?.id || '入力欄 ' + (index + 1)).slice(0, 500);
  }
  globalThis.narouLocalBackup = {fields, start, save, stop};
})();

