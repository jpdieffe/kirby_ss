import { ENGINE, ROM_URL } from './emulator.js';
const MAX_BYTES = 8 * 1024 * 1024;
let database;
let hash;
export function romHash() {
  hash ||= fetch(ROM_URL).then(r => { if (!r.ok) throw new Error('Cannot verify the game file.'); return r.arrayBuffer(); })
    .then(buffer => crypto.subtle.digest('SHA-256',buffer))
    .then(buffer => Array.from(new Uint8Array(buffer), n => n.toString(16).padStart(2,'0')).join(''));
  return hash;
}
async function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('kirby-together-checkpoints', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('checkpoints', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Checkpoint storage is unavailable. Allow site storage in your browser.'));
  });
  return database;
}
async function transaction(mode, operation) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('checkpoints',mode);
    const request = operation(tx.objectStore('checkpoints'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(new Error('Could not save the checkpoint. Your browser storage may be full.'));
    tx.onabort = () => reject(new Error('Checkpoint storage was interrupted.'));
  });
}
export const listCheckpoints = () => transaction('readonly',store => store.getAll());
export const deleteCheckpoint = id => transaction('readwrite',store => store.delete(id));
export async function saveCheckpoint(name, data) {
  const checkpoint = {id:crypto.randomUUID(),name:name.trim().slice(0,64),engine:ENGINE,rom:await romHash(),created:Date.now(),data:new Uint8Array(data)};
  if (!checkpoint.name || !data?.byteLength || data.byteLength > MAX_BYTES) throw new Error('Invalid checkpoint.');
  await transaction('readwrite',store => store.put(checkpoint));
  return checkpoint;
}
export async function verifyCheckpoint(checkpoint) {
  if (checkpoint.engine !== ENGINE || checkpoint.rom !== await romHash()) throw new Error('This checkpoint is for a different ROM or emulator version.');
}
export function exportCheckpoint(checkpoint) {
  const bytes = new Uint8Array(checkpoint.data);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  const url = URL.createObjectURL(new Blob([JSON.stringify({format:'kirby-checkpoint-v1',name:checkpoint.name,engine:checkpoint.engine,rom:checkpoint.rom,data:btoa(binary)})],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = checkpoint.name.replace(/[^a-z0-9 -]/gi,'').slice(0,50) + '.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
export async function importCheckpoint(file) {
  if (!file || file.size > 12 * 1024 * 1024) throw new Error('Choose a checkpoint JSON file smaller than 12 MB.');
  let checkpoint;
  try { checkpoint = JSON.parse(await file.text()); } catch { throw new Error('That file is not a checkpoint JSON file.'); }
  if (checkpoint.format !== 'kirby-checkpoint-v1' || typeof checkpoint.name !== 'string' || typeof checkpoint.data !== 'string') throw new Error('That file is not a Kirby Together checkpoint.');
  await verifyCheckpoint(checkpoint);
  let binary;
  try { binary = atob(checkpoint.data); } catch { throw new Error('The checkpoint data is damaged.'); }
  if (!binary.length || binary.length > MAX_BYTES) throw new Error('Invalid checkpoint size.');
  return saveCheckpoint(checkpoint.name,Uint8Array.from(binary,c => c.charCodeAt(0)));
}
