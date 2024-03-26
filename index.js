import * as fs from 'fs';
import Destination from './Destination.js'
import Load from './Load.js'
// import ortools from 'node_or_tools';
// import { inspect } from 'util';

// Read in the filename from the command line.
if (process.argv.length < 3) {
    console.log('Usage: node ' + process.argv[1] + ' FILENAME');
    process.exit(1);
}
const filename = process.argv[2];

// Then load in the data by reading the file.
const inputLoadData = fs.readFileSync(`./${filename}`).toString('utf8').split('\n');
const MAX_MINS = 12 * 60 // 12 hours * 60 mins

// The below code only solves for single Pickup node VRP problem, I could not determine a solution for VRP with pickups and dropoffs

// populate the loads map from the file read in...
let loads = {};
for (let i = 1; i < inputLoadData.length; i++) {
    if (inputLoadData[i] === '') {
        break;
    }
    const splitLineOnSpace = inputLoadData[i].split(' ');
    const loadIdStr = splitLineOnSpace[0];
    const pickupDestStr = splitLineOnSpace[1].slice(1, splitLineOnSpace[1].length - 1);
    const dropoffDestStr = splitLineOnSpace[2].slice(1, splitLineOnSpace[2].length - 1);
    const pickupDestSplitOnComma =  pickupDestStr.split(',')
    const dropoffDestSplitOnComma =  dropoffDestStr.split(',')
        
    const pickupX = Math.round(pickupDestSplitOnComma[0]);
    const pickupY = Math.round(pickupDestSplitOnComma[1]);
    const dropoffX = Math.round(dropoffDestSplitOnComma[0]);
    const dropoffY = Math.round(dropoffDestSplitOnComma[1]);

    const pickupDest = new Destination(pickupX, pickupY);
    const dropoffDest = new Destination(dropoffX, dropoffY);
    loads[loadIdStr] = new Load(loadIdStr, pickupDest, dropoffDest);
}

// Used later to break out of mergeRoutes loop once we have looked at all loadIds.
const loadsIdKeysArr = Object.keys(loads);

// Function to calculate savings VRP solution via Clarke & Wright method (since research reveals its popular and its pretty accurate)
// Reference Berkely lecture: https://aswani.ieor.berkeley.edu/teaching/FA15/151/lecture_notes/ieor151_lec18.pdf
function calculateSavingsFirstPickupToNextPickup(loads) {
    const savingsMap = {};
    const loadsVals = Object.values(loads);
    for (let j = 0; j < loadsVals.length; j++) {
        for (let k = j + 1; k < loadsVals.length; k++) {
            // TODO: decided to just focus on simpler VRP of pickup optimization only
            savingsMap[loadsVals[j].loadId + '-' + loadsVals[k].loadId] = loadsVals[j].minsDepotToPickup + loadsVals[k].minsDepotToPickup - loadsVals[j].pickupDest.minsToNewDest(loadsVals[k].pickupDest);
            // TODO: this is an attempt to incorporate dropoff point too but is definitely wip, likely does not work
            // savingsMap[loadsVals[j].loadId + '-dropoff'] = loadsVals[j].minsDepotToPickup + loadsVals[j].minsDropoffToDepot - loadsVals[j].pickupDest.minsToNewDest(loadsVals[j].Dest);
        }
    }
    // convert to array and sort the savingsMap descending
    const sortedSavings = Object.entries(savingsMap).sort(([,a],[,b]) => b - a);
    // console.table(sortedSavings);
    return sortedSavings;
}

// utility function to top level compare arrays for equality
function arrayIsEqualByString(a, b) {
    return a.join() == b.join();
}

// Calculate the Savings array
const savingsSortedArr = calculateSavingsFirstPickupToNextPickup(loads);

