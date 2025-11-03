import http from 'k6/http';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';

export const options = {
    duration: '2m',
};

// --- Data Structures ---
// Shared arrays (in-memory for single script)
let shoppersData = new SharedArray('shoppersData', function () {
    // Load shopper data from a CSV file
    return open('./shoppers.csv').split('\n').slice(1).map(line => line.split(','));
});

export default function() {
    let shopperProfileHost = 'https://shopper-profile.us-central1.staging.shipt.com';
    // Get the shopper for this iteration
    let shopperIdx = __ITER;
    if (shopperIdx >= shoppersData.length) {
        return; // No more shoppers to process
    }
    let shopper = shoppersData[shopperIdx];
    let shopperId = shopper[0].replace(/"/g, '');
    let profileUpdatePayload = JSON.stringify({
        metro_id: '116',
    });
    let profileUrl = `${shopperProfileHost}/v2/shoppers/${shopperId}`;
    // console.log(`PATCH ${profileUrl}`);
    // console.log(`Payload: ${profileUpdatePayload}`);
    let res = http.patch(profileUrl, profileUpdatePayload, {headers: {'Content-Type': 'application/json'}});
    if (res.status !== 200) {
        console.log(`Failed to update shopper profile for metro ${metroId}: ${res.status}`);
    }
}