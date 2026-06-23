// src/components/stock/AddPartModal.tsx
// 🔥 ULTRA PROFESSIONAL DESIGN - YOUR BRAND COLORS - ALL FEATURES PRESERVED
// ✅ MOBILE FIXES: Compact form, easier input deletion, fixed X button, smaller buttons
// ✅ ENHANCED: Multi make/model support + custom supplier input
// ✅ NEW: One-off part support with vehicle registration linking

'use client'

import React, { useState, useEffect, useRef } from 'react'
import { X, Package, Zap, Search, Tag, TrendingUp, Box, Sparkles, Link, Car } from 'lucide-react'
import { stockService } from '@/lib/services/stockService'
import { userProfileService, settingsService } from '@/lib/firestore'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import { useT, useLang } from '@/lib/i18n'

interface AddPartModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  defaultPartNumber?: string
}

// ─── Vehicle suggestion from fleet/yard lookup ────────────────────────────────
interface VehicleSuggestion {
  id: string
  registration: string
  make?: string
  model?: string
  source: 'fleet' | 'yard'
}

// COMPREHENSIVE PARTS LIST
const PARTS_LIST = [
  'Engine Oil', 'Oil Filter', 'Air Filter', 'Cabin Filter', 'Fuel Filter',
  'Spark Plug', 'Glow Plug', 'Ignition Coil', 'Timing Belt kit','Timing cover', 'Timing Chain','Oil sump',
  'Auxiliary Belt', 'Serpentine Belt', 'Water Pump', 'Thermostat', 'Radiator',
  'Radiator Cap', 'Coolant', 'Expansion Tank','Expansion Tank Cap', 'Head Gasket', 'Rocker Cover Gasket',
  'Sump Gasket', 'Sump Plug', 'Sump Plug Washer', 'Clutch Kit', 'Clutch Slave Cylinder',
  'Clutch Master Cylinder', 'Flywheel', 'Dual Mass Flywheel', 'Gearbox Mount', 'Engine Mount',
  'Driveshaft OS', 'Driveshaft NS', 'CV Joint OS', 'CV Joint NS', 'Inner CV Joint',
  'Outer CV Joint', 'Wheel Bearing Front', 'Wheel Bearing Rear', 'Hub Assembly', 'Brake Pads Front',
  'Brake Pads Rear', 'Brake Discs Front', 'Brake Discs Rear', 'Brake Caliper Front', 'Brake Caliper Rear',
  'Brake Hose', 'Brake Pipe', 'Brake Fluid', 'ABS Sensor', 'Brake Shoes',
  'Brake Drums', 'Handbrake Cable', 'Brake Master Cylinder', 'Brake Servo', 'Shock Absorber Front',
  'Shock Absorber Rear', 'Coil Spring Front', 'Coil Spring Rear', 'Suspension Arm Front Lower', 'Suspension Arm Front Upper',
  'Rear Control Arm', 'Drop Link', 'Anti Roll Bar', 'Anti Roll Bar Bush', 'Suspension Bush',
  'Ball Joint', 'Track Rod End', 'Inner Track Rod', 'Steering Rack', 'Power Steering Pump',
  'Power Steering Fluid', 'Steering Column', 'Steering U Joint', 'Battery', 'Alternator',
  'Starter Motor', 'Starter Solenoid', 'Glow Plug Relay', 'Fuse', 'Relay',
  'Headlight Bulb', 'Tail Light Bulb', 'Indicator Bulb', 'Wiper Blade Front', 'Wiper Blade Rear',
  'Wiper Motor', 'Windscreen Washer Pump', 'Windscreen Washer Fluid', 'Door Lock Actuator', 'Window Regulator',
  'Window Motor', 'Fuel Pump', 'High Pressure Fuel Pump', 'Fuel Injector', 'Throttle Body','Injector',
  'EGR Valve', 'DPF Filter', 'Catalytic Converter', 'Lambda Sensor', 'MAP Sensor','Particle Matter sensor',
  'MAF Sensor', 'Crankshaft Sensor', 'Camshaft Sensor', 'Knock Sensor', 'Turbocharger',
  'Intercooler', 'Boost Hose', 'Vacuum Pump', 'Vacuum Hose', 'PCV Valve',
  'Engine Coolant Temperature Sensor', 'Oil Pressure Sensor', 'Oil Level Sensor', 'Heater Matrix', 'Heater Blower Motor',
  'AC Compressor', 'AC Condenser', 'AC Pressure Sensor', 'AC Gas', 'Clutch Bearing',
  'Release Bearing', 'Wheel Bolt', 'Wheel Nut', 'Alloy Wheel', 'Steel Wheel',
  'Tyre', 'Spare Wheel', 'Jack', 'Wheel Brace', 'Tow Bar',
  'TPMS Sensor', 'Exhaust Flexi Pipe', 'Exhaust Back Box', 'Exhaust Middle Section', 'Exhaust Mount','NS headlight', 'OS headlight', 'NS tail light', 'OS tail light', 'Radiator Fan',
  'Exhaust Gasket', 'Sway Bar Link', 'Subframe Bush', 'Engine Undertray', 'Bonnet Cable', 'NS Mirror unit', 'OS Mirror unit','NS Mirror glass', 'OS Mirror glass',
  'Bonnet Lock', 'Door Mirror', 'Door Handle', 'Seat Belt', 'Airbag Module',
  'ECU', 'Immobiliser Module', 'Gear Selector Cable', 'Propshaft', 'Differential',
  'Throttle Cable', 'Accelerator Pedal Sensor', 'Brake Light Switch', 'Clutch Switch', 'Reverse Light Switch', 'Windscreen', 'Rear Window', 'Side Window', 'Sunroof Glass', 'Door Glass',
  'Parking Sensor', 'Parking Sensor Module', 'Horn', 'Horn Relay', 'Number Plate Light',
  'Side Marker Light', 'Fog Light Front', 'Fog Light Rear', 'Fuel Tank', 'Fuel Tank Strap',
  'Fuel Cap', 'Fuel Filler Neck', 'Fuel Pressure Regulator', 'Injector Seal Kit', 'Rocker Arm',
  'Hydraulic Lifter', 'Camshaft', 'Crankshaft Pulley', 'Harmonic Balancer', 'Engine Timing Cover',
  'Oil Pump', 'Oil Pickup Pipe', 'Dipstick', 'Dipstick Tube', 'Transmission Oil',
  'Automatic Gearbox Filter', 'Gearbox Oil Seal', 'Driveshaft Seal', 'Differential Oil', 'Differential Seal',
  'Transfer Case Oil', '4x4 Actuator', 'Wheel Speed Sensor', 'Steering Angle Sensor', 'Clock Spring',
  'Seat Occupancy Sensor', 'Engine Wiring Loom', 'Battery Terminal', 'Battery Clamp', 'Glow Plug Control Module',
  'Turbo Actuator', 'Intercooler Hose', 'Radiator Fan', 'Radiator Fan Switch', 'Engine Cooling Fan Relay'
]

