import { LatLon, distanceKm } from "./geo";

export interface City {
  name: string;
  lat: number;
  lon: number;
  /** 1 = megacity, shown at every zoom. 2 = major city, shown when zoomed in. */
  tier: 1 | 2;
}

export const CITIES: City[] = [
  { name: "Tokyo", lat: 35.68, lon: 139.69, tier: 1 },
  { name: "Delhi", lat: 28.61, lon: 77.21, tier: 1 },
  { name: "Shanghai", lat: 31.23, lon: 121.47, tier: 1 },
  { name: "Beijing", lat: 39.9, lon: 116.4, tier: 1 },
  { name: "Mumbai", lat: 19.08, lon: 72.88, tier: 1 },
  { name: "São Paulo", lat: -23.55, lon: -46.63, tier: 1 },
  { name: "Mexico City", lat: 19.43, lon: -99.13, tier: 1 },
  { name: "Cairo", lat: 30.04, lon: 31.24, tier: 1 },
  { name: "Dhaka", lat: 23.81, lon: 90.41, tier: 1 },
  { name: "New York", lat: 40.71, lon: -74.01, tier: 1 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24, tier: 1 },
  { name: "Moscow", lat: 55.76, lon: 37.62, tier: 1 },
  { name: "London", lat: 51.51, lon: -0.13, tier: 1 },
  { name: "Paris", lat: 48.86, lon: 2.35, tier: 1 },
  { name: "Lagos", lat: 6.52, lon: 3.38, tier: 1 },
  { name: "Istanbul", lat: 41.01, lon: 28.98, tier: 1 },
  { name: "Buenos Aires", lat: -34.6, lon: -58.38, tier: 1 },
  { name: "Kinshasa", lat: -4.44, lon: 15.27, tier: 1 },
  { name: "Jakarta", lat: -6.21, lon: 106.85, tier: 1 },
  { name: "Manila", lat: 14.6, lon: 120.98, tier: 1 },
  { name: "Karachi", lat: 24.86, lon: 67.01, tier: 1 },
  { name: "Tehran", lat: 35.69, lon: 51.39, tier: 1 },
  { name: "Bangkok", lat: 13.76, lon: 100.5, tier: 1 },
  { name: "Seoul", lat: 37.57, lon: 126.98, tier: 1 },
  { name: "Johannesburg", lat: -26.2, lon: 28.05, tier: 1 },
  { name: "Sydney", lat: -33.87, lon: 151.21, tier: 1 },
  { name: "Chicago", lat: 41.88, lon: -87.63, tier: 1 },
  { name: "Lima", lat: -12.05, lon: -77.04, tier: 1 },
  { name: "Bogotá", lat: 4.71, lon: -74.07, tier: 1 },
  { name: "Riyadh", lat: 24.71, lon: 46.68, tier: 1 },
  { name: "Nairobi", lat: -1.29, lon: 36.82, tier: 1 },
  { name: "Toronto", lat: 43.65, lon: -79.38, tier: 2 },
  { name: "Vancouver", lat: 49.28, lon: -123.12, tier: 2 },
  { name: "San Francisco", lat: 37.77, lon: -122.42, tier: 2 },
  { name: "Houston", lat: 29.76, lon: -95.37, tier: 2 },
  { name: "Washington", lat: 38.91, lon: -77.04, tier: 2 },
  { name: "Miami", lat: 25.76, lon: -80.19, tier: 2 },
  { name: "Anchorage", lat: 61.22, lon: -149.9, tier: 2 },
  { name: "Havana", lat: 23.11, lon: -82.37, tier: 2 },
  { name: "Caracas", lat: 10.48, lon: -66.9, tier: 2 },
  { name: "Santiago", lat: -33.45, lon: -70.67, tier: 2 },
  { name: "Rio de Janeiro", lat: -22.91, lon: -43.17, tier: 2 },
  { name: "Reykjavík", lat: 64.15, lon: -21.94, tier: 2 },
  { name: "Lisbon", lat: 38.72, lon: -9.14, tier: 2 },
  { name: "Madrid", lat: 40.42, lon: -3.7, tier: 2 },
  { name: "Berlin", lat: 52.52, lon: 13.4, tier: 2 },
  { name: "Rome", lat: 41.9, lon: 12.5, tier: 2 },
  { name: "Stockholm", lat: 59.33, lon: 18.07, tier: 2 },
  { name: "Warsaw", lat: 52.23, lon: 21.01, tier: 2 },
  { name: "Kyiv", lat: 50.45, lon: 30.52, tier: 2 },
  { name: "Athens", lat: 37.98, lon: 23.73, tier: 2 },
  { name: "Casablanca", lat: 33.57, lon: -7.59, tier: 2 },
  { name: "Algiers", lat: 36.75, lon: 3.06, tier: 2 },
  { name: "Dakar", lat: 14.72, lon: -17.47, tier: 2 },
  { name: "Accra", lat: 5.6, lon: -0.19, tier: 2 },
  { name: "Khartoum", lat: 15.5, lon: 32.56, tier: 2 },
  { name: "Addis Ababa", lat: 9.03, lon: 38.74, tier: 2 },
  { name: "Dar es Salaam", lat: -6.79, lon: 39.21, tier: 2 },
  { name: "Luanda", lat: -8.84, lon: 13.23, tier: 2 },
  { name: "Cape Town", lat: -33.92, lon: 18.42, tier: 2 },
  { name: "Baghdad", lat: 33.31, lon: 44.36, tier: 2 },
  { name: "Dubai", lat: 25.2, lon: 55.27, tier: 2 },
  { name: "Tashkent", lat: 41.3, lon: 69.24, tier: 2 },
  { name: "Almaty", lat: 43.24, lon: 76.89, tier: 2 },
  { name: "Novosibirsk", lat: 55.01, lon: 82.93, tier: 2 },
  { name: "Kolkata", lat: 22.57, lon: 88.36, tier: 2 },
  { name: "Bengaluru", lat: 12.97, lon: 77.59, tier: 2 },
  { name: "Yangon", lat: 16.84, lon: 96.17, tier: 2 },
  { name: "Ho Chi Minh City", lat: 10.82, lon: 106.63, tier: 2 },
  { name: "Singapore", lat: 1.35, lon: 103.82, tier: 2 },
  { name: "Hong Kong", lat: 22.32, lon: 114.17, tier: 2 },
  { name: "Chongqing", lat: 29.56, lon: 106.55, tier: 2 },
  { name: "Taipei", lat: 25.03, lon: 121.57, tier: 2 },
  { name: "Osaka", lat: 34.69, lon: 135.5, tier: 2 },
  { name: "Vladivostok", lat: 43.12, lon: 131.89, tier: 2 },
  { name: "Perth", lat: -31.95, lon: 115.86, tier: 2 },
  { name: "Melbourne", lat: -37.81, lon: 144.96, tier: 2 },
  { name: "Auckland", lat: -36.85, lon: 174.76, tier: 2 },
];

export function nearestCity(ll: LatLon): { city: City; km: number } {
  let best = { city: CITIES[0], km: Infinity };
  for (const city of CITIES) {
    const km = distanceKm(ll, city);
    if (km < best.km) best = { city, km };
  }
  return best;
}