// Function to handle merging of routes (once sorted in descending order) to determine number of optimal drivers
function mergeRoutes(savingsSortedArr) {
    const mergedRoutes = {};
    for (let savings of savingsSortedArr) {
        const workingMergedLoadStr = savings[0];
        const loadsStrSplitOnDash = workingMergedLoadStr.split('-');
        const firstLoadId = loadsStrSplitOnDash[0];
        const secondLoadId = loadsStrSplitOnDash[1];
        let foundExistingMergeRoute;
        let foundLoadIds = [];
        const mergedRoutesKeys = Object.keys(mergedRoutes);
        for (let i = 0; i < mergedRoutesKeys.length; i++) {
            if (mergedRoutesKeys[i].includes('-' + firstLoadId + '-')) {
                foundLoadIds.push(firstLoadId);
                foundExistingMergeRoute = mergedRoutesKeys[i];
            }
            if (mergedRoutesKeys[i].includes('-' + secondLoadId + '-')) {
                foundLoadIds.push(secondLoadId);
                foundExistingMergeRoute = mergedRoutesKeys[i];
            }
            if ((foundExistingMergeRoute && mergedRoutesKeys.length == 1) || (mergedRoutesKeys.length > 1 && foundLoadIds.length > 1)) {
                break;
            }
        }
        // don't need to bother processing if both loads are already assigned a merged route
        if (foundLoadIds?.length < 2) {
            let existingMergeTotalMinsRoute;
            if (foundExistingMergeRoute) {
                existingMergeTotalMinsRoute = mergeRoutes[foundExistingMergeRoute];
            }
            const minsDepotToPickupFirstLoad = loads[firstLoadId].minsDepotToPickup;
            const minsDepotToPickupSecondLoad = loads[secondLoadId].minsDepotToPickup;
            const minsPickupFirstToPickupSecond = loads[firstLoadId].pickupDest.minsToNewDest(loads[secondLoadId].pickupDest);
            // TODO: not entirely sure about this logic with workingTotalMins, usually you are checking vehicle capacity (Demand), not total mins(distance) as a limitation
            const workingTotalMins = existingMergeTotalMinsRoute ? existingMergeTotalMinsRoute : minsDepotToPickupFirstLoad;
            const totalMinsProposedRoute = workingTotalMins + minsDepotToPickupSecondLoad - minsPickupFirstToPickupSecond;
            
            // // TODO: this is an attempt to incorporate dropoff point too but is definitely wip
            // const workingTotalMins = existingMergeTotalMinsRoute ? existingMergeTotalMinsRoute : minsDepotToPickupFirstLoad + loads[firstLoadId].minsPickupToDropoff;
            // // const minsDropoffToDepotSecondLoad = loads[secondLoadId].minsDropoffToDepot;
            // const minsDropoffFirstToPickupSecond = loads[firstLoadId].dropoffDest.minsToNewDest(loads[secondLoadId].pickupDest);
            // // const totalMinsProposedRoute = workingTotalMins + minsDropoffToDepotSecondLoad + loads[firstLoadId].minsPickupToDropoff + loads[secondLoadId].minsPickupToDropoff - minsDropoffFirstToPickupSecond;
            // const totalMinsProposedRoute = workingTotalMins + minsDepotToPickupSecondLoad - minsDropoffFirstToPickupSecond;

            // final logic to make sure we have not exceed MAX_MINS or 12 hour shift
            // console.log('totalMinsProposedRoute', totalMinsProposedRoute);
            // console.log('MAX_MINS', MAX_MINS);
            if (totalMinsProposedRoute <= MAX_MINS) {
                // console.log('we should merge routes');
                let expandedMergeRouteStr = '0-' + workingMergedLoadStr + '-0';
                if (foundExistingMergeRoute) {
                    // build out the new expandedMergeRouteStr key for adding to mergedRoutes map
                    const loadIdToAdd = !foundLoadIds.includes(firstLoadId) ? firstLoadId : !foundLoadIds.includes(secondLoadId) ? secondLoadId : undefined
                    expandedMergeRouteStr = loadIdToAdd ? foundExistingMergeRoute.slice(0, foundExistingMergeRoute.length - 1) + loadIdToAdd + '-0' : foundExistingMergeRoute;
                    if (foundExistingMergeRoute !== expandedMergeRouteStr) {
                        delete mergedRoutes[foundExistingMergeRoute];
                    }
                }
                // also add the totalMins value to map
                mergedRoutes[expandedMergeRouteStr] = totalMinsProposedRoute;
            }
            // } else {
            //     console.log('DO NOT merge routes');
            // }
        }
        // console.table(mergedRoutes);
        // check if we can break out of the loop because we have handled all loads
        const allLoadsMerged = Object.keys(mergedRoutes).map(routeStr => routeStr.slice(2, routeStr.length - 2)).join('-').split('-').sort((a,b) => Number(a) - Number(b));
        if (arrayIsEqualByString(allLoadsMerged,loadsIdKeysArr)) {
            break;
        }
    }
    return mergedRoutes;
}

