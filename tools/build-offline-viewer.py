from pathlib import Path
import re,json
root=Path(__file__).resolve().parents[1]
modules={}
def bundle(path):
 path=path.resolve();key=path.relative_to(root).as_posix()
 if key in modules:return key
 text=path.read_text(encoding='utf-8');exports=[]
 def imp(m):
  dependency=bundle(path.parent/m[2]);return 'const {'+re.sub(r'\s+as\s+',':',m[1])+'}=modules['+json.dumps(dependency)+'];'
 text=re.sub(r"^import\s*\{([^}]+)\}\s*from\s*['\"]([^'\"]+)['\"];",imp,text,flags=re.M)
 def declaration(m):exports.append(m[2]);return m[1]+' '+m[2]
 text=re.sub(r'\bexport\s+((?:async\s+)?function|class|const|let)\s+(\w+)',declaration,text)
 def named(m):exports.extend(s.strip() for s in m[1].split(','));return ''
 text=re.sub(r'export\s*\{([^}]+)\};',named,text)
 if re.search(r'^import\s|\bexport\s',text,re.M):raise Exception('Unsupported module syntax: '+key)
 modules[key]='modules['+json.dumps(key)+']=(()=>{\n'+text+'\nreturn {'+','.join(dict.fromkeys(exports))+'};\n})();'
 return key
bundle(root/'offline-viewer.js')
script='(()=>{\nconst modules=Object.create(null);\n'+'\n'.join(modules.values())+'\n})();'
organized=(root/'sites/narou/organized.js').read_text(encoding='utf-8')
css='\n'.join((root/name).read_text(encoding='utf-8') for name in ['style.css','organized.css'])
css+='\nbutton,.backup-tabs button{min-height:40px}.viewer-box{border:1px solid #c6d9d1;border-radius:10px;background:white;padding:16px;margin:16px 0}#drop{border:2px dashed #a7c8be;padding:18px;border-radius:8px}.drag{background:#e0f0e9}#warning{color:#923c18;white-space:pre-wrap;overflow-wrap:anywhere}#backup{max-width:100%;padding:8px}#top{position:fixed;bottom:16px;right:20px}input{max-width:100%}#file{display:block;width:100%;margin-top:8px}.toolbar>*{min-width:0}.toolbar label{max-width:100%}#backup{display:block;width:100%}.meta{overflow-wrap:anywhere}'
html='''<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>シンプルになろう（ビューワー）</title><style>__VIEWER_CSS__</style></head><body><main class="library">
<h1>シンプルになろう（ビューワー）</h1>
<p class="note">拡張機能・ネット接続は不要です。ZIPやJSONを読み込み、文章を確認・コピーできます。</p>
<section class="viewer-box" aria-label="インポートエリア"><div id="drop">ZIP・JSONをここにドラッグ＆ドロップ、または <input id="file" type="file" accept=".zip,.json" multiple aria-label="バックアップファイルを選択"></div>
<div class="toolbar"><button id="folder" class="secondary">ZIPのあるフォルダを読み込む</button><input id="folderFile" type="file" webkitdirectory multiple hidden><button id="clear" class="secondary">読み込みをクリア</button><label>表示するバックアップ <select id="backup" disabled aria-label="表示するバックアップ"></select></label></div>
<p id="importStatus" class="note" role="status"></p><p id="status" role="status" aria-live="polite">ZIPを読み込んでください。後から不足ZIPを追加できます。数が多い場合はフォルダを読み込んでください。</p><p id="warning" role="alert"></p>
<p class="note">ZIPは表示した項目から破損を確認します。未表示の項目は未検証です。関連作品の選択はこの画面を開いている間だけ有効です。</p></section>
<div id="records"></div></main><button id="top" class="secondary">トップへ戻る</button><script>__VIEWER_SCRIPT__</script></body></html>'''
html=html.replace('__VIEWER_CSS__',css).replace('__VIEWER_SCRIPT__',(organized+'\n'+script).replace('</script','<\\/script'))
(root/'simple-narou-zipviewer.html').write_text(html,encoding='utf-8')

print('Built standalone viewer:',len(html.encode()),'bytes;',len(modules),'shared modules')


