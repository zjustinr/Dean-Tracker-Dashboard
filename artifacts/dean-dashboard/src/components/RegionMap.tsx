import { memo } from "react";
import * as RSM from "react-simple-maps";

// Tiny live "coverage" map for the Slate Builder: an outline of the US that fills
// in whichever states the region/state filters currently select, so a recruiter
// can instantly see the geographic footprint of a search. Reuses the same
// us-atlas topojson + geoAlbersUsa projection the career map already loads, so it
// adds no new dependency and the file is served from cache after the first view.
const { ComposableMap, Geographies, Geography } = RSM;
const US_STATES_GEO = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

// us-atlas states-10m keys each geography by 2-digit state FIPS (geo.id); the
// filters speak USPS postal codes, so translate. DC (11) is included but too
// small to read on a map this size.
const FIPS_TO_USPS: Record<string, string> = {
  "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
  "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
  "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
  "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
  "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
  "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
  "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
  "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
  "54": "WV", "55": "WI", "56": "WY",
};

function RegionMapBase({ selected }: { selected: Set<string> }) {
  const any = selected.size > 0;
  return (
    <div className="w-full">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 340 }}
        width={420} height={264}
        style={{ width: "100%", height: "auto" }}
        aria-label="US map highlighting the states in the current search"
      >
        <Geographies geography={US_STATES_GEO}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const usps = FIPS_TO_USPS[String(geo.id)] || "";
              const on = !!usps && selected.has(usps);
              return (
                <Geography
                  key={geo.rsmKey || geo.id}
                  geography={geo}
                  fill={on ? "#011F5B" : "hsl(var(--muted))"}
                  stroke="hsl(var(--card))"
                  strokeWidth={0.6}
                  style={{
                    default: { outline: "none", transition: "fill 200ms ease" },
                    hover: { outline: "none", fill: on ? "#011F5B" : "hsl(var(--muted))" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      <p className="mt-1 text-[10px] text-muted-foreground text-center leading-tight">
        {any ? `${selected.size} state${selected.size === 1 ? "" : "s"} in view` : "All states — pick a region or state"}
      </p>
    </div>
  );
}

export default memo(RegionMapBase);
