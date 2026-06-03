// src/lib/utils/partGrouping.ts
// Smart keyword-based grouping for stock parts
// Groups parts by category (Filters, Pads, Discs, etc.) instead of exact name match

/**
 * Part category definitions
 * Each category has keywords that trigger grouping
 * Keywords are checked in order - more specific matches first
 */
const PART_CATEGORIES: Record<string, {
  label: string
  keywords: string[]
  icon: string // Can be emoji OR image path (e.g., '/stock/timing.png')
  color: string // Gradient color for cards
}> = {
  filters: {
    label: 'Filters',
    keywords: ['filter', 'dpf filter', 'filtru', 'филтър', 'dpf филтър', 'filtr', 'filtr oleju', 'filtr powietrza', 'filtr paliwa', 'filtr kabinowy', 'filtr przeciwpyłkowy', 'filtr dpf'],
    icon: '/stock/filters.png', // Replace with '/stock/filters.png' when you have it
    color: 'from-blue-500 to-blue-600'
  },
  oils: {
    label: 'Oils & Fluids',
    keywords: ['engine oil', 'transmission oil', 'differential oil', 'transfer case oil', 'coolant', 'brake fluid', 'power steering fluid', 'windscreen washer fluid', 'ac gas', 'ulei de motor', 'ulei de cutie', 'ulei cutie', 'ulei diferenț', 'ulei diferent', 'ulei servodirec', 'ulei transfer', 'antigel', 'lichid de răcire', 'lichid de racire', 'lichid de frână', 'lichid de frana', 'lichid spălător', 'lichid spalator', 'freon', 'двигателно масло', 'трансмисионно масло', 'масло диференциал', 'масло раздатъчна', 'антифриз', 'охладителна течност', 'спирачна течност', 'масло хидравлично кормило', 'течност чистачки', 'газ климатик', 'olej silnikowy', 'olej przekładniowy', 'olej skrzyni', 'olej do skrzyni', 'olej mostu', 'olej dyferencjału', 'olej reduktora', 'płyn chłodniczy', 'płyn chłodzący', 'płyn do chłodnicy', 'płyn hamulcowy', 'płyn do wspomagania', 'płyn wspomagania kierownicy', 'płyn do spryskiwaczy', 'czynnik klimatyzacji', 'gaz do klimatyzacji'],
    icon: '/stock/oils.png', // Replace with '/stock/oils.png' when you have it
    color: 'from-amber-500 to-amber-600'
  },
  brakePads: {
    label: 'Brake Pads',
    keywords: ['brake pad', 'brake shoe', 'plăcuțe', 'placute', 'saboți', 'saboti', 'накладки', 'спирачни челюсти', 'klocki', 'klocki hamulcowe', 'szczęki hamulcowe', 'okładziny hamulcowe'],
    icon: '/stock/brake-pads.png', // Replace with '/stock/brake-pads.png' when you have it
    color: 'from-red-500 to-red-600'
  },
  brakeDiscs: {
    label: 'Brake Discs',
    keywords: ['brake disc', 'brake drum', 'rotor', 'discuri de frână', 'discuri de frana', 'tamburi', 'tambur', 'спирачни дискове', 'спирачен диск', 'спирачни барабани', 'tarcze hamulcowe', 'tarcza hamulcowa', 'bęben hamulcowy', 'bębny hamulcowe'],
    icon: '/stock/brake-discs.png', // Replace with '/stock/brake-discs.png' when you have it
    color: 'from-rose-500 to-rose-600'
  },
  brakeSystem: {
    label: 'Brake System',
    keywords: ['brake caliper', 'brake hose', 'brake pipe', 'brake master', 'brake servo', 'abs sensor', 'handbrake', 'brake light switch', 'etrier', 'furtun de frână', 'furtun de frana', 'conductă de frână', 'conducta de frana', 'pompă centrală frână', 'pompa centrala frana', 'servofrână', 'servofrana', 'senzor abs', 'frână de mână', 'frana de mana', 'contact stop frână', 'contact stop frana', 'спирачен апарат', 'спирачен маркуч', 'спирачна тръба', 'спирачна помпа', 'серво спирачка', 'abs датчик', 'ръчна спирачка', 'стоп ключ', 'zacisk hamulcowy', 'zacisk hamulca', 'przewód hamulcowy', 'wąż hamulcowy', 'pompa hamulcowa', 'serwo hamulca', 'czujnik abs', 'hamulec ręczny', 'włącznik świateł stop'],
    icon: '/stock/brake-system.png', // ✅ YOUR EXAMPLE - brake-system.png is ready!
    color: 'from-red-600 to-red-700'
  },
  belts: {
    label: 'Belts & Timing',
    keywords: ['timing belt', 'timing chain', 'timing cover', 'auxiliary belt', 'serpentine belt', 'distribuție', 'distributie', 'curea auxiliară', 'curea auxiliara', 'curea de accesorii', 'lanț de distribuție', 'lant de distributie', 'ангренаж', 'ангренажен ремък', 'ангренажна верига', 'допълнителен ремък', 'пистов ремък', 'pasek rozrządu', 'rozrząd', 'łańcuch rozrządu', 'pasek wielorowkowy', 'pasek osprzętu', 'pasek klinowy', 'pasek dodatkowy'],
    icon: '/stock/timing.png', // ✅ YOUR EXAMPLE - timing.png is ready!
    color: 'from-gray-600 to-gray-700'
  },
  ignition: {
    label: 'Ignition',
    keywords: ['spark plug', 'glow plug', 'ignition coil', 'glow plug relay', 'glow plug control', 'bujie', 'bobină de inducție', 'bobina de inductie', 'свещ', 'подгревна свещ', 'запалителна бобина', 'реле подгревни свещи', 'модул подгревни свещи', 'świeca zapłonowa', 'świeca żarowa', 'świece', 'cewka zapłonowa', 'przekaźnik świec żarowych', 'sterownik świec żarowych'],
    icon: '/stock/ignition.png',
    color: 'from-yellow-500 to-yellow-600'
  },
  cooling: {
    label: 'Cooling System',
    keywords: ['water pump', 'thermostat', 'radiator', 'expansion tank', 'heater matrix', 'heater blower', 'coolant temperature', 'radiator fan', 'cooling fan', 'pompă de apă', 'pompa de apa', 'termostat', 'vas de expansiune', 'vas expansiune', 'calorifer', 'aerotermă', 'aeroterma', 'ventilator radiator', 'temperatură lichid', 'temperatura lichid', 'радиатор', 'водна помпа', 'термостат', 'разширителен съд', 'радиатор парно', 'вентилатор парно', 'вентилатор охлаждане', 'температура охладителна', 'pompa wody', 'pompa cieczy', 'termostat', 'chłodnica', 'zbiornik wyrównawczy', 'nagrzewnica', 'wentylator chłodnicy', 'wentylator chłodzenia', 'czujnik temperatury cieczy'],
    icon: '/stock/cooling.png',
    color: 'from-cyan-500 to-cyan-600'
  },
  clutch: {
    label: 'Clutch & Flywheel',
    keywords: ['clutch kit', 'clutch slave', 'clutch master', 'flywheel', 'dual mass', 'clutch bearing', 'release bearing', 'clutch switch', 'ambreiaj', 'volantă', 'volanta', 'rulment de presiune', 'rulment presiune', 'съединител', 'маховик', 'лагер съединител', 'аксиален лагер', 'sprzęgło', 'zestaw sprzęgła', 'koło zamachowe', 'dwumasowe koło', 'łożysko oporowe', 'wysprzęglik', 'pompa sprzęgła'],
    icon: '/stock/clutch-kit.png',
    color: 'from-slate-600 to-slate-700'
  },
  gaskets: {
    label: 'Gaskets & Seals',
    keywords: ['head gasket', 'rocker cover gasket', 'sump gasket', 'sump plug', 'oil sump', 'exhaust gasket', 'gearbox oil seal', 'driveshaft seal', 'differential seal', 'injector seal', 'garnitură', 'garnitura', 'baie de ulei', 'baie ulei', 'simering', 'гарнитура', 'семеринг', 'маслена вана', 'пробка маслена', 'шайба пробка', 'uszczelka', 'uszczelka pod głowicę', 'uszczelka głowicy', 'uszczelka miski', 'miska olejowa', 'korek spustowy', 'simmering', 'uszczelniacz', 'pierścień uszczelniający'],
    icon: '/stock/gaskets.png',
    color: 'from-gray-500 to-gray-600'
  },
  driveshafts: {
    label: 'Driveshafts & CV Joints',
    keywords: ['driveshaft', 'cv joint', 'propshaft', 'planetară', 'planetara', 'cap planetar', 'cardan', 'полуоска', 'каре', 'кардан', 'półoś', 'półos', 'wał napędowy', 'przegub', 'przegub napędowy', 'wałek napędowy', 'wał kardana'],
    icon: '/stock/driveshafts.png',
    color: 'from-indigo-500 to-indigo-600'
  },
  bearings: {
    label: 'Bearings & Hubs',
    keywords: ['wheel bearing', 'hub assembly', 'harmonic balancer', 'rulment roată', 'rulment roata', 'butuc', 'главинен лагер', 'главина', 'демпферна шайба', 'łożysko koła', 'piasta', 'piasta koła', 'koło pasowe wału', 'tłumik drgań'],
    icon: '/stock/bearings.png',
    color: 'from-purple-500 to-purple-600'
  },
  suspension: {
    label: 'Suspension',
    keywords: ['shock absorber', 'coil spring', 'suspension arm', 'control arm', 'drop link', 'anti roll bar', 'suspension bush', 'ball joint', 'sway bar', 'subframe bush', 'amortizor', 'arc spiral', 'arc elicoidal', 'braț suspensie', 'brat suspensie', 'bieletă', 'bieleta', 'antiruliu', 'bară stabilizatoare', 'bara stabilizatoare', 'bucșă', 'bucsa', 'pivot', 'амортисьор', 'носач', 'тампон стабилизатор', 'тампон окачване', 'тампон преден носач', 'шарнир', 'линк щанга', 'линк стабилизатор', 'стабилизираща щанга', 'пружина', 'amortyzator', 'sprężyna', 'sprężyna zawieszenia', 'wahacz', 'łącznik stabilizatora', 'stabilizator', 'tuleja wahacza', 'tuleja zawieszenia', 'sworzeń', 'sworzeń wahacza', 'guma stabilizatora', 'poduszka silnika zawieszenia'],
    icon: '/stock/suspension.png',
    color: 'from-orange-500 to-orange-600'
  },
  steering: {
    label: 'Steering',
    keywords: ['track rod', 'steering rack', 'power steering pump', 'steering column', 'steering u joint', 'steering angle', 'clock spring', 'cap de bară', 'cap de bara', 'bară de direcție', 'bara de directie', 'direcție', 'directie', 'servodirecție', 'servodirectie', 'coloană de direcție', 'coloana de directie', 'unghi volan', 'spirală airbag', 'spirala airbag', 'кормилна', 'хидравлично кормило', 'ъгъл волан', 'лентов кабел еърбег', 'drążek kierowniczy', 'końcówka drążka', 'przekładnia kierownicza', 'maglownica', 'pompa wspomagania', 'kolumna kierownicy', 'wspomaganie kierownicy', 'kąt skrętu', 'taśma airbag', 'pierścień airbag'],
    icon: '/stock/steering.png',
    color: 'from-teal-500 to-teal-600'
  },
  electrical: {
    label: 'Electrical & Battery',
    keywords: ['battery', 'alternator', 'starter motor', 'starter solenoid', 'fuse', 'relay', 'horn relay', 'battery terminal', 'battery clamp', 'engine wiring', 'baterie', 'electromotor', 'solenoid', 'fuzibil', 'siguranță fuzibilă', 'siguranta fuzibila', 'releu', 'instalație electrică', 'instalatie electrica', 'bornă baterie', 'borna baterie', 'clemă baterie', 'clema baterie', 'bujii incandescente', 'алтернатор', 'стартер', 'соленоид', 'акумулатор', 'предпазител', 'реле', 'кабелен сноп', 'клема акумулатор', 'скоба акумулатор', 'akumulator', 'alternator', 'rozrusznik', 'automat rozrusznika', 'bezpiecznik', 'przekaźnik', 'klema akumulatora', 'zacisk akumulatora', 'wiązka elektryczna', 'instalacja elektryczna'],
    icon: '/stock/electrical.png',
    color: 'from-green-500 to-green-600'
  },
  lights: {
    label: 'Lights & Bulbs',
    keywords: ['headlight', 'taillight', 'tail light', 'indicator bulb', 'fog light', 'number plate light', 'side marker', 'light bulb', 'far', 'bec', 'stop', 'semnalizare', 'lampă', 'lampa', 'proiector ceață', 'ceață', 'ceata', 'număr înmatriculare', 'numar inmatriculare', 'фар', 'крушка', 'стоп', 'мигач', 'халоген', 'габаритна лампа', 'лампа регистрационен номер', 'reflektor', 'lampa', 'żarówka', 'światło stop', 'kierunkowskaz', 'halogen', 'światło przeciwmgielne', 'lampa tylna', 'oświetlenie tablicy', 'światło pozycyjne'],
    icon: '/stock/lights.png',
    color: 'from-yellow-400 to-yellow-500'
  },
  wipers: {
    label: 'Wipers & Washers',
    keywords: ['wiper blade', 'wiper motor', 'windscreen washer pump', 'ștergător', 'stergator', 'ștergătoare', 'stergatoare', 'spălător parbriz', 'spalator parbriz', 'чистачк', 'помпа чистачки', 'wycieraczka', 'wycieraczki', 'pióro wycieraczki', 'silnik wycieraczek', 'pompka spryskiwacza', 'spryskiwacz szyby'],
    icon: '/stock/wipers.png',
    color: 'from-blue-400 to-blue-500'
  },
  fuel: {
    label: 'Fuel System',
    keywords: ['fuel pump', 'fuel injector', 'throttle body', 'injector', 'fuel tank', 'fuel cap', 'fuel filler', 'fuel pressure', 'pompă de combustibil', 'pompa de combustibil', 'pompă de înaltă', 'pompa de inalta', 'clapetă de accelerație', 'clapeta de acceleratie', 'rezervor', 'presiune combustibil', 'горивна помпа', 'гориворазпределителна', 'дюза', 'инжектор', 'дроселова клапа', 'резервоар гориво', 'гърловина резервоар', 'капачка резервоар', 'скоба резервоар', 'регулатор налягане гориво', 'гарнитури дюзи', 'pompa paliwa', 'wtryskiwacz', 'przepustnica', 'zbiornik paliwa', 'pompa wysokiego ciśnienia', 'korek wlewu paliwa', 'wlew paliwa', 'ciśnienie paliwa', 'regulator ciśnienia paliwa'],
    icon: '/stock/fuel-system.png',
    color: 'from-red-400 to-red-500'
  },
  exhaust: {
    label: 'Exhaust & Emissions',
    keywords: ['egr valve', 'catalytic', 'lambda sensor', 'map sensor', 'maf sensor', 'particle matter', 'exhaust flexi', 'exhaust back box', 'exhaust middle', 'exhaust mount', 'eșapament', 'esapament', 'egr', 'catalizator', 'lambda', 'senzor map', 'senzor particule', 'particule', 'debitmetru', 'flexibil eșapament', 'tobă', 'toba', 'ауспух', 'катализатор', 'ламбда', 'egr клапан', 'map датчик', 'дебитомер', 'прахови частици', 'гофре', 'гърне ауспух', 'гарнитура ауспух', 'zawór egr', 'egr', 'katalizator', 'sonda lambda', 'czujnik lambda', 'czujnik map', 'przepływomierz', 'filtr cząstek stałych', 'flex układu wydechowego', 'tłumik wydechu', 'wydech', 'kolektor wydechowy'],
    icon: '/stock/exhaust.png',
    color: 'from-gray-400 to-gray-500'
  },
  turbo: {
    label: 'Turbo & Intake',
    keywords: ['turbocharger', 'turbo actuator', 'intercooler', 'boost hose', 'vacuum pump', 'vacuum hose', 'pcv valve', 'turbo', 'turbosuflantă', 'turbosuflanta', 'turbină', 'turbina', 'furtun turbo', 'vacuum', 'pcv', 'турбо', 'турбина', 'интеркулер', 'вакуум', 'pcv клапан', 'turbosprężarka', 'turbina', 'turbo', 'intercooler', 'chłodnica powietrza', 'wąż turbo', 'pompa próżniowa', 'podciśnienie', 'zawór pcv', 'aktuator turbiny'],
    icon: '/stock/turbo.png',
    color: 'from-sky-500 to-sky-600'
  },
  engine: {
    label: 'Engine Internals',
    keywords: ['oil pump', 'oil pickup', 'oil pressure sensor', 'oil level sensor', 'dipstick', 'rocker arm', 'hydraulic lifter', 'camshaft', 'crankshaft pulley', 'crankshaft sensor', 'knock sensor', 'engine mount', 'suport motor', 'tampon motor', 'senzor vibrochen', 'vibrochen', 'ax came', 'axe came', 'detonație', 'detonatie', 'presiune ulei', 'nivel ulei', 'pompă de ulei', 'pompa de ulei', 'sorb', 'jojă', 'joja', 'culbutor', 'tachet', 'fulie', 'маслена помпа', 'маслоприемник', 'маслоизмерителна', 'кобилица', 'хидравличен повдигач', 'разпределителен вал', 'колянов вал', 'детонационен датчик', 'налягане масло', 'ниво масло', 'тампон двигател', 'шайба колянов', 'pompa oleju', 'smok oleju', 'czujnik ciśnienia oleju', 'czujnik poziomu oleju', 'miarka oleju', 'bagnet oleju', 'dźwigienka zaworowa', 'popychacz hydrauliczny', 'wałek rozrządu', 'wał korbowy', 'koło pasowe wału korbowego', 'czujnik położenia wału', 'czujnik spalania stukowego', 'poduszka silnika', 'łapa silnika', 'wspornik silnika'],
    icon: '/stock/engine.png',
    color: 'from-zinc-600 to-zinc-700'
  },
  sensors: {
    label: 'Sensors',
    keywords: ['tpms sensor', 'parking sensor', 'accelerator pedal sensor', 'wheel speed sensor', 'seat occupancy sensor', 'ac pressure sensor', 'senzor tpms', 'tpms', 'pedală accelerație', 'pedala acceleratie', 'senzor de parcare', 'parcare', 'turație roată', 'turatie roata', 'prezență scaun', 'prezenta scaun', 'presiune ac', 'tpms датчик', 'датчик паркиране', 'датчици паркиране', 'датчик педал газ', 'датчик обороти колело', 'датчик заета седалка', 'датчик налягане климатик', 'czujnik tpms', 'tpms', 'czujnik parkowania', 'czujniki parkowania', 'czujnik pedału gazu', 'czujnik prędkości koła', 'czujnik obecności na fotelu', 'czujnik ciśnienia klimatyzacji'],
    icon: '/stock/sensors.png',
    color: 'from-violet-500 to-violet-600'
  },
  body: {
    label: 'Body & Interior',
    keywords: ['door lock actuator', 'body moulding', 'panel', 'window regulator', 'window motor', 'mirror unit', 'mirror glass', 'door handle', 'seat belt', 'bonnet cable', 'bonnet lock', 'engine undertray', 'horn', 'front bumper', 'rear bumper', 'side skirt', 'roof rack', 'tow bar', 'boot lock', 'boot strut', 'mirror cover', 'door card', 'door trim', 'interior trim', 'dashboard', 'glove box', 'sun visor', 'seat cover', 'headrest', 'trim','mirror','door','window','bonnet','boot','bump','skirt','roof','tow','interior','dashboard','glove box','sun visor','seat cover','headrest', 'închidere ușă', 'inchidere usa', 'actuator ușă', 'macara', 'oglindă', 'oglinda', 'mâner', 'maner', 'centură', 'centura', 'claxon', 'cârlig de remorcare', 'carlig de remorcare', 'remorcare', 'scut motor', 'capotă', 'capota', 'broască capotă', 'broasca capota', 'огледало', 'стъкло огледало', 'дръжка врата', 'ключалка врата', 'стъклоповдигач', 'предпазен колан', 'клаксон', 'теглич', 'кора под двигателя', 'преден капак', 'брава преден капак', 'жило преден капак', 'lusterko', 'szyba lusterka', 'klamka drzwi', 'zamek drzwi', 'siłownik zamka', 'podnośnik szyby', 'pas bezpieczeństwa', 'klakson', 'sygnał dźwiękowy', 'hak holowniczy', 'holowanie', 'osłona silnika', 'pokrywa silnika', 'maska', 'zamek maski', 'linka maski', 'zderzak przedni', 'zderzak tylny', 'próg', 'bagażnik dachowy', 'deska rozdzielcza', 'schowek', 'osłona przeciwsłoneczna', 'pokrowiec fotela', 'zagłówek'],
    icon: '/stock/body.png',
    color: 'from-stone-500 to-stone-600'
  },
  aircon: {
    label: 'Air Conditioning',
    keywords: ['ac compressor', 'ac condenser', 'compresor ac', 'condensator', 'компресор климатик', 'кондензатор климатик', 'sprężarka klimatyzacji', 'kompresor klimatyzacji', 'skraplacz klimatyzacji', 'chłodnica klimatyzacji'],
    icon: '/stock/aircon.png',
    color: 'from-cyan-400 to-cyan-500'
  },
  glass: {
    label: 'Glass',
    keywords: ['windscreen', 'rear window', 'side window', 'sunroof glass', 'door glass', 'parbriz', 'lunetă', 'luneta', 'geam', 'sticlă trapă', 'sticla trapa', 'trapă', 'trapa', 'предно стъкло', 'задно стъкло', 'странично стъкло', 'стъкло шибидах', 'стъкло врата', 'szyba czołowa', 'szyba przednia', 'szyba tylna', 'szyba boczna', 'szyba drzwi', 'szyba szyberdachu', 'szyberdach'],
    icon: '/stock/glass.png',
    color: 'from-sky-300 to-sky-400'
  },
  wheels: {
    label: 'Wheels & Tyres',
    keywords: ['wheel bolt', 'wheel nut', 'alloy wheel', 'steel wheel', 'tyre', 'spare wheel', 'jack', 'wheel brace', 'prezon', 'piuliță roată', 'piulita roata', 'jantă', 'janta', 'anvelop', 'roată de rezervă', 'roata de rezerva', 'cric', 'cheie roți', 'cheie roti', 'джанта', 'гума', 'болт джанта', 'гайка джанта', 'крик', 'ключ за джанти', 'śruba koła', 'nakrętka koła', 'felga', 'felga aluminiowa', 'felga stalowa', 'opona', 'koło zapasowe', 'podnośnik', 'lewarek', 'klucz do kół'],
    icon: '/stock/wheels.png',
    color: 'from-neutral-600 to-neutral-700'
  },
  transmission: {
    label: 'Transmission & Gearbox',
    keywords: ['gearbox mount', 'automatic gearbox', 'gear selector', 'differential', '4x4 actuator', 'reverse light switch', 'suport cutie', 'timonerie', 'selector', 'diferențial', 'diferential', 'marșarier', 'marsarier', '4x4', 'cutie automată', 'cutie automata', 'тампон скоростна кутия', 'скоростна кутия', 'жило скоростен лост', 'диференциал', 'актуатор 4x4', 'светлини заден ход', 'раздатъчна кутия', 'poduszka skrzyni biegów', 'skrzynia biegów', 'skrzynia automatyczna', 'selektor biegów', 'linka zmiany biegów', 'dyferencjał', 'mechanizm różnicowy', 'aktuator 4x4', 'włącznik świateł cofania', 'reduktor', 'skrzynia rozdzielcza'],
    icon: '/stock/transmission.png',
    color: 'from-slate-500 to-slate-600'
  },
  electronics: {
    label: 'Electronics & Modules',
    keywords: ['ecu', 'immobiliser module', 'airbag module', 'calculator motor', 'calculator', 'imobilizator', 'airbag', 'modul airbag', 'компютър двигател', 'имобилайзер', 'модул еърбег', 'sterownik silnika', 'komputer silnika', 'ecu', 'immobilizer', 'poduszka powietrzna', 'moduł airbag', 'moduł poduszki powietrznej'],
    icon: '/stock/ecu.png', 
    color: 'from-blue-600 to-blue-700'
  },
  
  misc: {
    label: 'Miscellaneous',
    keywords: [], // Catch-all for unmatched parts
    icon: '/stock/generic.png',
    color: 'from-gray-500 to-gray-600'
  }
}

