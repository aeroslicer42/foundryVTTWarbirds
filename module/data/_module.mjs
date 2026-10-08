import PilotModel from "./actor/pilot.mjs";
import AircraftModel from "./actor/aircraft.mjs";
import NpcModel from "./actor/npc.mjs";
import VesselModel from "./actor/vessel.mjs";
import WeaponModel from "./item/weapon.mjs";
import TraitModel from "./item/trait.mjs";
import ManeuverModel from "./item/maneuver.mjs";
import SponsorshipModel from "./item/sponsorship.mjs";
import GearModel from "./item/gear.mjs";

export const actor = {
  pilot: PilotModel,
  aircraft: AircraftModel,
  npc: NpcModel,
  vessel: VesselModel
};

export const item = {
  weapon: WeaponModel,
  trait: TraitModel,
  maneuver: ManeuverModel,
  sponsorship: SponsorshipModel,
  gear: GearModel
};

export { PilotModel, AircraftModel, NpcModel, VesselModel, WeaponModel, TraitModel, ManeuverModel, SponsorshipModel, GearModel };
