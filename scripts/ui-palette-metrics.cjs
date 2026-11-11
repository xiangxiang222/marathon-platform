/* Runs inside a browser context. Keep this function self-contained so that
 * Playwright can serialize it for both Web and Mini source mirrors. */
function inspectUiPalette() {
  const parse = value => {
    const match = String(value).match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])] : null;
  };
  const composite = (front, back) => front.slice(0, 3).map((value, index) => value * front[3] + back[index] * (1 - front[3]));
  const luminance = color => color.slice(0, 3).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const gradientColors = (image, background) => [...String(image).matchAll(/rgba?\([^)]+\)/g)].map(match => parse(match[0])).filter(Boolean).map(color => composite(color, background));
  const family = color => {
    const [r, g, b] = color.map(value => value / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    if (delta < 0.035) return 'neutral';
    let hue = max === r ? (g - b) / delta % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    return hue < 18 || hue >= 345 ? 'coral' : hue < 75 ? 'apricot-gold' : hue < 175 ? 'mint' : hue < 260 ? 'sky' : 'lilac';
  };
  const effective = element => {
    if (!element) return [255, 255, 255];
    const color = parse(getComputedStyle(element).backgroundColor) || [0, 0, 0, 0];
    return composite(color, effective(element.parentElement));
  };
  const visible = element => { const rect = element.getBoundingClientRect(), style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'; };
  const hero = document.querySelector('.event-hero, .activity-page .hero');
  let activityHero = null;
  if (hero && visible(hero)) {
    const style = getComputedStyle(hero), under = effective(hero.parentElement), background = effective(hero);
    const colors = [background, ...gradientColors(style.backgroundImage, background)];
    for (const pseudo of ['::before', '::after']) {
      const overlay = getComputedStyle(hero, pseudo), color = parse(overlay.backgroundColor);
      const width = parseFloat(overlay.width), height = parseFloat(overlay.height), rect = hero.getBoundingClientRect();
      if (overlay.display !== 'none' && color?.[3] > 0 && width * height > rect.width * rect.height * 0.5) colors.push(composite(color, background));
    }
    const minimumBackgroundLuminance = Math.min(...colors.map(luminance)), textLuminance = luminance(parse(style.color) || under);
    const minimumTextContrast = (minimumBackgroundLuminance + 0.05) / (textLuminance + 0.05);
    activityHero = { class: hero.className, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage, color: style.color, minimumBackgroundLuminance, textLuminance, minimumTextContrast,
      brightReadableSurface: minimumBackgroundLuminance >= 0.65 && textLuminance <= 0.3 && minimumTextContrast >= 4.5 };
  }
  const darkNeutralControls = [...document.querySelectorAll('button, input, textarea, select')].filter(visible).filter(element => {
    const rect = element.getBoundingClientRect(), raw = parse(getComputedStyle(element).backgroundColor);
    return raw?.[3] > 0 && rect.width * rect.height >= 400 && luminance(effective(element)) < 0.2 && Math.max(...raw.slice(0, 3)) - Math.min(...raw.slice(0, 3)) < 48;
  }).map(element => ({ tag: element.tagName, class: element.className, text: (element.innerText || element.getAttribute('aria-label') || '').slice(0, 40), background: getComputedStyle(element).backgroundColor }));
  const tokens = getComputedStyle(document.body);
  const token = (...names) => {
    let value = names.map(name => tokens.getPropertyValue(name).trim().toLowerCase()).find(Boolean) || '';
    if (/^#[0-9a-f]{3}$/.test(value)) value = '#' + value.slice(1).split('').map(character => character + character).join('');
    return value;
  };
  // Record pastel backgrounds as color, including gradient stops. A gradient
  // itself is never treated as a dark fill. These observations support visual
  // review; they are not a claim that every pixel or text contrast was sampled.
  const coloredSurfaces = [...document.querySelectorAll('body,main,section,article,form,div,button,a')].filter(visible).map(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element), background = effective(element);
    const area = Math.max(0, Math.min(innerWidth, rect.right) - Math.max(0, rect.left)) * Math.max(0, Math.min(innerHeight, rect.bottom) - Math.max(0, rect.top));
    const colors = [background, ...gradientColors(style.backgroundImage, background)];
    const families = [...new Set(colors.filter(color => luminance(color) >= 0.65).map(family).filter(value => value !== 'neutral'))];
    return { tag: element.tagName, class: typeof element.className === 'string' ? element.className : '', area: Math.round(area), background: style.backgroundColor, gradient: style.backgroundImage, families };
  }).filter(value => value.area >= 600 && value.families.length).sort((a, b) => b.area - a.area).slice(0, 24);
  const pastelFamilies = [...new Set(coloredSurfaces.flatMap(value => value.families))];
  return { palette: { accent: token('--accent', '--brand'), background: token('--bg', '--page-bg'), surface: token('--card', '--surface'), ink: token('--ink', '--text'), secondary: token('--muted', '--text-secondary'), border: token('--line', '--border'), sky: token('--sky-soft'), mint: token('--mint-soft'), lilac: token('--lilac-soft'), sun: token('--sun-soft'), peach: token('--peach-soft') }, activityHero, darkNeutralControls,
    colorRichness: { method: 'Visible first-viewport DOM backgrounds and gradient-stop colors; no pixel coverage claim', pastelFamilies, coloredSurfaces } };
}

module.exports = { inspectUiPalette };
