// SKIN STYLES — parts sheets the painter dresses a hull with. Each style names one sheet and where
// its parts sit on it: the RIBBON (a long strip of hull plating that runs along the outline and its
// onion rings) and the ENGINES (laid on the stern, nozzle to the left = backwards; `flipEngines` for a
// sheet whose nozzles point right; some sheets' parts are not really engines — they are used as engines
// anyway until there is a better place for them). Rectangles are in sheet pixels, found by scanning the
// sheet's alpha (the valley between the strip and the parts row, then the empty columns between parts).
// `edge`: how ragged the strip's top is — the share of its height before a row is more than half solid;
// that much of the ribbon is pushed out past the outline so the raggedness IS the outline. `pitch`: the
// style's natural ring overlap (a ragged strip overlaps more). New sheets: drop the file in assets/parts/,
// run the scan (see the painter session notes), add an entry.
const P = (id, name, file, ribbon, engines, edge, extra = {}) => ({ id, name, sheet: 'assets/parts/' + file, ribbon, engines, edge, pitch: Math.max(0.55, Math.min(0.75, 0.75 - 0.6 * edge)), ...extra });
const R = (x, y, w, h) => ({ x, y, w, h });
export const STYLES = Object.fromEntries([
  // machines
  // UTOPIA (2026-10-09): one sheet carries everything — TWO strips (ring k wears strip k % 2: the first leads), four
  // engines, three mounts, three turrets and 22 fittings (see below). His first clean sci-fi style.
  // the strip rectangles are the SOLID body of each strip: the pointed prow on the left, the stepped end on the right
  // and the thin rail under the body are left out — inside a hull they were notches (magenta at the nacelle corners)
  P('utopia1', 'Utopia (clean panels)', 'utopia-1.webp', R(30, 69, 1078, 131), [R(28, 469, 615, 177), R(687, 471, 431, 192), R(17, 664, 539, 215), R(574, 663, 540, 199)], 0.02, { ribbons: [R(30, 69, 1078, 131), R(30, 272, 1078, 131)] }),
  // UTOPIA II (2026-10-10): his one continuous strip; utopia-3.webp = that strip + Utopia's four engines composed on one
  // sheet (a style's engines must sit on its ribbon sheet). Mounts, fittings and everything else are Utopia's (below);
  // the turrets are the crates' turrets, a bit brighter (turret-9 = turret-4 lifted, same cells).
  // edge 0.15: the strip's top is stepped panels down to 15 % of its height (rows under 90 % solid) — pushed out past the
  // outline by that much so the steps ARE the outline (his ask: "a broken, jagged outline"), not hidden over the filler
  P('utopia2', 'Utopia II (continuous panels)', 'utopia-3.webp', R(0, 0, 2000, 250), [R(20, 270, 615, 177), R(675, 270, 431, 192), R(20, 505, 539, 215), R(599, 505, 540, 199)], 0.15),
  P('greeble1', 'Greeble (grey plating)', 'greeble-1.webp', R(15, 133, 1970, 185), [R(119, 366, 518, 227), R(1382, 365, 545, 243), R(696, 396, 627, 168)], 0.04),
  P('pipes1', 'Pipes (plumbing and vents)', 'pipes-1.webp', R(5, 106, 1990, 202), [R(84, 343, 461, 281), R(1444, 339, 517, 285), R(605, 395, 773, 183)], 0.07),
  P('crate1', 'Crates (boxes and tanks)', 'crate-1.webp', R(20, 102, 1962, 198), [R(74, 361, 561, 243), R(1344, 351, 603, 262), R(691, 381, 599, 199)], 0.07),
  P('cable1', 'Cables (braided lines)', 'cable-1.webp', R(14, 127, 1972, 181), [R(97, 332, 554, 265), R(1381, 336, 550, 285), R(695, 372, 633, 201)], 0.04),
  P('tank1', 'Tanks (glass vessels)', 'tank-1.webp', R(9, 39, 1982, 232), [R(35, 324, 583, 302), R(1383, 324, 580, 293), R(658, 318, 685, 308)], 0.08),
  P('cobble1', 'Cobbles (stone plates)', 'cobble-1.webp', R(8, 101, 1984, 182), [R(93, 324, 541, 273), R(1386, 306, 522, 310), R(695, 362, 626, 192)], 0.01),
  P('castle1', 'Castle (walls and towers)', 'castle-1.webp', R(7, 0, 1991, 282), [R(45, 305, 577, 336), R(1454, 282, 517, 344), R(711, 283, 638, 369)], 0.26),
  P('deck1', 'Deck (timber hull and masts)', 'deck-1.webp', R(11, 5, 1980, 329), [R(31, 336, 483, 321), R(1289, 334, 701, 330), R(547, 368, 703, 276)], 0.15),
  P('sail1', 'Sails (masts and canvas)', 'sail-1.webp', R(18, 12, 1962, 323), [R(89, 335, 512, 312), R(1447, 335, 500, 299), R(635, 335, 777, 324)], 0.25),
  // crystal and plant
  P('crystal1', 'Crystal (shards and pods)', 'crystal-1.webp', R(16, 61, 1968, 266), [R(109, 355, 507, 271), R(1386, 343, 568, 299), R(672, 378, 656, 229)], 0.23),
  P('shard1', 'Shards (crystal leaves and gems)', 'shard-1.webp', R(2, 72, 1998, 260), [R(251, 351, 411, 265), R(1339, 346, 421, 275), R(724, 384, 553, 198)], 0.11),
  P('leaf1', 'Leaf (pods and leaves)', 'leaf-1.webp', R(14, 33, 1972, 277), [R(65, 310, 643, 340), R(1420, 340, 540, 297), R(752, 326, 601, 307)], 0.18),
  P('leaf2', 'Leaf II (broad leaves)', 'leaf-2.webp', R(7, 15, 1986, 290), [R(20, 315, 603, 325), R(1372, 315, 613, 329), R(652, 318, 655, 319)], 0.2, { flipEngines: true }),
  P('wing1', 'Wings (veined membranes)', 'wing-1.webp', R(19, 13, 1963, 347), [R(68, 360, 533, 278), R(693, 394, 659, 212), R(1402, 360, 576, 286)], 0.22),
  P('coral1', 'Coral (porous growth)', 'coral-1.webp', R(13, 68, 1975, 251), [R(67, 331, 560, 280), R(1382, 335, 574, 295), R(684, 358, 626, 236)], 0.17),
  // flesh and bone
  P('bone1', 'Bone (biomechanical)', 'bone-1.webp', R(11, 146, 1978, 160), [R(65, 349, 658, 266), R(1516, 350, 419, 269), R(756, 363, 735, 221)], 0.03),
  P('carapace1', 'Carapace (ribbed shell)', 'carapace-1.webp', R(18, 57, 1965, 213), [R(58, 306, 585, 313), R(1440, 293, 525, 334), R(688, 341, 693, 236)], 0.07),
  P('eye1', 'Eyes (tendrils and eyes)', 'eye-1.webp', R(25, 84, 1950, 223), [R(84, 346, 554, 249), R(1357, 326, 580, 293), R(689, 374, 628, 197)], 0.07),
  P('thorn1', 'Thorns (spines and eggs)', 'thorn-1.webp', R(16, 19, 1966, 257), [R(30, 292, 642, 336), R(1276, 296, 698, 337), R(686, 286, 565, 355)], 0.27, { flipEngines: true }),
].map(s => [s.id, s]));

