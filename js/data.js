// Ruang data: regions, prices (with sources), furniture catalog, country templates.
// Every number here is either sourced (see SOURCES) or labelled "assumed" / "proxy".

export const RATES_DATE = '2026-11-09';

// plr = World Bank PA.NUS.PPPC.RF (price level ratio, USA = 1.00), 2024.
// rate = units of local currency per 1 USD on RATES_DATE.
// lat/lon = largest or capital city, used for the sun clock.
export const REGIONS = {
  ID: { name: 'Indonesia', cur: 'IDR', rate: 18080.8, plr: 0.30, lat: -6.2, lon: 106.8, tz: 7, lang: 'id', climate: 'tropical', quake: true, lens: 'none', locale: 'id-ID' },
  SG: { name: 'Singapore', cur: 'SGD', rate: 1.2801, plr: 0.60, lat: 1.35, lon: 103.8, tz: 8, lang: 'en', climate: 'tropical', quake: false, lens: 'fengshui', locale: 'en-SG' },
  MY: { name: 'Malaysia', cur: 'MYR', rate: 4.0615, plr: 0.31, lat: 3.14, lon: 101.69, tz: 8, lang: 'en', climate: 'tropical', quake: false, lens: 'none', locale: 'ms-MY' },
  TW: { name: 'Taiwan', cur: 'TWD', rate: 32.8215, plr: 0.55, plrAssumed: true, lat: 25.03, lon: 121.56, tz: 8, lang: 'zh-TW', climate: 'subtropical', quake: true, lens: 'fengshui', locale: 'zh-TW' },
  CN: { name: 'China', cur: 'CNY', rate: 6.6711, plr: 0.49, lat: 39.9, lon: 116.4, tz: 8, lang: 'zh-CN', climate: 'temperate', quake: false, lens: 'fengshui', locale: 'zh-CN' },
  JP: { name: 'Japan', cur: 'JPY', rate: 158.001, plr: 0.62, lat: 35.68, lon: 139.69, tz: 9, lang: 'ja', climate: 'temperate', quake: true, lens: 'none', locale: 'ja-JP' },
  KR: { name: 'South Korea', cur: 'KRW', rate: 1348.54, plr: 0.59, lat: 37.57, lon: 126.98, tz: 9, lang: 'ko', climate: 'cold', quake: false, lens: 'none', locale: 'ko-KR' },
  TH: { name: 'Thailand', cur: 'THB', rate: 33.5027, plr: 0.30, lat: 13.75, lon: 100.5, tz: 7, lang: 'en', climate: 'tropical', quake: false, lens: 'none', locale: 'th-TH' },
  VN: { name: 'Vietnam', cur: 'VND', rate: 25498.5, plr: 0.29, lat: 21.03, lon: 105.85, tz: 7, lang: 'en', climate: 'tropical', quake: false, lens: 'fengshui', locale: 'vi-VN' },
  PH: { name: 'Philippines', cur: 'PHP', rate: 63.3217, plr: 0.34, lat: 14.6, lon: 120.98, tz: 8, lang: 'en', climate: 'tropical', quake: true, lens: 'none', locale: 'en-PH' },
  IN: { name: 'India', cur: 'INR', rate: 93.9105, plr: 0.24, lat: 28.61, lon: 77.21, tz: 5.5, lang: 'en', climate: 'hot', quake: false, lens: 'vastu', locale: 'en-IN' },
  AU: { name: 'Australia', cur: 'AUD', rate: 1.453, plr: 0.90, lat: -33.87, lon: 151.21, tz: 10, lang: 'en', climate: 'temperate', quake: false, lens: 'none', locale: 'en-AU' },
  US: { name: 'United States', cur: 'USD', rate: 1, plr: 1.00, lat: 40.71, lon: -74.0, tz: -5, lang: 'en', climate: 'temperate', quake: false, lens: 'none', locale: 'en-US', imperial: true },
  CA: { name: 'Canada', cur: 'CAD', rate: 1.4095, plr: 0.84, lat: 43.65, lon: -79.38, tz: -5, lang: 'en', climate: 'cold', quake: false, lens: 'none', locale: 'en-CA' },
  GB: { name: 'United Kingdom', cur: 'GBP', rate: 0.7467, plr: 0.85, lat: 51.5, lon: -0.13, tz: 0, lang: 'en', climate: 'temperate', quake: false, lens: 'none', locale: 'en-GB' },
  DE: { name: 'Germany', cur: 'EUR', rate: 0.895, plr: 0.76, lat: 52.52, lon: 13.4, tz: 1, lang: 'en', climate: 'cold', quake: false, lens: 'none', locale: 'de-DE' },
  FR: { name: 'France', cur: 'EUR', rate: 0.895, plr: 0.74, lat: 48.86, lon: 2.35, tz: 1, lang: 'en', climate: 'temperate', quake: false, lens: 'none', locale: 'fr-FR' },
  NL: { name: 'Netherlands', cur: 'EUR', rate: 0.895, plr: 0.79, lat: 52.37, lon: 4.9, tz: 1, lang: 'en', climate: 'cold', quake: false, lens: 'none', locale: 'nl-NL' },
  ES: { name: 'Spain', cur: 'EUR', rate: 0.895, plr: 0.61, lat: 40.42, lon: -3.7, tz: 1, lang: 'es', climate: 'hot', quake: false, lens: 'none', locale: 'es-ES' },
  IT: { name: 'Italy', cur: 'EUR', rate: 0.895, plr: 0.65, lat: 41.9, lon: 12.5, tz: 1, lang: 'en', climate: 'temperate', quake: true, lens: 'none', locale: 'it-IT' },
  SE: { name: 'Sweden', cur: 'SEK', rate: 9.8521, plr: 0.80, lat: 59.33, lon: 18.07, tz: 1, lang: 'en', climate: 'cold', quake: false, lens: 'none', locale: 'sv-SE' },
  MX: { name: 'Mexico', cur: 'MXN', rate: 18.6438, plr: 0.54, lat: 19.43, lon: -99.13, tz: -6, lang: 'es', climate: 'subtropical', quake: true, lens: 'none', locale: 'es-MX' },
  BR: { name: 'Brazil', cur: 'BRL', rate: 5.501, plr: 0.46, lat: -23.55, lon: -46.63, tz: -3, lang: 'en', climate: 'subtropical', quake: false, lens: 'none', locale: 'pt-BR' },
  AE: { name: 'United Arab Emirates', cur: 'AED', rate: 3.6727, plr: 0.63, lat: 25.2, lon: 55.27, tz: 4, lang: 'en', climate: 'hot', quake: false, lens: 'none', locale: 'en-AE' },
};

