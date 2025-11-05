import http from 'k6/http';
import { check } from 'k6';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';

// Define all cities and shopper types
const cities = ['atlanta', 'chicago', 'dallas', 'detroit', 'houston', 'msp'];
const shopperTypes = ['active', 'inactive'];

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
    { target: 50, duration: '4m' },
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
                const stages = type === 'active' ? activeStages : inactiveStages;
                const maxVUs = type === 'active' ? 200 : 10;
                const preAllocVUs = type === 'active' ? 10 : 5;
                const startRate = type === 'active' ? 200 : 10;


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
            })
        )
    ),
};

// Shared logic for active shoppers
function activeLogic(shopper, city) {
    const res = http.get(`https://offering.us-central1.staging.shipt.com/v3/drivers/${shopper.shopper_id}/package_delivery/offers`,headers, {
        tags: { city, shopper_type: 'active' },
    });
    //sleep(2)
}

// Shared logic for inactive shoppers
function inactiveLogic(shopper, city) {
    const res = http.get(`https://offering.us-central1.staging.shipt.com/v3/drivers/${shopper.shopper_id}/package_delivery/offers`, headers, {
        tags: { city, shopper_type: 'inactive' },
    });
    sleep(5)
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
      activeLogic(shopper, city);
    } else {
       //inactiveLogic(shopper, city);
    }
}
