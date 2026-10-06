const {execFile}=require('child_process');
const {promisify}=require('util');
const fs=require('fs');
const path=require('path');
const run=promisify(execFile);
module.exports=function(app,ipcMain){
 const exe=path.join(__dirname,'tools','svcl.exe');
 const journal=path.join(app.getPath('userData'),'audio-route.json');
 let active=null;
 const command=(...args)=>run(exe,args,{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
 async function snapshot(){const {stdout}=await run(exe,['/SaveFileEncoding','2','/sjson',''],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024,encoding:'buffer'});const text=stdout.toString(stdout[0]===255&&stdout[1]===254?'utf16le':'utf8');return JSON.parse(text.replace(/^\uFEFF/,''));}
 function applications(rows){return rows.filter(r=>r.Type==='Application'&&r.Direction==='Render'&&Number(r['Process ID'])>0&&r['Process Path']&&!/Ears Desktop\.exe$/i.test(r['Process Path']));}
 async function processes(){
  const script="[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false); @(Get-Process | Where-Object { $_.Id -gt 4 -and $_.ProcessName -ne 'Ears Desktop' } | ForEach-Object { [PSCustomObject]@{pid=$_.Id;name=($_.ProcessName+'.exe');title=$_.MainWindowTitle;window=($_.MainWindowHandle -ne 0)} }) | ConvertTo-Json -Compress";
  const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:15000,maxBuffer:4*1024*1024});
  const result=JSON.parse(stdout.replace(/^\uFEFF/,''));return Array.isArray(result)?result:[result];
 }
 async function restore(){
  if(!active&&fs.existsSync(journal))active=JSON.parse(fs.readFileSync(journal,'utf8'));
  if(!active)return;
  await command('/SetAppDefault',active.previous,'all',active.name);
  active=null;fs.rmSync(journal,{force:true});
 }
 let queue=Promise.resolve();
 function exclusive(fn){const next=queue.then(fn);queue=next.catch(()=>{});return next;}
 ipcMain.handle('audio:list',(_,showAll=false)=>exclusive(async()=>{
  const [rows,running]=await Promise.all([snapshot(),processes()]);const merged=new Map();
  for(const p of running.filter(p=>showAll||p.window))merged.set(p.name.toLowerCase(),{...p,title:p.title||p.name});
  for(const r of applications(rows)){const name=path.win32.basename(r['Process Path']),key=name.toLowerCase();const existing=merged.get(key);merged.set(key,{pid:Number(r['Process ID']),name,title:existing?.title||r['Window Title']||r.Name});}
  return [...merged.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }));
 ipcMain.handle('audio:stop',()=>exclusive(restore));
 ipcMain.handle('audio:start',(_,pid)=>exclusive(async()=>{
  await restore();const [rows,running]=await Promise.all([snapshot(),processes()]);
  const process=running.find(p=>p.pid===pid);
  if(!process)throw Error('Приложение закрылось. Обновите список.');
  const name=process.name;
  const sessions=applications(rows).filter(r=>path.win32.basename(r['Process Path']).toLowerCase()===name.toLowerCase());
  const target=sessions.find(r=>r['Device State']==='Active')||sessions.find(r=>Number(r['Process ID'])===pid)||sessions[0];
  const cable=rows.find(r=>r.Type==='Device'&&r.Direction==='Render'&&r['Device State']==='Active'&&r.Name==='CABLE Input');
  if(!cable)throw Error('Установите VB-CABLE с vb-audio.com/Cable/ и перезапустите программу.');
  const id=cable['Item ID'];
  if(cable.Default==='Render'||[cable.Default,cable['Default Multimedia'],cable['Default Communications']].some(Boolean))throw Error('Выберите физические динамики устройством Windows по умолчанию вместо CABLE Input.');
  const conflict=applications(rows).find(r=>path.win32.basename(r['Process Path']).toLowerCase()!==name.toLowerCase()&&r['Device State']==='Active'&&r['Item ID'].split('|')[0]===id);
  if(conflict)throw Error('На кабеле сейчас воспроизводит звук '+conflict.Name+'. Остановите его воспроизведение или выберите другой выход для него в микшере Windows.');
  const previousDevice=target&&rows.find(r=>r.Type==='Device'&&r.Direction==='Render'&&target['Item ID'].includes(r['Item ID']));
  const previous=previousDevice&&previousDevice['Item ID']!==id?previousDevice['Item ID']:'DefaultRenderDevice';
  active={name,previous};fs.writeFileSync(journal,JSON.stringify(active));
  try{
   await command('/SetAppDefault',id,'all',name);
   let state='waiting';
   for(let attempt=0;attempt<8;attempt++){
    const current=applications(await snapshot()).filter(r=>path.win32.basename(r['Process Path']).toLowerCase()===name.toLowerCase()&&r['Device State']==='Active');
    if(current.some(r=>r['Item ID'].split('|')[0]===id)){state='routed';break;}
    if(current.length)state='pending';
    await new Promise(resolve=>setTimeout(resolve,250));
   }
   return {name,state};
  }catch(e){await restore();throw e;}
 }));
 return {restore};
};
