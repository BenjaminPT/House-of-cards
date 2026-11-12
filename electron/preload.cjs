const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('hocDesktop', { platform: process.platform });
