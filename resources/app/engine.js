/* Desktop audio engine; original Ears popup communicates through this local adapter. */
const frequencies = [20,40,80,160,320,640,1280,2560,5120,10240,20480];
const context = new AudioContext({latencyHint:'interactive'});
const filters = frequencies.map((frequency,index) => {
  const node=context.createBiquadFilter();
  node.type=index===0?'lowshelf':index===10?'highshelf':'peaking';
  let saved; try {saved=JSON.parse(localStorage['filter'+index]||'null');} catch {}
  node.frequency.value=saved?.f||frequency; node.gain.value=saved?.g||0; node.Q.value=saved?.q||0.7071;
  return node;
});
const gain=context.createGain(), analyser=context.createAnalyser();
gain.gain.value=Number(localStorage.GAIN)||1; analyser.fftSize=8192;
filters.forEach((node,i)=>node.connect(filters[i+1]||gain));
gain.connect(analyser); analyser.connect(context.destination);
let listeners=[], stream=null, input=null, mediaSource, fileURL;
let presets; try {presets=JSON.parse(localStorage.PRESETS||'{}');} catch {presets={};}
presets=Object.assign(Object.create(null),presets);
function emit(message){listeners.forEach(fn=>fn(message,{},()=>{}));}
function refresh(){
 emit({type:'sendWorkspaceStatus',eqFilters:filters.map(n=>({frequency:n.frequency.value,gain:n.gain.value,q:n.Q.value,type:n.type})),gain:gain.gain.value,streams:stream?[{id:1,title:'Аудиовход ПК',favIconUrl:'ears16.png'}]:[]});
 emit({type:'sendSampleRate',Fs:context.sampleRate}); emit({type:'sendPresets',presets});
}
function persist(){filters.forEach((n,i)=>localStorage['filter'+i]=JSON.stringify({f:n.frequency.value,g:n.gain.value,q:n.Q.value}));localStorage.GAIN=gain.gain.value;localStorage.PRESETS=JSON.stringify(presets);}
function validPreset(p){return p&&['frequencies','gains','qs'].every(k=>Array.isArray(p[k])&&p[k].length===11&&p[k].every(Number.isFinite));}
function setFilter(i,f,g,q){const n=filters[i];if(!n)return;n.frequency.value=Math.max(5,Math.min(20000,context.sampleRate/2-1,f));n.gain.value=Math.max(-30,Math.min(30,g));n.Q.value=Math.max(.2,Math.min(11,q));}
function stop(){input?.disconnect(); input=null;stream?.getTracks().forEach(t=>t.stop());stream=null;refresh();}
function status(text){const element=document.getElementById('status');element.textContent=text;const bar=element.closest('.status-bar');if(bar)bar.dataset.state=/Переключение|Остановка обработки/.test(text)?'loading':/направлен в эквалайзер|обработка.*включена/i.test(text)?'active':/Error|не найден|не удалось|ошибка|некоррект|закрылось|на кабеле сейчас/i.test(text)?'error':'idle';}
window.chrome={runtime:{getManifest:()=>({version:'Desktop 1.0'}),getURL:p=>p,onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:(m,cb)=>{
 try {
 switch(m.type){
 case 'getFFT': {const data=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(data);cb?.({fft:Array.from(data)});return;}
 case 'modifyFilter':setFilter(m.index,m.frequency,m.gain,m.q);break;
 case 'modifyGain':gain.gain.value=Math.max(.00316,Math.min(10,m.gain));break;
 case 'resetFilter':setFilter(m.index,frequencies[m.index],0,.7071);break;
 case 'resetFilters':filters.forEach((n,i)=>setFilter(i,frequencies[i],0,.7071));gain.gain.value=1;refresh();break;
 case 'savePreset':presets[m.preset]={frequencies:filters.map(n=>n.frequency.value),gains:filters.map(n=>n.gain.value),qs:filters.map(n=>n.Q.value)};refresh();break;
 case 'deletePreset':delete presets[m.preset];refresh();break;
 case 'preset':{let p=presets[m.preset];if(m.preset==='bassBoost')p={frequencies:frequencies.map((f,i)=>i===0?340:f),gains:frequencies.map((_,i)=>i===0?5:0),qs:frequencies.map(()=>.7071)};if(validPreset(p)){filters.forEach((_,i)=>setFilter(i,p.frequencies[i],p.gains[i],p.qs[i]));refresh();}break;}
 case 'importPresets':{if(!m.presets||typeof m.presets!=='object'||Array.isArray(m.presets))throw Error('Неверный формат пресетов');const entries=Object.entries(m.presets);if(!entries.every(([name,p])=>name.trim()&&validPreset(p)))throw Error('В файле есть некорректные пресеты');entries.forEach(([name,p])=>presets[name]=p);refresh();status('Пресеты импортированы');break;}
 case 'exportPresets':{const url=URL.createObjectURL(new Blob([JSON.stringify(presets,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='EarsAudioToolkitPresets.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);break;}
 case 'disconnectTab':stop();break;
 case 'getFullRefresh':case 'getWorkspaceStatus':refresh();break;
 }
 persist();
 }catch(e){status(e.message);}
}}};
document.addEventListener('DOMContentLoaded',()=>{
 let applicationActive=false, switching=false, pendingApplication=false, stopRequested=false;
 const appSelect=document.getElementById('application');
 async function releaseApplication(){if(applicationActive){await window.appAudio.stop();applicationActive=false;}}
 document.getElementById('refreshApps').onclick=async()=>{try{
  const old=appSelect.value, oldName=appSelect.selectedOptions[0]?.dataset.name, apps=await window.appAudio.list(document.getElementById('allProcesses').checked);appSelect.replaceChildren();
  for(const item of apps){const option=document.createElement('option');option.value=item.pid;option.dataset.name=item.name;option.textContent=item.name+' — '+item.title;appSelect.append(option);}
  if([...appSelect.options].some(o=>o.value===old))appSelect.value=old;
  else {const same=[...appSelect.options].find(o=>o.dataset.name===oldName);if(same)appSelect.value=same.value;}
  status(apps.length?'Выберите приложение и нажмите «Включить для приложения».':'Нет приложений с окнами. Включите «Показать фоновые процессы» или запустите нужную программу.');
 }catch(e){status(e.message);}};
 document.getElementById('allProcesses').onchange=()=>document.getElementById('refreshApps').click();
 appSelect.onchange=()=>{stopRequested=false;return document.getElementById('startApp').onclick();};
 document.getElementById('startApp').onclick=async()=>{if(switching){pendingApplication=true;return;}switching=true;const selectedPid=Number(appSelect.value);status('Переключение звука приложения…');try{
  if(!appSelect.value)throw Error('Сначала выберите приложение.');
  await releaseApplication();stop();player.pause();
  const permission=await navigator.mediaDevices.getUserMedia({audio:true});permission.getTracks().forEach(t=>t.stop());
  await devices();const items=await navigator.mediaDevices.enumerateDevices();
  const cable=items.find(d=>d.kind==='audioinput'&&/CABLE Output/i.test(d.label));
  if(!cable)throw Error('Не найден CABLE Output. Установите VB-CABLE: vb-audio.com/Cable/');
  const chosen=items.find(d=>d.deviceId===document.getElementById('outputDevice').value&&d.kind==='audiooutput');
  const physical=chosen&&!/CABLE|VB-Audio/i.test(chosen.label)?chosen:items.find(d=>d.kind==='audiooutput'&&d.deviceId==='default'&&!/CABLE|VB-Audio/i.test(d.label))||items.find(d=>d.kind==='audiooutput'&&d.deviceId!=='communications'&&!/CABLE|VB-Audio/i.test(d.label));
  if(!physical)throw Error('Выберите физические наушники или динамики.');
  await context.setSinkId(physical.deviceId);document.getElementById('outputDevice').value=physical.deviceId;
  stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:cable.deviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  input=context.createMediaStreamSource(stream);input.connect(filters[0]);await context.resume();
  const selected=await window.appAudio.start(selectedPid);applicationActive=true;
  stream.getAudioTracks()[0].onended=async()=>{try{await releaseApplication();stop();status('Аудиокабель отключён. Обработка остановлена.');}catch(e){status(e.message);}};
  document.getElementById('inputDevice').value=cable.deviceId;refresh();
  status(selected.state==='routed'?'Звук '+selected.name+' направлен в эквалайзер. Выход: '+physical.label:selected.state==='pending'?'Приложение '+selected.name+' пока играет на прежнем выходе. Остановите и возобновите воспроизведение; при фиксированном выходе выберите CABLE Input в настройках приложения.':'Выбран '+selected.name+'. Запустите воспроизведение: его звук будет направлен в эквалайзер.');
 }catch(e){try{await releaseApplication();}catch(restoreError){status(restoreError.message);return;}stop();status(e.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}finally{switching=false;if(stopRequested){stopRequested=false;pendingApplication=false;try{await releaseApplication();stop();status('Обработка остановлена');}catch(e){status(e.message);}}else if(pendingApplication){pendingApplication=false;document.getElementById('startApp').click();}}};
 for(const id of ['audioFile','startInput','stopInput'])document.getElementById(id).addEventListener(id==='audioFile'?'change':'click',async e=>{
  if(!applicationActive&&!switching)return;
  e.stopImmediatePropagation();if(switching){if(id==='stopInput'){stopRequested=true;pendingApplication=false;status('Остановка обработки…');}return;}
  try{await releaseApplication();stop();status('Обработка приложения остановлена. Теперь можно выбрать другой источник.');}catch(err){status(err.message);}
 },true);
 document.getElementById('outputDevice').addEventListener('change',e=>{if(applicationActive&&/CABLE|VB-Audio/i.test(e.target.selectedOptions[0]?.textContent)){e.stopImmediatePropagation();status('Для выхода выберите физические наушники или динамики.');}},true);
 const player=document.getElementById('player');
 mediaSource=context.createMediaElementSource(player);mediaSource.connect(filters[0]);
 player.addEventListener('play',()=>context.resume());
 document.getElementById('audioFile').onchange=async e=>{try {const f=e.target.files[0];if(!f)return;stop();player.pause();if(fileURL)URL.revokeObjectURL(fileURL);fileURL=URL.createObjectURL(f);player.src=fileURL;await context.resume();await player.play();status('Файл: '+f.name);}catch(err){status(err.message);}};
 player.onerror=()=>status('Этот формат аудио не поддерживается. Попробуйте MP3, WAV, OGG или FLAC.');
 async function devices(){try{const items=await navigator.mediaDevices.enumerateDevices();for(const [id,kind] of [['inputDevice','audioinput'],['outputDevice','audiooutput']]){const select=document.getElementById(id),old=select.value;select.replaceChildren();items.filter(d=>d.kind===kind).forEach((d,i)=>{const o=document.createElement('option');o.value=d.deviceId;o.textContent=d.label||('Устройство '+(i+1));select.append(o);});if([...select.options].some(o=>o.value===old))select.value=old;}}catch(e){status(e.message);}}
 document.getElementById('devices').onclick=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop());await devices();status('Список устройств обновлён');}catch(e){status(e.message);}};
 document.getElementById('outputDevice').onchange=async e=>{try{await context.setSinkId(e.target.value);status('Выход выбран');}catch(err){status('Не удалось выбрать выход: '+err.message);}};
 document.getElementById('startInput').onclick=async()=>{try{stop();player.pause();const deviceId=document.getElementById('inputDevice').value;if(!deviceId)throw Error('Сначала обновите список и выберите аудиовход');stream=await navigator.mediaDevices.getUserMedia({audio:{deviceId:{exact:deviceId},echoCancellation:false,noiseSuppression:false,autoGainControl:false}});input=context.createMediaStreamSource(stream);input.connect(filters[0]);stream.getAudioTracks()[0].onended=()=>{stop();status('Аудиовход отключён');};await context.resume();refresh();status('Обработка аудиовхода включена');}catch(e){stop();status(e.message);}};
 document.getElementById('stopInput').onclick=()=>{stop();status('Обработка остановлена');};
 const importer=document.getElementById('importPresetsFile');importer.onchange=async()=>{try{if(importer.files[0])chrome.runtime.sendMessage({type:'importPresets',presets:JSON.parse(await importer.files[0].text())});}catch(e){status('Не удалось прочитать JSON: '+e.message);}importer.value='';};
 devices().then(()=>document.getElementById('refreshApps').click()); refresh();
});
