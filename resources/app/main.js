const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const routeTest=process.argv.find(arg=>arg.startsWith('--route-test='));
const selfTest = process.argv.includes('--self-test')||Boolean(routeTest);
if (selfTest) app.setPath('userData', path.join(app.getPath('temp'), 'ears-desktop-self-test-' + process.pid));
app.setName('Ears Desktop');
let audioRouting;
app.whenReady().then(async () => {
  audioRouting=require('./app-audio')(app,ipcMain);
  await audioRouting.restore();
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents.getURL().startsWith('file://') && ['media','speaker-selection'].includes(permission));
  });
  const win = new BrowserWindow({width: 920, height: 900, minWidth: 740, minHeight: 700,
    icon: path.join(__dirname, 'ears128.png'), backgroundColor: '#10141e',
    titleBarStyle:'hidden',titleBarOverlay:{color:'#151a26',symbolColor:'#c4cddd',height:42},
    autoHideMenuBar:true,
    webPreferences: {preload: path.join(__dirname,'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false}});
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.loadFile(path.join(__dirname,'index.html'));
  let closing=false;
  win.on('close',e=>{if(closing)return;e.preventDefault();audioRouting.restore().then(()=>{closing=true;win.close();}).catch(err=>{require('electron').dialog.showErrorBox('Не удалось вернуть звук приложения',err.message);});});
  if (selfTest) win.webContents.once('did-finish-load', async () => {
    try {
      const result = await win.webContents.executeJavaScript(`(async()=>{
        const assert=(v,m)=>{if(!v)throw Error(m)};
        assert(document.querySelectorAll('.filterDot').length===11,'11 filter controls');
        assert(document.getElementById('startApp')&&window.appAudio,'application controls and preload');
        const applications=await window.appAudio.list();
        assert(Array.isArray(applications),'native audio session enumeration');
        const all=await window.appAudio.list(true);
        assert(all.length>=applications.length,'background processes included');
        assert(all.some(p=>p.name.toLowerCase()==='explorer.exe'),'Explorer available without audio');
        chrome.runtime.sendMessage({type:'modifyFilter',index:3,frequency:180,gain:6,q:2});
        assert(filters[3].gain.value===6,'filter edit');
        chrome.runtime.sendMessage({type:'savePreset',preset:'Test'});
        chrome.runtime.sendMessage({type:'resetFilters'});
        chrome.runtime.sendMessage({type:'preset',preset:'Test'});
        assert(filters[3].gain.value===6,'preset round trip');
        chrome.runtime.sendMessage({type:'importPresets',presets:{bad:{}}});
        assert(!presets.bad,'reject invalid preset');
        chrome.runtime.sendMessage({type:'resetFilters'});
        await context.resume();
        const osc=context.createOscillator();osc.frequency.value=1000;osc.connect(filters[0]);
        const previous=gain.gain.value;gain.gain.value=.001;osc.start();
        await new Promise(r=>setTimeout(r,300));
        const fft=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(fft);
        osc.stop();osc.disconnect();gain.gain.value=previous;
        assert(Math.max(...fft)>-90,'audio graph produces spectrum');
        return {passed:true,applications:applications.length,allProcesses:all.length,filters:filters.length,sampleRate:context.sampleRate,peak:Math.max(...fft)};
      })()`);
      // Exercise native mouse input after scrolling, including a zoomed window.
      async function dragControl(selector,dx,dy,modifiers=[],index=0){
       const point=await win.webContents.executeJavaScript(`(async()=>{
        document.getElementById('tab-1').click();
        document.getElementById('eqDiv').scrollIntoView({block:'center'});
        await new Promise(r=>setTimeout(r,120));
        const target=document.querySelectorAll(${JSON.stringify(selector)})[${index}],rect=target.getBoundingClientRect();
        return {x:rect.x+rect.width/2,y:rect.y+rect.height/2,scroll:window.scrollY};
       })()`);
       if(point.scroll<=0)throw Error('Drag regression must exercise scrolled page');
       const factor=win.webContents.getZoomFactor(),x=Math.round(point.x*factor),y=Math.round(point.y*factor);
       win.webContents.sendInputEvent({type:'mouseMove',x,y,modifiers});
       win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1,modifiers});
       for(let step=1;step<=5;step++){
        win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(x+dx*factor*step/5),y:Math.round(y+dy*factor*step/5),button:'left',modifiers});
        await new Promise(r=>setTimeout(r,20));
       }
       win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(x+dx*factor),y:Math.round(y+dy*factor),button:'left',clickCount:1,modifiers});
       await new Promise(r=>setTimeout(r,80));
      }
      result.dragChecks=[];
      for(const zoom of [1,1.25]){
       win.webContents.setZoomFactor(zoom);
       await win.webContents.executeJavaScript("chrome.runtime.sendMessage({type:'resetFilters'});if(!document.getElementById('vizButton').classList.contains('on'))document.getElementById('vizButton').click()");
       await dragControl('.filterDot',18,-30,[],3);
       const moved=await win.webContents.executeJavaScript('({gain:filters[3].gain.value,frequency:filters[3].frequency.value})');
       if(moved.gain<4||moved.frequency<=160)throw Error('Filter drag failed after scroll at zoom '+zoom);
       const previousQ=await win.webContents.executeJavaScript('filters[3].Q.value');
       await dragControl('.filterDot',0,20,['shift'],3);
       const nextQ=await win.webContents.executeJavaScript('filters[3].Q.value');
       if(nextQ<=previousQ)throw Error('Shift drag did not change Q at zoom '+zoom);
       await dragControl('.gainLine',0,30);
       const volume=await win.webContents.executeJavaScript('gain.gain.value');
       if(volume>=.9)throw Error('Volume drag failed after scroll at zoom '+zoom);
       result.dragChecks.push({zoom,filter:moved,q:nextQ,volume});
      }
      win.webContents.setZoomFactor(1);
      await win.webContents.executeJavaScript("chrome.runtime.sendMessage({type:'resetFilters'})");
      fs.writeFileSync(path.join(__dirname,'self-test-result.json'),JSON.stringify(result,null,2));
      if(routeTest){
       const pid=Number(routeTest.split('=')[1]);
       const audioResult=await win.webContents.executeJavaScript(`(async()=>{
        const select=document.getElementById('application');
        await document.getElementById('refreshApps').onclick();
        const option=document.createElement('option');option.value=${pid};option.textContent='Audio test';select.append(option);select.value=${pid};
        await document.getElementById('startApp').onclick();
        try{
         if(!stream)throw Error(document.getElementById('status').textContent);
         const message=document.getElementById('status').textContent;
         const rms=async()=>{await new Promise(r=>setTimeout(r,400));const values=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(values);return Math.sqrt(values.reduce((s,v)=>s+v*v,0)/values.length);};
         const previous=gain.gain.value;gain.gain.value=1;const before=await rms();gain.gain.value=.01;const after=await rms();gain.gain.value=previous;
         if(before<.00001)throw Error('No audio signal received: '+message);
         if(after/before>.2)throw Error('Gain did not change captured signal');
         return {passed:true,before,after,ratio:after/before,message};
        }finally{await document.getElementById('stopInput').onclick?.();document.getElementById('stopInput').click();await window.appAudio.stop();}
       })()`);
       fs.writeFileSync(path.join(__dirname,'route-test-result.json'),JSON.stringify(audioResult,null,2));
      }
      const shot=await win.webContents.capturePage();
      fs.writeFileSync(path.join(__dirname,'self-test.png'),shot.toPNG());
      app.exit(0);
    } catch(e) {await audioRouting.restore();fs.writeFileSync(path.join(__dirname,routeTest?'route-test-result.json':'self-test-result.json'),JSON.stringify({passed:false,error:e.message}));app.exit(1);}
  });
});
app.on('window-all-closed', () => app.quit());
