// ==UserScript==
// @name         Crack Usernote Studio 💜 Neon Purple (iPhone · PC)
// @namespace    usernote-studio-neon-original
// @version      0.5.9
// @description  iPhone STAY · Android · PC / 모바일 편집·AI 결과 탭·업데이트 진단
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/qwerty1816/moonlight-usernote-studio/main/moonlight-usernote-studio.user.js
// @downloadURL  https://raw.githubusercontent.com/qwerty1816/moonlight-usernote-studio/main/moonlight-usernote-studio.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      api.anthropic.com
// @connect      raw.githubusercontent.com
// ==/UserScript==
(function(){
'use strict';
// 같은 버전의 중복 실행만 차단합니다. 다른 버전과 동시 설치는 피하세요.
if(window.__cunsNeonStudioV057)return;window.__cunsNeonStudioV057=true;
const STUDIO_VERSION='0.5.9';
const STUDIO_URL='https://raw.githubusercontent.com/qwerty1816/moonlight-usernote-studio/main/moonlight-usernote-studio.user.js';
const PREFIX='cuns-neon-v01:', LIMIT=2000;
const get=(k,d)=>{try{const v=GM_getValue(PREFIX+k);return v===undefined?d:v}catch(e){try{return JSON.parse(localStorage.getItem(PREFIX+k))??d}catch(_){return d}}};
const put=(k,v)=>{try{GM_setValue(PREFIX+k,v)}catch(e){localStorage.setItem(PREFIX+k,JSON.stringify(v))}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const room=()=>location.pathname.match(/\/c(?:hat)?\/([^/?#]+)/)?.[1]||location.pathname;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let dialog=null,ta=null,root=null,tab='presets',result=get('ai:result',''),source='',selected=new Set(),original='',applied='',draftTimer=0;let aiTarget=get('ai:target','2000'),aiLevel=get('ai:level','medium');
let aiSource=get('ai:source','note');if(!['note','part','manual'].includes(aiSource))aiSource='note';
let aiInput=get('ai:input',''),aiPreview=false;
let protectedBlocks=get('protect:'+room(),[]);if(!Array.isArray(protectedBlocks))protectedBlocks=[];
let editorMode='',editorOriginal='',editorText='',editorRange=[0,0],editorStart=null,editorEnd=null,editorUndo=[],editorCursor=0,editorRangeLocked=false;
let aiPane='settings', updateStatus='', updateBusy=false;
let targetCount=get('ai:target:custom','max');
const historyKey=()=> 'history:'+room();
function saveHistory(reason,text){const val=String(text??base());if(!val.trim())return;const arr=get(historyKey(),[]);if(arr[0]?.text===val)return;arr.unshift({id:uid(),at:Date.now(),reason,text:val});put(historyKey(),arr.slice(0,30));}
function protectCheck(before,after){
 const blocks=protectedBlocks.filter(x=>typeof x==='string'&&x.length&&before.includes(x));
 for(const x of blocks){
  const occurrences=v=>v.split(x).length-1;
  if(occurrences(after)<occurrences(before))return '🔒 보호된 내용이 변경되거나 사라졌어요. 적용을 중단했어요.';
 }
 return null;
}
function segmentText(v){const matches=[...v.matchAll(/^#{1,6}[^\n]+/gm)];const result=[];if(!matches.length){let st=0;for(const m of v.matchAll(/\n\s*\n/g)){const end=m.index+m[0].length;if(v.slice(st,end).trim())result.push({name:'문단 '+(result.length+1),start:st,end,text:v.slice(st,end)});st=end}if(v.slice(st).trim())result.push({name:'문단 '+(result.length+1),start:st,end:v.length,text:v.slice(st)});return result.length?result:[{name:'전체',start:0,end:v.length,text:v}];}
if(matches[0].index>0)result.push({name:'머리말',start:0,end:matches[0].index,text:v.slice(0,matches[0].index)});
for(let i=0;i<matches.length;i++){const start=matches[i].index,end=i+1<matches.length?matches[i+1].index:v.length;result.push({name:matches[i][0].trim(),start,end,text:v.slice(start,end)});}return result;}
function splitText(v,limit=1900){const out=[];let start=0;while(start<v.length){let end=Math.min(v.length,start+limit);if(end<v.length){const sep=Math.max(v.lastIndexOf('\n\n',end),v.lastIndexOf('\n',end));if(sep>start+Math.floor(limit*.45))end=sep+1;}out.push(v.slice(start,end));start=end;}return out;}
function updateProtected(text){const idx=protectedBlocks.indexOf(text);if(idx>=0)protectedBlocks.splice(idx,1);else protectedBlocks.push(text);put('protect:'+room(),protectedBlocks);render();}
function openEditor(mode){editorMode=mode;editorOriginal=mode==='part'?base():mode==='manual'?aiInput:mode==='result'?result:base();editorText=editorOriginal;editorStart=null;editorEnd=null;editorRange=[0,0];editorCursor=0;editorRangeLocked=false;editorUndo=[];render();}
function closeEditor(commit){if(commit){const next=root?.querySelector('#cuns-editor-text')?.value??editorText;if(editorMode==='part'){if(next!==editorOriginal)return alert('부분 선택 편집기는 원문을 변경하지 않아요. 아래 선택 구역을 지정해 주세요.');}else if(editorMode==='manual'){aiInput=next;put('ai:input',next);}else if(editorMode==='result'){result=next;put('ai:result',next);}else{const err=protectCheck(base(),next);if(err)return alert(err);if(next.length>LIMIT&&!confirm(next.length+'자입니다. 2,000자를 초과해요. 계속 입력할까요?'))return;saveHistory('모바일 편집 전',base());setBase(next);}}editorMode='';render();}
function editorSelection(start,end,focus=false){
 const el=root?.querySelector('#cuns-editor-text');if(!el)return;
 const n=el.value.length;start=Math.max(0,Math.min(n,start));end=Math.max(start,Math.min(n,end));
 editorRange=[start,end];editorCursor=end;editorRangeLocked=start!==end;
 try{el.setSelectionRange(start,end);if(focus)el.focus({preventScroll:true});}catch(_){}
 editorLabel();
}
function editorLabel(){const label=root?.querySelector('#cuns-editor-range-label');if(!label)return;
 const [st,en]=editorRange;label.textContent=`선택 범위: ${st.toLocaleString()}~${en.toLocaleString()} · ${(en-st).toLocaleString()}자`;
}
function editorRemember(){const el=root?.querySelector('#cuns-editor-text');if(!el)return;
 const st=el.selectionStart,en=el.selectionEnd;
 // iOS/Android 버튼 터치 후 선택이 0자로 접혀도 직전 명시적 선택을 보존합니다.
 if(st!==en){editorRange=[st,en];editorRangeLocked=true;}
 else if(!editorRangeLocked){editorRange=[st,en];}
 editorCursor=en;editorLabel();
}
function editorReplace(st,en,text){const el=root?.querySelector('#cuns-editor-text');if(!el||editorMode==='part')return;
 editorUndo.push({text:el.value,range:[...editorRange]});if(editorUndo.length>40)editorUndo.shift();
 el.setRangeText(text,st,en,'end');editorText=el.value;editorSelection(st+text.length,st+text.length);
}
function editorHtml(){const segs=segmentText(editorText);return `<div class="cuns-mobile-editor">
 <div class="cuns-editor-head"><div class="cuns-row"><b class="cuns-grow">✍️ 집중 편집 · ${editorMode==='part'?'부분 선택':editorMode==='manual'?'새 내용':editorMode==='result'?'압축 결과':'전체 노트'}</b><button class="cuns-btn" data-action="editor-cancel">닫기</button></div>
 <div class="cuns-muted">문단을 눌러 선택하거나 글자를 직접 드래그하세요. 시작점과 끝점은 현재 커서 위치에서도 지정할 수 있어요.</div>
 <div class="cuns-grid"><button class="cuns-btn" data-action="editor-start-here">① 현재 커서 시작</button><button class="cuns-btn" data-action="editor-end-here">② 현재 커서 끝</button><button class="cuns-btn" data-action="editor-start-mode">문단 시작</button><button class="cuns-btn" data-action="editor-end-mode">문단 끝</button><button class="cuns-btn" data-action="editor-select-all">전체 선택</button></div>
 <div id="cuns-editor-range-label" class="cuns-muted">선택 범위: 0~0 · 0자</div></div>
 <div class="cuns-editor-scroll"><div id="cuns-editor-segments" class="cuns-segments">${segs.map((x,i)=>`<button class="cuns-segment" data-seg="${i}" type="button"><b>${esc(x.name)}</b><span>${x.text.length}자</span></button>`).join('')}</div>
 <textarea id="cuns-editor-text" class="cuns-input cuns-area" spellcheck="false" ${editorMode==='part'?'readonly':''}>${esc(editorText)}</textarea></div>
 <div class="cuns-editor-foot"><div class="cuns-tools"><button class="cuns-btn" data-action="editor-left">◀</button><button class="cuns-btn" data-action="editor-right">▶</button><button class="cuns-btn" data-action="editor-select-line">줄 선택</button><button class="cuns-btn" data-action="editor-copy">복사</button><button class="cuns-btn" data-action="editor-cut" ${editorMode==='part'?'disabled':''}>잘라내기</button><button class="cuns-btn" data-action="editor-paste" ${editorMode==='part'?'disabled':''}>붙여넣기</button><button class="cuns-btn" data-action="editor-undo" ${editorMode==='part'?'disabled':''}>↶ 되돌리기</button></div>
 <div class="cuns-grid"><button class="cuns-btn primary" data-action="editor-use-selection">${editorMode==='part'?'✂️ 선택 부분 지정':'선택 복사'}</button><button class="cuns-btn primary" data-action="editor-save">${editorMode==='part'?'✓ 선택 완료':'✓ 수정 완료'}</button></div></div></div>`;}

let partSelection=get('ai:part:'+room(),null);
let pcPartRange=null;
let requestSnapshot=get('ai:request:'+room(),null);
let aiMode=get('ai:mode',null),aiProvider=get('ai:provider','openai'),aiModel=get('ai:model:openai','gpt-4.1-mini'),apiKey='',apiBusy=false,apiStatus='',apiStatusError=false;
const defaultModels={openai:'gpt-4.1-mini',gemini:'gemini-2.5-flash',claude:'claude-sonnet-4-5-20250929'};
const providerNames={openai:'OpenAI · GPT',gemini:'Google · Gemini',claude:'Anthropic · Claude'};
let availableModels={openai:[],gemini:[],claude:[]},modelsBusy=false;
function modelSelectHtml(){
 const items=availableModels[aiProvider];const unique=new Map();
 unique.set(aiModel, {id:aiModel,label:aiModel+' (현재 선택)'});
 for(const item of items)unique.set(item.id,item);
 const options=[...unique.values()].map(x=>`<option value="${esc(x.id)}" ${x.id===aiModel?'selected':''}>${esc(x.label)}</option>`).join('');
 return `<div class="cuns-row" style="margin-top:8px"><label style="white-space:nowrap">모델 선택</label><select id="cuns-model-select" class="cuns-input cuns-grow">${options}</select></div><div class="cuns-grid"><button class="cuns-btn" data-action="refresh-models" ${modelsBusy?'disabled':''}>${modelsBusy?'⏳ 조회 중…':'↻ 내 API 모델 목록 불러오기'}</button></div><div class="cuns-row"><label style="white-space:nowrap">모델 ID</label><input id="cuns-model" class="cuns-input cuns-grow" value="${esc(aiModel)}" autocapitalize="off" spellcheck="false" placeholder="모델 ID 직접 입력"></div><div class="cuns-muted">목록은 본인 API 키로 제공업체에서 직접 조회해요. 이름을 고르면 정확한 모델 ID가 자동 입력됩니다. 목록에 없으면 직접 입력할 수 있어요.</div>`;
}
function apiGet(url,headers){return new Promise((resolve,reject)=>{
 const finish=(status,body)=>{let data;try{data=JSON.parse(body)}catch(_){data={}}if(status>=200&&status<300)resolve(data);else{const e=new Error(data?.error?.message||data?.message||'HTTP '+status);e.status=status;reject(e)}};
 if(typeof GM_xmlhttpRequest==='function'){try{GM_xmlhttpRequest({method:'GET',url,headers,timeout:25000,onload:r=>finish(r.status,r.responseText),onerror:()=>reject(new Error('네트워크 또는 STAY 요청 차단')),ontimeout:()=>reject(new Error('시간 초과'))});return}catch(_){}}
 fetch(url,{headers}).then(async r=>finish(r.status,await r.text())).catch(reject);
})}
async function refreshModels(){
 const provider=aiProvider,key=apiKey.trim();if(!key)return alert('먼저 해당 제공업체의 API 키를 입력해 주세요.');
 modelsBusy=true;apiStatus='사용 가능한 모델을 조회하고 있어요…';apiStatusError=false;render();
 try{
 let rows=[];
 if(provider==='openai'){const data=await apiGet('https://api.openai.com/v1/models',{'Authorization':'Bearer '+key});rows=(data.data||[]).filter(x=>/^(gpt-|o[1-9])/.test(x.id)).map(x=>({id:x.id,label:x.id}));}
 else if(provider==='gemini'){let token='';do{const url='https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000'+(token?'&pageToken='+encodeURIComponent(token):'');const data=await apiGet(url,{'x-goog-api-key':key});rows.push(...(data.models||[]).filter(x=>!x.supportedGenerationMethods||x.supportedGenerationMethods.includes('generateContent')).map(x=>({id:x.name.replace(/^models\//,''),label:x.displayName?x.displayName+' · '+x.name.replace(/^models\//,''):x.name.replace(/^models\//,'')})));token=data.nextPageToken||'';}while(token&&rows.length<1000);}
 else {let after='';do{const data=await apiGet('https://api.anthropic.com/v1/models?limit=100'+(after?'&after_id='+encodeURIComponent(after):''),{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'});rows.push(...(data.data||[]).map(x=>({id:x.id,label:(x.display_name||x.id)+' · '+x.id})));after=data.has_more?data.last_id||'':'';}while(after&&rows.length<1000);}
 if(provider!==aiProvider)return;
 availableModels[provider]=rows.sort((a,b)=>a.label.localeCompare(b.label,'ko',{numeric:true}));apiStatus=rows.length+'개 모델을 불러왔어요. 원하는 모델을 선택해 주세요.';apiStatusError=false;
 }catch(e){apiStatus='모델 목록 조회 실패: '+e.message+'. 직접 모델 ID를 입력할 수 있어요.';apiStatusError=true;}
 finally{modelsBusy=false;render();}
}

function apiRequest(url,method,headers,payload){return new Promise((resolve,reject)=>{
 const json=JSON.stringify(payload);let done=false;
 const finish=(status,body)=>{if(done)return;done=true;let data;try{data=JSON.parse(body)}catch(_){data={raw:String(body||'').slice(0,400)}};if(status>=200&&status<300)resolve(data);else{const msg=data?.error?.message||data?.message||('HTTP '+status);const err=new Error(msg);err.status=status;reject(err)}};
 if(typeof GM_xmlhttpRequest==='function'){
  try{GM_xmlhttpRequest({method,url,headers:{...headers,'Content-Type':'application/json'},data:json,timeout:60000,onload:r=>finish(r.status,r.responseText),onerror:()=>reject(new Error('네트워크 또는 STAY 요청 차단')),ontimeout:()=>reject(new Error('연결 시간 초과'))});return}catch(e){}
 }
 fetch(url,{method,headers:{...headers,'Content-Type':'application/json'},body:json}).then(async r=>finish(r.status,await r.text())).catch(e=>reject(new Error('브라우저에서 직접 API 호출이 차단됐을 수 있어요: '+e.message)));
})}
async function compressWithApi(){
 if(apiBusy)return;
 const source=getAiSource();if(!source.trim())return alert('압축할 내용을 먼저 선택하거나 입력해 줘!');
 const key=apiKey.trim();if(!key)return alert('API 키를 입력해 줘. 키는 저장하지 않아요.');
 const model=aiModel.trim();if(!model)return alert('모델 ID를 입력해 줘!');
 saveRequestSnapshot();const snap=requestSnapshot;const instruction=promptText();
 apiBusy=true;apiStatus='AI 압축 중이에요. 잠시 기다려 주세요…';apiStatusError=false;render();
 try{
 let data,out='';
 if(aiProvider==='openai'){
 data=await apiRequest('https://api.openai.com/v1/chat/completions','POST',{'Authorization':'Bearer '+key},{model,messages:[{role:'user',content:instruction}],temperature:0.2});
 out=data?.choices?.[0]?.message?.content||'';
 }else if(aiProvider==='gemini'){
 data=await apiRequest('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent','POST',{'x-goog-api-key':key},{contents:[{role:'user',parts:[{text:instruction}]}],generationConfig:{temperature:0.2}});
 out=(data?.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('');
 }else{
 data=await apiRequest('https://api.anthropic.com/v1/messages','POST',{'x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},{model,max_tokens:4096,messages:[{role:'user',content:instruction}]});
 out=(data?.content||[]).filter(p=>p.type==='text').map(p=>p.text||'').join('');
 }
 if(!out.trim())throw new Error('모델이 빈 결과를 반환했어요. 모델 ID 또는 응답 한도를 확인해 주세요.');
 if(requestSnapshot!==snap||getAiSource()!==snap.source||room()!==snap.room)throw new Error('요청 중 압축 원문이 바뀌었어요. 결과 적용을 중단했어요.');
 result=out.trim();put('ai:result',result);aiPane='result';tab='ai';apiStatus='압축 완료! 결과를 검토한 뒤 적용해 주세요.';apiStatusError=false;
 const issue=verifyResult(result);if(issue){apiStatus='압축 완료, 확인 필요: '+issue;apiStatusError=true;}
 }catch(e){
 const status=e.status||0;
 apiStatus=(status===429?'API 사용량·요청 한도에 도달했을 수 있어요.':status===401||status===403?'API 키 또는 모델 접근 권한을 확인해 주세요.':status===400||status===404?'모델 ID·요청 형식을 확인해 주세요.':'API 요청 실패: '+e.message)+' 수동 압축으로 계속할 수 있어요.';
 apiStatusError=true;
 }finally{apiBusy=false;render();}
}
let presets=get('presets',[]);if(!Array.isArray(presets))presets=[];
const block=p=>'# '+p.name.trim()+'\n'+p.text.trim();
function getAiSource(){if(aiSource==='note')return base();if(aiSource==='part')return partSelection?.text||'';return aiInput;}
function base(){const v=ta?.value||'';return applied&&v.endsWith(applied)?v.slice(0,-applied.length):v}
function write(v){if(!ta)return;const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set; if(ta._valueTracker)ta._valueTracker.setValue('');setter.call(ta,v);ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));}
function apply(){if(!ta)return;const old=ta.value;if(applied&&!old.endsWith(applied)){alert('프리셋 뒤쪽 내용이 변경되어 자동 적용을 멈췄어요. 노트를 확인해주세요.');return}const b=base();const oldApplied=applied;const parts=presets.filter(p=>selected.has(p.id)).map(block);const newApplied=parts.length?(b&&!b.endsWith('\n')?'\n':'')+parts.join('\n\n'):'';const next=b+newApplied;if(next.length>LIMIT&&!confirm(`합계 ${next.length}자입니다. 2,000자를 초과해 저장이 실패할 수 있어요. 그래도 입력할까요?`)){applied=oldApplied;return}applied=newApplied;write(next);render()}
function backup(){saveHistory('압축 적용 전',base());const key='draft:'+room(),arr=get(key,[]);const v=base();if(!v.trim())return;arr.unshift({id:uid(),at:Date.now(),text:v});put(key,arr.slice(0,12))}
function autosave(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{const v=base();if(!v.trim())return;const key='auto:'+room();put(key,{at:Date.now(),text:v})},1200)}
function setBase(v){if(!ta)return;const b=String(v);const parts=presets.filter(p=>selected.has(p.id)).map(block);applied=parts.length?(b&&!b.endsWith('\n')?'\n':'')+parts.join('\n\n'):'';const next=b+applied;if(next.length>LIMIT&&!confirm(`현재 ${next.length}자로 2,000자를 초과해요. 계속할까요?`))return;write(next);render()}
const style=document.createElement('style');style.textContent=`
#cuns-launch{margin-left:8px;border:1px solid #a55bff;background:#241038;color:#eedaff;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:750;white-space:nowrap;box-shadow:0 0 11px #a75cff77}
#cuns-overlay{pointer-events:auto!important;touch-action:pan-y;position:fixed;inset:0;z-index:2147483646;background:#08030dc9;display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo',sans-serif;color:#f5eaff}
#cuns-sheet{pointer-events:auto!important;touch-action:pan-y;position:relative;z-index:1;box-sizing:border-box;width:100%;max-width:600px;height:min(89dvh, 760px);max-height:89dvh;overflow-y:auto!important;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;border-radius:22px 22px 0 0;border:1px solid #7e37d5;background:linear-gradient(155deg,#211032,#110b1d 75%);box-shadow:0 -8px 36px #a742ff66;padding:18px 16px calc(18px + env(safe-area-inset-bottom));font-size:14px}
#cuns-sheet *{box-sizing:border-box;pointer-events:auto!important}#cuns-sheet button,#cuns-sheet input,#cuns-sheet textarea{font:inherit}#cuns-sheet button{cursor:pointer}
#cuns-sheet:focus-within{scroll-behavior:auto}#cuns-result{min-height:190px;scroll-margin-bottom:125px;-webkit-user-select:text;user-select:text} .cuns-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.cuns-title{font-size:18px;font-weight:850;color:#f2d9ff}.cuns-sub{color:#bc91dd;font-size:11px;margin-top:4px}.cuns-close{background:#3a2452;border:0;border-radius:9px;color:white;padding:8px 12px}
.cuns-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:13px}.cuns-tabs button{border:1px solid #56346f;border-radius:12px;background:#271937;color:#d7c0ea;padding:11px 3px;font-size:12px!important}.cuns-tabs .on{border-color:#c277ff;background:#6832a0;color:white;box-shadow:0 0 12px #a74cff55}
.cuns-card{border:1px solid #4e3466;background:#261a35;border-radius:13px;padding:12px;margin:9px 0}.cuns-row{display:flex;align-items:center;gap:8px}.cuns-row>*{min-width:0}.cuns-grow{flex:1}.cuns-muted{font-size:12px;color:#bfa7d0}.cuns-count{font-size:12px;color:#e3afff;margin:6px 0 10px}.cuns-bar{height:7px;background:#48315d;border-radius:99px;overflow:hidden}.cuns-bar>i{display:block;height:100%;background:linear-gradient(90deg,#8c4aff,#e178ff)}
.cuns-btn{border:1px solid #8653a9;background:#3b2455;color:#f3ddff;border-radius:10px;padding:9px 11px;font-size:12px!important}.cuns-btn.primary{background:linear-gradient(120deg,#8a36de,#b65cf2);border-color:#d4a2ff;color:white;font-weight:750}.cuns-btn.danger{color:#ffbdcf;border-color:#7e3c60}.cuns-input{width:100%;border:1px solid #694586;border-radius:10px;background:#160e24;color:#f7ebff;padding:10px;outline:none;margin-top:8px}.cuns-input:focus{border-color:#d291ff}.cuns-area{min-height:112px;resize:vertical}.cuns-grid{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.cuns-tag{font-size:11px;color:#cfa4f4}.cuns-empty{text-align:center;color:#bba1d2;padding:22px 5px}.cuns-source{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0}.cuns-source label{display:flex;align-items:center;gap:4px}.cuns-preview{white-space:pre-wrap;overflow-wrap:anywhere;max-height:200px;overflow:auto;border:1px solid #704a8b;border-radius:10px;padding:10px;background:#10091b;font-size:12px}.cuns-warning{color:#ffbfcb;font-size:12px;margin-top:7px}

.cuns-mobile-editor{min-height:100%;padding:4px 0}.cuns-segments{display:flex;flex-direction:column;gap:5px;max-height:180px;overflow:auto;margin:10px 0}.cuns-segment{display:flex;justify-content:space-between;text-align:left;gap:12px;background:#312046;color:#e6ccf9;border:1px solid #7750a2;border-radius:9px;padding:12px;touch-action:manipulation}.cuns-segment span{font-size:11px;color:#c6a8de}.cuns-mobile-editor .cuns-btn{min-height:42px}.cuns-mobile-editor textarea{touch-action:auto}.cuns-lock{border:1px solid #9a68d0;background:#2c1b42;color:#efdaff;border-radius:9px;padding:9px;margin-top:5px;width:100%;text-align:left}.cuns-lock.locked{border-color:#ecbb69;color:#ffe2ac}

/* v0.5.6: fixed editor shell, safe-area toolbar and short AI panels */
#cuns-sheet{display:flex;flex-direction:column;overflow-y:auto!important;padding-bottom:calc(12px + env(safe-area-inset-bottom));}
#cuns-sheet>.cuns-mobile-editor{flex:1;min-height:0}
.cuns-mobile-editor{display:flex;flex-direction:column;height:100%;min-height:0;padding:0}
.cuns-editor-head{flex:none;padding-bottom:8px;border-bottom:1px solid #624078}
.cuns-editor-scroll{flex:1;min-height:100px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:4px 0 12px}
.cuns-editor-scroll textarea{display:block;min-height:180px;height:max(36vh,200px);font-size:16px!important;line-height:1.55;user-select:text;-webkit-user-select:text;touch-action:auto}
.cuns-editor-foot{flex:none;position:relative;background:#1b102b;border-top:1px solid #7d50a4;padding:8px 0 calc(6px + env(safe-area-inset-bottom));box-shadow:0 -5px 18px #12071d}
.cuns-tools{display:flex;gap:6px;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:3px;scrollbar-width:thin}
.cuns-tools>.cuns-btn{flex:0 0 auto;min-height:40px}
.cuns-editor-foot .cuns-grid{margin-top:6px;flex-wrap:nowrap}
.cuns-editor-foot .cuns-grid .cuns-btn{flex:1;padding:9px 4px}
.cuns-ai-subtabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:0 0 10px}
.cuns-ai-subtabs button{background:#322046;border:1px solid #745098;border-radius:9px;padding:11px 3px;color:#e2c9f6;font-size:13px}
.cuns-ai-subtabs button.on{background:#7137a5;color:white;border-color:#d3a0ff}
.cuns-status{border:1px solid #77509d;border-radius:10px;padding:9px 11px;margin:8px 0;color:#e6c9ff;font-size:12px}
.cuns-update{margin-top:8px;padding-top:8px;border-top:1px solid #553770}
/* v0.5.9 desktop mouse selection: preserve native caret and drag selection. */
@media (hover:hover) and (pointer:fine){
 #cuns-overlay,#cuns-sheet,#cuns-sheet .cuns-mobile-editor,#cuns-sheet .cuns-editor-scroll{touch-action:auto!important}
 #cuns-sheet .cuns-editor-scroll{overflow:auto!important}
 #cuns-part-full{cursor:text!important;user-select:text!important;-webkit-user-select:text!important;pointer-events:auto!important;touch-action:auto!important}
 #cuns-editor-text{position:relative;z-index:2;pointer-events:auto!important;cursor:text!important;user-select:text!important;-webkit-user-select:text!important;touch-action:auto!important;resize:vertical}
 #cuns-scroll-bottom{pointer-events:none!important;opacity:.45}
}
/* v0.5.6 iOS STAY: scrollable independent modal and reachable footer */
#cuns-overlay{position:fixed!important;inset:0!important;display:flex!important;align-items:flex-end!important;overflow:hidden!important;touch-action:auto!important}
#cuns-sheet{flex:0 1 auto!important;min-height:0!important;overflow-y:scroll!important;overflow-x:hidden!important;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y!important;padding-bottom:calc(100px + env(safe-area-inset-bottom))!important;scroll-padding-bottom:110px}
#cuns-sheet .cuns-card,#cuns-sheet .cuns-ai-pane,#cuns-sheet #cuns-body{touch-action:pan-y}
#cuns-sheet textarea,#cuns-sheet input{touch-action:auto}
#cuns-scroll-bottom{position:absolute;z-index:5;bottom:calc(16px + env(safe-area-inset-bottom));right:18px;border:1px solid #d5a5ff;border-radius:22px;background:#8236c9;color:white;font-weight:700;padding:11px 16px;box-shadow:0 3px 18px #15051e;pointer-events:auto;touch-action:manipulation}
@media (max-width:480px){#cuns-sheet{padding:13px 12px 0}.cuns-mobile-editor .cuns-btn{font-size:12px!important}.cuns-editor-head .cuns-grid{max-height:94px;overflow:auto}.cuns-editor-scroll textarea{height:32vh}}
`;document.head.appendChild(style);
const mobileStyle=document.createElement('style');mobileStyle.textContent=`
#cuns-mobile-launch{display:none!important}
@media(pointer:coarse),(max-width:700px){
 #cuns-mobile-launch{display:block!important;position:fixed!important;right:14px!important;bottom:calc(95px + env(safe-area-inset-bottom))!important;z-index:2147483645!important;border:1px solid #d6a7ff!important;border-radius:999px!important;background:#8034c8!important;color:#fff!important;padding:12px 16px!important;font-size:14px!important;font-weight:700!important;box-shadow:0 4px 18px #350b4eaa!important;touch-action:manipulation!important;pointer-events:auto!important}
 body:has(#cuns-overlay) #cuns-mobile-launch{display:none!important}
}`;document.head.appendChild(mobileStyle);
function find(){
 const dialogs=[...document.querySelectorAll('[role="dialog"],dialog,[data-state="open"]')];
 for(const d of dialogs){if(!d.closest('#cuns-overlay')&&d.querySelector('textarea:not(#cuns-result)')&&/유저노트/.test(d.textContent||''))return d;}
 // 일부 모바일 웹 UI는 role="dialog"를 사용하지 않음.
 for(const el of document.querySelectorAll('textarea')){
  if(el.closest('#cuns-overlay'))continue;
  let d=el.parentElement;
  for(let i=0;d&&i<8;i++,d=d.parentElement){
   if(/유저노트/.test(d.textContent||'')&&d.querySelector('button')&&d.getBoundingClientRect().width>0)return d;
  }
 }
 return null;
}
function launch(){if(root)return;if(!aiMode){aiMode='manual';put('ai:mode',aiMode);tab='ai';}root=document.createElement('div');root.id='cuns-overlay';root.innerHTML='<div id="cuns-sheet"></div><button id="cuns-scroll-bottom" type="button" aria-label="맨 아래로 이동">↓ 맨 아래</button>';((window.matchMedia('(hover:hover) and (pointer:fine)').matches && dialog?.isConnected)?dialog:document.body).appendChild(root);root.addEventListener('click',e=>{if(e.target===root)close();if(e.target.closest('#cuns-scroll-bottom')){const sheet=root.querySelector('#cuns-sheet');if(sheet)sheet.scrollTo({top:sheet.scrollHeight,behavior:'smooth'});}});root.addEventListener('pointerdown',e=>e.stopPropagation());root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});root.addEventListener('touchmove',e=>e.stopPropagation(),{passive:true});render();syncViewport()}
function close(){root?.remove();root=null;document.documentElement.style.removeProperty('--cuns-keyboard-height')}
function syncViewport(){if(!root)return;const sheet=root.querySelector('#cuns-sheet');if(!sheet)return;const vp=window.visualViewport;const h=vp?vp.height:window.innerHeight;const offset=vp?vp.offsetTop:0;root.style.top=offset+'px';root.style.height=h+'px';root.style.bottom='auto';sheet.style.maxHeight=Math.max(220,h-10)+'px';sheet.style.height=Math.max(220,h-10)+'px';sheet.style.minHeight='0';}
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);
function comparisonHtml(){const before=getAiSource().length,after=result.length,diff=before-after;const pct=before?Math.round(diff/before*1000)/10:0;const state=!before?'압축 원문을 먼저 선택하세요':!result?'결과를 붙여넣으면 절약량을 계산해요':diff>0?`💜 ${diff.toLocaleString()}자 절약 (${pct}%)`:diff===0?'원문과 글자 수 동일':`⚠️ 원문보다 ${(-diff).toLocaleString()}자 증가`;
return `원문 <b>${before.toLocaleString()}자</b> → 결과 <b id="cuns-result-count">${after.toLocaleString()}자</b><div style="margin-top:6px;color:${diff<0&&result?'#ffb3c7':'#d9b4ff'}">${state}</div>`;}
function updateComparison(){const el=root?.querySelector('#cuns-compare');if(el)el.innerHTML=comparisonHtml();}
function render(){if(!root)return;syncViewport();const sheet=root.querySelector('#cuns-sheet');if(editorMode){sheet.innerHTML=editorHtml();sheet.scrollTop=0;return;}const n=ta?.value.length||0;const pct=Math.min(100,n/LIMIT*100);sheet.innerHTML=`<div class="cuns-head"><div><div class="cuns-title">✦ USERNOTE STUDIO 💜</div><div class="cuns-sub">NEON PURPLE · v0.5.9 · STAY / GALAXY / PC</div></div><button class="cuns-close" data-action="close">✕</button></div><div class="cuns-card"><div class="cuns-row"><b class="cuns-grow">유저노트 사용량</b><span class="cuns-count">${n.toLocaleString()} / ${LIMIT.toLocaleString()}</span></div><div class="cuns-bar"><i style="width:${pct}%"></i></div><div class="cuns-muted" style="margin-top:7px">${n>LIMIT?'⚠️ 제한 초과 '+(n-LIMIT)+'자':'남은 공간 '+(LIMIT-n)+'자'} · 선택 프리셋 ${selected.size}개</div></div><div class="cuns-tabs"><button data-tab="presets" class="${tab==='presets'?'on':''}">✦ 프리셋</button><button data-tab="drafts" class="${tab==='drafts'?'on':''}">◷ 임시저장</button><button data-tab="ai" class="${tab==='ai'?'on':''}">✧ AI 압축</button></div><div id="cuns-body"></div>`;
const body=sheet.querySelector('#cuns-body');if(tab==='presets'){body.innerHTML=`<div class="cuns-muted">선택한 프리셋은 노트 끝에 붙어요. 체크를 해제하면 제거돼요.</div><div id="cuns-list">${presets.length?presets.map(p=>`<div class="cuns-card"><div class="cuns-row"><input type="checkbox" data-toggle="${esc(p.id)}" ${selected.has(p.id)?'checked':''}><div class="cuns-grow"><b>${esc(p.name)}</b><div class="cuns-tag">${block(p).length}자</div></div><button class="cuns-btn" data-edit="${esc(p.id)}">편집</button><button class="cuns-btn danger" data-delete="${esc(p.id)}">삭제</button></div></div>`).join(''):'<div class="cuns-empty">아직 프리셋이 없어요 ✨</div>'}</div><div class="cuns-card"><b>＋ 새 프리셋</b><input class="cuns-input" id="cuns-name" placeholder="프리셋 제목 (예: 전개 규칙)"><textarea class="cuns-input cuns-area" id="cuns-text" placeholder="프리셋 내용을 입력하세요"></textarea><div class="cuns-grid"><button class="cuns-btn primary" data-action="add">프리셋 저장</button><button class="cuns-btn" data-action="export">백업 복사</button><button class="cuns-btn" data-action="import">백업 가져오기</button></div></div>`}
if(tab==='drafts'){const arr=get('draft:'+room(),[]);const auto=get('auto:'+room(),null);body.innerHTML=`<div class="cuns-card"><b>🔄 업데이트 확인</b><div class="cuns-muted">설치된 버전: v${STUDIO_VERSION} · GitHub 배포 버전 확인 (자동 설치는 STAY/템퍼몽키가 담당)</div><div class="cuns-grid"><button class="cuns-btn" data-action="check-update" ${updateBusy?'disabled':''}>${updateBusy?'확인 중…':'GitHub 최신 버전 확인'}</button><button class="cuns-btn" data-action="open-install">설치 주소 열기</button></div>${updateStatus?`<div class="cuns-status">${esc(updateStatus)}</div>`:''}</div><div class="cuns-grid"><button class="cuns-btn primary" data-action="snapshot">현재 노트 백업</button><button class="cuns-btn" data-action="editor-open-note">📱 전체 화면 편집</button></div><div class="cuns-card"><b>🕰️ 자동 백업 타임머신</b>${get(historyKey(),[]).map(d=>`<div class="cuns-row" style="margin-top:8px"><span class="cuns-grow cuns-muted">${new Date(d.at).toLocaleString('ko-KR')} · ${esc(d.reason)} · ${d.text.length}자</span><button class="cuns-btn" data-history="${esc(d.id)}">복원</button></div>`).join('')||'<div class="cuns-muted">아직 이력이 없어요</div>'}</div>${auto?`<div class="cuns-card"><b>최근 자동저장</b><div class="cuns-muted">${new Date(auto.at).toLocaleString('ko-KR')} · ${auto.text.length}자</div><div class="cuns-grid"><button class="cuns-btn" data-load-auto="1">복원</button></div></div>`:''}${arr.map(d=>`<div class="cuns-card"><b>백업 ${new Date(d.at).toLocaleString('ko-KR')}</b><div class="cuns-muted">${d.text.length}자 · ${esc(d.text.slice(0,45))}</div><div class="cuns-grid"><button class="cuns-btn" data-load="${esc(d.id)}">이 버전 복원</button></div></div>`).join('')||'<div class="cuns-empty">저장된 백업이 없어요</div>'}`}
if(tab==='ai'){
const src=getAiSource();
body.innerHTML=`<div class="cuns-ai-subtabs"><button data-pane="settings" class="${aiPane==='settings'?'on':''}">⚙️ 설정</button><button data-pane="edit" class="${aiPane==='edit'?'on':''}">✍️ 편집</button><button data-pane="result" class="${aiPane==='result'?'on':''}">✨ 결과</button></div>${apiStatus?`<div class="cuns-status" style="${apiStatusError?'color:#ffb7cb':''}">${esc(apiStatus)}</div>`:''}<section class="cuns-ai-pane" data-pane-section="settings" style="${aiPane==='settings'?'':'display:none'}"><div class="cuns-card" style="border-color:#8b4fd0"><b>🌙 AI 압축 방식</b><div class="cuns-source"><label><input type="radio" name="cuns-mode" value="api" ${aiMode==='api'?'checked':''}>⚡ API 자동</label><label><input type="radio" name="cuns-mode" value="manual" ${aiMode==='manual'?'checked':''}>📋 무료 수동</label></div>
${aiMode==='api'?`<div class="cuns-muted">본인 API 키로 자동 압축해요. 사용료는 각자 제공업체 계정에 청구돼요.</div><select id="cuns-provider" class="cuns-input"><option value="openai" ${aiProvider==='openai'?'selected':''}>OpenAI · GPT</option><option value="gemini" ${aiProvider==='gemini'?'selected':''}>Google · Gemini</option><option value="claude" ${aiProvider==='claude'?'selected':''}>Anthropic · Claude</option></select><div class="cuns-row"><input id="cuns-api-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" class="cuns-input cuns-grow" placeholder="내 API 키 입력 (저장 안 함)" value="${esc(apiKey)}"><button class="cuns-btn" data-action="toggle-key">보기</button></div><div class="cuns-muted" style="margin-top:6px">🔐 키는 저장하지 않지만 웹페이지·다른 스크립트가 접근할 위험은 있어요. 신뢰하는 환경에서만 개인 키를 사용하세요.</div>${modelSelectHtml()}<div class="cuns-grid"><button class="cuns-btn primary" data-action="api-compress" ${apiBusy?'disabled':''}>${apiBusy?'⏳ 압축 중…':'⚡ 스튜디오에서 바로 압축'}</button><button class="cuns-btn" data-action="switch-manual">수동으로 전환</button></div>${apiStatus?`<div class="${apiStatusError?'cuns-warning':'cuns-muted'}" style="margin-top:8px">${esc(apiStatus)}</div>`:''}`:`<div class="cuns-muted">API 키 없이 ChatGPT·Gemini·Claude 웹사이트에서 압축한 결과를 붙여넣어요.</div>`}
<div class="cuns-muted" style="margin-top:8px">⚠️ API 자동 압축 결과는 AI가 생성하므로 규칙·인물·변수를 직접 검토한 뒤 적용해 주세요.</div></div>
<div class="cuns-card"><b>🔒 중요 설정 보호 잠금</b><div class="cuns-muted">잠근 구역은 압축 적용 시 그대로 유지해야 해요. 구역을 눌러 잠금/해제하세요.</div>${segmentText(base()).map((x,i)=>`<button class="cuns-lock ${protectedBlocks.includes(x.text)?'locked':''}" data-protect="${i}">${protectedBlocks.includes(x.text)?'🔒':'🔓'} ${esc(x.name)} · ${x.text.length}자</button>`).join('')}<div class="cuns-grid"><button class="cuns-btn" data-action="split-overflow">✂️ 초과 내용 분할·복사</button></div></div></section><section class="cuns-ai-pane" data-pane-section="edit" style="${aiPane==='edit'?'':'display:none'}"><div class="cuns-card"><b>① 압축할 내용 선택</b><div class="cuns-source">
<label><input type="radio" name="cuns-source" value="note" ${aiSource==='note'?'checked':''}>전체 유저노트</label>
<label><input type="radio" name="cuns-source" value="part" ${aiSource==='part'?'checked':''}>일부분 선택</label>
<label><input type="radio" name="cuns-source" value="manual" ${aiSource==='manual'?'checked':''}>새 내용 직접 입력</label></div>
${aiSource==='part'?`<div class="cuns-muted">아래 현재 노트에서 원하는 글자를 손가락으로 선택한 뒤 <b>선택 영역 지정</b>을 눌러줘. 선택한 부분만 압축하고, 나머지는 유지해요.</div>
<textarea id="cuns-part-full" class="cuns-input cuns-area" style="min-height:190px;cursor:text;user-select:text;-webkit-user-select:text" spellcheck="false">${esc(base())}</textarea>
<div class="cuns-grid"><button class="cuns-btn primary" data-action="select-part">✂️ 선택 영역 지정</button><button class="cuns-btn primary" data-action="editor-open-part">📱 터치로 선택</button><button class="cuns-btn" data-action="clear-part">선택 초기화</button></div>
<div class="cuns-muted" style="margin-top:8px">${partSelection?'선택됨: '+partSelection.text.length.toLocaleString()+'자':'아직 선택한 부분이 없어요.'}</div>`:''}
${aiSource!=='part'?`<div class="cuns-row" style="margin-top:10px"><b class="cuns-grow">${aiSource==='note'?'현재 유저노트 (자동 불러오기)':'새로 입력할 내용'}</b><span class="cuns-count" id="cuns-source-count">${src.length.toLocaleString()}자</span></div>
<textarea id="cuns-ai-input" class="cuns-input cuns-area" style="min-height:180px" placeholder="새로운 내용을 입력하거나 붙여넣으세요" ${aiSource==='manual'?'':'readonly'}>${esc(src)}</textarea>
<div class="cuns-muted" style="margin-top:6px">${aiSource==='manual'?'새 내용은 자동 보관돼요. 현재 노트는 변경되지 않아요.':'현재 유저노트를 자동으로 읽었어요. 이 칸은 원본 보호를 위해 읽기 전용이에요.'}</div>`:`<div class="cuns-row" style="margin-top:10px"><b class="cuns-grow">압축할 선택 영역</b><span class="cuns-count">${src.length.toLocaleString()}자</span></div><div class="cuns-preview">${esc(src||'위에서 원문을 선택해 주세요.')}</div>`}
${aiSource==='manual'&&presets.length?`<div class="cuns-grid"><select id="cuns-preset-import" class="cuns-input" style="flex:1"><option value="">저장한 프리셋 불러오기 (선택)</option>${presets.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="cuns-btn" data-action="import-preset-text">불러오기</button></div>`:''}
${aiSource==='note'?'<button class="cuns-btn" style="margin-top:8px" data-action="copy-to-manual">전체 내용을 직접 입력으로 복사</button>':''}<div class="cuns-grid"><button class="cuns-btn" data-action="editor-open-${aiSource==='manual'?'manual':'note'}">📱 전체 화면 편집</button></div></div>
<div class="cuns-card"><b>② 초고밀도 압축</b>
<div class="cuns-card" style="background:#1b1129;margin-top:10px"><b>⚡ 초고밀도 혼합 압축</b><div class="cuns-muted" style="margin-top:7px">목표 글자 수를 지정하거나 최대 압축을 선택할 수 있어요. 漢字·中文·｜·→ 등은 실제 글자 수 감소와 의미 정확성에 도움 될 때 활용해요. 크랙 전체 노트 제한은 2,000자예요.</div></div>
<div class="cuns-row" style="margin-top:10px"><label>🎯 목표 글자 수</label><select id="cuns-target" class="cuns-input cuns-grow"><option value="max" ${targetCount==='max'?'selected':''}>최대한 짧게</option>${[300,500,1000,1500,2000].map(n=>`<option value="${n}" ${String(targetCount)===String(n)?'selected':''}>${n}자 이내</option>`).join('')}<option value="custom" ${targetCount==='custom'?'selected':''}>직접 입력</option></select><input id="cuns-custom-target" type="number" class="cuns-input" style="max-width:90px" min="1" max="2000" value="${esc(get('ai:target:number','1000'))}" placeholder="글자 수"></div><div class="cuns-grid"><button class="cuns-btn" data-action="preview-prompt">👀 요청문 미리보기</button><button class="cuns-btn primary" data-action="prompt">📋 요청문 복사</button><button class="cuns-btn" data-action="share-prompt">📲 공유 메뉴</button></div>
${aiPreview?`<div class="cuns-preview" style="margin-top:10px">${esc(promptText())}</div>`:''}
<div class="cuns-grid">${aiMode==='api'?`<button class="cuns-btn primary" data-action="api-compress" ${apiBusy?'disabled':''}>${apiBusy?'⏳ 압축 중…':'⚡ 바로 압축하고 결과 보기'}</button>`:''}<button class="cuns-btn" data-pane="result">결과 탭 열기</button></div><div class="cuns-muted" style="margin-top:9px">${aiMode==='api'?'API 오류 시에도 요청문을 복사해 수동으로 계속할 수 있어요.':'요청문을 복사해 원하는 AI 앱에 붙여넣으세요.'}</div></div>
</section><section class="cuns-ai-pane" data-pane-section="result" style="${aiPane==='result'?'':'display:none'}"><div class="cuns-card"><b>③ 압축 결과</b><textarea id="cuns-result" class="cuns-input cuns-area" style="min-height:190px" placeholder="자동 압축 결과 또는 외부 AI 답변을 여기에 붙여넣으세요">${esc(result)}</textarea><div class="cuns-count" id="cuns-compare">${comparisonHtml()}</div>
<div class="cuns-grid"><button class="cuns-btn" data-action="editor-open-result">📱 전체 화면 편집</button></div><div class="cuns-grid"><button class="cuns-btn primary" data-action="paste-result">📥 클립보드 붙여넣기</button><button class="cuns-btn" data-action="clear-result">결과 지우기</button></div>
<div class="cuns-grid"><button class="cuns-btn primary" data-action="save-as-preset">💾 새 프리셋으로 저장</button><button class="cuns-btn" data-action="replace">${aiSource==='part'?'✂️ 선택 부분만 교체':aiSource==='note'?'전체 노트 교체':'새 내용으로 전체 교체'}</button><button class="cuns-btn" data-action="append">원본 아래 추가</button><button class="cuns-btn" data-action="copy-result">결과 복사</button></div>
<div class="cuns-muted" style="margin-top:8px">적용 전 원본을 백업하고, 부분 교체 시 선택 부분 외의 내용은 유지해요. 새 프리셋 저장은 현재 노트를 변경하지 않아요.</div></div></section>`;
}
}
async function copy(v){try{await navigator.clipboard.writeText(v);alert('클립보드에 복사했어! 💜');return true}catch(e){const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;top:15%;left:5%;width:90%;z-index:2147483647;opacity:.02';document.body.appendChild(t);t.focus();t.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}t.remove();if(ok){alert('복사했어! 💜');return true}prompt('전체 선택해서 복사해줘',v);return false}}
function promptText(){const source=getAiSource();const target=targetCount==='custom'?Math.max(1,Math.min(2000,Number(get('ai:target:number','1000'))||1000)):targetCount;const targetRule=target==='max'?'고정 목표 글자 수 없음. 원문보다 실질적으로 짧게.':`공백·줄바꿈 포함 ${target}자 이내로 압축. 의미 보존을 우선하며 불가능하면 누락 없이 알려줄 것.`;const locks=protectedBlocks.filter(x=>source.includes(x));return `[크랙 RP 유저노트 초고밀도 압축]
압축 대상: ${aiSource==='note'?'전체 유저노트':aiSource==='part'?'유저노트 중 사용자가 선택한 일부':'사용자가 새로 입력한 내용'}.
목표: ${targetRule} 모든 핵심 정보와 금지·조건·예외·주체를 보존하는 범위에서 최대한 고밀도로 압축.
[압축 방식: ⚡ 초고밀도 혼합 / 필수]
- 긴 문장을 핵심 지시어·조건·금지어로 재구성. 예: 질문으로 끝내지 말 것→질문종결禁, 캐릭터가 스스로 판단·행동·진행→캐릭터 자율판단·행동·진행.
- ｜·→·+·/·禁·必·無·未·停滞 등 구분자·漢字를 적극 검토. 中文 혼용도 더 짧고 의미가 정확할 때만 사용. 단순 한자 장식이나 길이가 같은 치환은 압축으로 간주하지 말 것.
- 중복 통합·조사 생략·구문 압축을 우선하고, 의미가 정확한 경우 짧은 한자 혼용. 원문이 이미 짧아도 불필요하게 풀어 쓰지 말 것.
- 원문의 인물·관계·날짜·숫자·고유명사·제목·상태창 항목·시간 순서·사건·조건·예외·부정·금지의 주체를 보존. 임의 사실 추가·추측 금지.
- 원문에 실제 등장하는 {user}, {char}, {{user}}, {{char}}, ⓤ, ⓒ, PC, NPC 및 중괄호 변수는 한 글자도 삭제·치환·변형하지 말 것. 원문에 없는 변수 추가 금지.
- 단순 요약으로 핵심 규칙을 빼거나 성적·관계·서사적 조건의 강도를 바꾸지 말 것. 불가피한 경우 의미 정확성 우선.
- 원문과 압축본의 실제 글자 수를 내부 비교하고 원문보다 길어지면 재압축. 최종 답변에는 압축 본문만 출력.
[보호 잠금: 다음 내용은 한 글자도 변경·삭제하지 말 것]
${locks.join('\n\n')||'(없음)'}
[원문 시작]
${source}
[원문 끝]`}
function saveRequestSnapshot(){requestSnapshot={room:room(),mode:aiSource,source:getAiSource(),note:base(),part:aiSource==='part'?partSelection:null,at:Date.now()};put('ai:request:'+room(),requestSnapshot)}
function checkRequest(){if(!requestSnapshot||requestSnapshot.room!==room()||requestSnapshot.mode!==aiSource||requestSnapshot.source!==getAiSource())return '압축 요청 이후 원문/선택이 달라졌어요. 요청문을 다시 복사해 주세요.';return ''}

function verifyResult(v){const src=getAiSource();const found=src.match(/\{\{[^{}]+\}\}|\{[^{}]+\}|ⓤ|ⓒ/g)||[];const missing=[...new Set(found)].filter(t=>!v.includes(t));if(missing.length)return '원문 변수 누락: '+missing.join(', ');if(/(?:^|\n)-의 생각|장소에 없는 는/.test(v))return '주체가 빠진 문장이 있어요';return '';}
function handleClick(e){const b=e.target.closest('button');if(!b||!root)return;const a=b.dataset.action;
if(editorMode){
 const el=root.querySelector('#cuns-editor-text');const v=el?.value??editorText;editorText=v;
 const segs=segmentText(v);
 if(b.dataset.seg!==undefined){
  const seg=segs[Number(b.dataset.seg)];if(!seg)return;
  if(editorStart==='pick'){editorRange=[seg.start,seg.start];editorCursor=seg.start;editorStart='set';editorRangeLocked=false;editorSelection(seg.start,seg.start);}
  else if(editorEnd==='pick'){const start=editorRange[0];editorEnd='set';editorSelection(Math.min(start,seg.end),Math.max(start,seg.end));}
  else editorSelection(seg.start,seg.end);
  return;
 }
 if(a==='editor-start-mode'){editorStart='pick';editorEnd=null;return alert('시작할 문단을 눌러줘.');}
 if(a==='editor-end-mode'){editorEnd='pick';return alert('끝낼 문단을 눌러줘.');}
 if(a==='editor-start-here'){editorStart='set';editorEnd=null;editorRange=[editorCursor,editorCursor];editorRangeLocked=false;editorLabel();return;}
 if(a==='editor-end-here'){editorEnd='set';const st=Math.min(editorRange[0],editorCursor),en=Math.max(editorRange[0],editorCursor);editorSelection(st,en);return;}
 if(a==='editor-cancel'){closeEditor(false);return;}
 if(a==='editor-save'||a==='editor-use-selection'&&editorMode==='part'){
  if(editorMode==='part'){
   const [st,en]=editorRange;if(st===en)return alert('선택할 부분을 먼저 지정해 줘!');
   const full=base();if(full!==editorOriginal)return alert('원본이 변경됐어요. 다시 열어 주세요.');
   partSelection={start:st,end:en,text:full.slice(st,en),note:full,room:room()};put('ai:part:'+room(),partSelection);editorMode='';aiPane='edit';render();return;
  }
  closeEditor(true);return;
 }
 if(a==='editor-left'||a==='editor-right'){const pos=Math.max(0,Math.min(v.length,editorCursor+(a==='editor-left'?-1:1)));editorSelection(pos,pos);return;}
 if(a==='editor-select-all'){editorSelection(0,v.length);return;}
 if(a==='editor-select-line'){const pos=editorCursor,st=v.lastIndexOf('\n',Math.max(0,pos-1))+1,x=v.indexOf('\n',pos);editorSelection(st,x<0?v.length:x);return;}
 if(a==='editor-copy'||a==='editor-use-selection'){const [st,en]=editorRange;if(st===en)return alert('먼저 구역이나 문장을 선택해 줘!');copy(v.slice(st,en));return;}
 if(a==='editor-cut'){const [st,en]=editorRange;if(st===en)return alert('잘라낼 부분을 먼저 선택해 줘!');copy(v.slice(st,en));editorReplace(st,en,'');return;}
 if(a==='editor-paste'){if(!navigator.clipboard?.readText)return alert('클립보드 읽기 권한이 없어요. 입력창을 길게 눌러 붙여넣어 줘.');const [st,en]=editorRange;navigator.clipboard.readText().then(t=>editorReplace(st,en,t)).catch(()=>alert('클립보드 권한이 없어요. 길게 눌러 붙여넣어 줘.'));return;}
 if(a==='editor-undo'){const last=editorUndo.pop();if(last){el.value=last.text;editorText=last.text;editorSelection(...last.range);}else alert('이 편집 화면에서 되돌릴 내용이 없어요.');return;}
 return;
}
if(a?.startsWith('editor-open-')){openEditor(a.slice('editor-open-'.length));return;}
if(b.dataset.history){const d=get(historyKey(),[]).find(x=>x.id===b.dataset.history);if(d&&confirm('현재 노트를 백업하고 이 버전으로 복원할까요?')){saveHistory('복원 직전',base());setBase(d.text);}return;}
if(b.dataset.protect!==undefined){const blocks=segmentText(base());const block=blocks[Number(b.dataset.protect)];if(block)updateProtected(block.text);return;}
if(a==='protect-all'){updateProtected(base());return;}
if(a==='split-overflow'){const chunks=splitText(base());if(chunks.length<2)return alert('현재 유저노트는 2,000자 이내예요.');const i=Number(prompt(`총 ${chunks.length}개로 나눴어. 복사할 번호를 입력해 줘 (1~${chunks.length})`,'1'));if(i>=1&&i<=chunks.length)copy(chunks[i-1]);return;}
if(b.dataset.pane){aiPane=b.dataset.pane;render();return}if(b.dataset.tab){tab=b.dataset.tab;render();return}if(a==='close'){close();return}
if(a==='check-update'){checkStudioUpdate();return}if(a==='open-install'){window.open(STUDIO_URL,'_blank','noopener');return}if(a==='toggle-key'){const el=root.querySelector('#cuns-api-key');if(el){el.type=el.type==='password'?'text':'password';b.textContent=el.type==='password'?'보기':'숨기기'}return}
if(a==='switch-manual'){aiMode='manual';put('ai:mode',aiMode);apiStatus='';render();return}
if(a==='api-compress'){compressWithApi();return}
if(a==='refresh-models'){refreshModels();return}
if(a==='add'){const name=root.querySelector('#cuns-name').value.trim(),text=root.querySelector('#cuns-text').value.trim();if(!name||!text)return alert('제목과 내용을 모두 입력해줘!');presets.push({id:uid(),name,text});put('presets',presets);render();return}if(b.dataset.edit){const p=presets.find(x=>x.id===b.dataset.edit);if(!p)return;const name=prompt('프리셋 제목',p.name);if(name===null)return;const text=prompt('프리셋 내용',p.text);if(text===null)return;p.name=name.trim();p.text=text;put('presets',presets);if(selected.has(p.id))apply();else render();return}if(b.dataset.delete){if(!confirm('이 프리셋을 삭제할까?'))return;const id=b.dataset.delete;if(selected.has(id)){selected.delete(id);apply()}presets=presets.filter(x=>x.id!==id);put('presets',presets);render();return}if(a==='snapshot'){backup();render();return}if(b.dataset.load||b.dataset.loadAuto){const d=b.dataset.loadAuto?get('auto:'+room(),null):get('draft:'+room(),[]).find(x=>x.id===b.dataset.load);if(d&&confirm('현재 노트를 백업한 뒤 선택한 버전으로 교체할까?')){const err=protectCheck(base(),d.text);if(err)return alert(err);backup();setBase(d.text)}return}if(a==='export'){copy(JSON.stringify({type:'cuns-neon-presets',version:1,presets},null,2));return}if(a==='import'){const raw=prompt('다른 기기에서 복사한 백업 JSON을 붙여넣어줘');if(!raw)return;try{const data=JSON.parse(raw);if(data.type!=='cuns-neon-presets'||!Array.isArray(data.presets))throw Error('형식 오류');const valid=data.presets.filter(x=>x&&typeof x.name==='string'&&typeof x.text==='string').map(x=>({id:uid(),name:x.name,text:x.text}));presets.push(...valid);put('presets',presets);render();alert(valid.length+'개 프리셋을 가져왔어!')}catch(e){alert('백업 형식을 확인해줘')}}if(a==='preview-prompt'){aiPreview=!aiPreview;render();return}if(a==='select-part'){const el=root.querySelector('#cuns-part-full');if(!el)return;const live=[el.selectionStart,el.selectionEnd];const [start,end]=live[0]!==live[1]?live:(pcPartRange||live);const full=base();if(start===end||start<0||end>full.length)return alert('현재 노트에서 압축할 글자를 길게 눌러 선택해 줘!');partSelection={start,end,text:full.slice(start,end),note:full,room:room()};put('ai:part:'+room(),partSelection);aiPreview=false;render();return}
if(a==='clear-part'){pcPartRange=null;partSelection=null;put('ai:part:'+room(),null);render();return}
if(a==='import-preset-text'){const id=root.querySelector('#cuns-preset-import')?.value;const p=presets.find(x=>x.id===id);if(!p)return alert('프리셋을 선택해 줘!');aiInput=p.text;put('ai:input',aiInput);render();return}
if(a==='copy-to-manual'){aiInput=getAiSource();put('ai:input',aiInput);aiSource='manual';put('ai:source',aiSource);render();return}if(a==='prompt'){if(!getAiSource().trim())return alert('압축할 원문을 먼저 선택하거나 입력해 줘!');saveRequestSnapshot();copy(promptText());return}if(a==='share-prompt'){if(!getAiSource().trim())return alert('압축할 원문을 먼저 선택하거나 입력해 줘!');saveRequestSnapshot();const msg=promptText();if(navigator.share){navigator.share({text:msg,title:'유저노트 ChatGPT 압축 요청'}).catch(err=>{if(err?.name!=='AbortError')copy(msg)})}else copy(msg);return}if(a==='paste-result'){if(!navigator.clipboard?.readText){alert('STAY에서 클립보드 읽기를 지원하지 않아요. 아래 결과 칸을 길게 눌러 붙여넣어 주세요.');return}navigator.clipboard.readText().then(v=>{if(!v.trim())return alert('클립보드가 비어 있어요.');result=v.trim();put('ai:result',result);render()}).catch(()=>alert('클립보드 읽기 권한이 차단됐어요. 결과 칸을 길게 눌러 붙여넣어 주세요.'));return}if(a==='clear-result'){if(confirm('임시 보관한 압축 결과를 지울까요?')){result='';put('ai:result','');render()}return}if(a==='open-chatgpt'){window.open('https://chatgpt.com/','_blank');return}if(a==='copy-result'){copy(result);return}if(a==='save-as-preset'){result=root.querySelector('#cuns-result')?.value.trim()||'';if(!result)return alert('압축 결과를 먼저 붙여넣어 줘!');const stale=checkRequest();if(stale)return alert('⚠️ '+stale);const issue=verifyResult(result);if(issue)return alert('⚠️ '+issue+'\n원문과 비교 후 다시 압축해 줘.');const name=prompt('새 프리셋 이름을 입력해 줘','압축 유저노트');if(!name?.trim())return;presets.push({id:uid(),name:name.trim(),text:result});put('presets',presets);alert('새 프리셋으로 저장했어! 💜');render();return}if(a==='replace'||a==='append'){
result=root.querySelector('#cuns-result')?.value.trim()||'';if(!result)return alert('압축 결과를 붙여넣어줘');
const stale=checkRequest();if(stale)return alert('⚠️ '+stale);
const issue=verifyResult(result);if(issue)return alert('⚠️ '+issue+'\n원문과 비교해 다시 압축해 주세요.');
const current=base();let next='';
if(a==='append')next=[current.trimEnd(),result].filter(Boolean).join('\n\n');
else if(aiSource==='part'){
 const p=requestSnapshot.part;
 if(!p||p.room!==room()||current!==p.note||current.slice(p.start,p.end)!==p.text)return alert('⚠️ 선택 이후 현재 유저노트가 변경됐어요. 원문을 다시 선택해 주세요.');
 next=current.slice(0,p.start)+result+current.slice(p.end);
}else if(aiSource==='note'){
 if(current!==requestSnapshot.note)return alert('⚠️ 압축 요청 후 원본 노트가 변경됐어요. 새 요청을 만들어 주세요.');
 next=result;
}else next=result;
const lockError=protectCheck(current,next);if(lockError)return alert(lockError);
 if(next.length>LIMIT)return alert('⚠️ 적용하면 '+next.length+'자로 크랙 2,000자 제한을 초과해요. 먼저 더 압축해 주세요.');
if(!confirm('현재 노트를 백업하고 '+(a==='append'?'내용을 추가':aiSource==='part'?'선택한 부분만 교체':'노트 전체를 교체')+'할까요?\n적용 후 크랙의 수정/등록 버튼을 눌러야 저장돼요.'))return;
backup();setBase(next);alert('입력창에 반영했어! 💜 크랙의 수정/등록 버튼을 눌러 최종 저장해 줘.');return}}

function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0)?1:-1;}return 0;}
async function checkStudioUpdate(){
 if(updateBusy)return;updateBusy=true;updateStatus='GitHub의 실제 배포 파일을 확인하고 있어요…';render();
 try{
  const url=STUDIO_URL+'?cuns_check='+Date.now();
  let content='';
  if(typeof GM_xmlhttpRequest==='function'){
   content=await new Promise((resolve,reject)=>GM_xmlhttpRequest({method:'GET',url,timeout:20000,onload:r=>r.status>=200&&r.status<300?resolve(r.responseText):reject(new Error('HTTP '+r.status)),onerror:()=>reject(new Error('네트워크 요청 실패')),ontimeout:()=>reject(new Error('시간 초과'))}));
  }else{const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);content=await r.text();}
  const latest=content.match(/^\/\/\s*@version\s+([^\s]+)/m)?.[1];
  if(!latest||!content.includes('==UserScript=='))throw new Error('GitHub 파일에서 유효한 버전을 찾지 못했어요.');
  const diff=compareVersions(latest,STUDIO_VERSION);
  updateStatus=diff>0?`GitHub v${latest} / 설치 실행 v${STUDIO_VERSION}. STAY·템퍼몽키의 업데이트 메뉴에서 설치 후 크랙 페이지를 새로고침하세요. 그대로라면 설치 주소 열기로 직접 재설치하세요.`:diff===0?`GitHub와 현재 실행 버전이 모두 v${STUDIO_VERSION}예요. 정상입니다!`:`GitHub v${latest}가 현재 실행 버전 v${STUDIO_VERSION}보다 이전이에요. GitHub 배포 파일을 갱신해야 해요.`;
 }catch(e){updateStatus='버전 확인 실패: '+e.message+'. 네트워크 또는 스크립트 관리자 권한을 확인해 주세요.';}
 finally{updateBusy=false;render();}
}
function attach(d){document.getElementById('cuns-mobile-launch')?.remove();protectedBlocks=get('protect:'+room(),[]);if(!Array.isArray(protectedBlocks))protectedBlocks=[];dialog=d;ta=d.querySelector('textarea:not(#cuns-result)');if(!ta)return;original=ta.value;applied='';selected.clear();const launchBtn=document.createElement('button');launchBtn.id='cuns-launch';launchBtn.type='button';launchBtn.textContent='💜 스튜디오';launchBtn.onclick=launch;const title=[...d.querySelectorAll('h1,h2,h3,div,span,p')].find(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()==='유저노트'));if(title)title.insertAdjacentElement('afterend',launchBtn);else ta.insertAdjacentElement('beforebegin',launchBtn);ta.addEventListener('input',autosave);
 const mb=document.createElement('button');mb.id='cuns-mobile-launch';mb.type='button';mb.textContent='💜 스튜디오';mb.onclick=launch;document.body.appendChild(mb);
}
function tick(){const d=find();if(!d)document.getElementById('cuns-mobile-launch')?.remove();if(d!==dialog){close();dialog=null;ta=null;applied='';selected.clear();if(d)attach(d)}else if(d&&!d.querySelector('#cuns-launch')){dialog=null;tick()}}
const obs=new MutationObserver(()=>{if(!document.getElementById('cuns-overlay'))tick()});obs.observe(document.documentElement,{childList:true,subtree:true});setInterval(tick,1800);document.addEventListener('pointerdown',e=>{
 if(!editorMode||!root?.contains(e.target))return;
 const b=e.target.closest('button');if(b?.closest('.cuns-editor-foot') && e.pointerType!=='mouse')e.preventDefault();
},true);
// PC: retain native mouse selection in the partial-note source textarea.
function rememberPartRange(e){if(e.target?.id!=='cuns-part-full')return;const el=e.target;if(el.selectionEnd>el.selectionStart)pcPartRange=[el.selectionStart,el.selectionEnd];}
document.addEventListener('mouseup',rememberPartRange,true);
document.addEventListener('keyup',rememberPartRange,true);
document.addEventListener('select',rememberPartRange,true);
document.addEventListener('beforeinput',e=>{if(e.target?.id==='cuns-part-full')e.preventDefault()},true);
document.addEventListener('paste',e=>{if(e.target?.id==='cuns-part-full')e.preventDefault()},true);
document.addEventListener('drop',e=>{if(e.target?.id==='cuns-part-full')e.preventDefault()},true);
document.addEventListener('click',e=>{if(e.target.closest('#cuns-sheet'))handleClick(e)});
document.addEventListener('select',e=>{if(e.target.id==='cuns-editor-text')editorRemember();},true);
document.addEventListener('keyup',e=>{if(e.target.id==='cuns-editor-text')editorRemember();},true);
document.addEventListener('pointerup',e=>{if(e.target.id==='cuns-editor-text')editorRemember();},true);document.addEventListener('change',e=>{if(e.target.id==='cuns-target'){targetCount=e.target.value;put('ai:target:custom',targetCount);return;}if(e.target.matches('input[name="cuns-mode"]')){aiMode=e.target.value;put('ai:mode',aiMode);apiStatus='';render();return}
if(e.target.id==='cuns-model-select'){aiModel=e.target.value;put('ai:model:'+aiProvider,aiModel);const input=root?.querySelector('#cuns-model');if(input)input.value=aiModel;return}
if(e.target.id==='cuns-provider'){aiProvider=e.target.value;put('ai:provider',aiProvider);aiModel=get('ai:model:'+aiProvider,defaultModels[aiProvider]);apiKey='';apiStatus='';render();return}
if(e.target.matches('input[name="cuns-source"]')){pcPartRange=null;aiSource=e.target.value;put('ai:source',aiSource);aiPreview=false;render();return}if(e.target.matches('[data-toggle]')){const id=e.target.dataset.toggle;if(e.target.checked)selected.add(id);else selected.delete(id);apply()}});document.addEventListener('input',e=>{if(e.target.id==='cuns-custom-target'){put('ai:target:number',e.target.value);return;}if(e.target.id==='cuns-editor-text'){editorText=e.target.value;editorRangeLocked=false;editorRemember();return;}if(e.target.id==='cuns-api-key'){apiKey=e.target.value;return}if(e.target.id==='cuns-model'){aiModel=e.target.value;put('ai:model:'+aiProvider,aiModel);return}if(e.target.id==='cuns-ai-input'&&aiSource==='manual'){aiInput=e.target.value;put('ai:input',aiInput);const c=root?.querySelector('#cuns-source-count');if(c)c.textContent=aiInput.length.toLocaleString()+'자';return}if(e.target.id==='cuns-result'){result=e.target.value;put('ai:result',result);const c=document.querySelector('#cuns-result-count');if(c)c.textContent=result.length;updateComparison()}});document.addEventListener('focusin',e=>{if(!root||!e.target.closest('#cuns-sheet'))return;setTimeout(()=>{syncViewport();if(e.target.id!=='cuns-editor-text'&&!e.target.closest('.cuns-editor-foot'))e.target.scrollIntoView({block:'nearest',behavior:'instant'});},280)});window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);if(ta?.value.trim())put('auto:'+room(),{at:Date.now(),text:base()})});tick();
})();
