/**
 * Combatants: people roll 1d6 + Mind + Awareness, aircraft roll their Dogfighting rating,
 * thugs have a fixed Initiative number and do not roll at all.
 */
export default class WarbirdsCombatant extends Combatant {

  /** @inheritDoc */
  _getInitiativeFormula() {
    const actor = this.actor;
    if ( actor?.type === "npc" && actor.system.isThug ) return "@initiative";
    return super._getInitiativeFormula();
  }
}
