const { contextBridge, ipcRenderer } = require('electron');

const SEND = ['save', 'ignore', 'layout', 'ready', 'drag-start', 'drag-end', 'fall', 'walk', 'stop-walk',
  'settings', 'menu-state', 'popup', 'notify', 'tray-icon', 'hide', 'quit'];
const ON = ['tick', 'menu', 'landed', 'thrown', 'falling', 'bump', 'walk-end', 'shown', 'flung'];

contextBridge.exposeInMainWorld('api', {
  send: (ch, d) => { if (SEND.includes(ch)) ipcRenderer.send(ch, d); },
  invoke: (ch, d) => (ch === 'load' ? ipcRenderer.invoke(ch, d) : Promise.reject(new Error('blocked'))),
  on: (ch, fn) => { if (ON.includes(ch)) ipcRenderer.on(ch, (e, d) => fn(d)); },
});
