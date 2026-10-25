export const levels = [
  {id:'green-greens',name:'Spring Breeze',description:'Green Greens · a fresh adventure',symbol:'✿'},
  {id:'great-cave',name:'The Great Cave Offensive',description:'Start your treasure hunt',symbol:'◆'},
  {id:'adventure-select',name:'Adventure select',description:'Choose from the original game menu',symbol:'✦'},
];
export async function levelData(id) {
  if (!levels.some(level => level.id === id)) throw new Error('Unknown level.');
  const response = await fetch(`./levels/${id}.state`);
  if (!response.ok) throw new Error('The level checkpoint could not load. Try again.');
  return new Uint8Array(await response.arrayBuffer());
}
