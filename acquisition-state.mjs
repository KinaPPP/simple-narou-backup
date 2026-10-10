// Keep controls locked between requests and while an asynchronous start is pending.
export function acquisitionActive(state,previous=false,starting=false){
 if(starting)return true;
 if(!state)return false;
 if(state.running||state.waiting)return true;
 if(['complete','ready','paused','error','idle'].includes(state.phase)||state.complete)return false;
 return previous||state.phase==='running'||state.phase==='waiting';
}
