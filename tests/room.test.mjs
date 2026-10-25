import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Room } from '../site/room.js';

async function withPeer(outcome, check) {
  const originalWindow = globalThis.window;
  const peers = [];
  class Peer extends EventEmitter {
    constructor(id) {
      super(); this.id = id; peers.push(this);
      const result = outcome(peers.length);
      if (result !== 'pending') queueMicrotask(() => {
        if (result === 'open') this.emit('open', id);
        else this.emit('error', {type:result});
      });
    }
    destroy() { this.destroyed = true; this.emit('close'); }
  }
  globalThis.window = {Peer};
  const errors = [];
  const room = new Room({error:message => errors.push(message)});
  try { await check(room, peers, errors); }
  finally { room.close(); globalThis.window = originalWindow; }
}

test('occupied codes retry with distinct IDs, without surfacing spurious close errors',async () => {
  await withPeer(attempt => attempt < 3 ? 'unavailable-id' : 'open',async (room, peers, errors) => {
    const code = await room.open(true);
    assert.equal(code.length,2);
    assert.equal(peers.length,3);
    assert.equal(new Set(peers.map(peer => peer.id)).size,3);
    assert.equal(peers.at(-1).id,`kirby-together-v1-${code}`);
    assert(peers.slice(0,-1).every(peer => peer.destroyed && peer.eventNames().length === 0));
    assert.deepEqual(errors,[]);
  });
});
test('a network error is surfaced immediately without cycling through room codes',async () => {
  await withPeer(() => 'network',async (room, peers) => {
    await assert.rejects(room.open(true),/room service is unreachable/);
    assert.equal(peers.length,1);
    assert.equal(peers[0].destroyed,true);
  });
});
test('repeated collisions stop after a bounded number of attempts',async () => {
  await withPeer(() => 'unavailable-id',async (room, peers) => {
    await assert.rejects(room.open(true),/Could not find a free room code/);
    assert.equal(peers.length,20);
    assert.equal(new Set(peers.map(peer => peer.id)).size,20);
    assert(peers.every(peer => peer.destroyed));
  });
});
test('leaving during registration cancels the pending attempt and releases its peer',async () => {
  await withPeer(() => 'pending',async (room, peers) => {
    const opened = room.open(true);
    room.close();
    await assert.rejects(opened,/canceled/);
    assert.equal(peers.length,1);
    assert.equal(peers[0].destroyed,true);
  });
});
