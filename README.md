# Warbirds — Jet Age (Foundry VTT system)

A Foundry VTT **v14** system for Outrider Studios' *Warbirds* role-playing game (Rapidfire rules), set up for the
*Jet Age* sourcebook. Written against Foundry 14.368 using `TypeDataModel` data models and ApplicationV2 sheets.

The system contains game mechanics only. It does not reproduce the text of the books; you need your own copies of
*Warbirds* and the *Jet Age Sourcebook* to play.

## Install

The game comes as two packages: the **system** (`warbirds`) and the table's **homebrew module**
(`warbirds-homebrew`). The homebrew lives in its own module so that updating the system never overwrites edits you
make to the homebrew compendiums, and so it can be shared on its own.

1. Copy the `warbirds` folder into your Foundry user data directory as `Data/systems/warbirds/`
   (the folder name **must** be `warbirds`, matching the `id` in `system.json`).
2. Copy the `warbirds-homebrew` folder to `Data/modules/warbirds-homebrew/`.
3. Restart Foundry (or reload the setup screen) and create a world with the "Warbirds — Jet Age" system; in the
   world, enable the **Warbirds — Table Homebrew** module under *Manage Modules*.
4. In **Settings → Configure Settings → System**, choose the standing stat: **Rank** (Jet Age, historical games)
   or **Fame** (Azure, core book). You can also switch on the Jet Age *Shoot to Kill* gritty rules.

**Installing from GitHub (beta releases):** in Foundry's *Install System* dialog paste the system's manifest URL
(`https://raw.githubusercontent.com/<user>/warbirds/main/system.json`), then in *Install Module* the module's
(`https://raw.githubusercontent.com/<user>/warbirds-homebrew/main/module.json`). Foundry's *Update* button then
follows the releases. Releases are built by the repositories' GitHub Action from version tags; `RELEASING.md`
describes the process. While the version is 0.x the releases are marked as pre-releases: this is a **beta** — expect
rough edges, and please report them on the repository's issue tracker.

**Upgrading a world from 0.5.x:** the homebrew compendiums used to be part of the system. Their documents keep the
same ids in the module, so anything already imported into the world is untouched; the first time a GM loads the
world with the module enabled, it rewrites any links that still point at the old `warbirds.homebrew-…` compendiums.

## What is in this build (stages a–d)

- **Pilot** actors: Body/Mind/Spirit, SA, the standard skill list with XP and Knack, the five flight skills
  (Piloting, Strafing, Gunnery, Ordinance, Electronic Warfare), Reserve, Rank or Fame (+ Fame Points and Scandal),
  Stat Points, kills and Ace status, Advantages/Disadvantages, a Health track whose penalties are derived from
  the book's pattern (0, −1 −1, −2 −2, −3 …), Defence / Resist / Health computed from stats and equipped gear,
  and an **Aircraft** tab that shows the linked warbird's stats and ratings as flown by this pilot.
- **Aircraft** actors: Performance, Armour, Structure + Damage Resistance (or a hand-written penalty track),
  Radar Rating, EPM, Super, BVR, Threat, hard points, a crew block for NPC pilots, mounted weapons and traits.
  Dogfighting / Strafing / Gunnery / Ordinance / EW ratings and the Break / Shoot / Escape / Stunt Defences are
  computed from the linked pilot (or the crew block) plus trait modifiers and damage penalties.
- **NPC** actors: thugs (fixed initiative, no Health track) and threats (full stat block with overrides).
- **Vessel** actors: airships, trains, fortifications and couriers with Armour, Performance, a main Structure track,
  Defence, **Threat** and a table of **sub-systems** (one entry per unit: bridge, engines, each gun emplacement...).
  Filling a unit's track disables it, does 1 damage to the main Structure and lowers Threat once every *N*
  destroyed units of its group (three emplacements on an escort frigate). A full main track leaves the vessel
  adrift (Defence 1, Threat 0); double damage destroys it.
