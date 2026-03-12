import http from 'k6/http';
import { check } from 'k6';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';
import exec from 'k6/execution';

// Define all cities and shopper types
const cities = ['atlanta'];
const shopperTypes = ['active'];
const offerCountTrend = new Trend('offer_array_size');

const headers = {
    headers: {
        'X-Shipt-Identifier': 'shopper-bff'
    },
};

// Load shopper data from CSVs into a lookup object
const shopperData = {};

for (const city of cities) {
    for (const type of shopperTypes) {
        const key = `${city}_${type}`;

        shopperData[key] = new SharedArray(key, () => {
            const path = `./data/${key}.csv`;
            let fileContent;

            try {
                fileContent = open(path);
            } catch (err) {
                throw new Error(`File not found: ${path}`);
            }

            const lines = fileContent
                .split('\n')
                .slice(1) // skip header
                .filter(line => line.trim() !== '');

            if (lines.length === 0) {
                throw new Error(`File is empty or has no valid shopper IDs: ${path}`);
            }

            return lines.map(id => ({ shopper_id: id.replace(/['"]+/g, '').trim() }));
        });
    }
}

const activeStages = [
    { target: 75, duration: '3m' },
    { target: 75, duration: '5m' },
    { target: 75, duration: '3m' },
    { target: 75, duration: '4m' },
];

const inactiveStages = [
    { target: 1, duration: '15m' }
];

export const options = {
    scenarios: Object.fromEntries(
        cities.flatMap(city =>
            shopperTypes.map(type => {
                const key = `${city}_${type}`;

                return [
                    key,
                    {
                        executor: 'constant-arrival-rate',
                        rate: 5,
                        timeUnit: '1s',
                        duration: '6m',
                        preAllocatedVUs: 2,
                        maxVUs: 8,
                        exec: 'scenarioExecutor',
                        env: { CITY: city, TYPE: type },
                        tags: {city, shopper_type: type},
                    },
                ];
            })
        )
    ),
};

// Per-VU state for tracking assigned shoppers
let myShoppers = null;
let myShopperIndex = 0;

// Shared logic for active shoppers
function activeLogic(shopper, city) {
    let res = http.get(`https://offering.us-central1.staging.shipt.com/v3/drivers/${shopper.shopper_id}/package_delivery/offers`, headers, {
        tags: { city, shopper_type: 'active' },
    });
    check(res, { 'Active TLMD offers': (r) => r.status === 200 });
    check(res, { 'Bot traffic': (r) => r.status === 429 });

    if (res.status === 200 && res.body) {
        try {
            const body = JSON.parse(res.body);
            const arraySize = Array.isArray(body.offers) ? body.offers.length : 0;
            offerCountTrend.add(arraySize);
        } catch (e) {
            console.error('Failed to parse response body');
        }
    }
}

// Shared logic for inactive shoppers
function inactiveLogic(shopper, city) {
    const res = http.get(`https://offering.us-central1.staging.shipt.com/v3/drivers/${shopper.shopper_id}/package_delivery/offers`, headers, {
        tags: { city, shopper_type: 'inactive' },
    });
    check(res, { 'Inactive TLMD offers': (r) => r.status === 200 });
    sleep(0.25);
}

export function scenarioExecutor() {
    const city = __ENV.CITY;
    const type = __ENV.TYPE;
    const key = `${city}_${type}`;

    const allShoppers = shopperData[key];
    if (!allShoppers || allShoppers.length === 0) {
        throw new Error(`No shopper data found for key: ${key}`);
    }

    // Initialize shoppers for this VU on first iteration
    // Initialize shoppers for this VU on first iteration
    if (myShoppers === null) {
        const vuId = exec.vu.idInTest;
        const scenarioName = exec.scenario.name;

        // Get maxVUs from the scenario - for constant-arrival-rate, use the configured maxVUs
        const maxVUs = 8;

        // Calculate this VU's slice of shoppers
        const shoppersPerVU = Math.ceil(allShoppers.length / maxVUs);
        const startIdx = (vuId - 1) * shoppersPerVU;
        const endIdx = Math.min(startIdx + shoppersPerVU, allShoppers.length);

        myShoppers = allShoppers.slice(startIdx, endIdx);
        myShopperIndex = 0;

        console.log(`VU ${vuId} (Scenario: ${scenarioName}): Assigned shoppers ${startIdx}-${endIdx - 1} (${myShoppers.length} total from ${allShoppers.length} total shoppers, maxVUs: ${maxVUs})`);
    }


    if (myShoppers.length === 0) {
        throw new Error(`VU ${exec.vu.idInTest}: No shoppers assigned`);
    }

    // Log warning when reusing shoppers
    // Check if all shoppers are exhausted BEFORE getting the next one
    if (myShopperIndex >= myShoppers.length) {
        console.warn(`VU ${exec.vu.idInTest}: All ${myShoppers.length} shoppers exhausted, stopping execution`);
        return; // Stop this VU from executing further
    }

    // Get next shopper from this VU's pool (without modulo - we want to stop, not wrap)
    const shopper = myShoppers[myShopperIndex];
    myShopperIndex++;

    console.log(`VU ${exec.vu.idInTest}: Using shopper ${myShopperIndex}/${myShoppers.length} - ID: ${shopper.shopper_id}`);


    if (type === 'active') {
        activeLogic(shopper, city);
    } else {
        //inactiveLogic(shopper, city);
    }
}