// COMPREHENSIVE PARTS LIST — Romanian (garage trade terms). Same order as PARTS_LIST.
// Names are deliberately chosen so partGrouping/partThumbnails keyword matching
// keeps the SAME category/icon behaviour as the English equivalents.
const PARTS_LIST_RO = [
  'Ulei de motor', 'Filtru de ulei', 'Filtru de aer', 'Filtru polen', 'Filtru de combustibil',
  'Bujie', 'Bujie incandescentă', 'Bobină de inducție', 'Kit distribuție', 'Capac distribuție', 'Lanț de distribuție', 'Baie de ulei',
  'Curea auxiliară', 'Curea de accesorii', 'Pompă de apă', 'Termostat', 'Radiator',
  'Bușon radiator', 'Antigel', 'Vas de expansiune', 'Bușon vas expansiune', 'Garnitură de chiulasă', 'Garnitură capac culbutori',
  'Garnitură baie de ulei', 'Bușon baie de ulei', 'Șaibă bușon baie de ulei', 'Kit ambreiaj', 'Cilindru receptor ambreiaj',
  'Pompă centrală ambreiaj', 'Volantă', 'Volantă bimasă', 'Suport cutie de viteze', 'Suport motor',
  'Planetară dreapta', 'Planetară stânga', 'Cap planetară dreapta', 'Cap planetară stânga', 'Cap planetară interior',
  'Cap planetară exterior', 'Rulment roată față', 'Rulment roată spate', 'Butuc roată', 'Plăcuțe de frână față',
  'Plăcuțe de frână spate', 'Discuri de frână față', 'Discuri de frână spate', 'Etrier frână față', 'Etrier frână spate',
  'Furtun de frână', 'Conductă de frână', 'Lichid de frână', 'Senzor ABS', 'Saboți de frână',
  'Tamburi de frână', 'Cablu frână de mână', 'Pompă centrală frână', 'Servofrână', 'Amortizor față',
  'Amortizor spate', 'Arc spiral față', 'Arc spiral spate', 'Braț suspensie față jos', 'Braț suspensie față sus',
  'Braț suspensie spate', 'Bieletă antiruliu', 'Bară antiruliu', 'Bucșă bară antiruliu', 'Bucșă suspensie',
  'Pivot', 'Cap de bară direcție', 'Bară de direcție interioară', 'Casetă de direcție', 'Pompă servodirecție',
  'Ulei servodirecție', 'Coloană de direcție', 'Cruce coloană direcție', 'Baterie', 'Alternator',
  'Electromotor', 'Solenoid electromotor', 'Releu bujii incandescente', 'Siguranță fuzibilă', 'Releu',
  'Bec far', 'Bec stop', 'Bec semnalizare', 'Ștergător parbriz', 'Ștergător lunetă',
  'Motoraș ștergătoare', 'Pompă spălător parbriz', 'Lichid spălător parbriz', 'Actuator închidere ușă', 'Macara geam',
  'Motoraș macara geam', 'Pompă de combustibil', 'Pompă de înaltă presiune', 'Injector combustibil', 'Clapetă de accelerație', 'Injector',
  'Supapă EGR', 'Filtru de particule', 'Catalizator', 'Sondă lambda', 'Senzor MAP', 'Senzor particule',
  'Debitmetru aer', 'Senzor vibrochen', 'Senzor ax came', 'Senzor de detonație', 'Turbosuflantă',
  'Intercooler', 'Furtun turbo', 'Pompă de vacuum', 'Furtun de vacuum', 'Supapă PCV',
  'Senzor temperatură lichid răcire', 'Senzor presiune ulei', 'Senzor nivel ulei', 'Calorifer habitaclu', 'Aerotermă habitaclu',
  'Compresor AC', 'Condensator AC', 'Senzor presiune AC', 'Freon', 'Rulment presiune ambreiaj',
  'Rulment de presiune', 'Prezon roată', 'Piuliță roată', 'Jantă aliaj', 'Jantă tablă',
  'Anvelopă', 'Roată de rezervă', 'Cric', 'Cheie roți', 'Cârlig de remorcare',
  'Senzor TPMS', 'Flexibil eșapament', 'Tobă finală eșapament', 'Tobă intermediară eșapament', 'Suport eșapament', 'Far stânga', 'Far dreapta', 'Stop stânga', 'Stop dreapta', 'Ventilator radiator',
  'Garnitură eșapament', 'Bieletă bară stabilizatoare', 'Bucșă jug motor', 'Scut motor', 'Cablu capotă', 'Oglindă stânga', 'Oglindă dreapta', 'Sticlă oglindă stânga', 'Sticlă oglindă dreapta',
  'Broască capotă', 'Oglindă exterioară', 'Mâner ușă', 'Centură de siguranță', 'Modul airbag',
  'Calculator motor', 'Modul imobilizator', 'Cablu timonerie', 'Cardan', 'Diferențial',
  'Cablu accelerație', 'Senzor pedală accelerație', 'Contact stop frână', 'Contact ambreiaj', 'Contact marșarier', 'Parbriz', 'Lunetă', 'Geam lateral', 'Sticlă trapă', 'Geam ușă',
  'Senzor de parcare', 'Modul senzori parcare', 'Claxon', 'Releu claxon', 'Lampă număr înmatriculare',
  'Lampă laterală', 'Proiector ceață față', 'Lampă ceață spate', 'Rezervor combustibil', 'Chingă rezervor',
  'Bușon rezervor', 'Gât umplere rezervor', 'Regulator presiune combustibil', 'Kit garnituri injectoare', 'Culbutor',
  'Tachet hidraulic', 'Ax came', 'Fulie vibrochen', 'Fulie vibrochen amortizor', 'Capac distribuție motor',
  'Pompă de ulei', 'Sorb pompă ulei', 'Jojă ulei', 'Tub jojă', 'Ulei de cutie',
  'Filtru cutie automată', 'Simering cutie de viteze', 'Simering planetară', 'Ulei diferențial', 'Simering diferențial',
  'Ulei cutie transfer', 'Actuator 4x4', 'Senzor turație roată', 'Senzor unghi volan', 'Spirală airbag',
  'Senzor prezență scaun', 'Instalație electrică motor', 'Bornă baterie', 'Clemă baterie', 'Modul bujii incandescente',
  'Actuator turbină', 'Furtun intercooler', 'Ventilator radiator', 'Comutator ventilator radiator', 'Releu ventilator răcire'
]