export const SOURCES = {
  angi: 'Angi cost guides (painting, wallpaper, laminate, vinyl), 2026 data, angi.com',
  costpilot: 'CostPilotUSA, Interior Remodeling Costs 2026, costpilotusa.com',
  floorguides: 'US flooring cost guides 2026 (Angi, HomeGuide, Forbes Home) as summarised on 2026-11-10',
  furnfull: 'FurnFull "How Much Furniture Costs" and US budgeting guides (Finessed Homes 2024, West Village Interior 2025)',
  wb: 'World Bank WDI PA.NUS.PPPC.RF, price level ratio, 2024',
  fx: 'Exchange rates 9 Nov 2026 (Federal Reserve H.10, exchangeratesnow.com)',
};

const FT2 = 10.7639; // square feet per square metre

// US base prices in USD. unit: m2 (area) or each. low/high = installed (finishes) or retail (furniture).
export const PRICES = {
  paint:        { low: 2 * FT2, high: 6 * FT2, unit: 'm2', src: 'costpilot' },
  wallpaper:    { low: 3 * FT2, high: 8 * FT2, unit: 'm2', src: 'angi' },
  ceilingPaint: { low: 1 * FT2, high: 3 * FT2, unit: 'm2', src: 'angi' },
  laminate:     { low: 3 * FT2, high: 14 * FT2, unit: 'm2', src: 'floorguides' },
  vinyl:        { low: 2 * FT2, high: 16 * FT2, unit: 'm2', src: 'floorguides' },
  hardwood:     { low: 4.5 * FT2, high: 28 * FT2, unit: 'm2', src: 'floorguides' },
  tile:         { low: 15 * FT2, high: 20 * FT2, unit: 'm2', src: 'floorguides' },
  carpet:       { low: 3 * FT2, high: 22 * FT2, unit: 'm2', src: 'floorguides' },
  lightInstall: { low: 150, high: 1000, unit: 'each', src: 'angi' },
  bed:          { low: 550, high: 3300, unit: 'each', src: 'furnfull', note: 'frame + mattress' },
  sofa:         { low: 500, high: 2500, unit: 'each', src: 'furnfull' },
  armchair:     { low: 150, high: 900, unit: 'each', src: 'furnfull' },
  diningTable:  { low: 250, high: 1600, unit: 'each', src: 'furnfull' },
  chair:        { low: 60, high: 400, unit: 'each', src: 'furnfull' },
  desk:         { low: 120, high: 1000, unit: 'each', src: 'furnfull' },
  officeChair:  { low: 58, high: 1000, unit: 'each', src: 'furnfull' },
  wardrobe:     { low: 230, high: 2000, unit: 'each', src: 'furnfull' },
  bookshelf:    { low: 60, high: 1200, unit: 'each', src: 'furnfull' },
  nightstand:   { low: 70, high: 800, unit: 'each', src: 'furnfull' },
  tvStand:      { low: 180, high: 1200, unit: 'each', src: 'furnfull' },
  rug:          { low: 150, high: 1400, unit: 'each', src: 'furnfull' },
  floorLamp:    { low: 50, high: 800, unit: 'each', src: 'furnfull' },
  ceilingLight: { low: 100, high: 2000, unit: 'each', src: 'furnfull' },
  curtains:     { low: 50, high: 500, unit: 'each', src: 'furnfull' },
  plant:        { low: 100, high: 500, unit: 'each', src: 'furnfull', note: 'incl. planter' },
};