// DECORATIONS — sheets of twelve, two styles a sheet: for each style three TURRET MOUNTS (the ring with the hole; kept
// in stock, placed with the hard points later) and three GREEBLES (solid pieces, scattered over the plating). Cells
// are [x, y, w, h] in sheet pixels, found by the valleys of least ink between rows and columns. The serpent set has
// no plating strip yet — a style in waiting.
const CELLS = {
  'deco-1': [[160,13,324,314],[564,15,321,311],[961,12,335,315],[120,349,364,189],[542,340,364,198],[961,339,375,205],[137,555,342,317],[551,553,350,320],[961,555,348,314],[112,890,378,181],[522,890,397,183],[949,881,374,191]],
  'deco-2': [[86,16,390,315],[543,16,394,315],[1017,40,365,281],[50,340,433,233],[559,349,360,231],[1009,349,386,231],[74,607,416,228],[587,607,306,237],[988,601,390,243],[82,846,378,216],[543,874,374,184],[978,861,409,203]],
  'deco-3': [[26,10,447,305],[531,10,388,306],[976,10,449,305],[31,323,498,255],[586,316,283,257],[915,343,504,221],[25,586,449,269],[540,584,374,269],[980,580,442,265],[25,865,470,200],[539,857,417,215],[1008,860,409,214]],
  'deco-4': [[141,19,359,306],[559,12,331,313],[969,17,349,300],[63,343,428,193],[550,333,347,213],[972,342,413,204],[106,559,372,276],[551,564,349,272],[997,546,353,287],[64,837,413,227],[558,839,336,230],[975,860,408,200]],
  'deco-5': [[102,12,340,265],[528,8,392,273],[996,13,393,264],[72,304,381,203],[519,296,414,217],[970,308,446,198],[81,526,377,315],[539,530,371,311],[1021,535,358,306],[56,860,413,188],[545,841,361,225],[982,841,422,223]],
  'deco-6': [[47,18,400,322],[518,12,413,328],[979,12,440,322],[43,344,445,211],[517,352,415,193],[966,341,452,210],[27,562,426,298],[502,559,445,312],[974,563,463,308],[24,885,476,188],[535,871,381,204],[977,875,454,200]],
  'deco-7': [[117,20,304,301],[533,26,383,316],[996,10,362,332],[83,365,382,180],[567,342,310,208],[996,357,360,188],[58,566,417,278],[518,564,412,280],[968,566,418,276],[78,844,387,214],[533,844,363,227],[927,847,488,223]],
  'deco-8': [[94,11,377,331],[520,2,422,340],[998,5,447,337],[77,342,424,230],[537,342,390,232],[989,342,395,225],[59,574,426,305],[518,574,415,305],[969,575,425,304],[52,879,414,193],[523,879,392,191],[979,879,424,199]],
  'deco-9': [[54,11,448,312],[556,27,339,290],[950,10,451,313],[28,323,501,205],[582,324,288,225],[935,323,484,216],[42,551,464,309],[565,560,321,288],[955,552,443,308],[23,860,504,193],[545,861,353,212],[917,860,519,206]],
  'deco-10': [[76,8,444,316],[520,9,406,315],[949,7,421,317],[36,324,468,198],[506,324,437,215],[946,324,464,215],[35,540,470,287],[508,542,435,284],[946,539,465,289],[33,836,471,224],[507,833,449,230],[960,832,455,232]],
  // the GREEBLE ADD-ONS (2026-10-09): sheets of extra greebles only, two styles a sheet (rows 1–2, rows 3–4), cells row by row
  'deco-11': [[17,90,421,210],[464,91,514,222],[1004,98,424,215],[15,372,429,182],[464,352,511,219],[999,351,429,213],[21,616,415,190],[457,625,518,181],[999,616,430,196],[19,829,413,206],[457,843,513,190],[999,840,431,197]],
  'deco-12': [[43,61,416,252],[497,76,452,237],[989,70,417,245],[37,350,425,256],[499,376,450,223],[987,362,426,237],[33,667,443,160],[504,653,438,182],[973,655,441,175],[43,854,426,182],[493,868,466,167],[982,859,432,181]],
  'deco-13': [[18,79,344,265],[385,74,343,280],[745,88,374,251],[1139,68,291,282],[23,390,344,248],[390,405,338,232],[755,386,308,252],[1083,383,343,255],[30,638,347,239],[392,669,314,209],[727,638,358,248],[1108,638,319,248],[14,892,370,172],[394,897,311,166],[722,899,338,169],[1080,886,353,185]],
  'deco-14': [[33,35,409,295],[483,34,478,296],[993,38,418,292],[25,368,485,211],[529,330,414,293],[972,352,450,264],[27,627,439,199],[483,623,495,215],[998,633,414,193],[36,840,391,223],[480,846,476,210],[972,838,450,226]],
  'deco-15': [[40,42,347,318],[387,34,303,334],[704,64,359,280],[1072,64,358,279],[40,391,314,292],[373,368,289,317],[681,394,386,279],[1083,404,338,267],[18,731,383,263],[416,705,266,309],[695,776,382,168],[1089,772,344,193]],
  'deco-16': [[17,55,459,243],[511,47,449,259],[994,61,438,242],[18,321,445,254],[484,343,483,218],[997,319,434,259],[17,581,453,224],[485,590,485,215],[993,585,437,222],[17,807,447,248],[482,833,482,197],[984,807,448,235]],
  'deco-17': [[15,55,355,237],[379,59,347,229],[731,75,346,204],[1082,67,357,220],[15,320,369,244],[390,333,341,219],[741,320,344,245],[1085,343,354,197],[24,590,359,210],[391,600,363,199],[754,582,313,229],[1074,586,364,225],[14,813,376,237],[397,827,328,211],[729,811,363,224],[1092,816,348,236]],
  'deco-18': [[14,57,266,175],[297,55,258,178],[569,43,257,212],[843,53,268,195],[14,276,267,169],[298,284,258,167],[572,281,248,170],[843,279,269,164],[16,484,298,180],[327,479,222,187],[564,480,271,184],[848,474,265,195],[16,676,278,150],[302,679,272,141],[585,674,243,155],[842,669,269,166]],
  'deco-19': [[46,37,346,319],[421,86,353,278],[774,23,313,341],[1087,70,340,294],[19,378,403,237],[422,364,352,255],[774,364,372,246],[1146,365,279,254],[55,625,288,252],[369,619,366,269],[756,648,351,210],[1134,619,284,269],[17,889,386,169],[403,888,305,180],[724,889,349,162],[1094,888,335,161]],
  'deco-20': [[27,173,336,167],[380,168,341,171],[737,171,346,168],[1097,167,330,172],[19,401,342,172],[377,402,345,171],[736,401,356,171],[1106,397,328,171],[24,645,336,158],[371,644,347,162],[734,648,350,170],[1097,642,330,174],[18,849,336,166],[367,858,359,163],[740,838,353,192],[1104,850,324,175]],
  'deco-21': [[16,19,860,217],[906,20,846,218],[12,264,867,186],[895,265,866,175],[16,468,853,164],[886,466,873,179],[13,655,849,206],[885,667,870,198]],
  'deco-22': [[32,57,681,224],[739,58,688,239],[25,311,696,246],[752,326,674,224],[24,563,683,219],[739,584,688,200],[25,788,694,263],[753,818,673,239]],
};
// the add-ons: style → [sheet, from, to] (cell indices), or a list of those. His order of sheets follows the style list;
// deco-19 / deco-20 arrived swapped (thorn + serpent, then carapace + eye). deco-21 (leaves, berries, mushrooms — long
// strips) is a GUESS onto leaf1 until he says. deco-22 (eight long tendril strips, a few with an eye) REPLACES the eye
// add-ons of deco-20 rows 3–4, which he did not like (too many eyes) — those cells stay in CELLS but nothing uses them.
const EXTRA = { greeble1: ['deco-11', 0, 6], pipes1: ['deco-11', 6, 12], crate1: ['deco-12', 0, 6], cable1: ['deco-12', 6, 12], tank1: ['deco-13', 0, 8], cobble1: ['deco-13', 8, 16],
  castle1: ['deco-14', 0, 6], deck1: ['deco-14', 6, 12], sail1: ['deco-15', 0, 8], crystal1: ['deco-15', 8, 12], shard1: ['deco-16', 0, 6], leaf1: [['deco-16', 6, 12], ['deco-21', 0, 8]],
  leaf2: ['deco-17', 0, 8], wing1: ['deco-17', 8, 16], coral1: ['deco-18', 0, 8], bone1: ['deco-18', 8, 16], thorn1: ['deco-19', 0, 8], serpent1: ['deco-19', 8, 16], carapace1: ['deco-20', 0, 8], eye1: ['deco-22', 0, 8] };