export interface PartGroup {
  category: string
  label: string
  icon: string
  color: string
  parts: any[]
  totalQuantity: number
  totalValue: number
  lowestStock: number
  hasLowStock: boolean
  hasOutOfStock: boolean
}

/**
 * Get category for a part based on its name
 * Returns category key or 'misc' if no match
 */
function getCategoryForPart(partName: string): string {
  const lowerName = partName.toLowerCase()
  
  // Check each category's keywords in order
  for (const [categoryKey, category] of Object.entries(PART_CATEGORIES)) {
    // Skip misc - it's the fallback
    if (categoryKey === 'misc') continue
    
    for (const keyword of category.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return categoryKey
      }
    }
  }
  
  return 'misc' // Fallback to miscellaneous
}

/**
 * Group parts by smart categories
 */
export function groupPartsByCategory(parts: any[]): PartGroup[] {
  const groups: Record<string, PartGroup> = {}
  
  // Group parts
  parts.forEach(part => {
    const categoryKey = getCategoryForPart(part.partName)
    
    // Initialize group if it doesn't exist
    if (!groups[categoryKey]) {
      const categoryInfo = PART_CATEGORIES[categoryKey]
      groups[categoryKey] = {
        category: categoryKey,
        label: categoryInfo.label,
        icon: categoryInfo.icon,
        color: categoryInfo.color,
        parts: [],
        totalQuantity: 0,
        totalValue: 0,
        lowestStock: Infinity,
        hasLowStock: false,
        hasOutOfStock: false,
      }
    }
    
    const group = groups[categoryKey]
    group.parts.push(part)
    group.totalQuantity += part.quantity
    group.totalValue += part.quantity * part.netPrice
    group.lowestStock = Math.min(group.lowestStock, part.quantity)
    
    if (part.quantity === 0) group.hasOutOfStock = true
    if (part.quantity < part.restockTarget) group.hasLowStock = true
  })
  
  // Convert to array and sort
  const groupArray = Object.values(groups)
    .filter(g => g.parts.length > 0) // Only groups with parts
    .sort((a, b) => {
      // Misc always at the end
      if (a.category === 'misc') return 1
      if (b.category === 'misc') return -1
      // Sort by total value (highest first)
      return b.totalValue - a.totalValue
    })
  
  return groupArray
}

/**
 * Get all available categories with their info
 */
export function getPartCategories() {
  return PART_CATEGORIES
}