// Floor finishes that have no sourced price are priced as the nearest sourced finish (proxy).
export const FLOOR_PRICE_KEY = {
  laminate: ['laminate'], vinyl: ['vinyl'], parquet: ['hardwood'], oak: ['hardwood'], walnut: ['hardwood'],
  tile: ['tile'], terracotta: ['tile'], zellige: ['tile'], stone: ['tile'], terrazzo: ['tile'],
  concrete: ['vinyl', 'proxy'], carpet: ['carpet'], tatami: ['carpet', 'proxy'], ondol: ['vinyl', 'proxy'],
};

export const WALL_PRICE_KEY = {
  paint: ['paint'], plaster: ['paint', 'proxy'], wallpaper: ['wallpaper'], panel: ['wallpaper', 'proxy'],
  brick: ['wallpaper', 'proxy'], wood: ['wallpaper', 'proxy'], tile: ['tile'], shiplap: ['wallpaper', 'proxy'],
};

// Furniture catalog. Sizes in metres (w = along x, d = along z, h = height). price = PRICES key.
// access = side(s) a person must reach (front = +z local). wall = prefers back against a wall.
export const CATALOG = {
  bed:        { w: 1.6, d: 2.05, h: 0.5, price: 'bed', access: ['left', 'right', 'front'], wall: true, kind: 'fabric' },
  singleBed:  { w: 0.95, d: 2.0, h: 0.5, price: 'bed', access: ['left', 'front'], wall: true, kind: 'fabric' },
  sofa:       { w: 2.0, d: 0.9, h: 0.82, price: 'sofa', access: ['front'], wall: true, kind: 'fabric' },
  armchair:   { w: 0.8, d: 0.82, h: 0.8, price: 'armchair', access: ['front'], kind: 'fabric' },
  coffeeTable:{ w: 1.0, d: 0.55, h: 0.42, price: 'nightstand', proxy: true, kind: 'wood' },
  diningTable:{ w: 1.4, d: 0.85, h: 0.75, price: 'diningTable', access: ['front', 'back'], kind: 'wood' },
  chair:      { w: 0.45, d: 0.5, h: 0.85, price: 'chair', kind: 'wood' },
  desk:       { w: 1.2, d: 0.6, h: 0.75, price: 'desk', access: ['front'], wall: true, kind: 'wood', task: true },
  officeChair:{ w: 0.6, d: 0.6, h: 1.0, price: 'officeChair', kind: 'fabric' },
  wardrobe:   { w: 1.2, d: 0.6, h: 2.0, price: 'wardrobe', access: ['front'], wall: true, tall: true, kind: 'wood' },
  bookshelf:  { w: 0.8, d: 0.3, h: 1.8, price: 'bookshelf', access: ['front'], wall: true, tall: true, kind: 'wood' },
  dresser:    { w: 1.0, d: 0.48, h: 0.8, price: 'wardrobe', proxy: true, access: ['front'], wall: true, kind: 'wood' },
  nightstand: { w: 0.45, d: 0.4, h: 0.55, price: 'nightstand', wall: true, kind: 'wood' },
  tvStand:    { w: 1.5, d: 0.4, h: 1.15, price: 'tvStand', wall: true, kind: 'wood', screen: true },
  rug:        { w: 2.0, d: 1.4, h: 0.01, price: 'rug', flat: true, kind: 'rug' },
  floorLamp:  { w: 0.35, d: 0.35, h: 1.6, price: 'floorLamp', kind: 'metal', light: true },
  plant:      { w: 0.45, d: 0.45, h: 1.2, price: 'plant', kind: 'plant' },
  lowTable:   { w: 0.9, d: 0.6, h: 0.33, price: 'nightstand', proxy: true, kind: 'wood' },
  cushion:    { w: 0.6, d: 0.6, h: 0.12, price: 'armchair', proxy: true, flat: true, kind: 'fabric' },
  screen:     { w: 1.4, d: 0.05, h: 1.7, price: 'bookshelf', proxy: true, kind: 'paper' },
  mirror:     { w: 0.6, d: 0.04, h: 1.6, price: 'floorLamp', proxy: true, wall: true, kind: 'mirror' },
  lantern:    { w: 0.3, d: 0.3, h: 0.5, price: 'floorLamp', proxy: true, kind: 'metal', light: true },
};

