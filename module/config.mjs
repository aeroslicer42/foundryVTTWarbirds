/**
 * Static configuration for the Warbirds system.
 * Everything here is referenced as CONFIG.WARBIRDS at runtime.
 */

export const SYSTEM_ID = "warbirds";

/**
 * Build a path inside this system's folder.
 * @param {string} path
 * @returns {string}
 */
export const systemPath = path => `systems/${SYSTEM_ID}/${path}`;

export const WARBIRDS = {};

/* -------------------------------------------- */
/*  Stats & skills                              */
/* -------------------------------------------- */

WARBIRDS.stats = {
  body: "WARBIRDS.Stats.body",
  mind: "WARBIRDS.Stats.mind",
  spirit: "WARBIRDS.Stats.spirit"
};

/**
 * The standard ground skill list (core book p90-94) with the stat each one defaults to.
 * Skills marked "Mind or Spirit" in the book default to one of them; the roll dialog lets the
 * player pick the other stat at roll time.
 * The key is also the TypedObjectField key used on new pilots, so lookups like
 * `system.skills.athletics` work for the default skills.
 */
WARBIRDS.skills = {
  academics: { label: "WARBIRDS.Skills.academics", stat: "mind" },
  athletics: { label: "WARBIRDS.Skills.athletics", stat: "body" },
  awareness: { label: "WARBIRDS.Skills.awareness", stat: "mind" },
  barter: { label: "WARBIRDS.Skills.barter", stat: "mind" },
  closeCombat: { label: "WARBIRDS.Skills.closeCombat", stat: "body" },
  command: { label: "WARBIRDS.Skills.command", stat: "spirit" },
  craft: { label: "WARBIRDS.Skills.craft", stat: "mind" },
  etiquette: { label: "WARBIRDS.Skills.etiquette", stat: "spirit" },
  interrogation: { label: "WARBIRDS.Skills.interrogation", stat: "spirit" },
  investigation: { label: "WARBIRDS.Skills.investigation", stat: "mind" },
  languages: { label: "WARBIRDS.Skills.languages", stat: "mind" },
  larceny: { label: "WARBIRDS.Skills.larceny", stat: "mind" },
  mechanics: { label: "WARBIRDS.Skills.mechanics", stat: "mind" },
  medicine: { label: "WARBIRDS.Skills.medicine", stat: "mind" },
  perform: { label: "WARBIRDS.Skills.perform", stat: "spirit" },
  persuade: { label: "WARBIRDS.Skills.persuade", stat: "spirit" },
  publicity: { label: "WARBIRDS.Skills.publicity", stat: "spirit" },
  ride: { label: "WARBIRDS.Skills.ride", stat: "body" },
  sailAirship: { label: "WARBIRDS.Skills.sailAirship", stat: "mind" },
  shooting: { label: "WARBIRDS.Skills.shooting", stat: "body" },
  stealth: { label: "WARBIRDS.Skills.stealth", stat: "body" },
  survival: { label: "WARBIRDS.Skills.survival", stat: "mind" }
};

/** Skills that may receive the once-per-session Fame/Rank bonus (and suffer the Scandal penalty). */
WARBIRDS.standingSkills = ["command", "etiquette", "perform", "persuade", "publicity", "interrogation"];

/** The flight skills. All of them are modified by SA. */
WARBIRDS.flightSkills = {
  piloting: "WARBIRDS.FlightSkills.piloting",
  strafing: "WARBIRDS.FlightSkills.strafing",
  gunnery: "WARBIRDS.FlightSkills.gunnery",
  ordinance: "WARBIRDS.FlightSkills.ordinance",
  ew: "WARBIRDS.FlightSkills.ew"
};

/* -------------------------------------------- */
/*  Difficulties                                */
/* -------------------------------------------- */

WARBIRDS.difficulties = {
  2: "WARBIRDS.Difficulty.routine",
  4: "WARBIRDS.Difficulty.easy",
  6: "WARBIRDS.Difficulty.moderate",
  8: "WARBIRDS.Difficulty.tough",
  10: "WARBIRDS.Difficulty.veryTough",
  12: "WARBIRDS.Difficulty.nearImpossible",
  14: "WARBIRDS.Difficulty.epic"
};

