import { Game } from './emulator.js';
import { Room } from './room.js';
import { parseRoomCode } from './protocol.js';
import { setupControls } from './controls.js';
import { levels, levelData } from './levels.js';
import { listCheckpoints, saveCheckpoint, deleteCheckpoint, exportCheckpoint, importCheckpoint, verifyCheckpoint } from './checkpoints.js';

const $ = selector => document.querySelector(selector);
const game = new Game();
let room = null;
let mode = 'lobby';
let networkSettings = {};
let muted = false;
let busy = false;
let wakeLock;
let remoteStream;
const controls = setupControls(mask => { if (mode === 'guest') room?.setInput(mask); else game.input(0,mask); });
function status(message, kind = '') { $('#status').textContent = message; $('#status').className = `status ${kind}`; }
function connection(message) { $('#connection').lastChild.textContent = ` ${message}`; }
function screenMessage(message, detail = '') { $('#screen-message').hidden = false; $('#screen-status').textContent = message; $('#screen-detail').textContent = detail; }
function error(error) { status(error.message || error,'error'); }
function guard(fn) { return (...args) => Promise.resolve().then(() => fn(...args)).catch(error); }
async function wake() {
  try { if (navigator.wakeLock && document.visibilityState === 'visible') wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}
function showPlayer() {
  document.body.classList.add('playing'); $('#lobby').hidden = true; $('#play-area').hidden = false;
  $('#player-label').textContent = mode === 'guest' ? 'PLAYER 2 · HELPER' : 'PLAYER 1 · KIRBY';
  $('#levels-button').hidden = mode === 'guest';
  $('#remote-video').hidden = mode !== 'guest'; $('#emulator').hidden = mode === 'guest';
  $('#sound-button').textContent = mode === 'guest' ? 'Enable sound' : 'Sound on';
  controls.enable(true); wake();
}
function busyLobby(value) {
  busy = value;
  for (const id of ['host-button','solo-button','join-button']) $(`#${id}`).disabled = value;
}
async function streamToGuest() {
  if (!game.ready || !room?.accepted || mode !== 'host') return;
  try { await game.resumeAudio(); room.stream(game.capture()); room.broadcast('Connected. Player two controls the helper.'); }
  catch (e) { error(e); room.broadcast(e.message); }
}
function makeRoom() {
  const instance = new Room({
    status: message => { if (room === instance) status(message); },
    error: message => { if (room === instance) { error(message); connection('Connection needs attention'); } },
    input: mask => { if (room === instance && mode === 'host') game.input(1,document.hidden || document.querySelector('dialog[open]') ? 0 : mask); },
    connected: () => {
      if (room !== instance) return;
      connection('Two players connected');
      status(mode === 'host' ? 'Your helper is here! Inhale an enemy, then press A to create a helper.' : 'Connected! Waiting for the host’s game stream…','success');
      if (mode === 'host') streamToGuest();
    },
    stream: stream => {
      if (room !== instance || mode !== 'guest') return;
      remoteStream = stream;
      const video = $('#remote-video'); video.srcObject = stream; video.muted = true;
      video.play().catch(() => { $('#resume-video').hidden = false; });
      video.onplaying = () => { $('#screen-message').hidden = true; };
      $('#resume-video').hidden = false;
      status('You’re player two. Ask Kirby to create a helper with A, then jump in.','success');
    },
    mediaClosed: () => { if (room === instance && mode === 'guest') screenMessage('Game stream stopped.','The host may have left. Leave and join again to reconnect.'); },
    disconnected: () => {
      if (room !== instance) return;
      controls.clear(); game.input(1,0);
      connection(mode === 'host' ? 'Waiting for player two' : 'Disconnected');
      $('#latency').textContent = 'DISCONNECTED';
      if (mode === 'host') { game.stopCapture(); status('Player two left. You can keep playing; your room link still works.'); }
      else { $('#remote-video').srcObject = null; remoteStream = null; screenMessage('The other player disconnected.','Leave, then join the room again when your host is ready.'); status('The room connection closed. Leave to join again.','error'); }
    },
    latency: ms => { if (room === instance) $('#latency').textContent = `${ms} MS · ROUND TRIP`; },
  }, networkSettings);
  room = instance; return instance;
}
async function launch(modeToUse, code) {
  if (busy) return;
  busyLobby(true); mode = modeToUse; showPlayer();
  try {
    if (mode === 'guest' || mode === 'host') {
      connection('Opening room…');
      screenMessage(mode === 'guest' ? 'Finding your adventure…' : 'Making room for two…','Connecting to the room service.');
      const instance = makeRoom();
      const roomCode = await instance.open(mode === 'host',code);
      if (instance !== room) return;
      $('#room-label').textContent = `ROOM ${roomCode.slice(0,5)}-${roomCode.slice(5)}`;
      if (mode === 'host') {
        $('#invite-button').hidden = false;
        connection('Waiting for player two');
        status('Your room is ready. Tap Invite to send its link to your friend.');
      } else {
        connection('Joining room…');
        screenMessage('Waiting for the host…','The game will appear here when the direct connection is ready.');
        return;
      }
    } else {
      $('#room-label').textContent = 'Solo adventure'; connection('Solo adventure');
      status('Use Start to begin. You can save level shortcuts from the Levels menu.');
    }
    screenMessage('Warming up Dream Land…','Loading the SNES emulator. The first start can take a few moments.');
    // Let EmulatorJS show its own progress, then remove its loading UI on start.
    $('#screen-message').hidden = true;
    await game.start();
    await game.resumeAudio();
    if (document.hidden) game.pause(true);
    if (mode === 'host') await streamToGuest();
  } catch (e) {
    room?.close(); room = null;
    connection('Could not start');
    screenMessage('Something interrupted the adventure.',e.message);
    error(e);
    if (!game.startPromise) {
      mode = 'lobby'; document.body.classList.remove('playing'); $('#lobby').hidden = false; $('#play-area').hidden = true; controls.enable(false);
    }
  } finally { busyLobby(false); }
}
$('#host-button').addEventListener('click',() => launch('host'));
$('#solo-button').addEventListener('click',() => launch('solo'));
$('#join-form').addEventListener('submit',e => {
  e.preventDefault();
  const code = parseRoomCode($('#room-code').value);
  if (!code) { status('Enter the 10-character room code, or paste the full invite link.','error'); $('#room-code').focus(); return; }
  launch('guest',code);
});
$('#invite-button').addEventListener('click',guard(async () => {
  const url = new URL(location.href); url.hash = new URLSearchParams({room:room.code}).toString();
  if (navigator.share && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({title:'Kirby Super Star · Join my room',url:url.href}); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(url.href); status('Invite link copied. Send it to your player two.','success'); }
  catch { status(`Invite your friend with this room code: ${room.code}`); }
}));
$('#leave-button').addEventListener('click',() => {
  controls.clear(); room?.close(); game.release(); game.stopCapture(); wakeLock?.release();
  location.replace(location.pathname + location.search);
});
async function enableVideo() {
  const video = $('#remote-video');
  video.muted = false; await video.play();
  muted = false; $('#sound-button').textContent = 'Sound on'; $('#sound-button').setAttribute('aria-pressed','false'); $('#resume-video').hidden = true;
}
$('#resume-video').addEventListener('click',guard(enableVideo));
$('#sound-button').addEventListener('click',guard(async () => {
  if (mode === 'guest') {
    if (!remoteStream) { status('Sound will be available when the host’s stream arrives.'); return; }
    if ($('#remote-video').muted) { await enableVideo(); return; }
    muted = true; $('#remote-video').muted = true;
  } else {
    await game.resumeAudio(); muted = !muted; game.setMuted(muted);
    if (mode === 'host' && muted) status('Game sound is muted for both players.');
  }
  $('#sound-button').textContent = muted ? 'Sound off' : 'Sound on'; $('#sound-button').setAttribute('aria-pressed',String(muted));
}));
$('#fullscreen-button').addEventListener('click',guard(async () => {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (document.documentElement.requestFullscreen) {
    await document.documentElement.requestFullscreen();
    try { await screen.orientation?.lock?.('landscape'); } catch {}
  } else status('On iPhone, rotate sideways. Add to Home Screen from Safari’s Share menu for more space.');
}));
$('#portrait-continue').addEventListener('click',() => document.body.classList.add('allow-portrait'));
function openDialog(selector) {
  controls.clear(); game.release(); $(selector).showModal();
  if (game.ready && mode !== 'guest') { game.pause(true); room?.broadcast('The host opened a menu. The game is paused.'); }
}
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close',() => {
  if (game.ready && mode !== 'guest' && !document.hidden && !document.querySelector('dialog[open]')) { game.pause(false); room?.broadcast('The host is back. Let’s play!'); }
}));
$('#help-button').addEventListener('click',() => openDialog('#help-dialog'));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click',() => button.closest('dialog').close()));
$('#network-form').addEventListener('submit',e => {
  e.preventDefault();
  const settings = Object.fromEntries(new FormData(e.target));
  if (settings.turn && !/^turns?:[^\s]+$/.test(settings.turn)) { status('Enter a TURN URL beginning with turn: or turns:.','error'); return; }
  if (settings.host && /[\s/:]/.test(settings.host)) { status('Enter just the PeerServer hostname, without https:// or a path.','error'); return; }
  networkSettings = {...settings,port:Number(settings.port) || 443};
  $('#help-dialog').close(); status('Connection settings updated for the next room.','success');
});
async function renderCheckpoints() {
  const list = $('#checkpoint-list'); list.replaceChildren();
  for (const level of levels) {
    const row = document.createElement('div'); row.className = 'checkpoint-row';
    const name = document.createElement('div'); name.className = 'checkpoint-name';
    const title = document.createElement('b'); title.textContent = `${level.symbol} ${level.name}`;
    const description = document.createElement('small'); description.textContent = level.description;
    name.append(title,description);
    const play = document.createElement('button'); play.textContent = 'Play'; play.setAttribute('aria-label',`Play ${level.name}`);
    play.addEventListener('click',guard(async () => {
      play.disabled = true;
      try { game.load(await levelData(level.id)); $('#levels-dialog').close(); status(`Jumped to ${level.name}.`,'success'); room?.broadcast(`The host launched ${level.name}.`); }
      finally { play.disabled = false; }
    }));
    row.append(name,play); list.append(row);
  }
  const heading = document.createElement('h3'); heading.textContent = 'Your checkpoints'; list.append(heading);
  const checkpoints = (await listCheckpoints()).sort((a,b) => b.created-a.created);
  if (!checkpoints.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Your level shortcuts will appear here. Reach a favorite level, then save it below.'; list.append(empty); }
  for (const checkpoint of checkpoints) {
    const row = document.createElement('div'); row.className = 'checkpoint-row';
    const name = document.createElement('div'); name.className = 'checkpoint-name';
    const title = document.createElement('b'); title.textContent = checkpoint.name;
    const date = document.createElement('small'); date.textContent = new Date(checkpoint.created).toLocaleDateString(); name.append(title,date); row.append(name);
    for (const [label,handler] of [
      ['Play',async () => { await verifyCheckpoint(checkpoint); controls.clear(); game.load(checkpoint.data); $('#levels-dialog').close(); status(`Jumped to ${checkpoint.name}.`,'success'); room?.broadcast(`The host launched ${checkpoint.name}.`); }],
      ['Export',() => exportCheckpoint(checkpoint)],
      ['Delete',async event => {
        if (event.target.dataset.confirm !== 'yes') { event.target.dataset.confirm = 'yes'; event.target.textContent = 'Confirm?'; return; }
        await deleteCheckpoint(checkpoint.id); await renderCheckpoints();
      }],
    ]) { const button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-label',`${label} ${checkpoint.name}`); button.addEventListener('click',guard(handler)); row.append(button); }
    list.append(row);
  }
}
$('#levels-button').addEventListener('click',guard(async () => {
  if (!game.ready) { status('Wait for the game to start before opening the level launcher.'); return; }
  openDialog('#levels-dialog'); await renderCheckpoints();
}));
$('#save-form').addEventListener('submit',guard(async e => {
  e.preventDefault(); const button = $('#save-checkpoint'); button.disabled = true;
  try { await saveCheckpoint($('#checkpoint-name').value,game.save()); $('#checkpoint-name').value = ''; await renderCheckpoints(); status('Checkpoint saved on this browser. Export it to keep a backup.','success'); }
  finally { button.disabled = false; }
}));
// preventDefault must run synchronously, before the guard's promise microtask.
$('#save-form').addEventListener('submit',e => e.preventDefault());
$('#import-checkpoint').addEventListener('change',guard(async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  await importCheckpoint(file); await renderCheckpoints(); status('Checkpoint imported. Tap Play to jump there.','success');
}));
document.addEventListener('visibilitychange',() => {
  if (mode === 'lobby') return;
  if (mode !== 'guest') {
    game.pause(document.hidden || !!document.querySelector('dialog[open]'));
    room?.broadcast(document.hidden ? 'The host switched tabs. Waiting for the host to return…' : 'The host is back. Let’s play!');
  }
  if (!document.hidden) wake();
});
window.addEventListener('pagehide',() => { room?.close(); game.release(); game.stopCapture(); wakeLock?.release(); });
window.addEventListener('pointerdown',() => { if (game.ready && mode !== 'guest') game.resumeAudio(); },{passive:true});
const invite = parseRoomCode(new URLSearchParams(location.hash.slice(1)).get('room') || '');
if (invite) { $('#room-code').value = invite; status('You have an invite! Tap Join to play as the helper.'); }