// Call the mergeRoutes function to implement the VRP Clarke and Wright's Savings alg approach
const mergedRoutes = mergeRoutes(savingsSortedArr);

// Helper function to print desired output format to stdout
function printDesiredRouteOutput(mergedRoutes) {
    for (const entry in mergedRoutes) {
        process.stdout.write('[' + entry.slice(2, entry.length - 2).replaceAll('-',',') + ']\n');
    }
}

// call function to print results
printDesiredRouteOutput(mergedRoutes);




// tried to get an external mapbox lib node-or-tools working but kept getting "Error: Unable to find a solution" for trainingProblems

// // populate the loads map from the file read in...
// const locations = [[0,0]];
// let minX;
// let minY;
// for (let i = 1; i < inputLoadData.length; i++) {
//     if (inputLoadData[i] === '') {
//         break;
//     }
//     const splitLineOnSpace = inputLoadData[i].split(' ');
//     // const loadIdStr = splitLineOnSpace[0];
//     const pickupDestStr = splitLineOnSpace[1].slice(1, splitLineOnSpace[1].length - 1);
//     const dropoffDestStr = splitLineOnSpace[2].slice(1, splitLineOnSpace[2].length - 1);
//     const pickupDestSplitOnComma =  pickupDestStr.split(',')
//     const dropoffDestSplitOnComma =  dropoffDestStr.split(',')
        
//     const pickupX = Math.round(pickupDestSplitOnComma[0]);
//     const pickupY = Math.round(pickupDestSplitOnComma[1]);
//     const dropoffX = Math.round(dropoffDestSplitOnComma[0]);
//     const dropoffY = Math.round(dropoffDestSplitOnComma[1]);
//     const loadMinX = pickupX < dropoffX ? pickupX : dropoffX;
//     const loadMinY = pickupY < dropoffY ? pickupY : dropoffY;
//     if (i === 1) {
//         minX = loadMinX;
//         minY = loadMinY;
//     } else {
//         if (loadMinX < minX) {
//            minX = loadMinX;
//         }
//         if (loadMinY < minY) {
//             minY = loadMinY;
//         }
//     }
//     locations.push([pickupX, pickupY], [dropoffX, dropoffY]);
// }
// console.table(locations);
// console.log('minX', minX);
// console.log('minY', minY);

// const pickups = [];
// const deliveries = [];
// for (let i = 0; i < locations.length; i ++) {
//     if (i !== 0) {
//         if (i % 2 === 1) {
//             pickups.push(i);
//         } else {
//             deliveries.push(i);
//         }
//     }
//     locations[i][0] = locations[i][0] + (-1 * minX);
//     locations[i][1] = locations[i][1] + (-1 * minY);
// }
// console.table(locations);

