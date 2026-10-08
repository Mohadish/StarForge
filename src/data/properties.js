// BREAKTHROUGH PROPERTIES — the raw material of technology.
//
// A breakthrough is not chosen: it is FOUND, as the passive result of research facilities working
// across the territory you hold. Each breakthrough carries 1–5 of the PROPERTIES below.
//
// A property never carries a number. It only says WHICH CHANNELS it can push and in what manner.
// The actual magnitude belongs to the breakthrough instance that was found — the same property is
// worth little in one breakthrough and a fortune in another. A component researched on top of a
// breakthrough gets two things: a better size / cost / research ratio, and the flat boosts that
// that particular breakthrough rolled on the channels below.
//
// You may only manufacture components built on a breakthrough while you hold the territory it came
// from. It cannot be synthesised anywhere else.

// ---------------------------------------------------------------------------
// CHANNELS — the finite list of things a boost can move. Nothing else is boostable.
// ---------------------------------------------------------------------------
// The triangle is NOT a discipline. Size / cost / research is a TRADE the player makes on every
// design (push one corner in, the other two come out). A breakthrough is a DISCOUNT on the whole
// triangle at once — that is why those three channels are marked kind:'triangle' and live apart.
export const DISCIPLINES = {
  weapons: 'Weapons', defence: 'Defence', hull: 'Hull & frame', propulsion: 'Propulsion',
  power: 'Power', sensors: 'Sensors & computing', industry: 'Industry & upkeep', triangle: 'The Triangle',
};

