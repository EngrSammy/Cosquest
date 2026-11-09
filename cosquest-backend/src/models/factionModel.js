const FACTIONS = [
  {
    key: 'ascendants',
    name: 'Ascendants',
    color: '#8B5CF6',
    description: 'The Ascendants celebrate anime culture — from shonen legends to slice-of-life gems. Cosplay your favorite characters, compete in anime trivia quests, and connect with otaku worldwide.',
    perks: ['Early access to anime convention meetups', 'Exclusive anime-themed rank badges', 'Priority entry to cosplay showcases'],
  },
  {
    key: 'icons',
    name: 'Icons',
    color: '#EC4899',
    description: 'Icons live and breathe comics — Marvel, DC, indie, manga comic-con squads, and rise through the ranks with every quest.',
    perks: ['Comic-con squad matchmaking program', 'Exclusive superhero rank badges & flares', 'Panel discussion priority access'],
  },
  {
    key: 'controllers',
    name: 'Controllers',
    color: '#06B6D4',
    description: 'Controllers are the competitive heart of CosQuest. Whether you rep RPGs, FPS, or retro classics, this faction is your guild. Level up through gaming quests and tournament events.',
    perks: ['Tournament bracket priority entry', 'Exclusive gaming rank badges & flares', 'Local LAN meetup coordination'],
  },
  {
    key: 'blockbusters',
    name: 'Blockbusters',
    color: '#F97316',
    description: 'Blockbusters live for the big screen — from superhero epics to indie darlings. Cosplay iconic movie characters, join film-themed quests, and debate the greatest performances of all time.',
    perks: ['Movie premiere watch parties', 'Exclusive cinema-themed rank badges', 'Red carpet cosplay contests'],
  },
  {
    key: 'everborns',
    name: 'Everborn',
    color: '#22C55E',
    description: 'The Everborn dwell in realms of magic and myth. From Tolkien to tabletop, this faction celebrates epic worldbuilding, enchanted cosplay, and quests that feel straight out of a fantasy legend.',
    perks: ['LARP event coordination', 'Exclusive fantasy-themed rank badges', 'World-building workshop access'],
  },
  {
    key: 'celestials',
    name: 'Celestials',
    color: '#EAB308',
    description: 'Celestials explore the cosmos of imagination — Star Wars, Star Trek, cyberpunk, and beyond. Build futuristic cosplays, solve sci-fi mystery quests, and connect with visionaries across the galaxy.',
    perks: ['Sci-fi convention squad matching', 'Exclusive galactic rank badges', 'Tech-cosplay build challenges'],
  },
];

const FACTION_KEYS = FACTIONS.map((f) => f.key);

function isValidFactionKey(key) {
  return FACTION_KEYS.includes(key);
}

function getFaction(key) {
  return FACTIONS.find((f) => f.key === key) || null;
}

module.exports = { FACTIONS, FACTION_KEYS, isValidFactionKey, getFaction };
