'use strict';
// ===== Plunder Port — datos y balance del juego =====
const TILE = 32;
const WW = 200, WH = 200;           // tamaño del mundo en tiles
const SEED = 1337;

// Tipos de tile
const W_WATER = 0, W_LAND = 1, W_REEF = 2, W_ROCK = 3;

const ZONES = [
  { name: 'Mar de los Novatos', sea: [42, 128, 196], req: 1, lootMult: 1 },
  { name: 'Arrecifes de Coral', sea: [30, 160, 175], req: 2, lootMult: 1.6 },
  { name: 'Aguas de Tormenta', sea: [44, 82, 112], req: 3, lootMult: 2.4 },
  { name: 'Triángulo Maldito', sea: [58, 48, 88], req: 4, lootMult: 3.4 },
];
// Distancia (en tiles) desde el puerto inicial donde empieza cada zona
const ZONE_EDGES = [0, 50, 95, 140];

const SHIPS = [
  { name: 'Bote remendado', hp: 40, speed: 1.0, hold: 10, crew: 1, cannons: 1, leak: 30, turn: 1.25, price: 0, len: 34, wid: 14, planks: 6,
    desc: 'Una balsa fea y llena de huecos. Hace agua todo el rato.' },
  { name: 'Balandra', hp: 80, speed: 1.15, hold: 24, crew: 2, cannons: 2, leak: 60, turn: 1.15, price: 900, len: 44, wid: 17, planks: 8,
    desc: 'Rápida y ligera. Aguanta los arrecifes.' },
  { name: 'Bergantín', hp: 150, speed: 1.25, hold: 45, crew: 3, cannons: 4, leak: 120, turn: 1.0, price: 4500, len: 54, wid: 20, planks: 10,
    desc: 'Dos mástiles y casco reforzado: resiste las tormentas.' },
  { name: 'Fragata', hp: 260, speed: 1.35, hold: 80, crew: 4, cannons: 6, leak: 240, turn: 0.92, price: 16000, len: 64, wid: 23, planks: 12,
    desc: 'Un buque de guerra. Puede cruzar el Triángulo Maldito.' },
  { name: 'Galeón', hp: 420, speed: 1.4, hold: 140, crew: 5, cannons: 8, leak: 0, turn: 0.82, price: 55000, len: 78, wid: 27, planks: 14,
    desc: 'Enorme, con tu propia sala de tesoros a bordo.' },
];

const PART_MAX = 6;
const PARTS = {
  casco:   { name: 'Casco',   desc: '+20% resistencia, menos huecos y menos agua', base: 90 },
  velas:   { name: 'Velas',   desc: '+10% velocidad', base: 80 },
  bodega:  { name: 'Bodega',  desc: '+20% espacio de carga', base: 100 },
  canones: { name: 'Cañones', desc: '+20% daño en combate', base: 110 },
  timon:   { name: 'Timón',   desc: '+15% giro y control', base: 70 },
};
function partCost(part, lvl) { return Math.round(PARTS[part].base * Math.pow(2.25, lvl)); }

const ITEMS = {
  coins:   { name: 'Monedas de oro', value: 15,  size: 1, color: '#f5c542', icon: '🪙' },
  chest:   { name: 'Cofre común',    value: 55,  size: 2, color: '#a0662b', icon: '📦' },
  ruby:    { name: 'Rubí',           value: 120, size: 1, color: '#e0245e', icon: '🔴' },
  diamond: { name: 'Diamante',       value: 240, size: 1, color: '#9ef0ff', icon: '💎' },
  rare:    { name: 'Cofre raro',     value: 650, size: 3, color: '#b06cff', icon: '🧰' },
};
const ITEM_ORDER = ['coins', 'chest', 'ruby', 'diamond', 'rare'];
const LOOT_WEIGHTS = [
  { coins: 60, chest: 30, ruby: 10, diamond: 0, rare: 0 },
  { coins: 35, chest: 30, ruby: 22, diamond: 10, rare: 3 },
  { coins: 20, chest: 25, ruby: 25, diamond: 20, rare: 10 },
  { coins: 10, chest: 20, ruby: 25, diamond: 28, rare: 17 },
];

const LEGENDS = {
  skull:   { name: 'Calavera Dorada',        desc: 'Brilla en la oscuridad y sonríe a sus dueños.', color: '#ffd23f' },
  trident: { name: 'Tridente de Poseidón',   desc: 'Dicen que calma las olas.', color: '#4fd1ff' },
  crown:   { name: 'Corona del Rey Ahogado', desc: 'Aún gotea agua salada.', color: '#ffb347' },
  chalice: { name: 'Cáliz de Jade',          desc: 'Rescatado de un naufragio en los arrecifes.', color: '#3ddc84' },
  pearl:   { name: 'Perla Negra',            desc: 'Del tamaño de un puño, escondida en una cueva.', color: '#555577' },
  compass: { name: 'Brújula Maldita',        desc: 'No apunta al norte: apunta a lo que más deseas.', color: '#c04040' },
};
const LEGEND_ORDER = ['skull', 'trident', 'crown', 'chalice', 'pearl', 'compass'];