export const CATALOG_ORDER = ['bed', 'singleBed', 'sofa', 'armchair', 'coffeeTable', 'diningTable', 'chair', 'desk',
  'officeChair', 'wardrobe', 'bookshelf', 'dresser', 'nightstand', 'tvStand', 'rug', 'floorLamp', 'plant',
  'lowTable', 'cushion', 'screen', 'mirror', 'lantern'];

// Country-house templates. wall/floor finish + palette + decor added + lighting colour temperature (K).
// kw = words (several languages) that the "describe it" box matches.
export const TEMPLATES = [
  { id: 'japandi', cc: 'JP', wall: { finish: 'plaster', color: '#ece5d8' }, floor: { type: 'tatami', color: '#c9b98a' },
    wood: '#c49f72', fabric: '#d8d0c2', accent: '#3f4a3c', light: 2700, adds: ['screen', 'lowTable', 'cushion', 'plant'], lowBed: true,
    kw: ['japan', 'japanese', 'japandi', 'zen', 'wabi', 'jepang', '日式', '和風', '日本', '侘寂', 'ジャパン', '和室', '일본', 'japonés'] },
  { id: 'hanok', cc: 'KR', wall: { finish: 'plaster', color: '#f1e9d6' }, floor: { type: 'ondol', color: '#d4ad6a' },
    wood: '#6e4a2b', fabric: '#efe6d4', accent: '#9a3030', light: 2700, adds: ['screen', 'lowTable', 'cushion'], lowBed: true,
    kw: ['korea', 'korean', 'hanok', 'korea', '韓式', '韩式', '韓屋', '한옥', '한국', 'coreano'] },
  { id: 'chinese', cc: 'CN', wall: { finish: 'paint', color: '#efe5d6' }, floor: { type: 'walnut', color: '#5b3a23' },
    wood: '#4f2f1c', fabric: '#c9b79a', accent: '#a3262a', light: 3000, adds: ['screen', 'lantern', 'plant'],
    kw: ['chinese', 'china', 'oriental', 'tiongkok', 'cina', '中式', '中國', '中国', '新中式', '中華', '중국', 'chino'] },
  { id: 'joglo', cc: 'ID', wall: { finish: 'wood', color: '#8a5a33' }, floor: { type: 'terracotta', color: '#b5603a' },
    wood: '#7a4a28', fabric: '#d9c6a5', accent: '#3b2a1e', light: 2700, adds: ['screen', 'plant', 'rug'],
    kw: ['java', 'javanese', 'joglo', 'jawa', 'batik', 'teak', 'jati', '爪哇', 'ジャワ', '자바'] },
  { id: 'bali', cc: 'ID', wall: { finish: 'plaster', color: '#f2eee5' }, floor: { type: 'stone', color: '#cfc6b4' },
    wood: '#b8895a', fabric: '#ebe3d3', accent: '#2f5d50', light: 3000, adds: ['plant', 'plant', 'lantern', 'rug'],
    kw: ['bali', 'balinese', 'tropical', 'tropis', 'resort', 'rattan', 'rotan', '峇里', '巴厘', '熱帶', '热带', 'バリ', '발리', 'tropical'] },
  { id: 'scandi', cc: 'SE', wall: { finish: 'paint', color: '#f3f3f0' }, floor: { type: 'oak', color: '#d8c19c' },
    wood: '#d2b48c', fabric: '#c2c6c9', accent: '#2b4c6f', light: 3000, adds: ['rug', 'floorLamp', 'plant'],
    kw: ['scandi', 'scandinavian', 'nordic', 'hygge', 'ikea', 'skandinavia', '北歐', '北欧', 'スカンジナビア', '북유럽', 'nórdico', 'escandinavo'] },
  { id: 'riad', cc: 'MA', wall: { finish: 'plaster', color: '#d98a5e' }, floor: { type: 'zellige', color: '#1f6f78' },
    wood: '#6b4226', fabric: '#e8d3b0', accent: '#b8892e', light: 2400, adds: ['lantern', 'cushion', 'rug', 'plant'],
    kw: ['morocco', 'moroccan', 'riad', 'maroko', 'boho', 'bohemian', '摩洛哥', 'モロッコ', '모로코', 'marroquí'] },
  { id: 'hacienda', cc: 'MX', wall: { finish: 'plaster', color: '#f1e6d6' }, floor: { type: 'terracotta', color: '#b4643c' },
    wood: '#4a2f1c', fabric: '#e2d2b8', accent: '#1e4fa0', light: 2700, adds: ['plant', 'rug', 'lantern'],
    kw: ['mexico', 'mexican', 'hacienda', 'spanish', 'meksiko', '墨西哥', 'メキシコ', '멕시코', 'mexicano', 'hacienda'] },
  { id: 'mediterranean', cc: 'GR', wall: { finish: 'plaster', color: '#fafaf6' }, floor: { type: 'stone', color: '#e2ddd1' },
    wood: '#a98a63', fabric: '#f0ece2', accent: '#1f5fa6', light: 3500, adds: ['plant', 'rug'],
    kw: ['mediterranean', 'greek', 'greece', 'santorini', 'coastal', 'beach', 'pantai', 'yunani', '地中海', '希臘', '希腊', 'ギリシャ', '지중해', 'mediterráneo'] },
  { id: 'cottage', cc: 'GB', wall: { finish: 'wallpaper', color: '#c9d3bc', pattern: 'floral' }, floor: { type: 'oak', color: '#8b6542' },
    wood: '#7b5536', fabric: '#e6d9c3', accent: '#7a2e2e', light: 2700, adds: ['armchair', 'rug', 'floorLamp'],
    kw: ['english', 'cottage', 'british', 'countryside', 'vintage', 'inggris', '英式', '鄉村', '乡村', 'イギリス', '영국', 'inglés', 'rústico'] },
  { id: 'parisian', cc: 'FR', wall: { finish: 'panel', color: '#f5f1ea' }, floor: { type: 'parquet', color: '#a77c4f' },
    wood: '#8d6a45', fabric: '#d9d2c7', accent: '#2d3a33', light: 2700, adds: ['mirror', 'armchair', 'plant'],
    kw: ['paris', 'parisian', 'french', 'france', 'classic', 'elegant', 'prancis', '法式', '巴黎', 'フレンチ', '프렌치', 'francés', 'parisino'] },
  { id: 'farmhouse', cc: 'US', wall: { finish: 'shiplap', color: '#f2f0e9' }, floor: { type: 'oak', color: '#9c7653' },
    wood: '#8a6a4a', fabric: '#d6d2c8', accent: '#23324a', light: 2700, adds: ['rug', 'plant', 'floorLamp'],
    kw: ['farmhouse', 'rustic', 'country', 'american', 'amerika', '美式', '農舍', '农舍', 'ファームハウス', '팜하우스', 'granja'] },
  { id: 'midcentury', cc: 'US', wall: { finish: 'paint', color: '#efe8dc' }, floor: { type: 'walnut', color: '#6e4a2e' },
    wood: '#6e4a2e', fabric: '#2e6f6b', accent: '#d2a13a', light: 2700, adds: ['armchair', 'floorLamp', 'plant', 'rug'],
    kw: ['mid-century', 'midcentury', 'retro', 'mcm', '60s', 'eames', '中世紀', '中古', 'ミッドセンチュリー', '미드센추리', 'retro'] },
  { id: 'industrial', cc: 'US', wall: { finish: 'brick', color: '#8e4b35' }, floor: { type: 'concrete', color: '#8f8e8a' },
    wood: '#5a3d2a', fabric: '#6b3f25', accent: '#1d1f22', light: 3000, adds: ['floorLamp', 'plant', 'rug'],
    kw: ['industrial', 'loft', 'brick', 'concrete', 'urban', 'industri', 'bata', 'beton', '工業', '工业', 'インダストリアル', '인더스트리얼', 'industrial'] },
  { id: 'rajasthani', cc: 'IN', wall: { finish: 'plaster', color: '#e9d7b2' }, floor: { type: 'stone', color: '#c9b08a' },
    wood: '#6a3f22', fabric: '#d9822b', accent: '#2c3e73', light: 2700, adds: ['rug', 'cushion', 'lantern', 'plant'],
    kw: ['india', 'indian', 'rajasthan', 'jaipur', 'india', '印度', 'インド', '인도', 'indio'] },
  { id: 'thai', cc: 'TH', wall: { finish: 'wood', color: '#7a4b27' }, floor: { type: 'parquet', color: '#8a5a32' },
    wood: '#6b3f1f', fabric: '#8a1f2b', accent: '#c9a13b', light: 2700, adds: ['cushion', 'plant', 'lantern'],
    kw: ['thai', 'thailand', 'siam', '泰式', '泰國', '泰国', 'タイ', '태국', 'tailandés'] },
  { id: 'brazil', cc: 'BR', wall: { finish: 'paint', color: '#e9e4da' }, floor: { type: 'concrete', color: '#b4ada2' },
    wood: '#8a5a32', fabric: '#e6dccb', accent: '#2f6b4f', light: 3000, adds: ['plant', 'plant', 'armchair', 'rug'],
    kw: ['brazil', 'brazilian', 'modernist', 'jungle', 'brasil', '巴西', 'ブラジル', '브라질', 'brasileño'] },
  { id: 'minimal', cc: 'XX', wall: { finish: 'paint', color: '#f4f3ef' }, floor: { type: 'oak', color: '#cdb391' },
    wood: '#c0a27c', fabric: '#d9d7d1', accent: '#1f2326', light: 3500, adds: [],
    kw: ['minimal', 'minimalist', 'minimalis', 'clean', 'simple', 'modern', 'bersih', '極簡', '极简', '簡約', '简约', '現代', '现代', 'ミニマル', '미니멀', 'minimalista', 'moderno'] },
];