// // Locations in a grid and Manhattan Distance for costs from example in npm package from mapbox/node-or-tools
// const locations = [
//     [0, 0], // 0
//     [0, 1], // 1
//     [0, 2], // 2
//     [0, 3], // 3
//     [1, 0], // 4
//     [1, 1], // 5
//     [1, 2], // 6
//     [1, 3], // 7
//     [2, 0], // 8
//     [2, 1], // 9
//     [2, 2], // 10
//     [2, 3], // 11
//     [3, 0], // 12
//     [3, 1], // 13
//     [3, 2], // 14
//     [3, 3]  // 15
// ];
// // const locations = [
// //     [-3, -3], // 0
// //     [-3, -2], // 1
// //     [-3, -1], // 2
// //     [-3, 0], // 3
// //     [-2, -3], // 4
// //     [-2, -2], // 5
// //     [-2, -1], // 6
// //     [-2, 0], // 7
// //     [-1, -3], // 8
// //     [-1, -2], // 9
// //     [-1, -1], // 10
// //     [-1, 0], // 11
// //     [0, -3], // 12
// //     [0, -2], // 13
// //     [0, -1], // 14
// //     [0, 0]  // 15
// // ];
// console.table(locations);
// const pickups = [];
// const deliveries = [];
// for (let i = 0; i < locations.length; i++) {
//     if (i % 2 === 0) {
//         pickups.push(i);
//     } else {
//         deliveries.push(i);
//     }
//     // console.log(locations[i][0]);
//     // locations[i][0] = locations[i][0] + (-1 * -3);
//     // console.log(locations[i][0]);
//     // locations[i][1] = locations[i][1] + (-1 * -3);
// }
// console.table(locations);

// console.log('pickups');
// console.table(pickups);
// console.log('deliveries');
// console.table(deliveries);

// const depot = 0;
// console.log('depot', locations[0]);

// function manhattanDistance(lhs, rhs) {
//     return Math.abs(lhs[0] - rhs[0]) + Math.abs(lhs[1] - rhs[1]);
// }

// // function euclideanDistance(lhs, rhs) {
// //     return Math.sqrt(Math.pow(lhs[0] - rhs[0], 2) + Math.pow(lhs[1] - rhs[1], 2));
// // }

// // costMatrix from Google ortools example
// // https://developers.google.com/optimization/routing/pickup_delivery
// // const costMatrix = [
// //     [0, 548, 776, 696, 582, 274, 502, 194, 308, 194, 536, 502, 388, 354, 468, 776, 662],
// //     [548, 0, 684, 308, 194, 502, 730, 354, 696, 742, 1084, 594, 480, 674, 1016, 868, 1210],
// //     [776, 684, 0, 992, 878, 502, 274, 810, 468, 742, 400, 1278, 1164, 1130, 788, 1552, 754],
// //     [696, 308, 992, 0, 114, 650, 878, 502, 844, 890, 1232, 514, 628, 822, 1164, 560, 1358],
// //     [582, 194, 878, 114, 0, 536, 764, 388, 730, 776, 1118, 400, 514, 708, 1050, 674, 1244],
// //     [274, 502, 502, 650, 536, 0, 228, 308, 194, 240, 582, 776, 662, 628, 514, 1050, 708],
// //     [502, 730, 274, 878, 764, 228, 0, 536, 194, 468, 354, 1004, 890, 856, 514, 1278, 480],
// //     [194, 354, 810, 502, 388, 308, 536, 0, 342, 388, 730, 468, 354, 320, 662, 742, 856],
// //     [308, 696, 468, 844, 730, 194, 194, 342, 0, 274, 388, 810, 696, 662, 320, 1084, 514],
// //     [194, 742, 742, 890, 776, 240, 468, 388, 274, 0, 342, 536, 422, 388, 274, 810, 468],
// //     [536, 1084, 400, 1232, 1118, 582, 354, 730, 388, 342, 0, 878, 764, 730, 388, 1152, 354],
// //     [502, 594, 1278, 514, 400, 776, 1004, 468, 810, 536, 878, 0, 114, 308, 650, 274, 844],
// //     [388, 480, 1164, 628, 514, 662, 890, 354, 696, 422, 764, 114, 0, 194, 536, 388, 730],
// //     [354, 674, 1130, 822, 708, 628, 856, 320, 662, 388, 730, 308, 194, 0, 342, 422, 536],
// //     [468, 1016, 788, 1164, 1050, 514, 514, 662, 320, 274, 388, 650, 536, 342, 0, 764, 194],
// //     [776, 868, 1552, 560, 674, 1050, 1278, 742, 1084, 810, 1152, 274, 388, 422, 764, 0, 798],
// //     [662, 1210, 754, 1358, 1244, 708, 480, 856, 514, 468, 354, 844, 730, 536, 194, 798, 0]
// // ];