export const CHANNELS = {
  // weapons — when weapons branch into kinetic / energy / missile / exotic, each family brings its
  // own damage channel; rate of fire, range, targeting and efficiency stay shared by all of them.
  beam_power:          { discipline: 'weapons',    name: 'Beam power',          moves: 'damage of energy weapons' },
  kinetic_penetration: { discipline: 'weapons',    name: 'Kinetic penetration', moves: 'damage of projectile weapons against armor' },
  warhead_yield:       { discipline: 'weapons',    name: 'Warhead yield',       moves: 'damage of missiles and anything else that carries its own charge to the target' },
  rate_of_fire:        { discipline: 'weapons',    name: 'Rate of fire',        moves: 'shots per second' },
  weapon_range:        { discipline: 'weapons',    name: 'Weapon range',        moves: 'engagement distance' },
  accuracy:            { discipline: 'weapons',    name: 'Accuracy',            moves: 'how tightly the weapon itself puts the shot where it was pointed — dispersion, recoil, drift, a barrel that warps as it heats. Nothing to do with the computer' },
  targeting:           { discipline: 'weapons',    name: 'Targeting',           moves: 'how well the fire control picks the aim point on a moving, evading target — the computing side of hitting' },
  weapon_efficiency:   { discipline: 'weapons',    name: 'Weapon efficiency',   moves: 'energy a weapon spends per shot' },
  // defence
  shield_capacity:     { discipline: 'defence',    name: 'Shield capacity',     moves: 'how much a shield holds' },
  shield_reach:        { discipline: 'defence',    name: 'Shield reach',        moves: 'how far a shield field extends from its emitter — how much hull one shield can cover' },
  shield_recovery:     { discipline: 'defence',    name: 'Shield recovery',     moves: 'recharge rate and the dead time after a hit' },
  armor_integrity:     { discipline: 'defence',    name: 'Armor integrity',     moves: 'hit points per length of armor' },
  armor_deflection:    { discipline: 'defence',    name: 'Armor deflection',    moves: 'damage shrugged off each hit' },
  evasion:             { discipline: 'defence',    name: 'Evasion',             moves: 'how often the enemy misses' },
  // hull & frame — what the thing is built on, ship or building
  structural_scale:    { discipline: 'hull',       name: 'Structural scale',    moves: 'how large a hull or building can be built at all' },
  hull_integrity:      { discipline: 'hull',       name: 'Hull integrity',      moves: 'hit points of the structure itself' },
  hull_regeneration:   { discipline: 'hull',       name: 'Hull regeneration',   moves: 'damage repaired during a battle' },
  // propulsion
  thrust:              { discipline: 'propulsion', name: 'Thrust',              moves: 'acceleration and top speed' },
  agility:             { discipline: 'propulsion', name: 'Agility',             moves: 'turn rate' },
  drive_efficiency:    { discipline: 'propulsion', name: 'Drive efficiency',    moves: 'power an engine draws' },
  // power
  reactor_output:      { discipline: 'power',      name: 'Reactor output',      moves: 'power produced every second' },
  energy_storage:      { discipline: 'power',      name: 'Energy storage',      moves: 'the buffer that covers a shortfall' },
  cold_start:          { discipline: 'power',      name: 'Cold start',          moves: 'time from cold to full power' },
  power_efficiency:    { discipline: 'power',      name: 'Power efficiency',    moves: 'power everything else draws' },
  // sensors & computing
  sensor_range:        { discipline: 'sensors',    name: 'Sensor range',        moves: 'how far you can see anything at all' },
  sensor_resolution:   { discipline: 'sensors',    name: 'Sensor resolution',   moves: 'how much detail you get: telling a real ship from a decoy, seeing through evasion, and how much a survey of a world actually finds' },
  computing:           { discipline: 'sensors',    name: 'Computing',           moves: 'raw calculation — research produced by labs' },
  synthetic_neural:    { discipline: 'sensors',    name: 'Synthetic neural',    moves: 'how much the machine decides by itself: crews it replaces, and how fast it acts without being told' },
  // industry & upkeep
  mining_yield:        { discipline: 'industry',   name: 'Mining yield',        moves: 'income from mines' },
  manufacturing:       { discipline: 'industry',   name: 'Manufacturing',       moves: 'build capacity of factories' },
  labor_efficiency:    { discipline: 'industry',   name: 'Labor efficiency',    moves: 'workers a building needs' },
  food_yield:          { discipline: 'industry',   name: 'Food yield',          moves: 'food from farms' },
  habitability:        { discipline: 'industry',   name: 'Habitability',        moves: 'people a habitat holds' },
  growth:              { discipline: 'industry',   name: 'Growth',              moves: 'how fast the population grows' },
  maintenance:         { discipline: 'industry',   name: 'Maintenance',         moves: 'upkeep, repair and refit cost' },
  // the triangle — a breakthrough shrinks it; the player still trades along it
  miniaturization:     { discipline: 'triangle', kind: 'triangle', name: 'Miniaturization', moves: 'mass and footprint of a component' },
  affordability:       { discipline: 'triangle', kind: 'triangle', name: 'Affordability',   moves: 'build cost of a component' },
  research_ease:       { discipline: 'triangle', kind: 'triangle', name: 'Research ease',   moves: 'research needed to design it' },
};

// The three big tiers of research. Fields hang off them; a field can sit under more than one.
export const BRANCHES = {
  physics: { name: 'Physics', blurb: 'matter, energy, force and light — how the universe behaves' },
  biology: { name: 'Biology', blurb: 'what is alive: growing it, feeding it, keeping it alive' },
  social:  { name: 'Social',  blurb: 'people and organisations: how work, knowledge and decisions are arranged' },
};

// Fields (the old "domains") — the working areas a breakthrough can come out of.
export const DOMAINS = {
  materials:   { name: 'Materials',        blurb: 'what things are made of',                        branches: ['physics'] },
  fabrication: { name: 'Fabrication',      blurb: 'how precisely they can be made',                 branches: ['physics', 'social'] },
  energy:      { name: 'Energy',           blurb: 'reactions and what they release',                branches: ['physics'] },
  electrics:   { name: 'Electrics',        blurb: 'moving charge around',                           branches: ['physics'] },
  optics:      { name: 'Optics',           blurb: 'light and beams',                                branches: ['physics'] },
  thermal:     { name: 'Thermal',          blurb: 'heat: making it, moving it, surviving it',       branches: ['physics'] },
  motion:      { name: 'Fields & motion',  blurb: 'force without contact',                          branches: ['physics'] },
  life:        { name: 'Life & chemistry', blurb: 'growing, digesting, tolerating',                 branches: ['biology', 'physics'] },
  information: { name: 'Information',      blurb: 'measuring, computing, predicting',               branches: ['physics', 'social'] },
};

