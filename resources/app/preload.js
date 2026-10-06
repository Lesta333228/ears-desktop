const {contextBridge, ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('appAudio', {
 list:showAll=>ipcRenderer.invoke('audio:list',Boolean(showAll)),
 start:pid=>ipcRenderer.invoke('audio:start',pid),
 stop:()=>ipcRenderer.invoke('audio:stop')
});
