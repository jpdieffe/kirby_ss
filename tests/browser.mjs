import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from '../scripts/serve.mjs';

const server = createServer(4174);
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-unsafe-swiftshader']});
const errors=[];
await mkdir('test-results',{recursive:true});
try {
  const context = await browser.newContext({viewport:{width:1365,height:900}});
  const page = await context.newPage();
  page.on('pageerror',e => {errors.push(e.message);console.log('PAGE ERROR',e.stack);});
  page.on('requestfailed',r => console.log('REQUEST FAILED',r.url(),r.failure()?.errorText));
  page.on('response',r => {if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
  page.on('console',m => {if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,500));});
  await page.goto('http://127.0.0.1:4174/');
  await page.screenshot({path:'test-results/lobby-desktop.png',fullPage:true});
  await page.locator('#solo-button').click();
  await page.waitForFunction(()=>window.EJS_emulator?.started,{},{timeout:95000});
  console.log('Emulator started');
  await page.waitForTimeout(3000);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2000);
  await page.screenshot({path:'test-results/game-desktop.png',fullPage:true});
  const info = await page.evaluate(() => ({width:window.EJS_emulator.canvas.width,height:window.EJS_emulator.canvas.height,saveBytes:window.EJS_emulator.gameManager.getState().length}));
  assert(info.width>0 && info.saveBytes>0); console.log('Game canvas and save',info);
  await page.locator('#levels-button').click();
  await page.getByRole('button',{name:'Play Spring Breeze',exact:true}).click();
  await page.waitForTimeout(400);
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(300);await page.keyboard.up('ArrowRight');
  await page.screenshot({path:'test-results/green-greens-playing.png',fullPage:true});
  console.log('Built-in Spring Breeze state loaded; gameplay input exercised');
  await page.locator('#levels-button').click();
  await page.locator('#checkpoint-name').fill('Test checkpoint');
  await page.locator('#save-checkpoint').click();
  await page.getByRole('button',{name:'Play Test checkpoint',exact:true}).waitFor();
  await page.getByRole('button',{name:'Play Test checkpoint',exact:true}).click();
  assert.equal(await page.locator('#levels-dialog').evaluate(d=>d.open),false);
  console.log('Checkpoint saved and restored');
  for(const level of ['The Great Cave Offensive','Adventure select']) {
    await page.locator('#levels-button').click();
    await page.getByRole('button',{name:`Play ${level}`,exact:true}).click();
    await page.waitForTimeout(500);
  }
  console.log('All bundled level states restored');
  await page.setViewportSize({width:844,height:390});
  await page.screenshot({path:'test-results/game-mobile-landscape.png',fullPage:true});
  const overflow = await page.evaluate(()=>({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,innerWidth,innerHeight}));
  assert(overflow.width<=overflow.innerWidth); assert(overflow.height<=overflow.innerHeight);
  console.log('Landscape layout fits',overflow);
  await page.locator('#leave-button').click();
  await page.waitForURL('http://127.0.0.1:4174/');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/lobby-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed');
} finally { await browser.close(); server.close(); }
