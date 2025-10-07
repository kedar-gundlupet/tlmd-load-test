import http from 'k6/http';
import { sleep } from 'k6';
export const options = {
  vus: 10,
  duration: '5s',
};
export default function () {
  const headers = {
    headers: {
      'X-Shipt-Identifier': 'shopper-bff'
    },
  };
  http.get('https://offering.us-central1.staging.shipt.com/v3/drivers/100000192/package_delivery/offers', headers);
  sleep(1);
}