// COMPREHENSIVE PARTS LIST — Bulgarian (auto-parts trade terms). Same order as PARTS_LIST.
// Names are deliberately chosen so partGrouping/partThumbnails keyword matching
// keeps the SAME category/icon behaviour as the English equivalents.
const PARTS_LIST_BG = [
  'Двигателно масло', 'Маслен филтър', 'Въздушен филтър', 'Филтър купе', 'Горивен филтър',
  'Свещ', 'Подгревна свещ', 'Запалителна бобина', 'Комплект ангренажен ремък', 'Капак ангренаж', 'Ангренажна верига', 'Маслена вана',
  'Допълнителен ремък', 'Пистов ремък', 'Водна помпа', 'Термостат', 'Радиатор',
  'Капачка радиатор', 'Антифриз', 'Разширителен съд', 'Капачка разширителен съд', 'Гарнитура глава', 'Гарнитура капак клапани',
  'Гарнитура маслена вана', 'Пробка маслена вана', 'Шайба пробка маслена вана', 'Комплект съединител', 'Долна помпа съединител',
  'Горна помпа съединител', 'Маховик', 'Двумасов маховик', 'Тампон скоростна кутия', 'Тампон двигател',
  'Полуоска дясна', 'Полуоска лява', 'Каре дясно', 'Каре ляво', 'Вътрешно каре',
  'Външно каре', 'Преден главинен лагер', 'Заден главинен лагер', 'Главина', 'Предни накладки',
  'Задни накладки', 'Предни спирачни дискове', 'Задни спирачни дискове', 'Преден спирачен апарат', 'Заден спирачен апарат',
  'Спирачен маркуч', 'Спирачна тръба', 'Спирачна течност', 'ABS датчик', 'Спирачни челюсти',
  'Спирачни барабани', 'Жило ръчна спирачка', 'Спирачна помпа', 'Серво спирачка', 'Преден амортисьор',
  'Заден амортисьор', 'Предна пружина', 'Задна пружина', 'Преден долен носач', 'Преден горен носач',
  'Заден носач', 'Линк щанга', 'Стабилизираща щанга', 'Тампон стабилизатор', 'Тампон окачване',
  'Шарнир', 'Накрайник кормилна щанга', 'Вътрешна кормилна щанга', 'Кормилна рейка', 'Помпа хидравлично кормило',
  'Масло хидравлично кормило', 'Кормилна колона', 'Кръстачка кормилна колона', 'Акумулатор', 'Алтернатор',
  'Стартер', 'Соленоид стартер', 'Реле подгревни свещи', 'Предпазител', 'Реле',
  'Крушка фар', 'Крушка стоп', 'Крушка мигач', 'Предна чистачка', 'Задна чистачка',
  'Моторче чистачки', 'Помпа чистачки', 'Течност чистачки', 'Моторче ключалка врата', 'Стъклоповдигач',
  'Моторче стъклоповдигач', 'Горивна помпа', 'Гориворазпределителна помпа високо налягане', 'Дюза', 'Дроселова клапа', 'Инжектор',
  'EGR клапан', 'DPF филтър', 'Катализатор', 'Ламбда сонда', 'MAP датчик', 'Датчик прахови частици',
  'Дебитомер въздух', 'Датчик колянов вал', 'Датчик разпределителен вал', 'Детонационен датчик', 'Турбокомпресор',
  'Интеркулер', 'Маркуч турбо', 'Вакуум помпа', 'Вакуум маркуч', 'PCV клапан',
  'Датчик температура охладителна течност', 'Датчик налягане масло', 'Датчик ниво масло', 'Радиатор парно', 'Моторче вентилатор парно',
  'Компресор климатик', 'Кондензатор климатик', 'Датчик налягане климатик', 'Газ климатик', 'Лагер съединител',
  'Аксиален лагер', 'Болт джанта', 'Гайка джанта', 'Алуминиева джанта', 'Стоманена джанта',
  'Гума', 'Резервна гума', 'Крик', 'Ключ за джанти', 'Теглич',
  'TPMS датчик', 'Гофре ауспух', 'Гърне ауспух заден', 'Гърне ауспух среден', 'Тампон ауспух', 'Ляв фар', 'Десен фар', 'Ляв стоп', 'Десен стоп', 'Вентилатор радиатор',
  'Гарнитура ауспух', 'Линк стабилизатор', 'Тампон преден носач рамка', 'Кора под двигателя', 'Жило преден капак', 'Ляво огледало', 'Дясно огледало', 'Ляво стъкло огледало', 'Дясно стъкло огледало',
  'Брава преден капак', 'Външно огледало', 'Дръжка врата', 'Предпазен колан', 'Модул еърбег',
  'Компютър двигател', 'Имобилайзер модул', 'Жило скоростен лост', 'Кардан', 'Диференциал',
  'Жило газ', 'Датчик педал газ', 'Стоп ключ', 'Ключ съединител', 'Ключ светлини заден ход', 'Предно стъкло', 'Задно стъкло', 'Странично стъкло', 'Стъкло шибидах', 'Стъкло врата',
  'Датчик паркиране', 'Модул датчици паркиране', 'Клаксон', 'Реле клаксон', 'Лампа регистрационен номер',
  'Странична габаритна лампа', 'Преден халоген', 'Заден халоген', 'Резервоар гориво', 'Скоба резервоар',
  'Капачка резервоар', 'Гърловина резервоар', 'Регулатор налягане гориво', 'Комплект гарнитури дюзи', 'Кобилица',
  'Хидравличен повдигач', 'Разпределителен вал', 'Шайба колянов вал', 'Демпферна шайба', 'Капак ангренаж двигател',
  'Маслена помпа', 'Маслоприемник', 'Маслоизмерителна пръчка', 'Тръба маслоизмерителна пръчка', 'Трансмисионно масло',
  'Филтър автоматична скоростна кутия', 'Семеринг скоростна кутия', 'Семеринг полуоска', 'Масло диференциал', 'Семеринг диференциал',
  'Масло раздатъчна кутия', 'Актуатор 4x4', 'Датчик обороти колело', 'Датчик ъгъл волан', 'Лентов кабел еърбег',
  'Датчик заета седалка', 'Кабелен сноп двигател', 'Клема акумулатор', 'Скоба акумулатор', 'Модул подгревни свещи',
  'Актуатор турбина', 'Маркуч интеркулер', 'Вентилатор радиатор', 'Ключ вентилатор радиатор', 'Реле вентилатор охлаждане'
]

