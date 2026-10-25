import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoomCode, parseRoomCode, validInput, applyMask, InputSources, gamepadMask } from '../site/protocol.js';

test('room invitations round trip without confusing letters or malformed paths',() => {
  const code = newRoomCode();
  assert.equal(code.length,10);
  assert.equal(parseRoomCode(`https://jpdieffe.github.io/kirby_ss/#room=${code}`),code);
  assert.equal(parseRoomCode(code.slice(0,5).toLowerCase()+'-'+code.slice(5)),code);
  for (const invalid of ['','javascript:alert(1)','../../abcd','ABCDEFGHIJ','https://example.com/#not-a-room','123']) assert.equal(parseRoomCode(invalid),null);
});
test('network input accepts only bounded SNES button masks and sequence numbers',() => {
  assert.equal(validInput({type:'input',seq:0,mask:4095}),true);
  for (const change of [{mask:4096},{mask:-1},{mask:1.2},{mask:'4'},{seq:-1},{seq:NaN},{seq:Infinity},{type:'state'}]) assert.equal(validInput({type:'input',seq:1,mask:0,...change}),false);
  assert.equal(validInput(null),false);
});
test('input transitions release held buttons and only emit changes',() => {
  const events=[];
  assert.equal(applyMask(1<<4,1<<8,(...args)=>events.push(args)),1<<8);
  assert.deepEqual(events,[[4,0],[8,1]]);
  assert.equal(applyMask(0,0,()=>assert.fail()),0);
});
test('releasing one input source does not cancel another held source',() => {
  const changes=[]; const inputs=new InputSources(mask=>changes.push(mask));
  inputs.set('keyboard',1); inputs.set('touch',1); inputs.set('keyboard',0);
  assert.equal(inputs.mask,1);
  inputs.set('pad',16); inputs.set('touch',0); inputs.clear();
  assert.deepEqual(changes,[1,17,16,0]);
});
test('gamepads map physical bottom/right buttons to SNES B/A and support diagonal movement',() => {
  const buttons=Array.from({length:16},()=>({pressed:false})); buttons[0].pressed=true;buttons[1].pressed=true;
  assert.equal(gamepadMask({mapping:'standard',buttons,axes:[-1,1]}),(1<<0)|(1<<8)|(1<<6)|(1<<5));
  assert.equal(gamepadMask(null),0);
  assert.equal(gamepadMask({mapping:''}),0);
});