/* -------------------------------------------- */
/*  Choice lists                                */
/* -------------------------------------------- */

WARBIRDS.standingModes = {
  rank: "WARBIRDS.Standing.rank",
  fame: "WARBIRDS.Standing.fame"
};

WARBIRDS.eras = {
  azure: "WARBIRDS.Eras.azure",
  postwar: "WARBIRDS.Eras.postwar",
  vietnam: "WARBIRDS.Eras.vietnam",
  digital: "WARBIRDS.Eras.digital",
  precision: "WARBIRDS.Eras.precision",   // table extension: 1992-2004, precision-guided warfare
  stealth: "WARBIRDS.Eras.stealth"        // table extension: 2005-2022, fifth-generation fighters
};

WARBIRDS.weaponCategories = {
  gun: "WARBIRDS.WeaponCategory.gun",
  ordinance: "WARBIRDS.WeaponCategory.ordinance",
  missile: "WARBIRDS.WeaponCategory.missile",
  turret: "WARBIRDS.WeaponCategory.turret",
  personal: "WARBIRDS.WeaponCategory.personal"
};

WARBIRDS.weaponSkills = {
  gunnery: "WARBIRDS.FlightSkills.gunnery",
  ordinance: "WARBIRDS.FlightSkills.ordinance",
  shooting: "WARBIRDS.Skills.shooting",
  closeCombat: "WARBIRDS.Skills.closeCombat"
};

/** Which skill a weapon category uses unless the item overrides it. */
WARBIRDS.weaponCategorySkill = {
  gun: "gunnery",
  ordinance: "ordinance",
  missile: "ordinance",
  turret: "gunnery",
  personal: "shooting"
};

WARBIRDS.traitCategories = {
  gunnery: "WARBIRDS.TraitCategory.gunnery",
  ordinance: "WARBIRDS.TraitCategory.ordinance",
  dogfighting: "WARBIRDS.TraitCategory.dogfighting",
  strafing: "WARBIRDS.TraitCategory.strafing",
  general: "WARBIRDS.TraitCategory.general",
  innate: "WARBIRDS.TraitCategory.innate",
  courier: "WARBIRDS.TraitCategory.courier"
};

WARBIRDS.traitRestrictions = {
  none: "WARBIRDS.TraitRestriction.none",
  ace: "WARBIRDS.TraitRestriction.ace",
  elite: "WARBIRDS.TraitRestriction.elite"
};

/** The numeric modifiers a trait can carry. Keys are used by the aircraft model when summing traits. */
WARBIRDS.traitModifiers = [
  "performance", "armour", "structure", "dr", "radar", "epm", "super",
  "dogfighting", "strafing", "gunnery", "ordinance", "ew",
  "breakDefence", "escapeDefence", "shootDefence", "stuntDefence", "stunt",
  "disengage", "awareness", "ammo"
];

WARBIRDS.maneuverKinds = {
  defence: "WARBIRDS.ManeuverKind.defence",
  stunt: "WARBIRDS.ManeuverKind.stunt",
  advancedStunt: "WARBIRDS.ManeuverKind.advancedStunt",
  bvrTactic: "WARBIRDS.ManeuverKind.bvrTactic",
  altitude: "WARBIRDS.ManeuverKind.altitude",
  other: "WARBIRDS.ManeuverKind.other"
};

WARBIRDS.sponsorshipKinds = {
  sponsor: "WARBIRDS.SponsorshipKind.sponsor",
  contract: "WARBIRDS.SponsorshipKind.contract"
};

WARBIRDS.sponsorshipStatus = {
  offered: "WARBIRDS.SponsorshipStatus.offered",
  active: "WARBIRDS.SponsorshipStatus.active",
  completed: "WARBIRDS.SponsorshipStatus.completed",
  failed: "WARBIRDS.SponsorshipStatus.failed",
  dropped: "WARBIRDS.SponsorshipStatus.dropped"
};

WARBIRDS.npcModes = {
  thug: "WARBIRDS.NpcMode.thug",
  threat: "WARBIRDS.NpcMode.threat"
};

