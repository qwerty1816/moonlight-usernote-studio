// ==UserScript==
// @name         Crack Usernote Studio 💜 Neon Purple (iPhone)
// @namespace    usernote-studio-neon-original
// @version      0.5.2
// @description  STAY 프리셋, 임시저장, GPT/Gemini/Claude API 및 수동 압축 (GitHub 자동 업데이트 배포판)
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
// ==/UserScript==
(function(){
'use strict';
if(window.__cunsNeonStudioV052)return;window.__cunsNeonStudioV052=true;
const PREFIX='cuns-neon-v01:', LIMIT=2000;
const get=(k,d)=>{try{const v=GM_getValue(PREFIX+k);return v===undefined?d:v}catch(e){try{return JSON.parse(localStorage.getItem(PREFIX+k))??d}catch(_){return d}}};
const put=(k,v)=>{try{GM_setValue(PREFIX+k,v)}catch(e){localStorage.setItem(PREFIX+k,JSON.stringify(v))}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const room=()=>location.pathname.match(/\/c(?:hat)?\/([^/?#]+)/)?.[1]||location.pathname;
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
let dialog=null,ta=null,root=null,tab='presets',result=get('ai:result',''),source='',selected=new Set(),original='',applied='',draftTimer=0;let aiTarget=get('ai:target','2000'),aiLevel=get('ai:level','medium');
let aiSource=get('ai:source','note');if(!['note','part','manual'].includes(aiSource))aiSource='note';
let aiInput=get('ai:input',''),aiPreview=false;
let partSelection=get('ai:part:'+room(),null);
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
 result=out.trim();put('ai:result',result);apiStatus='압축 완료! 결과를 검토한 뒤 적용해 주세요.';apiStatusError=false;
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
function backup(){const key='draft:'+room(),arr=get(key,[]);const v=base();if(!v.trim())return;arr.unshift({id:uid(),at:Date.now(),text:v});put(key,arr.slice(0,12))}
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
`;document.head.appendChild(style);
function find(){return [...document.querySelectorAll('[role="dialog"]')].find(d=>d.querySelector('textarea:not(#cuns-result)')&&/유저노트/.test(d.textContent||''))||null}
function launch(){if(root)return;if(!aiMode){aiMode='manual';put('ai:mode',aiMode);tab='ai';}root=document.createElement('div');root.id='cuns-overlay';root.innerHTML='<div id="cuns-sheet"></div>';(dialog||document.body).appendChild(root);root.addEventListener('click',e=>{if(e.target===root)close()});root.addEventListener('pointerdown',e=>e.stopPropagation());root.addEventListener('touchstart',e=>e.stopPropagation(),{passive:true});root.addEventListener('touchmove',e=>e.stopPropagation(),{passive:true});render();syncViewport()}
function close(){root?.remove();root=null;document.documentElement.style.removeProperty('--cuns-keyboard-height')}
function syncViewport(){if(!root)return;const sheet=root.querySelector('#cuns-sheet');if(!sheet)return;const vp=window.visualViewport;const h=vp?vp.height:window.innerHeight;const offset=vp?vp.offsetTop:0;root.style.top=offset+'px';root.style.height=h+'px';root.style.bottom='auto';sheet.style.maxHeight=Math.max(220,h-10)+'px';sheet.style.height=Math.max(220,h-10)+'px'}
window.visualViewport?.addEventListener('resize',syncViewport);window.visualViewport?.addEventListener('scroll',syncViewport);
function comparisonHtml(){const before=getAiSource().length,after=result.length,diff=before-after;const pct=before?Math.round(diff/before*1000)/10:0;const state=!before?'압축 원문을 먼저 선택하세요':!result?'결과를 붙여넣으면 절약량을 계산해요':diff>0?`💜 ${diff.toLocaleString()}자 절약 (${pct}%)`:diff===0?'원문과 글자 수 동일':`⚠️ 원문보다 ${(-diff).toLocaleString()}자 증가`;
return `원문 <b>${before.toLocaleString()}자</b> → 결과 <b id="cuns-result-count">${after.toLocaleString()}자</b><div style="margin-top:6px;color:${diff<0&&result?'#ffb3c7':'#d9b4ff'}">${state}</div>`;}
function updateComparison(){const el=root?.querySelector('#cuns-compare');if(el)el.innerHTML=comparisonHtml();}
function render(){if(!root)return;syncViewport();const sheet=root.querySelector('#cuns-sheet');const n=ta?.value.length||0;const pct=Math.min(100,n/LIMIT*100);sheet.innerHTML=`<div class="cuns-head"><div><div class="cuns-title">✦ USERNOTE STUDIO 💜</div><div class="cuns-sub">NEON PURPLE · iPhone STAY</div></div><button class="cuns-close" data-action="close">✕</button></div><div class="cuns-card"><div class="cuns-row"><b class="cuns-grow">유저노트 사용량</b><span class="cuns-count">${n.toLocaleString()} / ${LIMIT.toLocaleString()}</span></div><div class="cuns-bar"><i style="width:${pct}%"></i></div><div class="cuns-muted" style="margin-top:7px">${n>LIMIT?'⚠️ 제한 초과 '+(n-LIMIT)+'자':'남은 공간 '+(LIMIT-n)+'자'} · 선택 프리셋 ${selected.size}개</div></div><div class="cuns-tabs"><button data-tab="presets" class="${tab==='presets'?'on':''}">✦ 프리셋</button><button data-tab="drafts" class="${tab==='drafts'?'on':''}">◷ 임시저장</button><button data-tab="ai" class="${tab==='ai'?'on':''}">✧ AI 압축</button></div><div id="cuns-body"></div>`;
const body=sheet.querySelector('#cuns-body');if(tab==='presets'){body.innerHTML=`<div class="cuns-muted">선택한 프리셋은 노트 끝에 붙어요. 체크를 해제하면 제거돼요.</div><div id="cuns-list">${presets.length?presets.map(p=>`<div class="cuns-card"><div class="cuns-row"><input type="checkbox" data-toggle="${esc(p.id)}" ${selected.has(p.id)?'checked':''}><div class="cuns-grow"><b>${esc(p.name)}</b><div class="cuns-tag">${block(p).length}자</div></div><button class="cuns-btn" data-edit="${esc(p.id)}">편집</button><button class="cuns-btn danger" data-delete="${esc(p.id)}">삭제</button></div></div>`).join(''):'<div class="cuns-empty">아직 프리셋이 없어요 ✨</div>'}</div><div class="cuns-card"><b>＋ 새 프리셋</b><input class="cuns-input" id="cuns-name" placeholder="프리셋 제목 (예: 전개 규칙)"><textarea class="cuns-input cuns-area" id="cuns-text" placeholder="프리셋 내용을 입력하세요"></textarea><div class="cuns-grid"><button class="cuns-btn primary" data-action="add">프리셋 저장</button><button class="cuns-btn" data-action="export">백업 복사</button><button class="cuns-btn" data-action="import">백업 가져오기</button></div></div>`}
if(tab==='drafts'){const arr=get('draft:'+room(),[]);const auto=get('auto:'+room(),null);body.innerHTML=`<div class="cuns-grid"><button class="cuns-btn primary" data-action="snapshot">현재 노트 백업</button></div>${auto?`<div class="cuns-card"><b>최근 자동저장</b><div class="cuns-muted">${new Date(auto.at).toLocaleString('ko-KR')} · ${auto.text.length}자</div><div class="cuns-grid"><button class="cuns-btn" data-load-auto="1">복원</button></div></div>`:''}${arr.map(d=>`<div class="cuns-card"><b>백업 ${new Date(d.at).toLocaleString('ko-KR')}</b><div class="cuns-muted">${d.text.length}자 · ${esc(d.text.slice(0,45))}</div><div class="cuns-grid"><button class="cuns-btn" data-load="${esc(d.id)}">이 버전 복원</button></div></div>`).join('')||'<div class="cuns-empty">저장된 백업이 없어요</div>'}`}
if(tab==='ai'){
const src=getAiSource();
body.innerHTML=`<div class="cuns-card" style="border-color:#8b4fd0"><b>🌙 AI 압축 방식</b><div class="cuns-source"><label><input type="radio" name="cuns-mode" value="api" ${aiMode==='api'?'checked':''}>⚡ API 자동</label><label><input type="radio" name="cuns-mode" value="manual" ${aiMode==='manual'?'checked':''}>📋 무료 수동</label></div>
${aiMode==='api'?`<div class="cuns-muted">본인 API 키로 자동 압축해요. 사용료는 각자 제공업체 계정에 청구돼요.</div><select id="cuns-provider" class="cuns-input"><option value="openai" ${aiProvider==='openai'?'selected':''}>OpenAI · GPT</option><option value="gemini" ${aiProvider==='gemini'?'selected':''}>Google · Gemini</option><option value="claude" ${aiProvider==='claude'?'selected':''}>Anthropic · Claude</option></select><div class="cuns-row"><input id="cuns-api-key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" class="cuns-input cuns-grow" placeholder="내 API 키 입력 (저장 안 함)" value="${esc(apiKey)}"><button class="cuns-btn" data-action="toggle-key">보기</button></div><div class="cuns-muted" style="margin-top:6px">🔐 키는 저장하지 않지만 웹페이지·다른 스크립트가 접근할 위험은 있어요. 신뢰하는 환경에서만 개인 키를 사용하세요.</div>${modelSelectHtml()}<div class="cuns-grid"><button class="cuns-btn primary" data-action="api-compress" ${apiBusy?'disabled':''}>${apiBusy?'⏳ 압축 중…':'⚡ 스튜디오에서 바로 압축'}</button><button class="cuns-btn" data-action="switch-manual">수동으로 전환</button></div>${apiStatus?`<div class="${apiStatusError?'cuns-warning':'cuns-muted'}" style="margin-top:8px">${esc(apiStatus)}</div>`:''}`:`<div class="cuns-muted">API 키 없이 ChatGPT·Gemini·Claude 웹사이트에서 압축한 결과를 붙여넣어요.</div>`}
<div class="cuns-muted" style="margin-top:8px">⚠️ API 자동 압축 결과는 AI가 생성하므로 규칙·인물·변수를 직접 검토한 뒤 적용해 주세요.</div></div>
<div class="cuns-card"><b>① 압축할 내용 선택</b><div class="cuns-source">
<label><input type="radio" name="cuns-source" value="note" ${aiSource==='note'?'checked':''}>전체 유저노트</label>
<label><input type="radio" name="cuns-source" value="part" ${aiSource==='part'?'checked':''}>일부분 선택</label>
<label><input type="radio" name="cuns-source" value="manual" ${aiSource==='manual'?'checked':''}>새 내용 직접 입력</label></div>
${aiSource==='part'?`<div class="cuns-muted">아래 현재 노트에서 원하는 글자를 손가락으로 선택한 뒤 <b>선택 영역 지정</b>을 눌러줘. 선택한 부분만 압축하고, 나머지는 유지해요.</div>
<textarea id="cuns-part-full" class="cuns-input cuns-area" style="min-height:190px" readonly>${esc(base())}</textarea>
<div class="cuns-grid"><button class="cuns-btn primary" data-action="select-part">✂️ 선택 영역 지정</button><button class="cuns-btn" data-action="clear-part">선택 초기화</button></div>
<div class="cuns-muted" style="margin-top:8px">${partSelection?'선택됨: '+partSelection.text.length.toLocaleString()+'자':'아직 선택한 부분이 없어요.'}</div>`:''}
${aiSource!=='part'?`<div class="cuns-row" style="margin-top:10px"><b class="cuns-grow">${aiSource==='note'?'현재 유저노트 (자동 불러오기)':'새로 입력할 내용'}</b><span class="cuns-count" id="cuns-source-count">${src.length.toLocaleString()}자</span></div>
<textarea id="cuns-ai-input" class="cuns-input cuns-area" style="min-height:180px" placeholder="새로운 내용을 입력하거나 붙여넣으세요" ${aiSource==='manual'?'':'readonly'}>${esc(src)}</textarea>
<div class="cuns-muted" style="margin-top:6px">${aiSource==='manual'?'새 내용은 자동 보관돼요. 현재 노트는 변경되지 않아요.':'현재 유저노트를 자동으로 읽었어요. 이 칸은 원본 보호를 위해 읽기 전용이에요.'}</div>`:`<div class="cuns-row" style="margin-top:10px"><b class="cuns-grow">압축할 선택 영역</b><span class="cuns-count">${src.length.toLocaleString()}자</span></div><div class="cuns-preview">${esc(src||'위에서 원문을 선택해 주세요.')}</div>`}
${aiSource==='manual'&&presets.length?`<div class="cuns-grid"><select id="cuns-preset-import" class="cuns-input" style="flex:1"><option value="">저장한 프리셋 불러오기 (선택)</option>${presets.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="cuns-btn" data-action="import-preset-text">불러오기</button></div>`:''}
${aiSource==='note'?'<button class="cuns-btn" style="margin-top:8px" data-action="copy-to-manual">전체 내용을 직접 입력으로 복사</button>':''}</div>
<div class="cuns-card"><b>② 초고밀도 압축</b>
<div class="cuns-card" style="background:#1b1129;margin-top:10px"><b>⚡ 초고밀도 혼합 압축 · 고정</b><div class="cuns-muted" style="margin-top:7px">목표 글자 수 지정 없이 최대한 짧게. 漢字·中文·｜·→ 등은 실제 글자 수 감소와 의미 정확성에 도움 될 때 활용해요. 크랙 전체 노트 제한은 2,000자예요.</div></div>
<div class="cuns-grid"><button class="cuns-btn" data-action="preview-prompt">👀 요청문 미리보기</button><button class="cuns-btn primary" data-action="prompt">📋 요청문 복사</button><button class="cuns-btn" data-action="share-prompt">📲 공유 메뉴</button></div>
${aiPreview?`<div class="cuns-preview" style="margin-top:10px">${esc(promptText())}</div>`:''}
<div class="cuns-muted" style="margin-top:9px">${aiMode==='api'?'API 오류 시에도 요청문을 복사해 수동으로 계속할 수 있어요.':'요청문을 복사해 원하는 AI 앱에 붙여넣으세요.'}</div></div>
<div class="cuns-card"><b>③ 압축 결과</b><textarea id="cuns-result" class="cuns-input cuns-area" style="min-height:190px" placeholder="자동 압축 결과 또는 외부 AI 답변을 여기에 붙여넣으세요">${esc(result)}</textarea><div class="cuns-count" id="cuns-compare">${comparisonHtml()}</div>
<div class="cuns-grid"><button class="cuns-btn primary" data-action="paste-result">📥 클립보드 붙여넣기</button><button class="cuns-btn" data-action="clear-result">결과 지우기</button></div>
<div class="cuns-grid"><button class="cuns-btn primary" data-action="save-as-preset">💾 새 프리셋으로 저장</button><button class="cuns-btn" data-action="replace">${aiSource==='part'?'✂️ 선택 부분만 교체':aiSource==='note'?'전체 노트 교체':'새 내용으로 전체 교체'}</button><button class="cuns-btn" data-action="append">원본 아래 추가</button><button class="cuns-btn" data-action="copy-result">결과 복사</button></div>
<div class="cuns-muted" style="margin-top:8px">적용 전 원본을 백업하고, 부분 교체 시 선택 부분 외의 내용은 유지해요. 새 프리셋 저장은 현재 노트를 변경하지 않아요.</div></div>`;
}
}
async function copy(v){try{await navigator.clipboard.writeText(v);alert('클립보드에 복사했어! 💜');return true}catch(e){const t=document.createElement('textarea');t.value=v;t.style.cssText='position:fixed;top:15%;left:5%;width:90%;z-index:2147483647;opacity:.02';document.body.appendChild(t);t.focus();t.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}t.remove();if(ok){alert('복사했어! 💜');return true}prompt('전체 선택해서 복사해줘',v);return false}}
function promptText(){const source=getAiSource();return `[크랙 RP 유저노트 초고밀도 압축]
압축 대상: ${aiSource==='note'?'전체 유저노트':aiSource==='part'?'유저노트 중 사용자가 선택한 일부':'사용자가 새로 입력한 내용'}.
목표: 공백·줄바꿈 포함 원문보다 실질적으로 짧게. 고정 목표 글자 수 없음. 모든 핵심 정보와 금지·조건·예외·주체를 보존하는 범위에서 최대한 고밀도로 압축.
[압축 방식: ⚡ 초고밀도 혼합 / 필수]
- 긴 문장을 핵심 지시어·조건·금지어로 재구성. 예: 질문으로 끝내지 말 것→질문종결禁, 캐릭터가 스스로 판단·행동·진행→캐릭터 자율판단·행동·진행.
- ｜·→·+·/·禁·必·無·未·停滞 등 구분자·漢字를 적극 검토. 中文 혼용도 더 짧고 의미가 정확할 때만 사용. 단순 한자 장식이나 길이가 같은 치환은 압축으로 간주하지 말 것.
- 중복 통합·조사 생략·구문 압축을 우선하고, 의미가 정확한 경우 짧은 한자 혼용. 원문이 이미 짧아도 불필요하게 풀어 쓰지 말 것.
- 원문의 인물·관계·날짜·숫자·고유명사·제목·상태창 항목·시간 순서·사건·조건·예외·부정·금지의 주체를 보존. 임의 사실 추가·추측 금지.
- 원문에 실제 등장하는 {user}, {char}, {{user}}, {{char}}, ⓤ, ⓒ, PC, NPC 및 중괄호 변수는 한 글자도 삭제·치환·변형하지 말 것. 원문에 없는 변수 추가 금지.
- 단순 요약으로 핵심 규칙을 빼거나 성적·관계·서사적 조건의 강도를 바꾸지 말 것. 불가피한 경우 의미 정확성 우선.
- 원문과 압축본의 실제 글자 수를 내부 비교하고 원문보다 길어지면 재압축. 최종 답변에는 압축 본문만 출력.
[원문 시작]
${source}
[원문 끝]`}
function saveRequestSnapshot(){requestSnapshot={room:room(),mode:aiSource,source:getAiSource(),note:base(),part:aiSource==='part'?partSelection:null,at:Date.now()};put('ai:request:'+room(),requestSnapshot)}
function checkRequest(){if(!requestSnapshot||requestSnapshot.room!==room()||requestSnapshot.mode!==aiSource||requestSnapshot.source!==getAiSource())return '압축 요청 이후 원문/선택이 달라졌어요. 요청문을 다시 복사해 주세요.';return ''}

function verifyResult(v){const src=getAiSource();const found=src.match(/\{\{[^{}]+\}\}|\{[^{}]+\}|ⓤ|ⓒ/g)||[];const missing=[...new Set(found)].filter(t=>!v.includes(t));if(missing.length)return '원문 변수 누락: '+missing.join(', ');if(/(?:^|\n)-의 생각|장소에 없는 는/.test(v))return '주체가 빠진 문장이 있어요';return '';}
function handleClick(e){const b=e.target.closest('button');if(!b||!root)return;const a=b.dataset.action;if(b.dataset.tab){tab=b.dataset.tab;render();return}if(a==='close'){close();return}
if(a==='toggle-key'){const el=root.querySelector('#cuns-api-key');if(el){el.type=el.type==='password'?'text':'password';b.textContent=el.type==='password'?'보기':'숨기기'}return}
if(a==='switch-manual'){aiMode='manual';put('ai:mode',aiMode);apiStatus='';render();return}
if(a==='api-compress'){compressWithApi();return}
if(a==='refresh-models'){refreshModels();return}
if(a==='add'){const name=root.querySelector('#cuns-name').value.trim(),text=root.querySelector('#cuns-text').value.trim();if(!name||!text)return alert('제목과 내용을 모두 입력해줘!');presets.push({id:uid(),name,text});put('presets',presets);render();return}if(b.dataset.edit){const p=presets.find(x=>x.id===b.dataset.edit);if(!p)return;const name=prompt('프리셋 제목',p.name);if(name===null)return;const text=prompt('프리셋 내용',p.text);if(text===null)return;p.name=name.trim();p.text=text;put('presets',presets);if(selected.has(p.id))apply();else render();return}if(b.dataset.delete){if(!confirm('이 프리셋을 삭제할까?'))return;const id=b.dataset.delete;if(selected.has(id)){selected.delete(id);apply()}presets=presets.filter(x=>x.id!==id);put('presets',presets);render();return}if(a==='snapshot'){backup();render();return}if(b.dataset.load||b.dataset.loadAuto){const d=b.dataset.loadAuto?get('auto:'+room(),null):get('draft:'+room(),[]).find(x=>x.id===b.dataset.load);if(d&&confirm('현재 노트를 백업한 뒤 선택한 버전으로 교체할까?')){backup();setBase(d.text)}return}if(a==='export'){copy(JSON.stringify({type:'cuns-neon-presets',version:1,presets},null,2));return}if(a==='import'){const raw=prompt('다른 기기에서 복사한 백업 JSON을 붙여넣어줘');if(!raw)return;try{const data=JSON.parse(raw);if(data.type!=='cuns-neon-presets'||!Array.isArray(data.presets))throw Error('형식 오류');const valid=data.presets.filter(x=>x&&typeof x.name==='string'&&typeof x.text==='string').map(x=>({id:uid(),name:x.name,text:x.text}));presets.push(...valid);put('presets',presets);render();alert(valid.length+'개 프리셋을 가져왔어!')}catch(e){alert('백업 형식을 확인해줘')}}if(a==='preview-prompt'){aiPreview=!aiPreview;render();return}if(a==='select-part'){const el=root.querySelector('#cuns-part-full');if(!el)return;const start=el.selectionStart,end=el.selectionEnd;const full=base();if(start===end||start<0||end>full.length)return alert('현재 노트에서 압축할 글자를 길게 눌러 선택해 줘!');partSelection={start,end,text:full.slice(start,end),note:full,room:room()};put('ai:part:'+room(),partSelection);aiPreview=false;render();return}
if(a==='clear-part'){partSelection=null;put('ai:part:'+room(),null);render();return}
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
if(next.length>LIMIT)return alert('⚠️ 적용하면 '+next.length+'자로 크랙 2,000자 제한을 초과해요. 먼저 더 압축해 주세요.');
if(!confirm('현재 노트를 백업하고 '+(a==='append'?'내용을 추가':aiSource==='part'?'선택한 부분만 교체':'노트 전체를 교체')+'할까요?\n적용 후 크랙의 수정/등록 버튼을 눌러야 저장돼요.'))return;
backup();setBase(next);alert('입력창에 반영했어! 💜 크랙의 수정/등록 버튼을 눌러 최종 저장해 줘.');return}}

function attach(d){dialog=d;ta=d.querySelector('textarea:not(#cuns-result)');if(!ta)return;original=ta.value;applied='';selected.clear();const launchBtn=document.createElement('button');launchBtn.id='cuns-launch';launchBtn.type='button';launchBtn.textContent='💜 스튜디오';launchBtn.onclick=launch;const title=[...d.querySelectorAll('h1,h2,h3,div,span,p')].find(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()==='유저노트'));if(title)title.insertAdjacentElement('afterend',launchBtn);else ta.insertAdjacentElement('beforebegin',launchBtn);ta.addEventListener('input',autosave);}
function tick(){const d=find();if(d!==dialog){close();dialog=null;ta=null;applied='';selected.clear();if(d)attach(d)}else if(d&&!d.querySelector('#cuns-launch')){dialog=null;tick()}}
const obs=new MutationObserver(()=>{if(!document.getElementById('cuns-overlay'))tick()});obs.observe(document.documentElement,{childList:true,subtree:true});setInterval(tick,1800);document.addEventListener('click',e=>{if(e.target.closest('#cuns-sheet'))handleClick(e)});document.addEventListener('change',e=>{if(e.target.matches('input[name="cuns-mode"]')){aiMode=e.target.value;put('ai:mode',aiMode);apiStatus='';render();return}
if(e.target.id==='cuns-model-select'){aiModel=e.target.value;put('ai:model:'+aiProvider,aiModel);const input=root?.querySelector('#cuns-model');if(input)input.value=aiModel;return}
if(e.target.id==='cuns-provider'){aiProvider=e.target.value;put('ai:provider',aiProvider);aiModel=get('ai:model:'+aiProvider,defaultModels[aiProvider]);apiKey='';apiStatus='';render();return}
if(e.target.matches('input[name="cuns-source"]')){aiSource=e.target.value;put('ai:source',aiSource);aiPreview=false;render();return}if(e.target.matches('[data-toggle]')){const id=e.target.dataset.toggle;if(e.target.checked)selected.add(id);else selected.delete(id);apply()}});document.addEventListener('input',e=>{if(e.target.id==='cuns-api-key'){apiKey=e.target.value;return}if(e.target.id==='cuns-model'){aiModel=e.target.value;put('ai:model:'+aiProvider,aiModel);return}if(e.target.id==='cuns-ai-input'&&aiSource==='manual'){aiInput=e.target.value;put('ai:input',aiInput);const c=root?.querySelector('#cuns-source-count');if(c)c.textContent=aiInput.length.toLocaleString()+'자';return}if(e.target.id==='cuns-result'){result=e.target.value;put('ai:result',result);const c=document.querySelector('#cuns-result-count');if(c)c.textContent=result.length;updateComparison()}});document.addEventListener('focusin',e=>{if(!root||!e.target.closest('#cuns-sheet'))return;setTimeout(()=>{syncViewport();e.target.scrollIntoView({block:'center',behavior:'instant'});},280)});window.addEventListener('pagehide',()=>{clearTimeout(draftTimer);if(ta?.value.trim())put('auto:'+room(),{at:Date.now(),text:base()})});tick();
})();