- Items: **weapon** (guns, ordinance, missiles, turrets, personal), **trait** (structured modifiers),
  **manoeuvre**, **sponsorship / contract**, **gear**.
- Token bars: `health` (pilots, NPCs) and `structure` (aircraft, vessels) show remaining points; editing the bar on
  a token updates the damage taken. `reserve` is available as a secondary bar for pilots.
- Hard points: the Loadout tab counts the pylons of mounted ordinance and missiles and warns (and notifies when you
  drop a weapon on the sheet) when the airframe is over capacity.
- **Bail out**: a Crippled or Going Down aircraft shows a *Bail out* button on the Cockpit tab. It posts the core
  rule (bailing out at the last second; trapped if Life is on the Line) or, with the gritty rules on and a plane
  Going Down, rolls the pilot's 1d6 + Spirit vs 5.
- Combat tracker initiative: pilots and threats roll 1d6 + Mind + Awareness, aircraft roll their Dogfighting
  rating, thugs use their fixed Initiative number.
- Drag an **Aircraft** actor onto a pilot sheet (or a **Pilot** onto an aircraft sheet) to link them both ways.
  Drag items from the sidebar or compendiums onto sheets to add them.

## How rolls work

Everything is `1d6 + stat + skill + modifiers`, so every clickable number opens a small dialog first:

- **Stats, skills, flight skills** (pilot and NPC sheets): pick the stat (for "Mind or Spirit" skills), a modifier,
  a difficulty (or none for opposed rolls), and options such as the once-per-session Rank/Fame bonus or the
  **Knack** (2d6, keep one; the other die is shown on the card). Wound penalties and Life on the Line are added
  automatically. The card shows success/failure and Lead when a difficulty was set, and flags a natural 1 that
  misses by 3+ so you can ask the GM for a critical failure.
- **Aircraft ratings** (Cockpit tab, or the pilot's Aircraft tab): Dogfighting (with a *disengaging* toggle that
  adds Super and the disengage traits, and outnumbering bonuses), Strafing (vs Threat), Electronic Warfare
  (controller support, altitude, drag penalties) and the Stunt Defence roll.
- **Dogfighting is the combat tracker's initiative for aircraft**, and it is rolled again every round: at the start
  of each round the GM's client rolls Dogfighting for every aircraft in the encounter (through the normal Dogfighting
  card, so the breakdown is visible and *Spend Reserve* moves the aircraft up the order), and the tracker's own roll
  buttons do the same. Rolling Dogfighting from the sheet during the fight — with the disengaging or outnumbering
  toggles — also sets that aircraft's place in the order. Rolls made before *Begin Combat* count for round 1.
  Crippled aircraft automatically lose (they drop to the bottom), bombers and couriers never roll (they are strafed
  against their Threat), and ground people keep their 1d6 + Mind + Awareness for the whole fight as the book says.
  The tracker sorts ties by Situational Awareness, as the book does.
- **Dogfight round card**: once every aircraft in the encounter has its roll, the GM's client posts one card for
  the round (and keeps it current as rolls, Reserve spends and defence choices come in): the order with SA and side,
  the outnumbering bonus (worked out from token dispositions — friendly tokens against everyone else — and added to
  the automatic rolls, +1 per extra plane up to +2), who may shoot whom with the Lead for each pair, tie-breaks
  (higher SA shoots; equal SA means neither may) and, for every aircraft that can be shot, **Break / Escape /
  Shoot / Stunt** buttons for its owner. The choice is posted, stored on the combatant for the round and pre-selected
  in every Fire dialog against that aircraft (a Stunt is rolled on the spot and its value carried over). Holds,
  disengage attempts and head-to-heads are still resolved by hand.
- **Damage states on tokens**: Trailing Smoke, Crippled and Going Down (aircraft), Adrift and Destroyed (vessels),
  Down but Not Out and Out of the Fight (people) are status icons the GM's client keeps in step with the damage
  tracks, for linked actors and tokens' own copies alike. Going Down, Destroyed, Out of the Fight and Dead also mark
  the combatant defeated.
