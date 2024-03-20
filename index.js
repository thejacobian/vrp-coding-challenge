import * as fs from 'fs';
import Destination from './Destination.js'
import Load from './Load.js'

// Sadly, in 24 hours will a demanding full-time job I only got as far as tackling the first problem1.txt
const inputLoadData = fs.readFileSync('./trainingProblems/problem1.txt').toString('utf8').split('\n');
const MAX_MINS = 720 // 12 hours * 60 mins

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
    const pickupDest = new Destination(Number(pickupDestSplitOnComma[0]), Number(pickupDestSplitOnComma[1]));
    const dropoffDest = new Destination(Number(dropoffDestSplitOnComma[0]), Number(dropoffDestSplitOnComma[1]));
    loads[loadIdStr] = new Load(loadIdStr, pickupDest, dropoffDest);
}


// Used later to break out of mergeRoutes loop once we have looked at all loadIds.
const loadsIdKeysArr = Object.keys(loads);

// Function to calculate savings VRP solution via Clarke & Wright method (since research reveals ist popular and its pretty accurate)
// Reference Berkely lecture: https://aswani.ieor.berkeley.edu/teaching/FA15/151/lecture_notes/ieor151_lec18.pdf
function calculateSavingsDropoffToNextPickup(loads) {
    const savingsMap = {};
    const loadsVals = Object.values(loads);
    for (let j = 0; j < loadsVals.length; j++) {
        for (let k = j + 1; k < loadsVals.length; k++) {
            // TODO: decided to just focus on simpler VRP of pickup optimization only
            savingsMap[loadsVals[j].loadId + '-' + loadsVals[k].loadId] = loadsVals[j].minsDepotToPickup + loadsVals[k].minsDepotToPickup - loadsVals[j].pickupDest.minsToNewDest(loadsVals[k].pickupDest);
            // TODO: this is an attempt to incorporate dropoff point too but is definitely wip, likely does not work
            // savingsMap[loadsVals[j].loadId + '-' + loadsVals[k].loadId] = loadsVals[j].minsDepotToPickup + loadsVals[k].minsDropoffToDepot - loadsVals[j].dropoffDest.minsToNewDest(loadsVals[k].pickupDest);
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
const savingsSortedArr = calculateSavingsDropoffToNextPickup(loads);

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
            
            // TODO: this is an attempt to incorporate dropoff point too but is definitely wip
            // const minsDropoffToDepotSecondLoad = loads[secondLoadId].minsDropoffToDepot;
            // const minsDropoffFirstToPickupSecond = loads[firstLoadId].dropoffDest.minsToNewDest(loads[secondLoadId].pickupDest);
            // const totalMinsProposedRoute = minsDepotToPickupFirstLoad + minsDropoffToDepotSecondLoad + minsDropoffFirstToPickupSecond + loads[firstLoadId].minsPickupToDropoff + loads[secondLoadId].minsPickupToDropoff;

            // final logic to make sure we have not exceeed MAX_MINS or 12 hour shift
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
