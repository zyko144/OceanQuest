// Polices Unicode « océan » pour les noms de salons et les titres.

const SMALL_CAPS = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
  n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};
const REVERSE_SMALL_CAPS = Object.fromEntries(Object.entries(SMALL_CAPS).map(([k, v]) => [v, k]));

const stripAccents = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');

function mapAlphabet(text, upperStart, lowerStart, digitStart) {
  return [...stripAccents(text)].map((ch) => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90 && upperStart) return String.fromCodePoint(upperStart + code - 65);
    if (code >= 97 && code <= 122 && lowerStart) return String.fromCodePoint(lowerStart + code - 97);
    if (code >= 48 && code <= 57 && digitStart) return String.fromCodePoint(digitStart + code - 48);
    return ch;
  }).join('');
}

const fonts = {
  smallCaps: (text) => [...stripAccents(text.toLowerCase())].map((ch) => SMALL_CAPS[ch] ?? ch).join(''),
  boldSans: (text) => mapAlphabet(text, 0x1d5d4, 0x1d5ee, 0x1d7ec),
  boldSerif: (text) => mapAlphabet(text, 0x1d400, 0x1d41a, 0x1d7ce),
  boldScript: (text) => mapAlphabet(text, 0x1d4d0, 0x1d4ea, null),
  monospace: (text) => mapAlphabet(text, 0x1d670, 0x1d68a, 0x1d7f6),
};

// Décor du thème : modifie ici pour changer le style de tout le serveur.
const theme = {
  categoryName: (emoji, label) => `≋≋ ${emoji} ${fonts.boldSans(label.toUpperCase())} ≋≋`,
  textName: (emoji, label) => `${emoji}・${fonts.smallCaps(label).replace(/\s+/g, '-')}`,
  voiceName: (emoji, label) => `${emoji}︱${fonts.smallCaps(label)}`,
};

// Ramène un nom stylisé à une clé ASCII comparable (« 🌊・ʙɪᴇɴᴠᴇɴᴜᴇ » -> « bienvenue »).
function normalizeName(name) {
  return [...String(name)]
    .map((ch) => REVERSE_SMALL_CAPS[ch] ?? ch)
    .join('')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

module.exports = { fonts, theme, normalizeName, stripAccents };