- **Kills**: when *Apply* on an attack card takes an aircraft to Going Down, disables a vessel sub-system or
  destroys a vessel, the shooter's linked pilot is credited (air or ground kill) and the card says so; if whoever
  applied the damage cannot edit that pilot, the card offers a *Credit kill* button to the pilot's owner or the GM.
  The pilot sheet shows both tallies with +/− buttons and the distance to the next milestone (Dogfighting or
  Strafing Ace at 10, Elite Ace at 50); reaching one posts a note and a notification.
- **Fire**: target a token first. The dialog pre-fills the target's Break/Escape/Shoot Defence (or a person's
  Defence), its Armour/Resist and, for missiles, its EPM. It rolls the chosen number of attacks (two for LMGs),
  works out Lead, damage (`weapon + Lead`) and the damage that gets through (`− (Armour − AP)`), handles the
  person/vehicle scale rule, and spends ammo. Whoever owns the target gets an **Apply** button on the card.
- **Reserve**: every check card has *Spend Reserve +1* (up to +3 per roll) which re-evaluates the outcome.
- **Manoeuvres** have a *Use* button that posts the stunt or tactic to chat. BVR tactics and altitudes are posted as
  **secret** cards (whispered to the GM and the player) with a *Reveal* button that posts a public copy.
- **Difficulty**: pick one of the named steps or type any number (a vessel's Threat, 5 to bail out).

### Enemy flights (GM)

The aircraft sheet's window menu (and the *Create Enemy Flight* macro, which uses the selected token's aircraft or
offers a picker) creates a flight of copies of an aircraft: pick how many, a name prefix (Red 1, Red 2…), the token
disposition and a **pilot grade** that fills the crew block — *Regular pilot* (SA 0, Piloting 2, Gunnery 2, the rest
1, core p166), *Squadron leader* and *Strafing ace* (the core book's Jamaican Squadron Leader and Mayan Strafing Ace
examples, p162), and two table defaults, *Rookie* (everything 1) and *Ace*. Every number can be changed before
creating, and *Save as default* keeps your version of a grade as a world setting. The copies land in an "Enemy
Flights" folder as linked actors with no pilot link and, if a token is selected, their tokens are dropped in a row
next to it.

### Strafing a vessel

1. Target the vessel's token and roll **Strafing** from the cockpit: the dialog pre-fills its current Threat. If the
   roll fails, the vessel's gunners get `Threat − roll` shots (max 3) on the way in.
