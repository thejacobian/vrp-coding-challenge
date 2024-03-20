export default class Destination {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
  
    // Euclidean distance serving as mins per requirements
    minsToNewDest(destination) {
        const dx = this.x - destination.x;
        const dy = this.y - destination.y;
        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }
}
