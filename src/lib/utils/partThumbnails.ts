// src/lib/utils/partThumbnails.ts
// Automatic thumbnail mapping for stock parts
// 🖼️ Matches part names to images in /public/stock/

/**
 * Maps part name patterns to thumbnail filenames in /public/stock/
 * Add more entries as you add more thumbnails
 */
const THUMBNAIL_MAP: Record<string, string> = {
  'oil filter': 'oil-filter.png',
  'air filter': 'air-filter.png',
  'engine oil': 'engine-oil.png',
  'brake pads': 'brake-pads.png',
  'brake discs': 'brake-discs.png',
  'clutch-kit': 'clutch-kit.png',
  'tyre': 'tyres.png',
  'timing belt kit': 'timing.png',
  'fuel filter': 'fuel-filter.png',
  'battery': 'battery.png',
  'gearbox oil': 'gearbox-oil.png',
  'Wheel with tyre': 'wheel.png',
  'nuts': 'nuts.png',
  'tie rod end': 'tie-rod-end.png',
  'alternator': 'alternator.png',
  'pulley': 'pulley.png',
  'seat belt': 'seat-belt.png',
  'cv': 'cv-joint.png',
  'windscreen': 'windscreen.png',

  // Romanian part-name keys → same thumbnails (additive; English keys above match first)
  'filtru de ulei': 'oil-filter.png',
  'filtru de aer': 'air-filter.png',
  'ulei de motor': 'engine-oil.png',
  'plăcuțe de frână': 'brake-pads.png',
  'placute de frana': 'brake-pads.png',
  'discuri de frână': 'brake-discs.png',
  'discuri de frana': 'brake-discs.png',
  'kit ambreiaj': 'clutch-kit.png',
  'anvelop': 'tyres.png',
  'kit distribuție': 'timing.png',
  'kit distributie': 'timing.png',
  'filtru de combustibil': 'fuel-filter.png',
  'baterie': 'battery.png',
  'ulei de cutie': 'gearbox-oil.png',
  'jantă': 'wheel.png',
  'janta': 'wheel.png',
  'piuliță': 'nuts.png',
  'piulita': 'nuts.png',
  'cap de bară': 'tie-rod-end.png',
  'cap de bara': 'tie-rod-end.png',
  'fulie': 'pulley.png',
  'centură de siguranță': 'seat-belt.png',
  'centura de siguranta': 'seat-belt.png',
  'planetară': 'cv-joint.png',
  'planetara': 'cv-joint.png',
  'parbriz': 'windscreen.png',

  // Bulgarian part-name keys → same thumbnails (additive; English/RO keys above match first)
  'маслен филтър': 'oil-filter.png',
  'въздушен филтър': 'air-filter.png',
  'двигателно масло': 'engine-oil.png',
  'предни накладки': 'brake-pads.png',
  'задни накладки': 'brake-pads.png',
  'накладки': 'brake-pads.png',
  'предни спирачни дискове': 'brake-discs.png',
  'задни спирачни дискове': 'brake-discs.png',
  'спирачни дискове': 'brake-discs.png',
  'комплект съединител': 'clutch-kit.png',
  'резервна гума': 'tyres.png',
  'гума': 'tyres.png',
  'комплект ангренажен ремък': 'timing.png',
  'горивен филтър': 'fuel-filter.png',
  'акумулатор': 'battery.png',
  'трансмисионно масло': 'gearbox-oil.png',
  'алуминиева джанта': 'wheel.png',
  'стоманена джанта': 'wheel.png',
  'джанта': 'wheel.png',
  'гайка джанта': 'nuts.png',
  'накрайник кормилна щанга': 'tie-rod-end.png',
  'шайба колянов вал': 'pulley.png',
  'предпазен колан': 'seat-belt.png',
  'каре': 'cv-joint.png',
  'предно стъкло': 'windscreen.png',
  'алтернатор': 'alternator.png',

  // Polish part-name keys -> same thumbnails (additive)
  'filtr oleju': 'oil-filter.png',
  'filtr powietrza': 'air-filter.png',
  'olej silnikowy': 'engine-oil.png',
  'klocki hamulcowe': 'brake-pads.png',
  'klocki': 'brake-pads.png',
  'tarcze hamulcowe': 'brake-discs.png',
  'tarcza hamulcowa': 'brake-discs.png',
  'zestaw sprzęgła': 'clutch-kit.png',
  'opona': 'tyres.png',
  'zestaw rozrządu': 'timing.png',
  'pasek rozrządu': 'timing.png',
  'filtr paliwa': 'fuel-filter.png',
  'akumulator': 'battery.png',
  'olej przekładniowy': 'gearbox-oil.png',
  'olej skrzyni': 'gearbox-oil.png',
  'felga': 'wheel.png',
  'nakrętka koła': 'nuts.png',
  'końcówka drążka': 'tie-rod-end.png',
  'koło pasowe': 'pulley.png',
  'pas bezpieczeństwa': 'seat-belt.png',
  'półoś': 'cv-joint.png',
  'przegub': 'cv-joint.png',
  'szyba czołowa': 'windscreen.png',
  'szyba przednia': 'windscreen.png',
  // Add more thumbnails here as you create them:
  // 'brake pad': 'brake-pad.png',
  // 'air filter': 'air-filter.png',
  // 'spark plug': 'spark-plug.png',
};

/**
 * Get thumbnail path for a part based on its name
 * Returns generic.png if no specific thumbnail matches
 * 
 * @param partName - The name of the part (e.g., "Oil Filter", "Brake Pads")
 * @returns Path to thumbnail (specific or generic)
 */
export function getPartThumbnail(partName: string): string {
  if (!partName) return '/stock/generic.png';
  
  const normalizedName = partName.toLowerCase().trim();
  
  // Check for exact or partial matches
  for (const [key, thumbnail] of Object.entries(THUMBNAIL_MAP)) {
    if (normalizedName.includes(key)) {
      return `/stock/${thumbnail}`;
    }
  }
  
  // Return generic thumbnail for unmapped parts
  return '/stock/generic.png';
}

/**
 * Check if a specific (non-generic) thumbnail exists for a part
 * 
 * @param partName - The name of the part
 * @returns true if a specific thumbnail exists (not generic)
 */
export function hasPartThumbnail(partName: string): boolean {
  if (!partName) return false;
  const normalizedName = partName.toLowerCase().trim();
  return Object.keys(THUMBNAIL_MAP).some(key => normalizedName.includes(key));
}