2. **Fire** at it. Guns pick a part (main Structure or any sub-system, with that part's Defence and Armour pre-filled);
   ordinance and missiles default to a **random location** (the system rolls the d6 against the vessel's location
   table and uses the part it hits; spend Reserve to shift the roll). *Apply* on the card damages that part, disables
   it when its track fills (1 main damage, Threat drops), and redirects hits on already disabled parts to the main
   Structure.
3. The vessel's sheet has a **Fire** button on every unit that can shoot (gun emplacements, batteries, turrets):
   target the fighter and the dialog offers its Shoot Defence (approach) or Break Defence (retaliatory fire).
4. **Hit location** on the vessel sheet rolls a d6 on its table on its own, for hand-resolved attacks.

Jet Age bombers (B-52, Tu-95) are aircraft actors with a Threat: strafing them pre-fills that Threat the same way.

### Weapon automation

Weapons carry a few more switches (weapon sheet, *Details* tab) that the Fire dialog and the card act on:

- **Special text** is shown in the Fire dialog, so "fired from altitude", SEAD or runway rules are in front of you
  when you shoot.
- **Alternative mode** (a label plus an Accuracy / Lead change) appears as a checkbox: *Laser guided +1* on the
  Ataka, *Dual-mode laser guidance +1* on the Brimstone, *Against vehicles +1* on the JSOW-B, *Against ground
  targets −1* on the ADMM, *Against fighters −2* on the Amos and Phoenix.
- **Extra die to hit** rolls 2d6 and keeps the best (the Meteor); **a natural 1 always misses** (Amos, Phoenix) is
  flagged as an automatic miss whatever the total.
- **Skill: Gunnery or Ordinance (best)** uses whichever rating is higher on the firing aircraft (the Zoisite laser).
- **Cooldown** (rounds to wait after firing: 1 = every other round) is tracked against the active combat. The
  loadout shows *Cooling — ready round N* next to the weapon, the Fire dialog warns, and the card says when it is
  ready again. The EML, ADMM and BML-U wait one round, the Cordium Railgun two.
- **Recharge**: *each round not fired* gives the Pulse Laser one shot back at the end of every combat round it did
  not fire (the GM's client does the bookkeeping); *between scenes* weapons (the tactical lasers) are refilled with
  the **Rearm** button on the Weapons panel, which refills every ammo counter on the aircraft.
- **Grouped targets** (Hypersthene, RBK-500, and every cluster munition under the table's ground-unit rule — a whole
  squadron of vehicles per drop): target several tokens, and one roll is compared with each target's own Defence; the
  card gets one line and one *Apply* button per target.
- **Fragmentary** (core p118: the book's rockets, the HE rocket pod, the KAB airburst bombs, and every cluster
  munition): no −2 when a vehicle weapon shoots at people, and the same one-roll-per-target behaviour for everyone
  you have targeted in the blast.
- **Hits two locations** (heavy and super-heavy bombs, GBU-10/16, the KAB family): against a vessel the dialog asks
  for a second location (random by default, never the same as the first) and the card gets a line per location.
- **Target restrictions** warn in the dialog rather than block: *Performance 0–1 targets only*, *airships and ships
  only* and *cannot target people* compare the weapon with what you have targeted.

### Running a BVR engagement (Jet Age p5–9)

Needs 30+ nm of separation and at least one fighter with radar and BVR missiles (the cockpit shows a radar-dish icon
next to BVR when the airframe qualifies). Give each fighter the three altitude and four tactic manoeuvres from the
**Manoeuvres & Tactics** compendium once (drag them onto the Loadout tab).

1. **Planning.** Each pilot clicks *Use* on an altitude and on a tactic. Those post as secret cards that only the
   player and the GM see.
2. **Electronic Warfare.** Everyone reveals altitude (click *Reveal* on the altitude card). Each pilot presses
   **Electronic Warfare** on the cockpit: the dialog has toggles for controller support (+2), high altitude (−2),
   after a Drag (−2) and the low-altitude carry-over (−2); the card reminds you what each Lead means. Reveal tactic
   cards as the Leads dictate (1–3 the loser reveals, the winner may change; 3–6 also +1 attack and Defence;
   7+ unaware target).
3. **Attacks.** High fires first, then medium, then low (ER missiles count one block higher). Target the enemy and
   **Fire** a missile: pick the Defence that matches the target's tactic — Press → Shoot, Crank → Break,
   Notch → Escape (Break if the missile is IR), Drag → *Dragging (Escape +2)*, unaware target → *Performance*.
   The dialog pre-ticks the target's EPM for missiles and adds your Radar Rating to the roll. Press with ripple fire
   = set *Attacks* to the number of missiles; Press for +1 = type +1 in the modifier.
4. **Resolution.** Run the *BVR: Resolve Tactics* macro (target both tokens first to prefill their names) or call
   `game.warbirds.bvr.prompt()`; it posts head-to-head / dogfight / another BVR round / disengaged from the Jet Age
   table. `game.warbirds.bvr.resolve("press", "crank")` returns the outcome key for your own macros.

Quick BVR (the sidebar rule): skip planning, everyone with BVR missiles fires once vs Escape Defence, then dogfight.

## Look and feel

Dark theme: gunmetal cockpit panels with amber instruments. Light theme: cream technical-manual paper with olive
panels. Both follow Foundry's theme setting per window. Stencil lettering uses a bundled copy of Roboto Condensed
(SIL OFL, see `fonts/roboto-condensed/LICENSE`). Status badges are annunciator lamps (green / amber / red), damage
tracks light up red as they fill, and the current box glows amber.

## Compendiums

The **Warbirds** folder in the Compendium sidebar holds:

- **Jet Age Aircraft** — all 30 fighters and 3 bombers from the sourcebook as aircraft actors with their guns, missiles,
  traits, hard points, fuel and ceilings. Drag one into the world, then drag your pilot onto it.
- **Sample Pilot & NPCs** — Dana "Sparrow" Cole and Mike "Hammer" Kowalski (Rank 1 rookies built with the core
  creation rules) plus the Hitman, Pirate Boarding Party Leader and
  the Goons / Troops / Mercs thug blocks.
- **Airships, Trains & Fortifications** — every vessel stat block from the core book: the six fleet ships and
  carriers, the skiff and freighters, the five train cars, the Pirate Airfield, the Santiago Secret Prison and the
  XS-1200 Fast Courier, with their sub-systems expanded one unit per row, hit locations, gunner attacks and Threat
  thresholds. Build a train by dropping several cars on the scene.
- **Weapons** — core guns and ordinance, every Jet Age gun and missile (with era variants), and personal weapons.
- **Eras** on the aircraft sheet: the book's Azure, Post-War (1946–1958), Vietnam (1959–1975) and Digital
  (1976–1991), plus two table extensions for the setting's later decades — **Precision Era (1992–2004)** and
  **Stealth Era (2005–2022)**. They are labels (and a catalogue column); the Jet Age weapon variants stop at Digital
  because the book gives no later numbers.
- **Warbird Traits** — every core and Jet Age trait with its modifiers already filled in.
- **Manoeuvres & Tactics** — the defending options, basic and advanced stunts, BVR altitudes and tactics.
- **Warbirds Macros** — *Test Fight* (GM) sets up a ready-to-play dogfight: Sparrow in an F-4 Phantom II and
  Hammer in an F-5 Freedom Fighter, linked to their jets, against Red 1–3 (MiG-21s with regular-pilot crews), on a
  new "Test Fight" scene with all five tokens placed and a combat waiting for *Begin Combat*; everything goes in a
  "Warbirds Test Fight" folder, and running it again offers to replace the previous one (also callable as
  `game.warbirds.createTestFight()`). *Create Sample Pilot and Aircraft* imports Sparrow and an F-4 Phantom II and
  links them; *Create Enemy Flight* opens the enemy flight generator; *BVR: Resolve Tactics* opens the BVR
  resolution dialog.

Compendium sources are generated from `packs-src/build.py` in the development folder (not shipped) and compiled
with the Foundry CLI.

### Homebrew compendiums (the `warbirds-homebrew` module)

The **Warbirds (Homebrew)** folder holds the table's own material, ported from its Roll20 handouts and crunch
document. It ships as the companion module, not in the system:

- **Aircraft (Homebrew)** — 42 airframes (Mirages, Gripens, Flankers, Raptors, the ADFX‑01 Morgan, CFA‑44 Nosferatu,
  R‑103 Delphinus, PW‑Mk.I, the Mil Mi‑44 "Drakon", the MQ‑99 drone, the Pave Hawk…) with their guns, traits and
  hard-point breakdowns and an era (real aircraft by service entry, the setting's own designs by when they appear in
  its timeline); the guns and signature systems their handouts name are already fitted, and ordnance for the hard
  points is dragged in from Weapons (Homebrew). Stealth
  airframes carry a switched-off **Clean Configuration** trait for the higher EPM when flying without external
  stores; variant fits (Gripen D missions, the production YF‑23 radar, the J‑16 SEAD fit) are switched-off traits too.
  Paired guns ("Dual DEFA 553", "2x …") are one weapon at +1 damage with no ammo or Armour penalty.
- **Weapons (Homebrew)** — every entry of the crunch document's ordnance tables (and its personal weapons, see Gear
  below): 20 air-to-air missiles, 56 bombs,
  rockets and air-to-ground missiles and 10 guns and gun pods (including the Electromagnetic Launcher, the Pulse Laser
  and the Tactical Laser System), plus the aircraft-specific guns and signature systems (Dual DEFA 553, Mauser BK27,
  GSh‑30‑2, GSh‑23M, the Canberra's cannon pack, door guns, ADMM, BML‑U, the Dual Wielder EML, Cordium Railgun,
  Nanocide casette bomb, and the Morgan's Zoisite TLS and Hypersthene MPBM). Clusters (Ataka, Vikhr, Brimstone) are
  one item per hard point with that many missiles of ammo; cluster munitions (Rockeye, RBK-500, JSOW, Nanocide) are
  fragmentary against people and hit a whole squadron of vehicles with one roll. Rules the system can act on — firing modes, cooldowns,
  recharge, grouped targets, two hit locations, extra dice, target restrictions — are set on the items (see *Weapon
  automation*); the rest (fired from altitude, SEAD standoff, runway busters) is in each weapon's *Special* text,
  shown in the Fire dialog and explained in the *Ordnance Notes* journal entry. The Nanocide bomb uses the *Ignores
  Armour* weapon flag.
- **Gear (Homebrew)** — the crunch document's modern armour: concealable vests, Type IIIA, plate carriers with SAPI /
  ESAPI / XSAPI plates (their *Uses* count the damage absorbed before the plate breaks), the Gusoku, the sneaking
  suit and the helmets. Always-on Resist is in the item's Armour; conditional bonuses (melee only, head shots) are in
  its notes. The crunch's modern personal weapons (revolvers, AP pistols, assault and battle rifles, modern snipers,
  antimateriel and anti-tank rifles, SMGs, machine guns with a *Braced on the bipod* mode, modern grenades and the
  high-tech melee weapons) are in Weapons (Homebrew) with their Value in the description.
- **Traits (Homebrew)** — Thrust Vectoring (+2 stunts) and Post‑Stall Maneuver, Supercruise, the COFFIN Pod, Pulse
  Engine, Clean Configuration, the Catnip and Morganite EW systems, the Zaslon shield, the crunch document's Modern Day
  Modifications (COFFIN, Countermeasure Systems, Jamming Systems, Experimental Stealth Coating, Radar Swap), and
  **Helicopter** / **Helicopter Strafing**. The Helicopter trait switches on the rotary-wing rules in the system: an
  extra d6 on every Strafing roll (keep the best; 3d6 with a Knack), stunts only with Performance 3+, and the
  cockpit's *Bail out* rolling 1d6 + Body + Athletics vs 5.
- **Manoeuvres (Homebrew)** — the Herbst manoeuvre, the Kulbit, Pugachev's Cobra and the helicopter Hover.
- **Rules (Homebrew)** — the *Thrust Vectoring, Supermaneuverability and You* and *Helicopters* handouts, the crunch
  document's *Character & Warbird Creation Notes* (WSO duties, plane-skill points, internal gun swaps) and *Ordnance
  Notes*, plus an auto-generated catalogue table of every homebrew aircraft.

They are generated by `packs-src/homebrew.py` from the handout text (`pdftotext` of the Roll20 PDF exports and the
crunch document, plus hand transcriptions of the screenshots), so a corrected handout can be re-imported by
re-running the script. Renamed aircraft keep their compendium IDs, so links to them survive the rename.

## Layout

```
warbirds/
  system.json                 manifest (v14, documentTypes, token attributes)
  lang/en.json                all UI strings
  css/                        theme tokens (variables layer) and sheet styles
  module/warbirds.mjs         init: documents, data models, sheets, settings
  module/config.mjs           skill lists, choices, trait modifier keys
  module/utils.mjs            penalty track builder and helpers
  module/data/actor/          pilot, aircraft, npc, vessel TypeDataModels
  module/data/item/           weapon, trait, maneuver, sponsorship, gear
  module/documents/           Actor, Item, Combatant subclasses
  module/applications/sheets/ ApplicationV2 sheets
  templates/                  Handlebars templates
  packs/                      compendium packs (LevelDB)
  fonts/                      Roboto Condensed (OFL) for the stencil lettering
```
