import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from '../scripts/serve.mjs';

const server = createServer(4177);
// Use normal autoplay restrictions, unlike the general emulator tests.
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader','--disable-features=PreloadMediaEngagementData,MediaEngagementBypassAutoplayPolicies']});
try {
  const hostContext = await browser.newContext({...devices['Pixel 5'],viewport:{width:851,height:393}});
  await hostContext.addInitScript(() => {
    window.holdHostAudio = true;
    window.hostAudioContexts = [];
    window.rtcConnections = [];
    window.RTCPeerConnection = new Proxy(RTCPeerConnection,{construct(target,args) {
      const connection = Reflect.construct(target,args); window.rtcConnections.push(connection); return connection;
    }});
    const resume = AudioContext.prototype.resume;
    const createDestination = AudioContext.prototype.createMediaStreamDestination;
    AudioContext.prototype.createMediaStreamDestination = function(...args) {
      const destination = createDestination.apply(this,args);
      window.hostAudioContexts.push(this);
      this.suspend();
      return destination;
    };
    // Reproduce a mobile browser leaving resume() pending until a later tap.
    AudioContext.prototype.resume = function() {
      if (window.holdHostAudio) return new Promise(() => {});
      return resume.call(this);
    };
  });
  const host = await hostContext.newPage();
  const errors = [];
  host.on('pageerror',error => errors.push(error.message));
  await host.goto('http://127.0.0.1:4177/');
  await host.locator('#host-button').tap();
  await host.waitForFunction(() => window.EJS_emulator?.started,{}, {timeout:95000});
  await host.waitForFunction(() => window.hostAudioContexts.some(context => context.state === 'suspended'));
  const code = (await host.locator('#room-label').textContent()).replace('ROOM ','');
  const guestContext = await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const guest = await guestContext.newPage();
  guest.on('pageerror',error => errors.push(error.message));
  await guest.goto(`http://127.0.0.1:4177/#room=${code}`);
  await guest.locator('#join-button').tap();
  try {
    await guest.waitForFunction(() => document.querySelector('#remote-video').srcObject?.getVideoTracks().length === 1,{}, {timeout:20000});
  } catch (error) {
    console.log('HOST',await host.evaluate(async () => ({
      status:document.querySelector('#status').textContent, hidden:document.hidden,
      frames:window.EJS_emulator.gameManager.functions.getFrameNum(), audio:window.hostAudioContexts.map(c => c.state),
      connections:await Promise.all(window.rtcConnections.map(async pc => ({state:pc.connectionState,stats:[...await pc.getStats()].map(([,s])=>s).filter(s=>s.type==='outbound-rtp').map(s=>({kind:s.kind,frames:s.framesEncoded,bytes:s.bytesSent}))}))),
    })));
    console.log('GUEST',await guest.evaluate(() => ({status:document.querySelector('#status').textContent,screen:document.querySelector('#screen-status').textContent,video:document.querySelector('#remote-video').videoWidth,tracks:document.querySelector('#remote-video').srcObject?.getTracks().map(t=>({kind:t.kind,muted:t.muted,state:t.readyState}))})));
    throw error;
  }
  console.log('PASS: mobile host establishes the media connection while its audio resume promise remains pending');
  await guest.waitForFunction(() => document.querySelector('#screen-status').textContent.includes('tap on the host'));
  await host.locator('#resume-audio').waitFor({state:'visible'});
  await host.evaluate(() => { window.holdHostAudio = false; });
  await host.locator('#resume-audio').tap();
  await host.waitForFunction(() => window.hostAudioContexts.every(context => context.state === 'running'));
  await host.locator('#resume-audio').waitFor({state:'hidden'});
  await guest.waitForFunction(() => document.querySelector('#remote-video').videoWidth > 0,{}, {timeout:20000});
  console.log('PASS: a host tap starts game video and audio without recreating the room');
  await guest.locator('#resume-video').tap();
  await guest.waitForFunction(() => {
    const video = document.querySelector('#remote-video');
    return !video.paused && !video.muted && video.srcObject.getAudioTracks().length === 1;
  });
  assert.deepEqual(errors,[]);
  console.log('Mobile host regression checks passed');
} finally { await browser.close(); server.close(); }