// const costMatrix = new Array(locations.length);

// for (let from = 0; from < locations.length; ++from) {
//     costMatrix[from] = new Array(locations.length);

//     for (let to = 0; to < locations.length; ++to) {
//         // costMatrix[from][to] = euclideanDistance(locations[from], locations[to]);
//         costMatrix[from][to] = manhattanDistance(locations[from], locations[to]);
//     }
// }

// const dayStarts = Hours(0);
// const dayEnds = Hours(12); // 1 driver cannot exceed a 12 hour day

// const seed = 2147483650;
// function ParkMillerRNG(seed) {
//     const modulus = 2147483647;
//     const multiplier = 48271;
//     const increment = 0;
//     let state = seed;

//     return function() {
//         state = (multiplier * state + increment) % modulus;
//         return state / modulus;
//     };
// }
// const rand = ParkMillerRNG(seed);

// function Seconds(v) { return v; };
// function Minutes(v) { return Seconds(v * 60); }
// function Hours(v)   { return Minutes(v * 60); }

// const durationMatrix = new Array(locations.length);

// for (let from = 0; from < locations.length; ++from) {
//     durationMatrix[from] = new Array(locations.length);

//     for (let to = 0; to < locations.length; ++to) {
//         // arbitraty serviceTime at each location of 3 mins
//         const serviceTime = Minutes(3);
//         const travelTime = Minutes(costMatrix[from][to]);

//         durationMatrix[from][to] = serviceTime + travelTime;
//     }
// }

// const timeWindows = new Array(locations.length);

// for (let at = 0; at < locations.length; ++at) {
//     if (at === depot) {
//         timeWindows[at] = [dayStarts, dayEnds];
//         continue;
//     }

//     const earliest = dayStarts;
//     const latest = dayEnds - Hours(1);

//     const start = rand() * (latest - earliest) + earliest;
//     const stop = rand() * (latest - start) + start;

//     timeWindows[at] = [start, stop];
// }

// const demandMatrix = new Array(locations.length);

// for (let from = 0; from < locations.length; ++from) {
//     demandMatrix[from] = new Array(locations.length);

//     for (let to = 0; to < locations.length; ++to) {
//         if (from === depot)
//             demandMatrix[from][to] = 0
//         else
//             demandMatrix[from][to] = 1
//     }
// }

// const vrpSolverOpts = {
//     numNodes: locations.length,
//     costs: costMatrix,
//     durations: durationMatrix,
//     timeWindows: timeWindows,
//     demands: demandMatrix
// };

// const VRP = new ortools.VRP(vrpSolverOpts);

// const numVehicles = pickups.length;
// console.log('numVehicles', numVehicles);
// const timeHorizon = (dayEnds - dayStarts);
// console.log('timeHorizon', timeHorizon);
// const vehicleCapacity = pickups.length;
// console.log('vehicleCapacity', vehicleCapacity);

// // Dummy lock to let vehicle 0 go to location 2 and 3 first - to test route locks
// const routeLocks = new Array(numVehicles);

// for (let vehicle = 0; vehicle < numVehicles; ++vehicle) {
//     // if (vehicle === 0)
//     //     routeLocks[vehicle] = [2, 3];
//     // else
//         routeLocks[vehicle] = [];
// }

// const vrpSearchOpts = {
//     computeTimeLimit: 1000 * 30, // 30 secs
//     numVehicles,
//     depotNode: depot,
//     timeHorizon,
//     vehicleCapacity,
//     routeLocks,
//     pickups,
//     deliveries
// };

// VRP.Solve(vrpSearchOpts, function (err, solution) {
//     if (err) return console.log(err);
//     console.log(inspect(solution, {showHidden: false, depth: null}));
// });