// ---------------------------------------------------------------------------
// PROPERTIES — each one reaches across more than one discipline. No numbers here.
// ---------------------------------------------------------------------------
export const PROPERTIES = [
  // ---------------- Materials ----------------
  { id: 'lattice_toughness', name: 'Lattice Toughness', domain: 'materials', rarity: 'common',
    what: 'the grain structure refuses to crack; a hit spreads instead of splitting',
    affects: [
      { channel: 'armor_integrity', how: 'plates take the hit without splitting' },
      { channel: 'hull_integrity', how: 'the frame keeps its shape when the armor fails' },
      { channel: 'structural_scale', how: 'larger hulls and buildings stop collapsing under their own weight' },
      { channel: 'kinetic_penetration', how: 'a slug that does not deform digs deeper' }] },

  { id: 'elastic_rebound', name: 'Elastic Rebound', domain: 'materials', rarity: 'common',
    what: 'gives under load and hands the energy back instead of keeping the dent',
    affects: [
      { channel: 'armor_deflection', how: 'the blow bounces instead of biting' },
      { channel: 'accuracy', how: 'recoil is swallowed instead of thrown into the next shot' },
      { channel: 'shield_recovery', how: 'emitter mounts settle again immediately' },
      { channel: 'agility', how: 'a frame that flexes survives a harder turn' },
      { channel: 'maintenance', how: 'fewer parts are bent out of true' }] },

  { id: 'cellular_foam', name: 'Cellular Foam', domain: 'materials', rarity: 'uncommon',
    what: 'a sponge of sealed voids: nearly the same strength for a fraction of the weight',
    affects: [
      { channel: 'miniaturization', how: 'the same part weighs a fraction of what it did' },
      { channel: 'structural_scale', how: 'weight stops being the reason you cannot build it bigger' },
      { channel: 'habitability', how: 'thin walls leave more room for people' },
      { channel: 'affordability', how: 'less material per part' }] },

  { id: 'self_knit_alloy', name: 'Self-Knit Alloy', domain: 'materials', rarity: 'rare',
    what: 'micro-cracks close themselves while the part is still in service',
    affects: [
      { channel: 'hull_regeneration', how: 'holes knit shut in the middle of the battle' },
      { channel: 'maintenance', how: 'damage never reaches a repair dock' },
      { channel: 'hull_integrity', how: 'nothing accumulates fatigue' },
      { channel: 'armor_integrity', how: 'the plate that cracked is whole again' }] },

  { id: 'phase_slip', name: 'Phase Slip', domain: 'materials', rarity: 'exotic',
    what: 'matter sits a hair out of step with normal space',
    affects: [
      { channel: 'evasion', how: 'part of the ship is not quite where the shot arrives' },
      { channel: 'sensor_range', how: 'it reads what is happening just out of phase, through anything' },
      { channel: 'miniaturization', how: 'volume folded slightly out of the way' },
      { channel: 'armor_deflection', how: 'a hit lands on something that is only half there' }] },

  // ---------------- Fabrication ----------------
  { id: 'crystal_symmetry', name: 'Crystal Symmetry', domain: 'fabrication', rarity: 'uncommon',
    what: 'an almost flawless lattice — every sample behaves exactly like the last one',
    affects: [
      { channel: 'computing', how: 'a flawless lattice is a flawless processor' },
      { channel: 'synthetic_neural', how: 'a mind can be grown in it without a single flaw to go mad around' },
      { channel: 'targeting', how: 'fire control that does not drift between shots' },
      { channel: 'research_ease', how: 'nothing has to be over-designed for the bad samples' },
      { channel: 'affordability', how: 'almost nothing is rejected at the end of the line' }] },

  { id: 'sinter_density', name: 'Sinter Density', domain: 'fabrication', rarity: 'common',
    what: 'powder packs into a finished part in one pass, with no machining left over',
    affects: [
      { channel: 'affordability', how: 'one step instead of twelve' },
      { channel: 'manufacturing', how: 'the same yard turns out more hulls' },
      { channel: 'maintenance', how: 'a part with no seams has nothing to come apart' }] },

  { id: 'tolerance_grade', name: 'Tolerance Grade', domain: 'fabrication', rarity: 'common',
    what: 'parts fit each other so exactly that nothing is wasted on slack',
    affects: [
      { channel: 'miniaturization', how: 'no space is spent on clearance' },
      { channel: 'accuracy', how: 'a barrel with no play points exactly where it is aimed' },
      { channel: 'rate_of_fire', how: 'the action never jams' },
      { channel: 'thrust', how: 'nothing is lost in the couplings' },
      { channel: 'maintenance', how: 'parts stop wearing each other out' }] },

  // ---------------- Energy ----------------
  { id: 'combustion_yield', name: 'Combustion Yield', domain: 'energy', rarity: 'common',
    what: 'the fuel burns hotter and leaves nothing behind',
    affects: [
      { channel: 'reactor_output', how: 'more out of every gram of fuel' },
      { channel: 'thrust', how: 'hotter exhaust, harder push' },
      { channel: 'kinetic_penetration', how: 'a hotter charge throws the slug faster' },
      { channel: 'warhead_yield', how: 'the warhead burns everything it carries' }] },

  { id: 'energy_density', name: 'Energy Density', domain: 'energy', rarity: 'common',
    what: 'more joules packed into every kilogram',
    affects: [
      { channel: 'energy_storage', how: 'the same buffer holds far more' },
      { channel: 'beam_power', how: 'a heavier punch out of the same emitter' },
      { channel: 'warhead_yield', how: 'more blast packed into the same nose cone' },
      { channel: 'miniaturization', how: 'the power plant shrinks around the same output' }] },

  { id: 'magnetic_confluence', name: 'Magnetic Confluence', domain: 'energy', rarity: 'uncommon',
    what: 'fields that meet without fighting each other, and hold what should not be held',
    affects: [
      { channel: 'beam_power', how: 'the bolt stays together all the way to the target' },
      { channel: 'reactor_output', how: 'a hotter plasma held by the same bottle' },
      { channel: 'shield_capacity', how: 'the trick that holds plasma also holds a shield' },
      { channel: 'shield_reach', how: 'fields that merge instead of fighting can be thrown wider' },
      { channel: 'kinetic_penetration', how: 'rails that accelerate without tearing themselves apart' }] },

  { id: 'decay_harvest', name: 'Decay Harvest', domain: 'energy', rarity: 'rare',
    what: 'catches the radiation that every other design throws away',
    affects: [
      { channel: 'reactor_output', how: 'the waste becomes part of the output' },
      { channel: 'power_efficiency', how: 'losses are collected instead of vented' },
      { channel: 'sensor_range', how: 'the same receivers read very faint radiation very far away' }] },

  { id: 'vacuum_tension', name: 'Vacuum Tension', domain: 'energy', rarity: 'exotic',
    what: 'pulls a trickle of work out of empty space itself',
    affects: [
      { channel: 'reactor_output', how: 'power with no fuel behind it' },
      { channel: 'power_efficiency', how: 'the background tops up everything' },
      { channel: 'energy_storage', how: 'the buffer refills on its own' },
      { channel: 'cold_start', how: 'there is nothing to spin up' }] },

  // ---------------- Electrics ----------------
  { id: 'superconduction', name: 'Superconduction', domain: 'electrics', rarity: 'uncommon',
    what: 'current runs with no resistance at working temperature — nothing is lost as heat',
    affects: [
      { channel: 'power_efficiency', how: 'nothing is lost between the reactor and the part' },
      { channel: 'reactor_output', how: 'what was lost as heat now arrives' },
      { channel: 'thrust', how: 'coils take the current they were always promised' },
      { channel: 'rate_of_fire', how: 'the weapon recharges as fast as the cable allows' }] },

  { id: 'charge_retention', name: 'Charge Retention', domain: 'electrics', rarity: 'common',
    what: 'holds a charge for hours without leaking it away',
    affects: [
      { channel: 'energy_storage', how: 'a buffer that is still full when you need it' },
      { channel: 'shield_capacity', how: 'the shield sits on a deeper reservoir' },
      { channel: 'shield_reach', how: 'a field that does not leak can be stretched thinner' },
      { channel: 'weapon_efficiency', how: 'nothing bleeds away between shots' }] },

  { id: 'inductive_coupling', name: 'Inductive Coupling', domain: 'electrics', rarity: 'common',
    what: 'power crosses a gap with no cable and no contact to wear out',
    affects: [
      { channel: 'manufacturing', how: 'machines that can be rearranged in a day' },
      { channel: 'power_efficiency', how: 'no connector losses anywhere' },
      { channel: 'miniaturization', how: 'the cable runs disappear' },
      { channel: 'maintenance', how: 'there are no contacts left to burn out' }] },

  { id: 'arc_suppression', name: 'Arc Suppression', domain: 'electrics', rarity: 'common',
    what: 'switches enormous currents without the flash-over that forces a cooldown',
    affects: [
      { channel: 'rate_of_fire', how: 'no waiting for the switchgear to recover' },
      { channel: 'cold_start', how: 'full current from the first instant' },
      { channel: 'weapon_efficiency', how: 'the energy goes to the target, not to the arc' }] },

  // ---------------- Optics ----------------
  { id: 'luminous_refraction', name: 'Luminous Refraction', domain: 'optics', rarity: 'common',
    what: 'bends and concentrates light through the medium with almost no scatter',
    affects: [
      { channel: 'weapon_range', how: 'the beam is still a weapon when it arrives' },
      { channel: 'beam_power', how: 'more of the light reaches one spot' },
      { channel: 'sensor_range', how: 'the same optics look much further out' }] },

  { id: 'beam_coherence', name: 'Beam Coherence', domain: 'optics', rarity: 'uncommon',
    what: 'the beam stays a needle instead of spreading into a smear',
    affects: [
      { channel: 'weapon_range', how: 'distance stops widening the beam' },
      { channel: 'accuracy', how: 'the spot on the hull stays a spot' },
      { channel: 'weapon_efficiency', how: 'nothing is spent on light that misses' },
      { channel: 'targeting', how: 'a narrow beam is an exact measurement of where you hit' },
      { channel: 'sensor_resolution', how: 'a needle-thin return draws the target instead of smudging it' }] },

  { id: 'spectral_filtering', name: 'Spectral Filtering', domain: 'optics', rarity: 'common',
    what: 'passes exactly the wavelengths you want and mirrors the rest away',
    affects: [
      { channel: 'shield_capacity', how: 'the shield refuses the wavelengths aimed at it' },
      { channel: 'sensor_resolution', how: 'the one signal that matters is picked out of the glare' },
      { channel: 'computing', how: 'optical channels that do not interfere' }] },

  { id: 'photon_recycling', name: 'Photon Recycling', domain: 'optics', rarity: 'rare',
    what: 'the light that misses is caught and used again',
    affects: [
      { channel: 'weapon_efficiency', how: 'the miss is not a total loss' },
      { channel: 'power_efficiency', how: 'stray light is collected across the whole hull' },
      { channel: 'computing', how: 'the same recycling drives optical processors' }] },

  // ---------------- Thermal ----------------
  { id: 'thermal_sink', name: 'Thermal Sink', domain: 'thermal', rarity: 'common',
    what: 'soaks a shocking amount of heat and sheds it again quickly',
    affects: [
      { channel: 'rate_of_fire', how: 'the barrel is ready before the gunner is' },
      { channel: 'accuracy', how: 'a barrel that never heats never warps off the aim point' },
      { channel: 'reactor_output', how: 'the reactor can be pushed harder for longer' },
      { channel: 'hull_integrity', how: 'a hit that should have cooked the frame does not' }] },

  { id: 'cryo_stability', name: 'Cryo Stability', domain: 'thermal', rarity: 'uncommon',
    what: 'stays useful and predictable close to absolute zero',
    affects: [
      { channel: 'energy_storage', how: 'cold storage leaks almost nothing' },
      { channel: 'cold_start', how: 'the system never has to be warmed first' },
      { channel: 'computing', how: 'cold logic runs faster and makes fewer mistakes' },
      { channel: 'sensor_range', how: 'a cold receiver hears the quiet things' }] },

  { id: 'heat_shear', name: 'Heat Shear', domain: 'thermal', rarity: 'rare',
    what: 'turns a temperature difference straight into work, with no moving parts',
    affects: [
      { channel: 'reactor_output', how: 'every gradient on the ship becomes a generator' },
      { channel: 'drive_efficiency', how: 'engine waste heat pushes the engine' },
      { channel: 'power_efficiency', how: 'heat stops being a loss' }] },

  { id: 'ablative_char', name: 'Ablative Char', domain: 'thermal', rarity: 'common',
    what: 'the surface burns away on purpose and carries the damage off with it',
    affects: [
      { channel: 'armor_deflection', how: 'the first layer leaves with the energy' },
      { channel: 'armor_integrity', how: 'what is underneath is never touched' },
      { channel: 'affordability', how: 'the sacrificial layer is cheap to make and cheap to replace' }] },

  { id: 'ignition_threshold', name: 'Ignition Threshold', domain: 'thermal', rarity: 'common',
    what: 'starts reacting from a much smaller nudge',
    affects: [
      { channel: 'cold_start', how: 'lighting the reactor takes almost nothing' },
      { channel: 'shield_recovery', how: 'the field restarts the moment it is dropped' },
      { channel: 'rate_of_fire', how: 'each shot needs less to set it off' },
      { channel: 'warhead_yield', how: 'the charge goes off whole, on the lightest touch' }] },

  // ---------------- Fields & motion ----------------
  { id: 'magnetic_coupling', name: 'Magnetic Coupling', domain: 'motion', rarity: 'common',
    what: 'force handed over without contact, so nothing grinds itself away',
    affects: [
      { channel: 'thrust', how: 'the drive pushes on the ship, not on its bearings' },
      { channel: 'accuracy', how: 'a mount with no bearings has no slop to shake the shot' },
      { channel: 'agility', how: 'thrusters answer instantly' },
      { channel: 'manufacturing', how: 'machine tools with nothing to wear out' },
      { channel: 'maintenance', how: 'there is no contact left to service' }] },

  { id: 'inertial_damping', name: 'Inertial Damping', domain: 'motion', rarity: 'rare',
    what: 'mass argues less with a change of direction',
    affects: [
      { channel: 'agility', how: 'the ship turns as if it were empty' },
      { channel: 'accuracy', how: 'a gun platform that does not wallow while it fires' },
      { channel: 'thrust', how: 'acceleration stops fighting the ship' },
      { channel: 'evasion', how: 'it moves in ways a gunner cannot lead' },
      { channel: 'miniaturization', how: 'structure no longer has to survive its own manoeuvres' }] },

  { id: 'field_geometry', name: 'Field Geometry', domain: 'motion', rarity: 'uncommon',
    what: 'a shaped field holds far more than a round one for the same power',
    affects: [
      { channel: 'shield_capacity', how: 'the field is thickest where the hits come from' },
      { channel: 'shield_reach', how: 'the field keeps its shape far from the emitter' },
      { channel: 'shield_recovery', how: 'a collapsed shape reforms quickly' },
      { channel: 'power_efficiency', how: 'no power is spent holding empty space' }] },

  { id: 'resonant_drive', name: 'Resonant Drive', domain: 'motion', rarity: 'common',
    what: 'strikes matter at its own frequency, so a small push does a large job',
    affects: [
      { channel: 'thrust', how: 'the drive pulses with the structure instead of against it' },
      { channel: 'mining_yield', how: 'rock shatters itself when asked politely' },
      { channel: 'manufacturing', how: 'forming metal takes a fraction of the force' }] },

  { id: 'gravitic_gradient', name: 'Gravitic Gradient', domain: 'motion', rarity: 'exotic',
    what: 'small differences in gravity, held exactly where you want them',
    affects: [
      { channel: 'habitability', how: 'every deck can be a ground floor' },
      { channel: 'agility', how: 'the ship leans on space itself to turn' },
      { channel: 'structural_scale', how: 'weight is carried by the field, not by the beams' },
      { channel: 'miniaturization', how: 'nothing needs to be braced against its own weight' }] },

  // ---------------- Life & chemistry ----------------
  { id: 'nutrient_cycle', name: 'Nutrient Cycle', domain: 'life', rarity: 'common',
    what: 'waste is food again before it has cooled down',
    affects: [
      { channel: 'food_yield', how: 'nothing leaves the loop' },
      { channel: 'habitability', how: 'a colony needs far less room per person' },
      { channel: 'labor_efficiency', how: 'the loop runs itself' }] },

  { id: 'growth_vigor', name: 'Growth Vigor', domain: 'life', rarity: 'common',
    what: 'everything alive grows faster, bigger and with fewer failures',
    affects: [
      { channel: 'food_yield', how: 'more harvests, larger each time' },
      { channel: 'growth', how: 'people arrive faster than the plan expected' },
      { channel: 'habitability', how: 'a hostile place becomes merely unpleasant' }] },

  { id: 'bio_leaching', name: 'Bio-Leaching', domain: 'life', rarity: 'uncommon',
    what: 'microbes eat the ore out of the rock, so nobody has to dig it',
    affects: [
      { channel: 'mining_yield', how: 'ore that was not worth digging is now worth having' },
      { channel: 'labor_efficiency', how: 'the shift works without a crew' },
      { channel: 'maintenance', how: 'the same cultures clean corrosion off everything else' }] },

  { id: 'enzyme_precision', name: 'Enzyme Precision', domain: 'life', rarity: 'rare',
    what: 'the reaction happens at exactly the atom you meant and nowhere else',
    affects: [
      { channel: 'computing', how: 'chemistry that computes' },
      { channel: 'synthetic_neural', how: 'grown tissue makes a better mind than etched silicon' },
      { channel: 'manufacturing', how: 'parts are grown to shape instead of cut to shape' },
      { channel: 'research_ease', how: 'an experiment that always answers the question asked' }] },

  { id: 'toxin_tolerance', name: 'Toxin Tolerance', domain: 'life', rarity: 'common',
    what: 'crews and crops survive conditions that should kill them',
    affects: [
      { channel: 'labor_efficiency', how: 'no one is standing by in a suit' },
      { channel: 'habitability', how: 'the place does not have to be cleaned first' },
      { channel: 'growth', how: 'people stop dying of where they live' }] },

  // ---------------- Information ----------------
  { id: 'signal_purity', name: 'Signal Purity', domain: 'information', rarity: 'common',
    what: 'data arrives exactly as it left, with no noise to argue with',
    affects: [
      { channel: 'computing', how: 'no cycles spent asking again' },
      { channel: 'targeting', how: 'the gun is told the truth about where the target is' },
      { channel: 'sensor_resolution', how: 'a signal under the noise floor is still a signal' },
      { channel: 'shield_recovery', how: 'emitters agree with each other instantly' }] },

  { id: 'parallel_logic', name: 'Parallel Logic', domain: 'information', rarity: 'uncommon',
    what: 'thousands of small computations at once instead of one long one',
    affects: [
      { channel: 'computing', how: 'the whole problem at the same time' },
      { channel: 'synthetic_neural', how: 'a mind is many small thoughts running together' },
      { channel: 'research_ease', how: 'the design is simulated instead of prototyped' },
      { channel: 'manufacturing', how: 'every machine on the floor is scheduled at once' },
      { channel: 'targeting', how: 'every possible path of the target is tracked' }] },

  { id: 'predictive_control', name: 'Predictive Control', domain: 'information', rarity: 'rare',
    what: 'the machine acts on where things are about to be',
    affects: [
      { channel: 'targeting', how: 'the shot is already where the target is going' },
      { channel: 'synthetic_neural', how: 'the ship stops waiting to be told' },
      { channel: 'agility', how: 'the turn begins before the order finishes' },
      { channel: 'shield_recovery', how: 'the field is raised for the hit that has not landed' },
      { channel: 'evasion', how: 'it dodges the shot that was going to be fired' }] },

  { id: 'temporal_lag', name: 'Temporal Lag', domain: 'information', rarity: 'exotic',
    what: 'inside the field, local time runs slightly slower than outside it',
    affects: [
      { channel: 'research_ease', how: 'a laboratory year in a calendar month' },
      { channel: 'cold_start', how: 'the plant is already warm when it arrives in the present' },
      { channel: 'shield_recovery', how: 'the field has longer to recover than the enemy has to fire' },
      { channel: 'evasion', how: 'the ship is a fraction of a second behind where it is aimed at' }] },
];

