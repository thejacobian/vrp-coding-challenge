import Destination from './Destination.js'

export default class Load {
    constructor(loadId, pickupDest, dropoffDest) {
        this.loadId = loadId;
        this.pickupDest = pickupDest;
        this.dropoffDest = dropoffDest;
        this.minsPickupToDropoff = this.pickupDest.minsToNewDest(this.dropoffDest);
        this.minsDepotToPickup = new Destination(0,0).minsToNewDest(this.pickupDest);
        this.minsDropoffToDepot = this.dropoffDest.minsToNewDest(new Destination(0,0));
    }
}
