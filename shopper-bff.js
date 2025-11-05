import http from 'k6/http';
import { check } from 'k6';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Define all cities and shopper types
const cities = ['atlanta', 'chicago', 'dallas', 'detroit', 'houston', 'msp'];
const shopperTypes = ['active', 'inactive'];
const BASE_URL = 'https://shopper-bff-offering.us-central1.staging.shipt.com';

const HEADERS = { 'x-user-type': 'Driver' };

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
            //console.log("file content "+lines)

            if (lines.length === 0) {
                throw new Error(`File is empty or has no valid shopper IDs: ${path}`);
            }

            return lines.map(id => ({ shopper_id: id.replace(/['"]+/g, '').trim() }));
        });
    }
}

//Define separate stages for active/inactive shoppers
// const activeStages = [
//     { target: 50, duration: '30s' },
//     { target: 150, duration: '3m' },
//     { target: 250, duration: '4m' },
//     { target: 200, duration: '2m' },
//     { target: 0, duration: '30s' },
// ];

const activeStages = [
    // { target: 10, duration: '1m' },
    { target: 25, duration: '4m' },
    // { target: 150, duration: '1m' },
];

const inactiveStages = [
    { target: 10, duration: '4m' },
];

// const inactiveStages = [
//     { target: 20*60, duration: '10m' },
//     { target: 0, duration: '30s' },
// ];

// const inactiveStages = [
//     { target: 5, duration: '30s' },
//     { target: 15, duration: '3m' },
//     { target: 25, duration: '4m' },
//     { target: 20, duration: '2m' },
//     { target: 0, duration: '30s' },
// ];


// Build scenarios with env variables to pass city/type info
export const options = {
    scenarios: Object.fromEntries(
        cities.flatMap(city =>
            shopperTypes.map(type => {
                const key = `${city}_${type}`;
                // Below 4 are used only in ramping-arrival-rate.
                const stages = type === 'active' ? activeStages : inactiveStages;
                const maxVUs = type === 'active' ? 50 : 10;
                const preAllocVUs = type === 'active' ? 10 : 5;
                const startRate = type === 'active' ? 0 : 0;

                return [
                    key,
                    //type,
                    {
                        executor: 'ramping-arrival-rate',
                        startRate: startRate,
                        timeUnit: '1s',
                        preAllocatedVUs: preAllocVUs,
                        maxVUs: maxVUs,
                        stages,
                        exec: 'scenarioExecutor',  // single shared executor function
                        env: { CITY: city, TYPE: type },  // pass city/type here
                        tags: {
                            city,
                            shopper_type: type,
                        },
                    },
                ];

                // return [
                //     key,
                //     {
                //         executor: 'constant-arrival-rate',
                //         rate: 25,              // RPS
                //         timeUnit: '1s',         // rate is per second
                //         duration: '4m',         // total test time: 4 minutes
                //         preAllocatedVUs: 50,   // pre-spawned virtual users
                //         maxVUs: 200,            // upper limit if requests take longer
                //         exec: 'scenarioExecutor',
                //         env: { CITY: city, TYPE: type },  // pass city/type here
                //         tags: {city, shopper_type: type,},
                //     },
                // ];
            })
        )
    ),
};

function call(shopper, city) {
    HEADERS['x-user-id'] = shopper.shopper_id;
    let res = http.get(`${BASE_URL}/offering/v1/offers/driver`, { headers: HEADERS });
    check(res, { 'got offers': (r) => r.status === 200 });

    let offers = [];
    try {
        offers = res.json('offers') || [];
    } catch (e) {
        offers = [];
    }

    // call card-view for first 4
    const groupOffers = offers.slice(0, 2);
    const requests = groupOffers.map((offer) => ({
        method: 'GET',
        url: `${BASE_URL}/offering/v1/offers/${offer.order_bundle_id}/card-view`,
        params: { headers: HEADERS }
    }));

    const responses = http.batch(requests);
    for (const resp of responses) {
        check(resp, { 'card-view 200': (r) => r.status === 200 });
    }
}

// Shared scenario executor function (runs per iteration)
export function scenarioExecutor() {
    const city = __ENV.CITY;
    const type = __ENV.TYPE;
    const key = `${city}_${type}`;

    const data = shopperData[key];
    if (!data || data.length === 0) {
        throw new Error(`No shopper data found for key: ${key}`);
    }

    const shopper = data[Math.floor(Math.random() * data.length)];

    if (type === 'active') {
        call(shopper, city);
    } else {
        //call(shopper, city);
    }
}