WARBIRDS.advantageKinds = {
  advantage: "WARBIRDS.Advantage.advantage",
  disadvantage: "WARBIRDS.Advantage.disadvantage"
};

WARBIRDS.advantageLevels = {
  minor: "WARBIRDS.Advantage.minor",
  major: "WARBIRDS.Advantage.major"
};

/** Condition labels for people (pilots, NPCs). */
WARBIRDS.creatureStatus = {
  fine: "WARBIRDS.Status.fine",
  wounded: "WARBIRDS.Status.wounded",
  down: "WARBIRDS.Status.down",
  out: "WARBIRDS.Status.out",
  dead: "WARBIRDS.Status.dead"
};

/** Vessel categories (big targets). */
WARBIRDS.vesselCategories = {
  airship: "WARBIRDS.VesselCategory.airship",
  train: "WARBIRDS.VesselCategory.train",
  fortification: "WARBIRDS.VesselCategory.fortification",
  courier: "WARBIRDS.VesselCategory.courier",
  other: "WARBIRDS.VesselCategory.other"
};

/** Condition labels for vessels. */
WARBIRDS.vesselStatus = {
  intact: "WARBIRDS.VesselStatus.intact",
  damaged: "WARBIRDS.VesselStatus.damaged",
  adrift: "WARBIRDS.VesselStatus.adrift",
  destroyed: "WARBIRDS.VesselStatus.destroyed"
};

/** BVR tactics and the resolution matrix (Jet Age p7-9): what the next round is for each pair. */
WARBIRDS.bvrTactics = {
  press: "WARBIRDS.Bvr.press",
  crank: "WARBIRDS.Bvr.crank",
  notch: "WARBIRDS.Bvr.notch",
  drag: "WARBIRDS.Bvr.drag"
};
WARBIRDS.bvrAltitudes = {
  high: "WARBIRDS.Bvr.high",
  medium: "WARBIRDS.Bvr.medium",
  low: "WARBIRDS.Bvr.low"
};
WARBIRDS.bvrResolution = {
  press: { press: "headToHead", crank: "dogfight", notch: "dogfight", drag: "bvr" },
  crank: { press: "dogfight", crank: "dogfight", notch: "dogfight", drag: "bvr" },
  notch: { press: "dogfight", crank: "dogfight", notch: "bvr", drag: "bvr" },
  drag: { press: "bvr", crank: "bvr", notch: "bvr", drag: "disengage" }
};
WARBIRDS.bvrOutcomes = {
  headToHead: "WARBIRDS.Bvr.outcomeHeadToHead",
  dogfight: "WARBIRDS.Bvr.outcomeDogfight",
  bvr: "WARBIRDS.Bvr.outcomeBvr",
  disengage: "WARBIRDS.Bvr.outcomeDisengage"
};

/** Condition labels for aircraft. */
WARBIRDS.aircraftStatus = {
  fit: "WARBIRDS.AircraftStatus.fit",
  smoke: "WARBIRDS.AircraftStatus.smoke",
  crippled: "WARBIRDS.AircraftStatus.crippled",
  down: "WARBIRDS.AircraftStatus.down"
};

/** Defence options a defending aircraft can choose (core book p70). */
WARBIRDS.aircraftDefences = {
  break: "WARBIRDS.Defence.break",
  escape: "WARBIRDS.Defence.escape",
  shoot: "WARBIRDS.Defence.shoot",
  stunt: "WARBIRDS.Defence.stunt"
};

/* -------------------------------------------- */
/*  Default document images                     */
/* -------------------------------------------- */

WARBIRDS.defaultIcons = {
  Actor: {
    pilot: "icons/svg/mystery-man.svg",
    aircraft: "icons/svg/wing.svg",
    npc: "icons/svg/mystery-man.svg",
    vessel: "icons/svg/anchor.svg"
  },
  Item: {
    weapon: "icons/svg/sword.svg",
    trait: "icons/svg/upgrade.svg",
    maneuver: "icons/svg/wing.svg",
    sponsorship: "icons/svg/coins.svg",
    gear: "icons/svg/chest.svg"
  }
};
