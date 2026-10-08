import { systemPath, WARBIRDS } from "../config.mjs";
import { signed } from "../utils.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/**
 * The current message visibility mode, with "In Character" treated as public for rolls (as dnd5e does).
 * @returns {string}
 */
export function messageMode() {
  let mode = "public";
  try {
    mode = game.settings.get("core", "messageMode");
  } catch(err) {
    mode = "public";
  }
  return mode === "ic" ? "public" : mode;
}

/**
 * Wrap rendered HTML in a div so DialogV2 uses it as-is (string content is sanitised, which can drop attributes).
 * @param {string} html
 * @returns {HTMLDivElement|string}
 */
function toElement(html) {
  if ( typeof document === "undefined" ) return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

/**
 * Difficulty choices for the roll dialog.
 * @returns {{value: string, label: string}[]}
 */
function difficultyOptions(selected) {
  const custom = customDifficulty(selected);
  const options = [{ value: "", label: game.i18n.localize("WARBIRDS.Roll.noDifficulty"), selected: (custom === null) && (selected === null || selected === "") }];
  for ( const [value, key] of Object.entries(WARBIRDS.difficulties) ) {
    options.push({ value, label: `${value} – ${game.i18n.localize(key)}`, selected: String(selected) === value });
  }
  options.push({ value: "custom", label: game.i18n.localize("WARBIRDS.Roll.customDifficulty"), selected: custom !== null });
  return options;
}

/**
 * A pre-selected difficulty that is not one of the named steps (a vessel's Threat of 9, bailing out vs 5...) goes in the
 * free number field instead of the select.
 * @param {number|null} selected
 * @returns {number|null}
 */
function customDifficulty(selected) {
  if ( (selected === null) || (selected === undefined) || (selected === "") ) return null;
  return (String(selected) in WARBIRDS.difficulties) ? null : Number(selected);
}

/**
 * Ask for the situational details of a check: modifier, difficulty, optional stat choice and toggles.
 *
 * @param {object} config
 * @param {string} config.title                 Dialog title.
 * @param {{label: string, value: number}[]} config.parts   The fixed parts of the bonus (for display).
 * @param {number|null} [config.difficulty]      Pre-selected difficulty (null = none / opposed).
 * @param {boolean} [config.allowDifficulty=true]
 * @param {string} [config.difficultyLabel]      Label for the difficulty field (e.g. "Threat").
 * @param {{key: string, label: string, value: number, checked: boolean}[]} [config.toggles]   Optional bonuses.
 * @param {{current: string, choices: Record<string, string>, values: Record<string, number>}} [config.stat]   Stat picker.
 * @param {boolean} [config.knack]               Whether the Knack checkbox starts checked.
 * @param {boolean} [config.showKnack]
 * @returns {Promise<object|null>}               The form values, or null when cancelled.
 */
export async function promptCheck(config) {
  const context = {
    parts: config.parts.map(p => ({ ...p, display: signed(p.value) })),
    base: signed(config.parts.reduce((n, p) => n + p.value, 0)),
    allowDifficulty: config.allowDifficulty ?? true,
    difficultyLabel: config.difficultyLabel ?? game.i18n.localize("WARBIRDS.Roll.difficulty"),
    difficulties: difficultyOptions(config.difficulty ?? null),
    customDifficulty: customDifficulty(config.difficulty ?? null),
    toggles: config.toggles ?? [],
    stat: config.stat ? {
      current: config.stat.current,
      options: Object.entries(config.stat.choices).map(([value, label]) => ({
        value, label: `${game.i18n.localize(label)} (${signed(config.stat.values[value] ?? 0)})`, selected: value === config.stat.current
      }))
    } : null,
    showKnack: config.showKnack ?? false,
    knack: config.knack ?? false
  };
  const content = toElement(await renderTemplate(systemPath("templates/dialog/check.hbs"), context));
  const result = await DialogV2.prompt({
    window: { title: config.title, icon: "fa-solid fa-dice-d6" },
    classes: ["warbirds", "wb-dialog"],
    position: { width: 400 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      const select = dialog.element.querySelector("[name=difficulty]");
      const custom = dialog.element.querySelector("[name=difficultyCustom]");
      if ( !select || !custom ) return;
      custom.addEventListener("input", () => { if ( custom.value !== "" ) select.value = "custom"; });
      select.addEventListener("change", () => { if ( select.value !== "custom" ) custom.value = ""; });
    },
    ok: {
      label: "WARBIRDS.Roll.roll",
      icon: "fa-solid fa-dice-d6",
      callback: (event, button) => {
        const fd = new foundry.applications.ux.FormDataExtended(button.form);
        return fd.object;
      }
    }
  });
  if ( !result ) return null;
  return {
    modifier: Number(result.modifier) || 0,
    difficulty: parseDifficulty(result),
    stat: result.stat ?? null,
    knack: !!result.knack,
    toggles: Object.fromEntries((config.toggles ?? []).map(t => [t.key, !!result[`toggle-${t.key}`]]))
  };
}

/**
 * The difficulty from a check dialog: a typed number wins over the select.
 * @param {object} result
 * @returns {number|null}
 */
function parseDifficulty(result) {
  const custom = result.difficultyCustom;
  const hasCustom = (custom !== "") && (custom !== undefined) && (custom !== null) && Number.isFinite(Number(custom));
  if ( result.difficulty === "custom" ) return hasCustom ? Number(custom) : null;
  if ( hasCustom ) return Number(custom);
  return (result.difficulty === "" || result.difficulty === undefined || result.difficulty === null) ? null : Number(result.difficulty);
}

/**
 * Ask for the details of an attack: number of attacks, modifier, the target's Defence and armour.
 *
 * @param {object} config
 * @param {string} config.title
 * @param {{label: string, value: number}[]} config.parts
 * @param {object} config.weapon                 {name, damage, ap, attacksPerRound, ammo: {value, max, tracked}, isMissile, ignoresEPM,
 *                                               special, altMode: {label, accuracy, damage}|null, twoLocations, extraDie, missOnOne}
 * @param {object|null} config.target            {name, img, kind: "aircraft"|"creature"|"other", defences: {key: value}, epm, armour, resist}
 * @param {object[]|null} [config.targets]       Every target, when the weapon rolls once against each of them.
 * @param {string[]} [config.warnings]           Rules reminders shown above the target block.
 * @param {boolean} [config.aerial]              Aircraft weapon (defence choices are Break/Escape/Shoot) vs ground attack.
 * @returns {Promise<object|null>}
 */
export async function promptAttack(config) {
  const target = config.target;
  const defenceChoices = [];
  if ( target?.kind === "aircraft" ) {
    for ( const [key, label] of Object.entries(WARBIRDS.aircraftDefences) ) {
      if ( key === "stunt" ) continue;
      defenceChoices.push({ value: key, label: `${game.i18n.localize(label)} (${target.defences[key]})`, number: target.defences[key] });
    }
    defenceChoices.push({ value: "stunt", label: game.i18n.localize("WARBIRDS.Roll.stuntDefenceChoice"), number: "" });
    // BVR: a dragging fighter uses Escape +2; an unaware target (EW Lead 7+) or an ambushed one defends with Performance alone.
    defenceChoices.push({ value: "drag", label: `${game.i18n.localize("WARBIRDS.Roll.dragDefence")} (${target.defences.escape + 2})`, number: target.defences.escape + 2 });
    defenceChoices.push({ value: "performance", label: `${game.i18n.localize("WARBIRDS.Roll.ambushDefence")} (${target.defences.performance})`, number: target.defences.performance });
  }
  else if ( target?.kind === "creature" ) {
    defenceChoices.push({ value: "defence", label: `${game.i18n.localize("WARBIRDS.Secondary.defence")} (${target.defences.defence})`, number: target.defences.defence });
    defenceChoices.push({ value: "allout", label: `${game.i18n.localize("WARBIRDS.Roll.allOutDefence")} (${target.defences.defence + 2})`, number: target.defences.defence + 2 });
  }
  else if ( target?.kind === "vessel" ) {
    // Guns pick a part; ordinance hits a random location. Main Structure first, then each intact sub-system.
    if ( config.weapon.isOrdinance ) defenceChoices.push({ value: "random", label: game.i18n.localize("WARBIRDS.Roll.randomLocation"), number: "", armour: "" });
    defenceChoices.push({ value: "main", label: `${game.i18n.localize("WARBIRDS.Vessel.mainStructure")} (${target.defences.main} / ${game.i18n.localize("WARBIRDS.Aircraft.armour")} ${target.armour})`, number: target.defences.main, armour: target.armour });
    for ( const part of target.parts ) {
      defenceChoices.push({
        value: part.id,
        label: `${part.name}${part.disabled ? ` – ${game.i18n.localize("WARBIRDS.Vessel.disabled")}` : ""} (${part.defence} / ${game.i18n.localize("WARBIRDS.Aircraft.armour")} ${part.armour})`,
        number: part.defence, armour: part.armour
      });
    }
    if ( !config.weapon.isOrdinance ) defenceChoices.push({ value: "random", label: game.i18n.localize("WARBIRDS.Roll.randomLocation"), number: "", armour: "" });
  }
  defenceChoices.push({ value: "custom", label: game.i18n.localize("WARBIRDS.Roll.customDefence"), number: "" });
  // The defence the target chose on this round's dogfight card is pre-selected (a Stunt brings its rolled value).
  const chosen = target?.chosenDefence;
  if ( chosen ) {
    const option = defenceChoices.find(c => c.value === chosen.type);
    if ( option ) {
      option.selected = true;
      if ( (chosen.type === "stunt") && (chosen.value !== null) && (chosen.value !== undefined) ) option.number = chosen.value;
    }
  }
  // Heavy bombs pick a second hit location on a vessel (random unless chosen).
  const secondLocation = (target?.kind === "vessel") && config.weapon.twoLocations
    ? defenceChoices.filter(c => c.value !== "custom").map(c => ({ ...c, selected: c.value === "random" }))
    : null;
  const altMode = config.weapon.altMode?.label ? {
    label: config.weapon.altMode.label,
    detail: [config.weapon.altMode.accuracy ? `${game.i18n.localize("WARBIRDS.Weapon.acc")} ${signed(config.weapon.altMode.accuracy)}` : "",
      config.weapon.altMode.damage ? `${game.i18n.localize("WARBIRDS.Weapon.lead")} ${signed(config.weapon.altMode.damage)}` : ""].filter(Boolean).join(", ")
  } : null;

  const context = {
    parts: config.parts.map(p => ({ ...p, display: signed(p.value) })),
    base: signed(config.parts.reduce((n, p) => n + p.value, 0)),
    weapon: config.weapon,
    attacksMax: Math.max(1, config.weapon.attacksPerRound ?? 1),
    attackOptions: Array.from({ length: Math.max(1, config.weapon.attacksPerRound ?? 1) }, (_, i) => i + 1).map(n => ({ value: n, selected: n === (config.weapon.attacksPerRound ?? 1) })),
    target,
    defenceChoices,
    defaultDefence: (defenceChoices.find(c => c.selected) ?? defenceChoices[0])?.number ?? "",
    chosenDefence: chosen ? game.i18n.format("WARBIRDS.Roll.chosenDefence", { defence: game.i18n.localize(WARBIRDS.aircraftDefences[chosen.type] ?? chosen.type) }) : "",
    showEPM: !!config.aerial && (target?.kind === "aircraft"),
    epmChecked: !!config.weapon.isMissile && !config.weapon.ignoresEPM && !!target?.epm,
    armourLabel: game.i18n.localize(target?.kind === "creature" ? "WARBIRDS.Secondary.resist" : "WARBIRDS.Aircraft.armour"),
    armourValue: target ? (target.kind === "creature" ? target.resist : (defenceChoices[0]?.armour ?? target.armour)) : "",
    isVessel: target?.kind === "vessel",
    aerial: !!config.aerial,
    special: config.weapon.special ?? "",
    warnings: config.warnings ?? [],
    altMode,
    targets: config.targets?.length > 1 ? config.targets : null,
    secondLocation,
    extraDie: !!config.weapon.extraDie,
    missOnOne: !!config.weapon.missOnOne,
    fragmentary: !!config.weapon.fragmentary,
    scales: [
      { value: "none", label: game.i18n.localize("WARBIRDS.Roll.scaleNone"), selected: true },
      { value: "down", label: game.i18n.localize("WARBIRDS.Roll.scaleDown") },
      { value: "up", label: game.i18n.localize("WARBIRDS.Roll.scaleUp") }
    ]
  };
  const content = toElement(await renderTemplate(systemPath("templates/dialog/attack.hbs"), context));
  const result = await DialogV2.prompt({
    window: { title: config.title, icon: "fa-solid fa-crosshairs" },
    classes: ["warbirds", "wb-dialog"],
    position: { width: 440 },
    content,
    rejectClose: false,
    render: (event, dialog) => {
      // Changing the Defence type fills in its number.
      const select = dialog.element.querySelector("[name=defenceType]");
      const input = dialog.element.querySelector("[name=defence]");
      const armourInput = dialog.element.querySelector("[name=armour]");
      select?.addEventListener("change", () => {
        const option = select.selectedOptions[0];
        const n = option?.dataset.number;
        if ( n !== undefined && n !== "" ) input.value = n;
        const a = option?.dataset.armour;
        if ( armourInput && a !== undefined && a !== "" ) armourInput.value = a;
        if ( option?.value === "stunt" ) input.placeholder = game.i18n.localize("WARBIRDS.Roll.stuntPlaceholder");
        if ( option?.value === "random" ) { input.value = ""; input.placeholder = "d6"; if ( armourInput ) armourInput.value = ""; }
      });
    },
    ok: {
      label: "WARBIRDS.Roll.fire",
      icon: "fa-solid fa-crosshairs",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if ( !result ) return null;
  return {
    attacks: Math.max(1, Number(result.attacks) || 1),
    modifier: Number(result.modifier) || 0,
    defenceType: result.defenceType ?? "custom",
    defence: (result.defence === "" || result.defence === undefined || result.defence === null) ? null : Number(result.defence),
    applyEPM: !!result.applyEPM,
    armour: (result.armour === "" || result.armour === undefined || result.armour === null) ? null : Number(result.armour),
    consumeAmmo: !!result.consumeAmmo,
    scale: result.scale ?? "none",
    altMode: !!result.altMode,
    defenceType2: result.defenceType2 ?? null
  };
}

/**
 * Ask which BVR tactic each of two fighters chose, to resolve the planning phase.
 *
 * @param {object} [config]
 * @param {string[]} [config.names]       Names for the two fighters (defaults to the targeted tokens, then "Fighter 1/2").
 * @param {string|null} [config.first]    Pre-selected tactic for fighter 1.
 * @param {string|null} [config.second]   Pre-selected tactic for fighter 2.
 * @returns {Promise<{names: string[], first: string, second: string}|null>}
 */
export async function promptBvr(config={}) {
  const targeted = Array.from(game.user?.targets ?? []).map(t => t.name);
  const names = config.names ?? [
    targeted[0] ?? game.i18n.format("WARBIRDS.Bvr.fighter", { n: 1 }),
    targeted[1] ?? game.i18n.format("WARBIRDS.Bvr.fighter", { n: 2 })
  ];
  const options = selected => Object.entries(WARBIRDS.bvrTactics).map(([value, label]) => ({
    value, label: game.i18n.localize(label), selected: value === selected
  }));
  const context = {
    fighters: [
      { index: 1, name: names[0], options: options(config.first ?? "press") },
      { index: 2, name: names[1], options: options(config.second ?? "press") }
    ]
  };
  const content = toElement(await renderTemplate(systemPath("templates/dialog/bvr.hbs"), context));
  const result = await DialogV2.prompt({
    window: { title: game.i18n.localize("WARBIRDS.Bvr.resolveTitle"), icon: "fa-solid fa-satellite-dish" },
    classes: ["warbirds", "wb-dialog"],
    position: { width: 420 },
    content,
    rejectClose: false,
    ok: {
      label: "WARBIRDS.Bvr.resolve",
      icon: "fa-solid fa-satellite-dish",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if ( !result ) return null;
  return {
    names: [result.name1 || names[0], result.name2 || names[1]],
    first: result.tactic1,
    second: result.tactic2
  };
}
