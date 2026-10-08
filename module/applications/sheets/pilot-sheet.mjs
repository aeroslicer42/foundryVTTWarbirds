import WarbirdsActorSheet from "./base-actor-sheet.mjs";
import { systemPath, WARBIRDS } from "../../config.mjs";
import { recordToArray, signed } from "../../utils.mjs";
import * as rolls from "../../dice/rolls.mjs";

/**
 * The player character sheet.
 */
export default class PilotSheet extends WarbirdsActorSheet {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["pilot"],
    position: { width: 780, height: 800 },
    window: { icon: "fa-solid fa-user-pilot" },
    actions: {
      linkAircraft: PilotSheet.#onLinkAircraft,
      rollAircraftRating: PilotSheet.#onRollAircraftRating,
      fireAircraftWeapon: PilotSheet.#onFireAircraftWeapon
    }
  };

  /** @inheritDoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "stats", icon: "fa-solid fa-id-card" },
        { id: "aircraft", icon: "fa-solid fa-jet-fighter" },
        { id: "standing", icon: "fa-solid fa-star" },
        { id: "gear", icon: "fa-solid fa-suitcase" },
        { id: "notes", icon: "fa-solid fa-book" }
      ],
      initial: "stats",
      labelPrefix: "WARBIRDS.Tabs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: systemPath("templates/actor/pilot/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    stats: {
      template: systemPath("templates/actor/pilot/stats.hbs"),
      templates: [systemPath("templates/shared/track.hbs"), systemPath("templates/shared/item-row.hbs")],
      scrollable: [""]
    },
    aircraft: {
      template: systemPath("templates/actor/pilot/aircraft.hbs"),
      templates: [systemPath("templates/shared/track.hbs")],
      scrollable: [""]
    },
    standing: { template: systemPath("templates/actor/pilot/standing.hbs"), scrollable: [""] },
    gear: {
      template: systemPath("templates/actor/pilot/gear.hbs"),
      templates: [systemPath("templates/shared/item-row.hbs")],
      scrollable: [""]
    },
    notes: { template: systemPath("templates/actor/pilot/notes.hbs"), scrollable: [""] }
  };

  /* -------------------------------------------- */

  /** @inheritDoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if ( this.actor.limited ) {
      const { header, tabs, notes } = parts;
      return { header, tabs, notes };
    }
    return parts;
  }

  /** @inheritDoc */
  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if ( group === "primary" ) {
      // The standing tab is "Rank & Contracts" or "Fame & Contracts" depending on the world setting.
      if ( tabs.standing ) tabs.standing.label = `WARBIRDS.Tabs.standing_${this.actor.system.standingMode}`;
      if ( this.actor.limited ) for ( const id of ["stats", "aircraft", "standing", "gear"] ) delete tabs[id];
    }
    return tabs;
  }

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    const system = this.actor.system;
    const enrich = async html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
      secrets: this.actor.isOwner, relativeTo: this.actor, rollData: this.actor.getRollData()
    });

    switch ( partId ) {
      case "header":
        context.standingLabel = game.i18n.localize(WARBIRDS.standingModes[system.standingMode]);
        break;

      case "stats":
        context.skills = this._prepareSkills(system.skills);
        // Two columns of skills, filled top to bottom.
        context.skillColumns = [context.skills.slice(0, Math.ceil(context.skills.length / 2)), context.skills.slice(Math.ceil(context.skills.length / 2))];
        context.flightSkills = Object.entries(system.flightSkills).map(([key, skill]) => ({
          key,
          label: game.i18n.localize(WARBIRDS.flightSkills[key]),
          ...skill,
          total: system.sa + skill.level + system.penalty
        }));
        context.track = this._prepareTrack(system.health.track, system.wounds, "wounds");
        context.killTally = [
          { key: "air", label: game.i18n.localize("WARBIRDS.Pilot.killsAir"), value: system._source.kills.air, ace: system.ace.dogfighting, milestone: "WARBIRDS.Pilot.dogfightingAce", next: system.ace.next.air },
          { key: "ground", label: game.i18n.localize("WARBIRDS.Pilot.killsGround"), value: system._source.kills.ground, ace: system.ace.strafing, milestone: "WARBIRDS.Pilot.strafingAce", next: system.ace.next.ground }
        ].map(k => ({
          ...k,
          progress: k.next
            ? game.i18n.format("WARBIRDS.Pilot.aceProgress", { remaining: k.next.remaining, milestone: game.i18n.localize(k.next.elite ? "WARBIRDS.Pilot.eliteAce" : k.milestone) })
            : game.i18n.localize("WARBIRDS.Pilot.eliteAce")
        }));
        context.weapons = this._prepareItems("weapon").filter(w => w.system.category === "personal");
        context.advantages = recordToArray(system.advantages, (a, b) => a.name.localeCompare(b.name)).map(a => ({
          ...a,
          kindLabel: game.i18n.localize(WARBIRDS.advantageKinds[a.kind]),
          levelLabel: game.i18n.localize(WARBIRDS.advantageLevels[a.level])
        }));
        context.stats = Object.entries(WARBIRDS.stats).map(([key, label]) => ({
          key, label: game.i18n.localize(label), value: system.stats[key], source: system._source.stats[key]
        }));
        break;

      case "aircraft":
        context.aircraft = this.#prepareAircraft();
        break;

      case "standing":
        context.standingMode = system.standingMode;
        context.standingLabel = game.i18n.localize(WARBIRDS.standingModes[system.standingMode]);
        context.sponsors = this._prepareItems("sponsorship").filter(s => s.system.kind === "sponsor");
        context.contracts = this._prepareItems("sponsorship").filter(s => s.system.kind === "contract");
        context.activeFP = this.actor.itemTypes.sponsorship.filter(s => s.system.isActive).reduce((n, s) => n + s.system.fp, 0);
        context.standingSkills = WARBIRDS.standingSkills.map(k => game.i18n.localize(WARBIRDS.skills[k].label)).join(", ");
        break;

      case "gear":
        context.gear = this._prepareItems("gear");
        context.weapons = this._prepareItems("weapon");
        context.maneuvers = this._prepareItems("maneuver");
        break;

      case "notes":
        context.enriched = {
          background: await enrich(system.background),
          contacts: await enrich(system.contacts),
          biography: await enrich(system.biography),
          notes: await enrich(system.notes)
        };
        break;
    }
    return context;
  }

  /**
   * Context for the Aircraft tab: the linked aircraft's stats and ratings as flown by this pilot.
   * @returns {object|null}
   */
  #prepareAircraft() {
    const aircraft = this.actor.system.aircraftActor;
    if ( !aircraft ) return null;
    const sys = aircraft.system;
    const r = sys.ratings;
    const t = sys.totals;
    return {
      actor: aircraft,
      uuid: aircraft.uuid,
      name: aircraft.name,
      img: aircraft.img,
      model: sys.model,
      status: game.i18n.localize(WARBIRDS.aircraftStatus[t.status]),
      flownByThisPilot: sys.pilot === this.actor.uuid,
      stats: [
        { label: "WARBIRDS.Aircraft.performance", value: t.performance },
        { label: "WARBIRDS.Aircraft.armour", value: t.armour },
        { label: "WARBIRDS.Aircraft.structure", value: `${t.structureValue}/${t.structureMax}` },
        { label: "WARBIRDS.Aircraft.radar", value: t.hasRadar ? signed(t.radar) : "—" },
        { label: "WARBIRDS.Aircraft.epm", value: t.epm },
        { label: "WARBIRDS.Aircraft.super", value: t.super }
      ],
      ratings: [
        { key: "dogfighting", label: "WARBIRDS.Ratings.dogfighting", value: signed(r.dogfighting), rollable: true },
        { key: "strafing", label: "WARBIRDS.Ratings.strafing", value: signed(r.strafing), rollable: true },
        { key: "gunnery", label: "WARBIRDS.Ratings.gunnery", value: signed(r.gunnery), rollable: false },
        { key: "ordinance", label: "WARBIRDS.Ratings.ordinance", value: signed(r.ordinance), rollable: false },
        { key: "ew", label: "WARBIRDS.Ratings.ew", value: signed(r.ew), rollable: true }
      ],
      defences: [
        { key: "break", label: "WARBIRDS.Defence.break", value: r.breakDefence },
        { key: "escape", label: "WARBIRDS.Defence.escape", value: r.escapeDefence },
        { key: "shoot", label: "WARBIRDS.Defence.shoot", value: r.shootDefence },
        { key: "stunt", label: "WARBIRDS.Defence.stunt", value: `1d6 ${signed(r.stuntDefence)}` }
      ],
      track: this._prepareTrack(t.penalties, sys.damage, "damage"),
      weapons: aircraft.itemTypes.weapon.filter(w => w.system.mounted).map(w => ({ id: w.id, name: w.name, img: w.img, summary: w.system.summary })),
      traits: aircraft.itemTypes.trait.filter(t => t.system.active).map(t => ({ id: t.id, name: t.name, img: t.img, summary: t.system.summary }))
    };
  }

  /* -------------------------------------------- */

  /**
   * Dropping an aircraft actor on the pilot sheet assigns it (and links the pilot back).
   * @inheritDoc
   */
  async _onDropActor(event, actor) {
    if ( !this.actor.isOwner ) return null;
    if ( actor.type !== "aircraft" ) {
      ui.notifications.warn("WARBIRDS.Notifications.dropAircraftOnly", { localize: true });
      return null;
    }
    await this.#link(actor);
    return actor;
  }

  /**
   * Link an aircraft to this pilot in both directions.
   * @param {Actor} aircraft
   */
  async #link(aircraft) {
    await this.actor.update({ "system.aircraft": aircraft.uuid });
    if ( aircraft.isOwner && (aircraft.system.pilot !== this.actor.uuid) ) {
      await aircraft.update({ "system.pilot": this.actor.uuid });
    }
  }

  /**
   * Pick an aircraft from the world's actors.
   * @this {PilotSheet}
   */
  static async #onLinkAircraft(event, target) {
    const choices = game.actors.filter(a => a.type === "aircraft" && a.isOwner);
    if ( !choices.length ) return ui.notifications.info("WARBIRDS.Notifications.noAircraft", { localize: true });
    const options = choices.map(a => `<option value="${a.uuid}">${foundry.utils.escapeHTML(a.name)}${a.system.model ? ` (${foundry.utils.escapeHTML(a.system.model)})` : ""}</option>`).join("");
    const uuid = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("WARBIRDS.Dialog.linkAircraftTitle") },
      content: `<div class="form-group"><label>${game.i18n.localize("TYPES.Actor.aircraft")}</label><div class="form-fields"><select name="uuid">${options}</select></div></div>`,
      ok: { label: "WARBIRDS.Dialog.link", callback: (event, button) => button.form.elements.uuid.value },
      rejectClose: false
    });
    if ( !uuid ) return;
    const aircraft = await fromUuid(uuid);
    if ( aircraft ) await this.#link(aircraft);
  }

  /**
   * Roll one of the linked aircraft's ratings from the pilot sheet.
   * @this {PilotSheet}
   */
  static #onRollAircraftRating(event, target) {
    const aircraft = this.actor.system.aircraftActor;
    if ( !aircraft ) return;
    return rolls.rollRating(aircraft, target.dataset.rating);
  }

  /**
   * Fire one of the linked aircraft's weapons from the pilot sheet.
   * @this {PilotSheet}
   */
  static #onFireAircraftWeapon(event, target) {
    const aircraft = this.actor.system.aircraftActor;
    const item = aircraft?.items.get(target.dataset.itemId);
    if ( item ) return rolls.fireWeapon(aircraft, item);
  }
}
