// Country name → ISO 3166-1 alpha-2 → flag emoji.
// Covers every name/alias in country-centroids.js (English + Italian aliases).
const NAME_TO_CC = {
  'afghanistan': 'AF', 'afganistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'angola': 'AO',
  'argentina': 'AR', 'armenia': 'AM', 'australia': 'AU', 'austria': 'AT', 'azerbaijan': 'AZ',
  'bahrain': 'BH', 'bangladesh': 'BD', 'belarus': 'BY', 'belgium': 'BE', 'belgio': 'BE',
  'belize': 'BZ', 'benin': 'BJ', 'bolivia': 'BO', 'bosnia': 'BA', 'botswana': 'BW',
  'brazil': 'BR', 'brasile': 'BR', 'bulgaria': 'BG', 'burkina faso': 'BF', 'burundi': 'BI',
  'cambodia': 'KH', 'cameroon': 'CM', 'canada': 'CA', 'central african republic': 'CF',
  'chad': 'TD', 'chile': 'CL', 'china': 'CN', 'cina': 'CN', 'colombia': 'CO', 'congo': 'CG',
  'dr congo': 'CD', 'costa rica': 'CR', 'croatia': 'HR', 'cuba': 'CU', 'cyprus': 'CY',
  'cipro': 'CY', 'czech republic': 'CZ', 'denmark': 'DK', 'danimarca': 'DK',
  'dominican republic': 'DO', 'ecuador': 'EC', 'egypt': 'EG', 'egitto': 'EG',
  'el salvador': 'SV', 'eritrea': 'ER', 'estonia': 'EE', 'ethiopia': 'ET',
  'finland': 'FI', 'finlandia': 'FI', 'france': 'FR', 'francia': 'FR', 'gabon': 'GA',
  'germany': 'DE', 'germania': 'DE', 'ghana': 'GH', 'greece': 'GR', 'grecia': 'GR',
  'guatemala': 'GT', 'guinea': 'GN', 'haiti': 'HT', 'honduras': 'HN', 'hungary': 'HU',
  'india': 'IN', 'indonesia': 'ID', 'iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE',
  'irlanda': 'IE', 'israel': 'IL', 'israele': 'IL', 'italy': 'IT', 'italia': 'IT',
  'ivory coast': 'CI', 'jamaica': 'JM', 'japan': 'JP', 'giappone': 'JP', 'jordan': 'JO',
  'giordania': 'JO', 'kazakhstan': 'KZ', 'kenya': 'KE', 'kosovo': 'XK', 'kuwait': 'KW',
  'kyrgyzstan': 'KG', 'laos': 'LA', 'latvia': 'LV', 'lebanon': 'LB', 'libano': 'LB',
  'libya': 'LY', 'libia': 'LY', 'lithuania': 'LT', 'luxembourg': 'LU', 'madagascar': 'MG',
  'malawi': 'MW', 'malaysia': 'MY', 'mali': 'ML', 'mauritania': 'MR', 'mexico': 'MX',
  'messico': 'MX', 'moldova': 'MD', 'mongolia': 'MN', 'morocco': 'MA', 'marocco': 'MA',
  'mozambique': 'MZ', 'myanmar': 'MM', 'burma': 'MM', 'namibia': 'NA', 'nepal': 'NP',
  'netherlands': 'NL', 'olanda': 'NL', 'new zealand': 'NZ', 'nuova zelanda': 'NZ',
  'nicaragua': 'NI', 'niger': 'NE', 'nigeria': 'NG', 'north korea': 'KP',
  'corea del nord': 'KP', 'north macedonia': 'MK', 'norway': 'NO', 'norvegia': 'NO',
  'oman': 'OM', 'pakistan': 'PK', 'palestine': 'PS', 'gaza': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'filippine': 'PH', 'poland': 'PL', 'polonia': 'PL', 'portugal': 'PT', 'portogallo': 'PT',
  'qatar': 'QA', 'romania': 'RO', 'russia': 'RU', 'rwanda': 'RW', 'saudi arabia': 'SA',
  'arabia saudita': 'SA', 'senegal': 'SN', 'serbia': 'RS', 'sierra leone': 'SL',
  'slovakia': 'SK', 'slovenia': 'SI', 'somalia': 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'corea del sud': 'KR', 'south sudan': 'SS', 'spain': 'ES',
  'spagna': 'ES', 'sri lanka': 'LK', 'sudan': 'SD', 'sweden': 'SE', 'svezia': 'SE',
  'switzerland': 'CH', 'svizzera': 'CH', 'syria': 'SY', 'siria': 'SY', 'taiwan': 'TW',
  'tajikistan': 'TJ', 'tanzania': 'TZ', 'thailand': 'TH', 'togo': 'TG', 'tunisia': 'TN',
  'turkey': 'TR', 'türkiye': 'TR', 'turchia': 'TR', 'turkmenistan': 'TM', 'uganda': 'UG',
  'ukraine': 'UA', 'ucraina': 'UA', 'united arab emirates': 'AE', 'uae': 'AE',
  'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB', 'united states': 'US', 'usa': 'US',
  'america': 'US', 'uruguay': 'UY', 'uzbekistan': 'UZ', 'venezuela': 'VE', 'vietnam': 'VN',
  'yemen': 'YE', 'zambia': 'ZM', 'zimbabwe': 'ZW',
};

const ccToEmoji = (cc) => cc.replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));

// Returns the flag emoji for a country name (or '' when unknown).
export function flagFor(name) {
  if (!name) return '';
  const k = name.trim().toLowerCase();
  const cc = NAME_TO_CC[k] || NAME_TO_CC[Object.keys(NAME_TO_CC).find(n => k.startsWith(n))] || null;
  return cc ? ccToEmoji(cc) : '';
}
