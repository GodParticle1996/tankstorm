import { contextBridge } from "electron";

// Expose a minimal API to the renderer
contextBridge.exposeInMainWorld("tankstorm", {
  version: "1.0.0",
  platform: process.platform,
});
