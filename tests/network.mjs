import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../scripts/serve.mjs';

const server=createServer(4175);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
await mkdir('test-results',{recursive:true});
try {
  const hostContext=await browser.newContext({viewport:{width:1100,height:850}});
  const guestContext=await browser.newContext({viewport:{width:844,height:390}});
  const host=await hostContext.newPage(); const guest=await guestContext.newPage();
  const errors=[];
  for(const [name,page] of [['host',host],['guest',guest]]) {
    page.on('pageerror',e=>{errors.push(e.message);console.log(name,'ERROR',e.stack);});
    page.on('requestfailed',r=>console.log(name,'FAILED',r.url(),r.failure()?.errorText));
    page.on('console',m=>{if(m.type()==='error')console.log(name,'CONSOLE',m.text().slice(0,300));});
  }
  await host.goto('http://127.0.0.1:4175/');
  await host.locator('#host-button').click();
  await host.waitForFunction(()=>window.EJS_emulator?.started,{},{timeout:95000});
  const code=(await host.locator('#room-label').textContent()).replace('ROOM ','').replace('-','');
  console.log('Room created',code);
  await host.evaluate(()=>{
    window.receivedInputs=[];
    const manager=window.EJS_emulator.gameManager;const original=manager.simulateInput.bind(manager);
    manager.simulateInput=(...args)=>{window.receivedInputs.push(args);return original(...args);};
  });
  await guest.goto(`http://127.0.0.1:4175/#room=${code}`);
  await guest.locator('#join-button').click();
  await guest.waitForFunction(()=>document.querySelector('#remote-video').videoWidth>0,{},{timeout:95000});
  await guest.locator('#resume-video').click();
  const media=await guest.evaluate(()=>{const video=document.querySelector('#remote-video');return{width:video.videoWidth,height:video.videoHeight,audio:video.srcObject.getAudioTracks().length,video:video.srcObject.getVideoTracks().length,muted:video.muted};});
  assert(media.width>0 && media.audio===1 && media.video===1 && !media.muted);
  console.log('Guest received live video and audio',media);
  await guest.waitForFunction(()=>{
    const video=document.querySelector('#remote-video');
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=48;
    const context=canvas.getContext('2d');context.drawImage(video,0,0,64,48);
    const pixels=context.getImageData(0,0,64,48).data;
    return pixels.some((value,index)=>index%4!==3 && value>60);
  },{},{timeout:20000});
  console.log('Guest video contains visible game pixels');
  const audioLevel=await guest.evaluate(async()=>{
    const context=new AudioContext();await context.resume();
    const source=context.createMediaStreamSource(document.querySelector('#remote-video').srcObject);
    const analyser=context.createAnalyser();source.connect(analyser);
    const samples=new Float32Array(analyser.fftSize);let peak=0;
    for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,100));analyser.getFloatTimeDomainData(samples);peak=Math.max(peak,...samples.map(Math.abs));}
    source.disconnect();await context.close();return peak;
  });
  assert(audioLevel>.001);console.log('Guest receives non-silent game audio',audioLevel);
  await host.screenshot({path:'test-results/network-host.png',fullPage:true});
  await guest.keyboard.down('KeyZ');
  await host.waitForFunction(()=>window.receivedInputs.some(([p,b,v])=>p===1&&b===0&&v===1));
  await guest.keyboard.up('KeyZ');
  await host.waitForFunction(()=>window.receivedInputs.some(([p,b,v])=>p===1&&b===0&&v===0));
  console.log('Player two input press/release reached host controller port 2');
  await guest.screenshot({path:'test-results/guest-stream.png',fullPage:true});
  const third=await browser.newPage();
  await third.goto(`http://127.0.0.1:4175/#room=${code}`); await third.locator('#join-button').click();
  await third.waitForFunction(()=>document.querySelector('#status').textContent.includes('already has two'),{},{timeout:30000});
  console.log('Third player rejected'); await third.close();
  await guest.keyboard.down('KeyS');
  await host.waitForFunction(()=>window.receivedInputs.some(([p,b,v])=>p===1&&b===1&&v===1));
  await guest.close();
  await host.waitForFunction(()=>window.receivedInputs.some(([p,b,v])=>p===1&&b===1&&v===0));
  console.log('Disconnect releases remote buttons');
  const guest2=await guestContext.newPage(); await guest2.goto(`http://127.0.0.1:4175/#room=${code}`); await guest2.locator('#join-button').click();
  await guest2.waitForFunction(()=>document.querySelector('#remote-video').videoWidth>0,{},{timeout:45000});
  console.log('Guest can rejoin the existing room');
  assert.deepEqual(errors,[]);
  console.log('Real WebRTC browser checks passed');
} finally { await browser.close(); server.close(); }
