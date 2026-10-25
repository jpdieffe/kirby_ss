import { applyMask } from './protocol.js';

export const ENGINE = 'EmulatorJS-4.2.3-snes9x';
export const ROM_URL = './roms/kirby-super-star.zip';
// Capture only the emulator's Web Audio output; no microphone or screen permission.
const audioTaps = new Map();
let patched = false;
function installAudioTap() {
  if (patched || !window.AudioNode) return;
  patched = true;
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    const result = connect.call(this, destination, ...args);
    if (destination === this.context.destination) {
      try {
        let tap = audioTaps.get(this.context);
        if (!tap) {
          tap = this.context.createMediaStreamDestination();
          audioTaps.set(this.context, tap);
        }
        connect.call(this, tap, args[0] || 0, 0);
      } catch (error) { console.warn('Audio stream capture unavailable', error); }
    }
    return result;
  };
}
export class Game {
  constructor() { this.ready = false; this.masks = [0, 0]; this.startPromise = null; this.stream = null; }
  start() {
    if (this.startPromise) return this.startPromise;
    installAudioTap();
    this.startPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('The emulator took too long to start. Reload and try again.')), 90000);
      Object.assign(window, {
        EJS_player:'#emulator', EJS_core:'snes9x', EJS_gameUrl:ROM_URL,
        EJS_pathtodata:'./vendor/emulator/', EJS_gameName:'Kirby Super Star (USA)',
        EJS_gameID:19960321, EJS_startOnLoaded:true, EJS_threads:false,
        EJS_language:'en-US', EJS_disableAutoLang:false, EJS_noAutoFocus:false,
        EJS_color:'#ff9cbe', EJS_backgroundColor:'#121321', EJS_volume:.8,
        EJS_disableDatabases:true, EJS_disableLocalStorage:true,
        EJS_defaultControls:{0:{},1:{},2:{},3:{}}, EJS_VirtualGamepadSettings:[],
        EJS_Buttons:{playPause:false,restart:false,mute:false,settings:false,fullscreen:false,saveState:false,loadState:false,screenRecord:false,gamepad:false,cheat:false,volume:false,saveSavFiles:false,loadSavFiles:false,quickSave:false,quickLoad:false,screenshot:false,cacheManager:false,exitEmulation:false},
        EJS_onGameStart:() => {
          clearTimeout(timeout);
          this.emulator = window.EJS_emulator;
          this.manager = this.emulator.gameManager;
          this.manager.functions.setKeyboardEnabled(0);
          this.ready = true;
          resolve();
        },
      });
      const script = document.createElement('script');
      script.src = './vendor/emulator/loader.js';
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Could not load the emulator. Reload to try again.')); };
      document.head.append(script);
    });
    return this.startPromise;
  }
  input(player, mask) {
    if (!this.ready) return;
    this.masks[player] = applyMask(this.masks[player], mask, (button, value) => this.manager.simulateInput(player, button, value));
  }
  release() { this.input(0, 0); this.input(1, 0); }
  async resumeAudio() { await Promise.allSettled([...audioTaps.keys()].map(context => context.resume())); }
  setMuted(muted) { if (this.ready) this.emulator.setVolume(muted ? 0 : .8); }
  pause(value) { if (this.ready) { this.release(); this.manager.toggleMainLoop(value ? 0 : 1); } }
  capture() {
    if (this.stream?.getVideoTracks()[0]?.readyState === 'live') return this.stream;
    const canvas = this.emulator?.canvas;
    if (!canvas?.captureStream) throw new Error('This browser cannot stream the game. Try hosting in a current Chrome or Safari browser.');
    this.stream = canvas.captureStream(60);
    for (const tap of audioTaps.values()) for (const track of tap.stream.getAudioTracks()) this.stream.addTrack(track.clone());
    this.stream.getVideoTracks().forEach(track => { track.contentHint = 'motion'; });
    return this.stream;
  }
  stopCapture() { this.stream?.getTracks().forEach(track => track.stop()); this.stream = null; }
  save() { if (!this.ready) throw new Error('Start the game before saving a checkpoint.'); return this.manager.getState(); }
  load(data) {
    if (!this.ready) throw new Error('Start the game before loading a checkpoint.');
    const bytes = new Uint8Array(data);
    if (bytes.length < 32 || bytes.length > 8 * 1024 * 1024 || new TextDecoder().decode(bytes.subarray(0,7)) !== 'RASTATE') throw new Error('The checkpoint data is not a valid emulator state.');
    this.release(); this.manager.loadState(bytes);
  }
}