// Words in the "describe it" box that tweak the plan. Matching is case-insensitive substring.
export const DESCRIBE_MODIFIERS = [
  { kw: ['bright', 'light', 'airy', 'terang', 'cerah', '明亮', '亮', '明るい', '밝은', 'luminoso', 'claro'], mod: 'brighter' },
  { kw: ['dark', 'moody', 'gelap', '暗', '深色', 'ダーク', '어두운', 'oscuro'], mod: 'darker' },
  { kw: ['warm', 'hangat', '溫暖', '温暖', '暖', '따뜻', 'cálido'], mod: 'warmer' },
  { kw: ['cool', 'cold', 'sejuk', 'dingin', '冷', '涼', '凉', 'クール', '시원', 'fresco', 'frío'], mod: 'cooler' },
  { kw: ['cozy', 'cosy', 'nyaman', '溫馨', '温馨', '舒適', '舒适', '居心地', '아늑', 'acogedor'], mod: 'cozy' },
  { kw: ['plant', 'green', 'tanaman', 'hijau', '植物', '綠', '绿', 'グリーン', '식물', 'planta', 'verde'], mod: 'plants' },
  { kw: ['luxury', 'luxurious', 'mewah', '奢華', '奢华', '豪華', '高級', '럭셔리', 'lujo', 'lujoso'], mod: 'luxury' },
  { kw: ['cheap', 'budget', 'murah', 'hemat', '便宜', '省錢', '省钱', '安い', '저렴', 'barato', 'económico'], mod: 'budget' },
  { kw: ['colorful', 'colourful', 'warna-warni', 'ceria', '繽紛', '缤纷', '多彩', 'カラフル', '화려', 'colorido'], mod: 'colorful' },
  { kw: ['study', 'work', 'office', 'belajar', 'kerja', '書房', '书房', '工作', '勉強', '공부', 'estudio', 'trabajo'], mod: 'work' },
];