// COMPREHENSIVE PARTS LIST — Polish (auto-parts trade terms). Same order as PARTS_LIST.
// Names are deliberately chosen so partGrouping/partThumbnails keyword matching
// keeps the SAME category/icon behaviour as the English equivalents.
const PARTS_LIST_PL = [
  'Olej silnikowy', 'Filtr oleju', 'Filtr powietrza', 'Filtr kabinowy', 'Filtr paliwa',
  'Świeca zapłonowa', 'Świeca żarowa', 'Cewka zapłonowa', 'Zestaw rozrządu', 'Pokrywa rozrządu', 'Łańcuch rozrządu', 'Miska olejowa',
  'Pasek osprzętu', 'Pasek wieloklinowy', 'Pompa wody', 'Termostat', 'Chłodnica',
  'Korek chłodnicy', 'Płyn chłodniczy', 'Zbiornik wyrównawczy', 'Korek zbiornika wyrównawczego', 'Uszczelka głowicy', 'Uszczelka pokrywy zaworów',
  'Uszczelka miski olejowej', 'Korek spustu oleju', 'Podkładka korka spustu oleju', 'Zestaw sprzęgła', 'Pompa podrzędna sprzęgła',
  'Pompa nadrzędna sprzęgła', 'Koło zamachowe', 'Dwumasowe koło zamachowe', 'Poduszka skrzyni biegów', 'Poduszka silnika',
  'Półoś prawa', 'Półoś lewa', 'Przegub napędowy prawy', 'Przegub napędowy lewy', 'Przegub wewnętrzny',
  'Przegub zewnętrzny', 'Łożysko koła przód', 'Łożysko koła tył', 'Piasta koła', 'Klocki hamulcowe przód',
  'Klocki hamulcowe tył', 'Tarcze hamulcowe przód', 'Tarcze hamulcowe tył', 'Zacisk hamulcowy przód', 'Zacisk hamulcowy tył',
  'Przewód hamulcowy', 'Rurka hamulcowa', 'Płyn hamulcowy', 'Czujnik ABS', 'Szczęki hamulcowe',
  'Bębny hamulcowe', 'Linka hamulca ręcznego', 'Pompa hamulcowa', 'Serwo hamulca', 'Amortyzator przód',
  'Amortyzator tył', 'Sprężyna zawieszenia przód', 'Sprężyna zawieszenia tył', 'Wahacz przedni dolny', 'Wahacz przedni górny',
  'Wahacz tylny', 'Łącznik stabilizatora', 'Stabilizator', 'Tuleja stabilizatora', 'Tuleja zawieszenia',
  'Sworzeń wahacza', 'Końcówka drążka kierowniczego', 'Drążek kierowniczy wewnętrzny', 'Przekładnia kierownicza', 'Pompa wspomagania kierownicy',
  'Płyn wspomagania kierownicy', 'Kolumna kierownicza', 'Krzyżak kolumny kierowniczej', 'Akumulator', 'Alternator',
  'Rozrusznik', 'Elektromagnes rozrusznika', 'Przekaźnik świec żarowych', 'Bezpiecznik', 'Przekaźnik',
  'Żarówka reflektora', 'Żarówka tylnej lampy', 'Żarówka kierunkowskazu', 'Pióro wycieraczki przód', 'Pióro wycieraczki tył',
  'Silnik wycieraczek', 'Pompa spryskiwacza szyby', 'Płyn do spryskiwaczy', 'Siłownik zamka drzwi', 'Podnośnik szyby',
  'Silnik podnośnika szyby', 'Pompa paliwa', 'Pompa wysokiego ciśnienia paliwa', 'Wtryskiwacz paliwa', 'Przepustnica', 'Wtryskiwacz',
  'Zawór EGR', 'Filtr DPF', 'Katalizator', 'Sonda lambda', 'Czujnik MAP', 'Czujnik cząstek stałych',
  'Przepływomierz powietrza', 'Czujnik wału korbowego', 'Czujnik wałka rozrządu', 'Czujnik spalania stukowego', 'Turbosprężarka',
  'Intercooler', 'Przewód turbo', 'Pompa podciśnienia', 'Przewód podciśnienia', 'Zawór PCV',
  'Czujnik temperatury płynu chłodniczego', 'Czujnik ciśnienia oleju', 'Czujnik poziomu oleju', 'Nagrzewnica', 'Silnik dmuchawy nagrzewnicy',
  'Sprężarka klimatyzacji', 'Skraplacz klimatyzacji', 'Czujnik ciśnienia klimatyzacji', 'Czynnik klimatyzacji', 'Łożysko sprzęgła',
  'Łożysko oporowe', 'Śruba koła', 'Nakrętka koła', 'Felga aluminiowa', 'Felga stalowa',
  'Opona', 'Koło zapasowe', 'Podnośnik', 'Klucz do kół', 'Hak holowniczy',
  'Czujnik TPMS', 'Łącznik elastyczny układu wydechowego', 'Tłumik tylny', 'Tłumik środkowy', 'Mocowanie wydechu', 'Lewy reflektor', 'Prawy reflektor', 'Lewa lampa tylna', 'Prawa lampa tylna', 'Wentylator chłodnicy',
  'Uszczelka wydechu', 'Łącznik stabilizatora', 'Tuleja ramy pomocniczej', 'Osłona pod silnik', 'Linka maski', 'Lewe lusterko', 'Prawe lusterko', 'Szkło lewego lusterka', 'Szkło prawego lusterka',
  'Zamek maski', 'Lusterko zewnętrzne', 'Klamka drzwi', 'Pas bezpieczeństwa', 'Moduł poduszki powietrznej',
  'Sterownik silnika ECU', 'Moduł immobilizera', 'Linka wyboru biegów', 'Wał napędowy', 'Mechanizm różnicowy',
  'Linka przepustnicy', 'Czujnik pedału przyspieszenia', 'Włącznik świateł stop', 'Włącznik sprzęgła', 'Włącznik świateł cofania', 'Szyba czołowa', 'Szyba tylna', 'Szyba boczna', 'Szkło szyberdachu', 'Szyba drzwi',
  'Czujnik parkowania', 'Moduł czujników parkowania', 'Klakson', 'Przekaźnik klaksonu', 'Lampka tablicy rejestracyjnej',
  'Lampka obrysowa boczna', 'Światło przeciwmgielne przód', 'Światło przeciwmgielne tył', 'Zbiornik paliwa', 'Opaska zbiornika paliwa',
  'Korek wlewu paliwa', 'Szyjka wlewu paliwa', 'Regulator ciśnienia paliwa', 'Zestaw uszczelek wtryskiwaczy', 'Dźwigienka zaworowa',
  'Popychacz hydrauliczny', 'Wałek rozrządu', 'Koło pasowe wału korbowego', 'Tłumik drgań skrętnych', 'Pokrywa rozrządu silnika',
  'Pompa oleju', 'Smok pompy oleju', 'Miarka poziomu oleju', 'Rurka miarki oleju', 'Olej przekładniowy',
  'Filtr automatycznej skrzyni biegów', 'Uszczelniacz skrzyni biegów', 'Uszczelniacz półosi', 'Olej mechanizmu różnicowego', 'Uszczelniacz mechanizmu różnicowego',
  'Olej skrzyni rozdzielczej', 'Siłownik 4x4', 'Czujnik prędkości obrotowej koła', 'Czujnik kąta skrętu kierownicy', 'Taśma zwijana poduszki',
  'Czujnik obecności pasażera', 'Wiązka elektryczna silnika', 'Klema akumulatora', 'Zacisk akumulatora', 'Moduł sterowania świec żarowych',
  'Siłownik turbosprężarki', 'Przewód intercoolera', 'Wentylator chłodnicy', 'Włącznik wentylatora chłodnicy', 'Przekaźnik wentylatora chłodzenia'
]

// MAKE & MODEL LIST
const VEHICLE_MODELS = [
  'All Vehicles',
  'Ford Transit', 'Ford Transit Custom', 'Ford Transit Connect', 'Ford Transit Courier',
  'Volkswagen Transporter (T6 / T6.1)', 'Volkswagen Crafter', 'Volkswagen Caddy',
  'Mercedes-Benz Sprinter', 'Mercedes-Benz Vito', 'Mercedes-Benz Citan',
  'Renault Trafic', 'Renault Master', 'Renault Kangoo',
  'Vauxhall Vivaro', 'Vauxhall Movano', 'Vauxhall Combo Cargo',
  'Peugeot Expert', 'Peugeot Boxer', 'Peugeot Partner',
  'Citroën Dispatch', 'Citroën Relay', 'Citroën Berlingo',
  'Fiat Ducato', 'Fiat Scudo', 'Fiat Doblo', 'Iveco Daily',
  'Nissan Primastar', 'Nissan Interstar', 'Nissan NV200', 'Nissan NV300', 'Nissan NV400',
  'Toyota Proace', 'Toyota Proace City', 'Toyota Hilux (used as commercial)',
  'MAN TGE', 'Maxus Deliver 9', 'Maxus eDeliver 3', 'Maxus eDeliver 9', 'LDV Deliver 9',
  'Mitsubishi L200 (commercial use)', 'Isuzu D-Max (commercial use)',
  'Hyundai H350', 'Hyundai iLoad', 'Hyundai i800 (commercial conversions)',
  'Opel Vivaro', 'Opel Movano', 'Opel Combo Cargo',
  'Ram ProMaster (EU equivalent: Fiat Ducato platform)',
  'Renault Express Van', 'Mercedes-Benz V-Class (commercial conversions)'
]

