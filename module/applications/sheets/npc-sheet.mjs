import WarbirdsActorSheet from "./base-actor-sheet.mjs";
import { systemPath, WARBIRDS } from "../../config.mjs";

/**
 * The ground NPC sheet: a compact stat block for thugs and threats.
 */
export default class NpcSheet extends WarbirdsActorSheet {

  /** @inheritDoc */
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 720, height: 700 },
    window: { icon: "fa-solid fa-user-ninja" }
  };

  static ACCEPTED_ITEM_TYPES = ["weapon", "gear"];

  /** @inheritDoc */
  static TABS = {
    primary: {
      tabs: [
        { id: "main", icon: "fa-solid fa-id-card" },
        { id: "notes", icon: "fa-solid fa-book" }
      ],
      initial: "main",
      labelPrefix: "WARBIRDS.Tabs"
    }
  };

  /** @inheritDoc */
  static PARTS = {
    header: { template: systemPath("templates/actor/npc/header.hbs") },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    main: {
      template: systemPath("templates/actor/npc/main.hbs"),
      templates: [systemPath("templates/shared/track.hbs"), systemPath("templates/shared/item-row.hbs")],
      scrollable: [""]
    },
    notes: { template: systemPath("templates/actor/npc/notes.hbs"), scrollable: [""] }
  };

  /** @inheritDoc */
  async _preparePartContext(partId, context, options) {
    await super._preparePartContext(partId, context, options);
    const system = this.actor.system;
    switch ( partId ) {
      case "main":
        context.isThug = system.isThug;
        context.skills = this._prepareSkills(system.skills).filter(s => s.level > 0 || !system.isThug);
        context.track = this._prepareTrack(system.health.track, system.wounds, "wounds");
        context.weapons = this._prepareItems("weapon");
        context.gear = this._prepareItems("gear");
        context.stats = Object.entries(WARBIRDS.stats).map(([key, label]) => ({
          key, label: game.i18n.localize(label), value: system.stats[key], source: system._source.stats[key]
        }));
        break;
      case "notes": {
        const enrich = async html => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
          secrets: this.actor.isOwner, relativeTo: this.actor, rollData: this.actor.getRollData()
        });
        context.enriched = { description: await enrich(system.description), notes: await enrich(system.notes) };
        break;
      }
    }
    return context;
  }
}
