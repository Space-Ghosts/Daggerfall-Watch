// Daggerfall Watch: public market soul-trap names.
// Names and mobile ids are from Lattymoy/daggerfall-js-source:
// src/characters/enemy/enemyBasics.js and src/systems/enemyExpansion/*TableText.js.
// Does not publish the original item record, only the creature label.
const MONSTERS = Object.freeze([
  'Rat','Imp','Spriggan','Giant Bat','Grizzly Bear','Sabretooth Tiger','Spider','Orc',
  'Centaur','Werewolf','Nymph','Slaughterfish','Orc Sergeant','Harpy','Wereboar',
  'Skeletal Warrior','Giant','Zombie','Ghost','Mummy','Giant Scorpion','Orc Shaman',
  'Gargoyle','Wraith','Orc Warlord','Frost Daedra','Fire Daedra','Daedroth','Vampire',
  'Daedra Seducer','Ancient Vampire','Daedra Lord','Lich','Ancient Lich','Dragonling',
  'Fire Atronach','Iron Atronach','Flesh Atronach','Ice Atronach','Horse','Dragonling',
  'Dreugh','Lamia'
]);
const HUMANS = Object.freeze([
  'Mage','Spellsword','Battlemage','Sorcerer','Healer','Nightblade','Bard','Burglar',
  'Rogue','Acrobat','Thief','Assassin','Monk','Archer','Ranger','Barbarian',
  'Warrior','Knight','City Watch'
]);
const MOD_SOULS = Object.freeze({
  256:'Goblin',257:'Homunculus',258:'Lizard Man',259:'Lizard Warrior',260:'Bat',
  261:'Medusa',262:'Wolf',263:'Snow Wolf',264:'Hell Hound',265:'Grotesque',
  266:'Skeletal Soldier',267:'Dog',268:'Nymph',269:'Minotaur',270:'Iron Golem',
  271:'Blood Spider',272:'Troll',273:'Gloom Wraith',274:'Faded Ghost',
  275:'Vengeful King Lysandus',276:'Fire Daemon',277:'Ghoul',278:'Boar',
  279:'Land Dreugh',280:'Mountain Lion',281:'Mudcrab',282:'Ogre',
  283:"Will-o'-wisp",284:'Ice Golem',285:'Dremora Churl',286:'Stone Golem',
  287:'Dire Ghoul',288:'Scamp',289:'Centurion Sphere',290:'Steam Centurion',
  384:'Druid',385:'Guard',386:'Knight Rider',387:'Rogue Rider',
  388:'Necromancer Acolyte',389:'Rogue Druid',390:'Bounty Hunter',
  391:'Royal Knight',392:'Thief Rider',393:'Necromancer Glaivier',
  394:'Necromancer Assassin',395:'Dark Slayer',396:'Witch Defender',
  397:'Spellsword Rider',398:'Archer Rider'
});
export function soulNameForId(id) {
  if(!Number.isSafeInteger(id) || id < 0) return null;
  if(id < MONSTERS.length) return MONSTERS[id];
  if(id >= 128 && id < 128 + HUMANS.length) return HUMANS[id - 128];
  return MOD_SOULS[id] ?? `Unknown soul (ID ${id})`;
}

export function withPublicSoulName(raw, listing) {
  if(!listing || typeof listing !== 'object' || !raw || typeof raw !== 'object') return listing;
  // The market's listingView returns {kind:'item', item:{group,templateIndex,trappedSoulType,...}}.
  // Never derive souls from prices, rarity, enchantments, or the displayed name.
  const item = raw.item;
  if(!item || typeof item !== 'object' || Array.isArray(item)) return listing;
  const isTrap = item.templateIndex === 274 && (item.group === 'MiscItems' || item.group == null);
  // Azura's Star is an artifact that can also contain a trapped soul.
  const isStar = item.artifact === true && Number.isInteger(item.artifactIndexBitfield)
    && (item.artifactIndexBitfield >> 1) === 9;
  if(!isTrap && !isStar) return listing;
  if(listing.statsStatus === 'unidentified' || item.identified === false) return listing;
  if(!Object.hasOwn(item,'trappedSoulType')) return listing; // absent is not the same as empty
  const id = item.trappedSoulType;
  const soul = id === null || id === -1 ? 'Empty' : soulNameForId(id);
  if(!soul) return listing;
  // A second scan or a re-run on an enriched listing must not duplicate its label.
  const suffix = ` (${soul})`;
  let name = typeof listing.name === 'string' ? listing.name : '';
  if(name && !name.endsWith(suffix) && !/\([^()]+\)$/.test(name)) name += suffix;
  const line = `Trapped soul: ${soul}`;
  const lines = Array.isArray(listing.statLines) ? listing.statLines.filter(x => typeof x === 'string') : [];
  return {
    ...listing,
    ...(name ? {name} : {}),
    soulName: soul,
    statLines: lines.includes(line) ? lines : [...lines.filter(x=>!/^Trapped soul:/i.test(x)),line]
  };
}