const TROPHIES = {
  serpent: { name: 'Cabeza de Serpiente Marina', color: '#3fae5a' },
  kraken:  { name: 'Tentáculo del Kraken',       color: '#c2457a' },
  ghost:   { name: 'Farol del Barco Fantasma',   color: '#9fffd8' },
};

const CREW = {
  carpintero: { name: 'Carpintero', desc: 'Repara huecos solo, en pleno viaje', cost: 300, icon: '🔨' },
  vigia:      { name: 'Vigía',      desc: 'Revela más mapa alrededor del barco', cost: 200, icon: '🔭' },
  artillero:  { name: 'Artillero',  desc: 'Más daño y recarga más rápida', cost: 450, icon: '💣' },
  cocinero:   { name: 'Cocinero',   desc: 'Mantiene alta la moral en viajes largos', cost: 250, icon: '🍲' },
  buzo:       { name: 'Buzo',       desc: 'Saca tesoros de los naufragios', cost: 600, icon: '🤿' },
};
const CREW_ORDER = ['carpintero', 'vigia', 'artillero', 'cocinero', 'buzo'];

const DECOR = [
  { id: 'bandera',    name: 'Bandera pirata',        price: 1500 },
  { id: 'alfombra',   name: 'Alfombra persa',        price: 2500 },
  { id: 'candelabros',name: 'Candelabros de oro',    price: 4000 },
  { id: 'mapa',       name: 'Mapa enmarcado',        price: 5000 },
  { id: 'loro',       name: 'Loro disecado',         price: 7000 },
  { id: 'lampara',    name: 'Lámpara de araña',      price: 10000 },
  { id: 'canon',      name: 'Cañón dorado',          price: 15000 },
  { id: 'estatua',    name: 'Estatua de ti mismo',   price: 30000 },
];
const HOUSE_PRICE = 120000;

// Puertos: posición en tiles, multiplicadores de precio
const PORTS = [
  { name: 'Puerto Remiendo', tx: 22, ty: 176, mult: { coins: 1.0, chest: 1.0, ruby: 0.85, diamond: 0.8, rare: 0.9 }, estate: true, mapId: 0 },
  { name: 'Villa Gaviota',   tx: 34, ty: 136, mult: { coins: 0.9, chest: 1.15, ruby: 1.3, diamond: 0.9, rare: 1.0 }, estate: false, mapId: 0 },
  { name: 'Bahía Coral',     tx: 78, ty: 142, mult: { coins: 1.1, chest: 0.9, ruby: 1.0, diamond: 1.3, rare: 1.1 }, estate: true, mapId: 1 },
  { name: 'Puerto Trueno',   tx: 110, ty: 96, mult: { coins: 1.3, chest: 1.1, ruby: 0.9, diamond: 1.05, rare: 1.25 }, estate: false, mapId: 2 },
  { name: 'Refugio Maldito', tx: 174, ty: 32, mult: { coins: 1.0, chest: 1.3, ruby: 1.4, diamond: 1.2, rare: 1.5 }, estate: false, mapId: 2 },
];

const TAVERN = {
  price: [1500, 6000, 18000, 45000],
  income: [6, 18, 45, 110],     // oro por minuto a nivel 1
  maxLevel: 5,
  capMinutes: 480,              // máximo acumulado (8 horas)
};

const MAP_PIECE_PRICE = [150, 500, 1200];
const MAP_NAMES = ['Mapa del Islote Escondido', 'Mapa de la Fosa Tormentosa', 'Mapa del Corazón Maldito'];
const MAP_LEGEND = ['skull', 'trident', 'crown'];

const ENEMY_STATS = [
  { hp: 30,  dmg: 4,  speed: 85,  reload: 2.6, gold: 60 },
  { hp: 70,  dmg: 7,  speed: 105, reload: 2.3, gold: 160 },
  { hp: 140, dmg: 12, speed: 125, reload: 2.0, gold: 380 },
  { hp: 260, dmg: 18, speed: 140, reload: 1.8, gold: 800 },
];

const BOSSES = {
  serpent: { name: 'Serpiente Marina', zone: 1, hp: 600,  reward: 2500 },
  kraken:  { name: 'El Kraken',        zone: 2, hp: 1500, reward: 7000 },
  ghost:   { name: 'Barco Fantasma',   zone: 3, hp: 2600, reward: 16000 },
};

const PLANK_PRICE = 8;
const RUMORS_PRICE = [30, 80, 200, 400];