const DECO = { greeble1: ['deco-1', 0], pipes1: ['deco-1', 6], crystal1: ['deco-2', 0], crate1: ['deco-2', 6], eye1: ['deco-3', 0], cobble1: ['deco-3', 6], carapace1: ['deco-4', 0], coral1: ['deco-4', 6],
  cable1: ['deco-5', 0], castle1: ['deco-5', 6], bone1: ['deco-6', 0], thorn1: ['deco-6', 6], tank1: ['deco-7', 0], sail1: ['deco-7', 6], deck1: ['deco-8', 0], leaf1: ['deco-8', 6], wing1: ['deco-9', 0], serpent1: ['deco-9', 6],
  shard1: ['deco-10', 0], leaf2: ['deco-10', 6] };
// the serpent strip has spear tips at both ends: the ribbon rectangle leaves them out so the fold never shows a point
STYLES.serpent1 = P('serpent1', 'Serpent (scales and plates)', 'serpent-1.webp', R(67, 237, 1414, 163), [R(37, 562, 449, 292), R(1061, 571, 469, 278), R(506, 592, 532, 235)], 0.12);
// a style's decorations: `sheets` (the first holds the mounts), `mounts` [x, y, w, h] on sheet 0, `greebles` [x, y, w, h, sheet index, (scale)]
// Utopia's mounts live on its own sheet; its FITTINGS are the eight long modules of utopia-2.webp (his second set,
// 2026-10-09 — the sheet's own small pieces are out), sized and scattered exactly like every other style's.
{ const U = 'assets/parts/utopia-1.webp', U2 = 'assets/parts/utopia-2.webp';
  STYLES.utopia1.deco = { sheet: U, sheets: [U, U2], mounts: [[25, 906, 339, 228], [396, 905, 363, 225], [786, 928, 340, 203]],
    greebles: [[18,167,620,189],[660,182,576,189],[25,425,597,201],[644,467,594,163],[24,687,586,211],[643,700,583,199],[41,944,570,190],[643,962,583,176]].map(b => [...b, 1]) };
  STYLES.utopia2.deco = STYLES.utopia1.deco;                                          // Utopia II wears Utopia's mounts and fittings
  STYLES.utopia1.turrets = { sheet: U, cells: [[46,1166,318,223,119,111,223],[388,1167,376,221,133,110,221],[786,1163,332,227,123,113,227]] }; }