export function AddPartModal({ isOpen, onClose, onSuccess, defaultPartNumber }: AddPartModalProps) {
  const t = useT()
  const { lang } = useLang()
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [userDisplayName, setUserDisplayName] = useState<string>('Unknown')
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<string[]>([])

  // ── Mobile 3-step wizard (desktop keeps the full single-view form) ────────
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  )
  const [step, setStep] = useState(1)

  const [partSearch, setPartSearch] = useState('')
  const [modelSearch, setModelSearch] = useState('')

  // Multi make/model support
  const [makeModels, setMakeModels] = useState<string[]>([])
  const [makeModelInput, setMakeModelInput] = useState('')
  const [showSupplierDropdown, setShowSupplierDropdown] = useState(false)

  // ── One-off part / registration link ─────────────────────────────────────
  const [isOneOff, setIsOneOff] = useState(false)
  const [regSearch, setRegSearch] = useState('')
  const [regSuggestions, setRegSuggestions] = useState<VehicleSuggestion[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleSuggestion | null>(null)
  const [regSearchLoading, setRegSearchLoading] = useState(false)
  const regDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const [formData, setFormData] = useState({
    partName: '',
    partNumber: '',
    supplier: '',
    comments: '',
    quantity: '' as string | number,
    netPrice: '' as string | number,
    restockTarget: '' as string | number,
    unit: 'pieces' as 'pieces' | 'liters'
  })

  // ── Bootstrap user/org + suppliers ───────────────────────────────────────
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && isOpen) {
        try {
          const profile = await userProfileService.getProfile(user.uid)
          if (profile?.organizationId) {
            setOrganizationId(profile.organizationId)
            setUserDisplayName(profile.displayName || 'Unknown')
            const suppliersData = await settingsService.getSuppliers(profile.organizationId)
            setSuppliers(suppliersData)
          }
        } catch (error) {
          logger.error('Error fetching user data:', error)
        }
      }
    }
    fetchUserData()
  }, [user, isOpen])

  // ── Track viewport so the form is a wizard on phones, full form on desktop ─
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // ── Reset form when modal opens ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setFormData({
        partName: '',
        partNumber: defaultPartNumber || '',
        supplier: '',
        comments: '',
        quantity: '',
        netPrice: '',
        restockTarget: '',
        unit: 'pieces'
      })
      setPartSearch('')
      setModelSearch('')
      setMakeModels([])
      setMakeModelInput('')
      // Reset one-off state
      setIsOneOff(false)
      setRegSearch('')
      setRegSuggestions([])
      setSelectedVehicle(null)
    }
  }, [isOpen, defaultPartNumber])

  // ── Reg search: debounced lookup across fleet + yard ─────────────────────
  useEffect(() => {
    if (!isOneOff || !organizationId) return

    // Clear previous debounce
    if (regDebounceRef.current) clearTimeout(regDebounceRef.current)

    const trimmed = regSearch.trim().toUpperCase().replace(/\s+/g, '')

    if (trimmed.length < 2) {
      setRegSuggestions([])
      return
    }

    regDebounceRef.current = setTimeout(async () => {
      setRegSearchLoading(true)
      try {
        const results: VehicleSuggestion[] = []

        // Search fleet vehicles
        const { data: fleetData, error: fleetError } = await supabase
          .from('vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        if (fleetError) throw fleetError
        ;(fleetData ?? []).forEach(d => {
          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          if (reg.includes(trimmed)) {
            results.push({
              id: d.id,
              registration: d.registration,
              make: d.make,
              model: d.model,
              source: 'fleet'
            })
          }
        })

        // Search checked-in yard vehicles (avoid duplicates)
        const { data: yardData, error: yardError } = await supabase
          .from('checked_in_vehicles')
          .select('id, registration, make, model')
          .eq('organization_id', organizationId)
        if (yardError) throw yardError
        ;(yardData ?? []).forEach(d => {
          const reg = (d.registration || '').toUpperCase().replace(/\s+/g, '')
          if (reg.includes(trimmed)) {
            // Only add if not already in results from fleet
            const alreadyAdded = results.some(r =>
              r.registration?.toUpperCase().replace(/\s+/g, '') === reg
            )
            if (!alreadyAdded) {
              results.push({
                id: d.id,
                registration: d.registration,
                make: d.make,
                model: d.model,
                source: 'yard'
              })
            }
          }
        })

        setRegSuggestions(results.slice(0, 6)) // Cap at 6 suggestions
      } catch (err) {
        logger.error('Error searching registrations:', err)
      } finally {
        setRegSearchLoading(false)
      }
    }, 300)

    return () => {
      if (regDebounceRef.current) clearTimeout(regDebounceRef.current)
    }
  }, [regSearch, isOneOff, organizationId])

  const activePartsList = lang === 'ro' ? PARTS_LIST_RO : lang === 'bg' ? PARTS_LIST_BG : lang === 'pl' ? PARTS_LIST_PL : PARTS_LIST
  const filteredParts = activePartsList.filter(part =>
    part.toLowerCase().includes(partSearch.toLowerCase())
  )

  const filteredModels = VEHICLE_MODELS.filter(model =>
    model.toLowerCase().includes(modelSearch.toLowerCase())
  )

  const filteredSuppliers = suppliers.filter(sup =>
    sup.toLowerCase().includes(formData.supplier.toLowerCase())
  )

  const addMakeModel = () => {
    const trimmed = makeModelInput.trim()
    if (trimmed && !makeModels.includes(trimmed)) {
      setMakeModels([...makeModels, trimmed])
      setMakeModelInput('')
      setModelSearch('')
    }
  }

  const removeMakeModel = (index: number) => {
    setMakeModels(makeModels.filter((_, i) => i !== index))
  }

  const handleMakeModelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addMakeModel()
    }
  }

  // ── Select a vehicle from the suggestion list ─────────────────────────────
  const handleSelectVehicle = (vehicle: VehicleSuggestion) => {
    setSelectedVehicle(vehicle)
    setRegSearch(vehicle.registration)
    setRegSuggestions([])
  }

  // ── Clear linked vehicle ──────────────────────────────────────────────────
  const handleClearVehicle = () => {
    setSelectedVehicle(null)
    setRegSearch('')
    setRegSuggestions([])
  }

  // ── Wizard step nav (mobile only) ─────────────────────────────────────────
  // Step 1 = part details, 2 = stock & pricing, 3 = vehicle link + confirm.
  const stepTitle = (s: number) =>
    s === 1 ? t('stock.add.sectionInfo') : s === 2 ? t('stock.add.sectionPricing') : t('stock.add.sectionVehicle')

  const goNext = () => {
    if (step === 1) {
      if (!formData.partName.trim() || !formData.partNumber.trim()) {
        toast.error(t('stock.add.nameNumberRequired'))
        return
      }
      // Fold any uncommitted make/model text into a chip (mobile keyboards
      // often have no Enter/comma) before checking the requirement.
      const pending = makeModelInput.trim()
      if (pending && !makeModels.includes(pending)) {
        setMakeModels([...makeModels, pending])
        setMakeModelInput('')
        setModelSearch('')
      }
      if (makeModels.length === 0 && !pending) {
        toast.error(t('stock.add.makeModelRequired'))
        return
      }
    }
    setStep(s => Math.min(3, s + 1))
  }

  const goBack = () => setStep(s => Math.max(1, s - 1))

  // Hide a section when on mobile and not on its step; always show on desktop.
  const sectionCls = (s: number) => (isMobile && step !== s ? 'hidden' : '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // On mobile the form spans 3 steps; Enter / submit before the last step
    // just advances rather than saving.
    if (isMobile && step < 3) {
      goNext()
      return
    }

    if (!user || !organizationId) {
      toast.error(t('stock.add.authRequired'))
      return
    }

    if (!formData.partName.trim() || !formData.partNumber.trim()) {
      toast.error(t('stock.add.nameNumberRequired'))
      return
    }

    // Mobile soft keyboards often have no Enter/comma to commit the chip, so
    // fold any text still sitting in the input into the list before validating.
    const pendingMakeModel = makeModelInput.trim()
    const finalMakeModels = pendingMakeModel && !makeModels.includes(pendingMakeModel)
      ? [...makeModels, pendingMakeModel]
      : makeModels

    if (finalMakeModels.length === 0) {
      toast.error(t('stock.add.makeModelRequired'))
      return
    }

    if (finalMakeModels.length !== makeModels.length) {
      setMakeModels(finalMakeModels)
      setMakeModelInput('')
      setModelSearch('')
    }

    // If one-off is toggled, a registration must be selected
    if (isOneOff && !selectedVehicle) {
      toast.error(t('stock.add.selectRegForOneOff'))
      return
    }

    const quantity = formData.quantity === '' ? 0 : Number(formData.quantity)
    const netPrice = formData.netPrice === '' ? 0 : Number(formData.netPrice)
    const restockTarget = formData.restockTarget === '' ? 10 : Number(formData.restockTarget)

    setLoading(true)
    try {
      const partRef = await stockService.addPart({
        partName: formData.partName,
        partNumber: formData.partNumber,
        makeModel: finalMakeModels,
        supplier: formData.supplier || undefined,
        comments: formData.comments || undefined,
        quantity,
        netPrice,
        restockTarget,
        unit: formData.unit,
        organizationId,
        createdBy: user.uid,
        // ── One-off fields ────────────────────────────────────────────────
        isOneOff: isOneOff || undefined,
        linkedRegistration: isOneOff && selectedVehicle ? selectedVehicle.registration : undefined,
        linkedVehicleId: isOneOff && selectedVehicle ? selectedVehicle.id : undefined,
      })

      await stockService.addOrderHistory(
        partRef.id!,
        formData.partName,
        formData.partNumber,
        formData.supplier || undefined,
        quantity,
        formData.unit,
        netPrice,
        user.uid,
        userDisplayName,
        organizationId,
        'initial'
      )

      toast.success(
        isOneOff && selectedVehicle
          ? t('stock.add.addedLinked', { reg: selectedVehicle.registration })
          : t('stock.add.addedSaved')
      )
      onSuccess()
      onClose()

      // Reset
      setFormData({ partName: '', partNumber: '', supplier: '', comments: '', quantity: '', netPrice: '', restockTarget: '', unit: 'pieces' })
      setPartSearch('')
      setModelSearch('')
      setMakeModels([])
      setMakeModelInput('')
      setIsOneOff(false)
      setRegSearch('')
      setSelectedVehicle(null)
    } catch (error) {
      logger.error('Error adding part:', error)
      toast.error(t('stock.add.addFail'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xl animate-fadeIn">
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl shadow-[0_0_80px_rgba(114,166,142,0.3)] w-full max-w-6xl border-2 border-[#025940]/30 dark:border-[#72A68E]/20 max-h-[95vh] sm:max-h-[92vh] overflow-hidden animate-slideUp">

        {/* Animated gradient border top */}
        <div className="absolute top-0 left-0 right-0 h-1 sm:h-1.5 bg-gradient-to-r from-[#012619] via-[#72A68E] via-[#72A68E] to-[#025940] animate-shimmer"
             style={{backgroundSize: '200% 100%'}} />

        {/* Decorative corner accents */}
        <div className="absolute top-0 left-0 w-20 h-20 sm:w-32 sm:h-32 bg-gradient-to-br from-[#025940]/10 to-transparent rounded-br-full" />
        <div className="absolute top-0 right-0 w-20 h-20 sm:w-32 sm:h-32 bg-gradient-to-bl from-[#72A68E]/10 to-transparent rounded-bl-full" />

        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#012619] via-[#025940] to-[#014030] p-4 sm:p-8 overflow-hidden">
          <div className="absolute inset-0 opacity-5"
               style={{backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px'}} />
          <div className="absolute -top-20 -left-20 w-40 h-40 sm:w-64 sm:h-64 bg-[#72A68E]/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -right-20 w-40 h-40 sm:w-64 sm:h-64 bg-[#72A68E]/20 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}} />

          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-6 sm:right-6 p-2 sm:p-2.5 hover:bg-white/20 rounded-lg sm:rounded-xl transition-all duration-300 group backdrop-blur-sm border border-white/10 hover:border-white/30 z-50"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-white/80 group-hover:text-white group-hover:rotate-90 transition-all duration-300" />
          </button>

          <div className="relative flex items-center space-x-3 sm:space-x-5">
            <div className="relative">
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl bg-gradient-to-br from-[#72A68E] to-[#538a72] flex items-center justify-center shadow-2xl shadow-teal-500/40">
                <Package className="w-6 h-6 sm:w-10 sm:h-10 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 sm:-top-2 sm:-right-2 w-5 h-5 sm:w-7 sm:h-7 bg-gradient-to-br from-green-400 to-green-500 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-green-500/50 animate-bounce">
                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
              </div>
            </div>
            <div className="relative z-10">
              <h2 className="text-xl sm:text-4xl font-black text-white tracking-tight mb-0.5 sm:mb-1 drop-shadow-lg">{t('stock.add.title')}</h2>
              <p className="text-[#C5D9D0] text-xs sm:text-sm font-medium flex items-center space-x-1 sm:space-x-2">
                <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{t('stock.add.subtitle')}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-4 sm:space-y-8 overflow-y-auto max-h-[calc(95vh-100px)] sm:max-h-[calc(92vh-160px)] custom-scrollbar">

          {/* Mobile wizard progress (hidden on desktop / full-form view) */}
          {isMobile && (
            <div className="md:hidden">
              <div className="flex items-center gap-1.5">
                {[1, 2, 3].map(s => (
                  <div
                    key={s}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${step >= s ? 'bg-[#025940]' : 'bg-gray-200 dark:bg-gray-700'}`}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs font-bold text-[#025940] dark:text-[#b3f243]">
                {t('stock.add.stepOf', { step, total: 3 })} · {stepTitle(step)}
              </p>
            </div>
          )}

          {/* ── Part Information Section (wizard step 1) ── */}
          <div className={`space-y-3 sm:space-y-6 group ${sectionCls(1)}`}>
            <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-4 border-b border-gray-200 dark:border-gray-700 sm:border-b-2 relative">
              <div className="absolute bottom-0 left-0 h-0.5 w-12 sm:w-20 bg-gradient-to-r from-[#025940] to-[#72A68E] group-hover:w-24 sm:group-hover:w-40 transition-all duration-500" />
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#025940] to-[#538a72] flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Tag className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
              </div>
              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">{t('stock.add.sectionInfo')}</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">

              {/* Part Name */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 flex items-center space-x-2">
                  <Search className="w-3 h-3 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E]" />
                  <span>{t('stock.add.partName')}</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    list="parts-list"
                    value={partSearch || formData.partName}
                    onChange={(e) => {
                      setPartSearch(e.target.value)
                      setFormData({ ...formData, partName: e.target.value })
                    }}
                    className="w-full px-3 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={t('stock.add.partNamePlaceholder')}
                  />
                  <datalist id="parts-list">
                    {filteredParts.map((part, index) => (
                      <option key={`${part}-${index}`} value={part} />
                    ))}
                  </datalist>
                  <div className="absolute inset-y-0 right-3 sm:right-4 flex items-center pointer-events-none">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#025940] rounded-full animate-pulse" />
                  </div>
                </div>
              </div>

              {/* Part Number */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                  {t('stock.add.partNumber')}
                </label>
                <input
                  type="text"
                  value={formData.partNumber}
                  onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
                  className="w-full px-3 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base placeholder:text-gray-400 placeholder:font-normal"
                  placeholder={t('stock.add.partNumberPlaceholder')}
                />
              </div>
            </div>

            {/* Multi Make & Model */}
            <div className="group/input">
              <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 flex items-center space-x-2">
                <Search className="w-3 h-3 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E]" />
                <span>{t('stock.add.makeModelLabel')}</span>
              </label>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    list="models-list"
                    value={makeModelInput || modelSearch}
                    onChange={(e) => {
                      setModelSearch(e.target.value)
                      setMakeModelInput(e.target.value)
                    }}
                    onKeyDown={handleMakeModelKeyDown}
                    className="w-full px-3 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base placeholder:text-gray-400 placeholder:font-normal"
                    placeholder={t('stock.add.makeModelPlaceholder')}
                  />
                </div>
                <button
                  type="button"
                  onClick={addMakeModel}
                  disabled={!makeModelInput.trim()}
                  className="flex-shrink-0 px-4 sm:px-6 rounded-lg sm:rounded-xl bg-[#025940] hover:bg-[#012619] text-white font-bold text-sm sm:text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('stock.btn.add')}
                </button>
              </div>
              {/* Quick tag for universal parts (bulbs, fluids, etc.) */}
              <button
                type="button"
                onClick={() => { setMakeModels(['All Vehicles']); setMakeModelInput(''); setModelSearch('') }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#025940]/40 text-[#025940] dark:text-[#72A68E] text-xs sm:text-sm font-semibold hover:bg-[#025940]/10 transition-colors"
              >
                <Car className="w-3.5 h-3.5" />
                {t('stock.add.allVehicles')}
              </button>
              <datalist id="models-list">
                {filteredModels.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>

              {makeModels.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {makeModels.map((mm, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#025940] to-[#538a72] text-white rounded-full text-xs sm:text-sm font-bold shadow-lg shadow-teal-500/30"
                    >
                      <span>{mm}</span>
                      <button
                        type="button"
                        onClick={() => removeMakeModel(index)}
                        className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('stock.add.pressHint1')} <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">{t('stock.add.pressHintEnter')}</kbd> {t('stock.add.pressHintOr')} <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs font-mono">,</kbd> {t('stock.add.pressHint2')}
              </p>
            </div>

            {/* Supplier */}
            <div className="group/input">
              <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                {t('stock.add.supplierLabel')}
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  onFocus={() => setShowSupplierDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSupplierDropdown(false), 200)}
                  className="w-full px-3 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base placeholder:text-gray-400 placeholder:font-normal"
                  placeholder={t('stock.add.supplierPlaceholder')}
                />
                {showSupplierDropdown && filteredSuppliers.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-[#025940] dark:border-[#72A68E] rounded-lg sm:rounded-xl shadow-2xl shadow-teal-500/20 max-h-48 overflow-y-auto">
                    {filteredSuppliers.map((sup, index) => (
                      <button
                        key={index}
                        type="button"
                        onMouseDown={() => {
                          setFormData({ ...formData, supplier: sup })
                          setShowSupplierDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 sm:px-4 sm:py-3 hover:bg-gradient-to-r hover:from-[#025940]/10 hover:to-[#72A68E]/10 text-sm sm:text-base font-semibold text-gray-900 dark:text-white transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        {sup}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('stock.add.supplierHint')}
              </p>
            </div>

            {/* Comments */}
            <div className="group/input md:col-span-2">
              <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                {t('stock.add.commentsLabel')}
              </label>
              <textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-medium text-sm sm:text-base placeholder:text-gray-400 placeholder:font-normal resize-none"
                placeholder={t('stock.add.commentsPlaceholder')}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('stock.add.commentsHint')}
              </p>
            </div>
          </div>

          {/* ── ONE-OFF PART SECTION (wizard step 3) ───────────────────────────── */}
          <div className={`space-y-3 sm:space-y-4 group ${sectionCls(3)}`}>
            <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-4 border-b border-gray-200 dark:border-gray-700 sm:border-b-2 relative">
              <div className="absolute bottom-0 left-0 h-0.5 w-12 sm:w-20 bg-gradient-to-r from-[#b3f243] to-[#72A68E] group-hover:w-24 sm:group-hover:w-40 transition-all duration-500" />
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#b3f243] to-[#72A68E] flex items-center justify-center shadow-lg">
                <Link className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#012619]" />
              </div>
              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">{t('stock.add.sectionVehicle')}</h3>
            </div>

            {/* One-off toggle */}
            <div className="flex items-center justify-between p-3 sm:p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div>
                <p className="text-sm font-bold text-gray-800 dark:text-white">{t('stock.add.oneOffTitle')}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {t('stock.add.oneOffDesc')}
                </p>
              </div>
              {/* Toggle switch */}
              <button
                type="button"
                onClick={() => {
                  setIsOneOff(v => !v)
                  // Clear vehicle selection when toggling off
                  if (isOneOff) {
                    setSelectedVehicle(null)
                    setRegSearch('')
                    setRegSuggestions([])
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                  isOneOff ? 'bg-[#b3f243] border-[#b3f243]' : 'bg-gray-300 dark:bg-gray-600 border-gray-300 dark:border-gray-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
                    isOneOff ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Registration search — only shown when one-off is ON */}
            {isOneOff && (
              <div className="space-y-2 animate-slideDown">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center space-x-2">
                  <Car className="w-3.5 h-3.5 text-[#025940] dark:text-[#72A68E]" />
                  <span>{t('stock.add.regLabel')}</span>
                </label>

                {/* Selected vehicle pill */}
                {selectedVehicle ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#b3f243]/60 bg-[#b3f243]/10">
                    <div className="bg-[#012619] border border-[#b3f243]/40 rounded-lg px-2.5 py-1 font-mono font-bold tracking-widest text-[#b3f243] text-sm flex-shrink-0">
                      {selectedVehicle.registration}
                    </div>
                    {(selectedVehicle.make || selectedVehicle.model) && (
                      <span className="text-xs text-gray-600 dark:text-gray-300 font-medium flex-1 truncate">
                        {selectedVehicle.make} {selectedVehicle.model}
                      </span>
                    )}
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#025940]/20 text-[#025940] dark:bg-[#b3f243]/20 dark:text-[#b3f243] flex-shrink-0">
                      {selectedVehicle.source === 'fleet' ? t('stock.source.fleet') : t('stock.source.inYard')}
                    </span>
                    <button
                      type="button"
                      onClick={handleClearVehicle}
                      className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={regSearch}
                      onChange={(e) => setRegSearch(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 sm:px-5 sm:py-3 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#b3f243] dark:focus:border-[#b3f243] focus:ring-2 focus:ring-[#b3f243]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-mono font-bold tracking-widest text-sm placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-400"
                      placeholder={t('stock.add.regPlaceholder')}
                      autoComplete="off"
                    />
                    {regSearchLoading && (
                      <div className="absolute inset-y-0 right-3 flex items-center">
                        <div className="w-4 h-4 border-2 border-[#025940]/30 border-t-[#025940] rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Suggestions dropdown */}
                    {regSuggestions.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border-2 border-[#025940] dark:border-[#72A68E] rounded-xl shadow-2xl overflow-hidden">
                        {regSuggestions.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onMouseDown={() => handleSelectVehicle(v)}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#025940]/10 transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                          >
                            <div className="bg-[#012619] border border-[#b3f243]/40 rounded px-2 py-0.5 font-mono font-bold tracking-widest text-[#b3f243] text-xs flex-shrink-0">
                              {v.registration}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-300 flex-1 text-left truncate">
                              {v.make} {v.model}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                              {v.source === 'fleet' ? t('stock.source.fleet') : t('stock.source.inYard')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* No results hint */}
                    {regSearch.length >= 2 && !regSearchLoading && regSuggestions.length === 0 && (
                      <p className="text-xs text-gray-400 mt-2 px-1">
                        {t('stock.add.noVehiclesFound', { q: regSearch })}
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('stock.add.taggedHint')}
                </p>
              </div>
            )}
          </div>

          {/* ── Stock & Pricing Section (wizard step 2) ── */}
          <div className={`space-y-3 sm:space-y-6 group ${sectionCls(2)}`}>
            <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-4 border-b border-gray-200 dark:border-gray-700 sm:border-b-2 relative">
              <div className="absolute bottom-0 left-0 h-0.5 w-12 sm:w-20 bg-gradient-to-r from-[#025940] to-[#72A68E] group-hover:w-24 sm:group-hover:w-40 transition-all duration-500" />
              <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#025940] to-[#538a72] flex items-center justify-center shadow-lg shadow-teal-500/20">
                <Box className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
              </div>
              <h3 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white tracking-tight">{t('stock.add.sectionPricing')}</h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">

              {/* Quantity */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                  {t('stock.add.quantity')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-black text-lg sm:text-2xl text-center"
                  placeholder="0"
                />
              </div>

              {/* Unit */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                  {t('stock.add.unit')}
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value as 'pieces' | 'liters' })}
                  className="w-full px-2 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base cursor-pointer"
                >
                  <option value="pieces">{t('stock.units.pieces')}</option>
                  <option value="liters">{t('stock.units.liters')}</option>
                </select>
              </div>

              {/* Net Price */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 flex items-center space-x-1 sm:space-x-2">
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-[#025940] dark:text-[#72A68E]" />
                  <span>{t('stock.add.netPriceLabel')}</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.netPrice}
                  onChange={(e) => setFormData({ ...formData, netPrice: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-black text-lg sm:text-2xl text-center"
                  placeholder="0.00"
                />
              </div>

              {/* Restock Target */}
              <div className="group/input">
                <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 sm:mb-3">
                  {t('stock.add.restockTarget')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={formData.restockTarget}
                  onChange={(e) => setFormData({ ...formData, restockTarget: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-2 py-2 sm:px-5 sm:py-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg sm:rounded-xl focus:border-[#025940] dark:focus:border-[#72A68E] focus:ring-2 sm:focus:ring-4 focus:ring-[#025940]/20 dark:bg-gray-800 text-gray-900 dark:text-white transition-all duration-200 font-semibold text-sm sm:text-base"
                  placeholder="10"
                />
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {isMobile ? (
            /* ── Mobile wizard footer: Back/Cancel + Next/Add ── */
            <div className="flex items-center gap-2 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={step === 1 ? onClose : goBack}
                className="px-4 py-2.5 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors font-bold text-sm flex-shrink-0"
              >
                {step === 1 ? t('stock.btn.cancel') : t('stock.btn.back')}
              </button>
              {step < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  className="flex-1 px-5 py-2.5 bg-gradient-to-r from-[#012619] via-[#025940] to-[#538a72] text-white rounded-lg font-bold text-sm transition-all active:scale-[0.99]"
                >
                  {t('stock.btn.next')}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-5 py-2.5 bg-gradient-to-r from-[#012619] via-[#025940] to-[#538a72] text-white rounded-lg font-bold text-sm transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('stock.add.adding')}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      <span>{t('stock.add.addPartShort')}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            /* ── Desktop footer: full single-view form ── */
            <div className="flex justify-end space-x-2 sm:space-x-4 pt-4 sm:pt-8 border-t border-gray-200 dark:border-gray-700 sm:border-t-2">
              <button
                type="button"
                onClick={onClose}
                className="group px-4 py-2 sm:px-8 sm:py-4 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 font-bold text-sm sm:text-base"
              >
                <span className="group-hover:scale-110 inline-block transition-transform">{t('stock.btn.cancel')}</span>
              </button>
              <button
                type="submit"
                disabled={loading}
                className="group relative px-5 py-2 sm:px-10 sm:py-4 bg-gradient-to-r from-[#012619] via-[#025940] to-[#538a72] text-white rounded-lg sm:rounded-xl hover:shadow-2xl hover:shadow-teal-500/40 hover:scale-105 active:scale-100 transition-all duration-300 font-bold text-sm sm:text-base disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />
                <span className="relative flex items-center space-x-2 sm:space-x-3">
                  {loading ? (
                    <>
                      <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span className="hidden sm:inline">{t('stock.add.addingPart')}</span>
                      <span className="sm:hidden">{t('stock.add.adding')}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-12 transition-transform" />
                      <span className="hidden sm:inline">{t('stock.add.addToStock')}</span>
                      <span className="sm:hidden">{t('stock.add.addPartShort')}</span>
                    </>
                  )}
                </span>
              </button>
            </div>
          )}
        </form>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateY(-10px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .animate-slideUp { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slideDown { animation: slideDown 0.3s ease-out; }
        .animate-shimmer { animation: shimmer 3s linear infinite; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: linear-gradient(180deg, #025940, #72A68E); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #014030, #538a72); }
      `}</style>
    </div>
  )
}