export const COLOR_WORDS = [
  { kw: ['sage', 'olive', 'green', 'hijau', '綠', '绿', '緑', '초록', 'verde'], hex: '#7f9273' },
  { kw: ['blue', 'navy', 'biru', '藍', '蓝', '青', '파랑', 'azul'], hex: '#355c7d' },
  { kw: ['terracotta', 'rust', 'bata', '赤陶', 'テラコッタ', '테라코타'], hex: '#c0603e' },
  { kw: ['pink', 'blush', 'merah muda', 'pink', '粉', 'ピンク', '분홍', 'rosa'], hex: '#e2b4b0' },
  { kw: ['yellow', 'mustard', 'kuning', '黃', '黄', 'イエロー', '노랑', 'amarillo'], hex: '#d6a93c' },
  { kw: ['black', 'hitam', '黑', '黒', '검정', 'negro'], hex: '#24262a' },
  { kw: ['white', 'putih', '白', '흰', 'blanco'], hex: '#f5f4f0' },
  { kw: ['beige', 'cream', 'krem', '米色', '奶油', 'ベージュ', '베이지', 'crema'], hex: '#e7dcc6' },
  { kw: ['grey', 'gray', 'abu', '灰', 'グレー', '회색', 'gris'], hex: '#a9aaa6' },
  { kw: ['red', 'merah', '紅', '红', '赤', '빨강', 'rojo'], hex: '#a63a32' },
];

// Optional impact score (0-10) per renovation line, used by the budget optimiser.
export const IMPACT = { wall: 9, floor: 7, ceiling: 3, lighting: 8, curtains: 5, add: 5, rug: 6, plant: 5 };