// Rarity says how often a property shows up in a rolled breakthrough, and how generous the
// magnitudes on that breakthrough are allowed to be. The magnitudes themselves live on the
// breakthrough, never here.
export const RARITY = {
  common:   { weight: 100, magnitude: 'modest' },
  uncommon: { weight: 45,  magnitude: 'solid' },
  rare:     { weight: 15,  magnitude: 'strong' },
  exotic:   { weight: 3,   magnitude: 'era-defining' },
};

export const byId = id => PROPERTIES.find(p => p.id === id);
export const byDomain = d => PROPERTIES.filter(p => p.domain === d);
export const byChannel = c => PROPERTIES.filter(p => p.affects.some(a => a.channel === c));

// ---------------------------------------------------------------------------
// THE FOUR X — the empire's focus. Every channel answers to one of them: when the focus leans
// toward an X, breakthroughs express the channels of that X strongly and the others weakly.
// This is the hidden tech tree: field (what you study) × focus (what you want it for).
// ---------------------------------------------------------------------------
export const FOUR_X = { expand: 'Expansion', exploit: 'Exploitation', explore: 'Exploration', exterminate: 'Extermination' };

export const CHANNEL_X = {
  // extermination — fighting and surviving a fight
  beam_power: 'exterminate', kinetic_penetration: 'exterminate', warhead_yield: 'exterminate', rate_of_fire: 'exterminate', accuracy: 'exterminate',
  targeting: 'exterminate', weapon_efficiency: 'exterminate', weapon_range: 'exterminate',
  shield_capacity: 'exterminate', shield_recovery: 'exterminate', shield_reach: 'exterminate', armor_integrity: 'exterminate', armor_deflection: 'exterminate',
  evasion: 'exterminate', hull_regeneration: 'exterminate', cold_start: 'exterminate',
  // exploration — going far, seeing far, learning
  thrust: 'explore', agility: 'explore', drive_efficiency: 'explore', sensor_range: 'explore', sensor_resolution: 'explore',
  energy_storage: 'explore', computing: 'explore', research_ease: 'explore',
  // expansion — more room, more people, bigger things
  structural_scale: 'expand', hull_integrity: 'expand', habitability: 'expand', growth: 'expand', food_yield: 'expand',
  affordability: 'expand', miniaturization: 'expand', maintenance: 'expand',
  // exploitation — getting more out of what you already hold
  mining_yield: 'exploit', manufacturing: 'exploit', labor_efficiency: 'exploit',
  reactor_output: 'exploit', power_efficiency: 'exploit', synthetic_neural: 'exploit',
};