for (const [id, [sheet, at]] of Object.entries(DECO)) if (STYLES[id]) STYLES[id].deco = { sheet: 'assets/parts/' + sheet + '.webp', sheets: ['assets/parts/' + sheet + '.webp'], mounts: CELLS[sheet].slice(at, at + 3), greebles: CELLS[sheet].slice(at + 3, at + 6).map(c => [...c, 0]) };
for (const [id, list] of Object.entries(EXTRA)) {
  const st = STYLES[id]; if (!st || !st.deco) continue;
  for (const [sheet, a, b] of (Array.isArray(list[0]) ? list : [list])) {
    const file = 'assets/parts/' + sheet + '.webp'; let si = st.deco.sheets.indexOf(file); if (si < 0) { si = st.deco.sheets.length; st.deco.sheets.push(file); }
    for (const c of CELLS[sheet].slice(a, b)) st.deco.greebles.push([...c, si]);
  }
}

// TURRETS — sheets of twelve, four styles a sheet, a row each: a BEAM turret, a GUN and a MISSILE pod, barrels to the
// right (= forward). Cells are [x, y, w, h, px, py, body]: the tight box in sheet pixels, the PIVOT inside it (the centre
// of the widest part — the turret turns on it, and it sits on the hard point's centre) and the body's height there,
// which is what gets scaled to the mount. Found by the valleys of least ink, row by row (a sheet's headers and row
// labels are dropped: the part is the run with the most ink); the pivot is halfway between the widest column and
// the ink's centroid. A style without a row here shows the battle view's icons instead.
const TCELLS = {
  'turret-1': [[46,25,404,271,161,135,271],[501,23,465,274,176,137,274],[1012,18,393,282,168,142,282],[38,309,429,228,182,114,228],[497,312,500,218,200,108,218],[1024,308,392,228,166,114,228],[31,550,427,267,160,133,267],[497,539,528,279,178,140,279],[1057,546,355,266,150,133,266],[31,819,426,242,179,120,241],[491,818,508,232,198,116,230],[1023,820,394,230,173,116,230]],
  'turret-2': [[164,51,414,219,216,110,219],[618,60,410,203,165,101,203],[1055,57,362,209,166,104,209],[155,288,437,243,208,120,243],[619,287,400,244,138,121,244],[1042,296,382,231,160,115,231],[154,547,444,228,208,114,228],[605,550,431,224,172,111,224],[1048,543,374,242,162,120,242],[138,796,454,242,214,120,242],[603,802,425,228,184,113,228],[1045,798,377,239,157,119,239]],
  'turret-3': [[169,48,417,233,179,115,233],[619,53,411,220,165,111,220],[1047,52,374,222,158,111,222],[144,285,442,253,205,125,253],[604,291,427,244,175,121,244],[1052,297,369,232,167,117,232],[118,538,462,239,176,118,239],[600,539,424,242,128,121,242],[1038,540,383,241,139,123,241],[140,783,439,263,181,132,263],[606,792,415,249,149,124,249],[1037,794,384,247,177,123,246]],
  'turret-4': [[42,30,441,246,204,122,246],[528,41,389,227,173,116,227],[973,30,430,248,191,126,248],[28,298,448,246,201,123,246],[523,306,416,238,188,116,238],[987,299,424,245,198,124,245],[33,550,444,247,205,129,241],[514,551,433,246,179,127,246],[991,562,425,235,204,118,235],[34,807,440,245,170,125,245],[524,812,415,240,169,120,240],[996,804,421,251,162,125,251]],
  'turret-5': [[38,40,424,238,220,114,229],[499,44,451,232,203,116,231],[985,40,428,238,210,121,238],[33,278,435,258,183,133,254],[504,289,450,248,198,122,239],[989,278,426,261,230,137,249],[41,553,426,228,194,114,228],[498,552,458,233,223,117,233],[990,551,426,236,224,118,235],[39,802,432,235,193,116,235],[505,795,456,253,215,127,253],[995,798,418,245,208,123,244]],
  'turret-6': [[29,63,474,236,214,118,236],[529,63,435,232,183,117,232],[995,61,430,241,193,121,241],[30,318,475,226,210,113,226],[529,317,435,227,179,115,227],[996,318,428,230,212,117,230],[29,563,478,249,206,124,249],[529,567,440,240,172,119,240],[1001,567,423,241,198,120,241],[34,816,466,242,223,119,242],[525,816,431,241,185,119,238],[989,820,431,238,199,120,238]],
  'turret-7': [[27,233,550,499,190,252,499],[600,253,549,459,194,235,457],[1189,249,468,502,193,249,501]],   // one row: crystal, upgraded
  'turret-8': [[26,126,587,410,236,204,410],[673,140,664,381,236,191,381],[1391,131,582,399,238,197,399]],   // one row: pipes
};
TCELLS['turret-9'] = TCELLS['turret-4'];   // turret-4 lifted a little (gamma 0.82) for Utopia II — the same cells
// sheet rows → styles (his calls). turret-1: [row 1 the first shards set — FREE], leaf, leaf II, [row 4 "scales and plates"
// — FREE]; turret-2: [row 1 "armored tech" — FREE, greeble moved on], bio-mecha insect → wings, serpentine scale → serpent,
// [row 4 "crystal leaf" — FREE]; turret-3: [row 1 "honeycomb shell" — FREE], elder foliage → thorns, sail panels, wooden
// vessel → deck; turret-4 (unlabelled): tendrils → eyes, cobbles, crates, castle; turret-5: ribbed shell → carapace, coral,
// [row 3 old cables — FREE], shards; turret-6: tanks, cables (the new version), greeble, bone; turret-7: crystal (upgraded);
// turret-8: pipes. Every style has its turrets.
const TURRETS = { utopia2: ['turret-9', 6], crystal1: ['turret-7', 0], pipes1: ['turret-8', 0], leaf1: ['turret-1', 3], leaf2: ['turret-1', 6],
  wing1: ['turret-2', 3], serpent1: ['turret-2', 6],
  thorn1: ['turret-3', 3], sail1: ['turret-3', 6], deck1: ['turret-3', 9],
  eye1: ['turret-4', 0], cobble1: ['turret-4', 3], crate1: ['turret-4', 6], castle1: ['turret-4', 9],
  carapace1: ['turret-5', 0], coral1: ['turret-5', 3], shard1: ['turret-5', 9],
  tank1: ['turret-6', 0], cable1: ['turret-6', 3], greeble1: ['turret-6', 6], bone1: ['turret-6', 9] };
for (const [id, [sheet, at]] of Object.entries(TURRETS)) if (STYLES[id]) STYLES[id].turrets = { sheet: 'assets/parts/' + sheet + '.webp', cells: TCELLS[sheet].slice(at, at + 3) };   // [beam, gun, missile]
const loaded = new Map();
// the sheet as an image, once; `base` is where the page lives relative to assets/
export function loadStyle(style, base = '') {
  const key = base + style.sheet;
  if (!loaded.has(key)) loaded.set(key, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('could not load ' + key)); im.src = key; }));
  return loaded.get(key);
}
