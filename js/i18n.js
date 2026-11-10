import en from './i18n/en.js';
import id from './i18n/id.js';
import zhTW from './i18n/zh-TW.js';
import zhCN from './i18n/zh-CN.js';
import ja from './i18n/ja.js';
import ko from './i18n/ko.js';
import es from './i18n/es.js';

export const DICTS = { en, id, 'zh-TW': zhTW, 'zh-CN': zhCN, ja, ko, es };
export const LANGS = [
  ['en', 'English'], ['id', 'Bahasa Indonesia'], ['zh-TW', '繁體中文'], ['zh-CN', '简体中文'], ['ja', '日本語'], ['ko', '한국어'], ['es', 'Español'],
];

let lang = 'en';

export function setLang(l) {
  lang = DICTS[l] ? l : 'en';
  document.documentElement.lang = lang;
}

export function getLang() {
  return lang;
}

export function t(key, params) {
  let s = (DICTS[lang] && DICTS[lang][key]) ?? en[key] ?? key;
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (_, k) => {
      const v = params[k];
      if (v && typeof v === 'object' && v.t) return t(v.t);
      return v ?? '';
    });
  }
  return s;
}

export function guessLang() {
  const nav = (navigator.languages || [navigator.language || 'en']).map((x) => x || '');
  for (const n of nav) {
    if (/^zh-(TW|HK|MO|Hant)/i.test(n)) return 'zh-TW';
    if (/^zh/i.test(n)) return 'zh-CN';
    const base = n.split('-')[0];
    if (DICTS[base]) return base;
    if (base === 'ms') return 'id';
  }
  return 'en';
}

export function regionName(code) {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code);
  } catch {
    return code;
  }
}
