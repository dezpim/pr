export interface GPXPoint {
  lat: number;
  lon: number;
  ele: number; // elevation in meters
  time?: string;
  distance: number; // cumulative distance in meters
}

export interface GPXData {
  name: string;
  points: GPXPoint[];
}

// Calculate distance in meters using Haversine formula
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function parseGPX(xmlText: string): GPXData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  // Get track name
  let name = "Unnamed Segment";
  const nameNode = xmlDoc.querySelector("trk > name") || xmlDoc.querySelector("name");
  if (nameNode && nameNode.textContent) {
    name = nameNode.textContent.trim();
  }

  const trkpts = xmlDoc.querySelectorAll("trkpt");
  const points: GPXPoint[] = [];
  let accumDistance = 0;

  for (let i = 0; i < trkpts.length; i++) {
    const trkpt = trkpts[i];
    const lat = parseFloat(trkpt.getAttribute("lat") || "0");
    const lon = parseFloat(trkpt.getAttribute("lon") || "0");

    const eleNode = trkpt.querySelector("ele");
    const ele = eleNode ? parseFloat(eleNode.textContent || "0") : 0;

    const timeNode = trkpt.querySelector("time");
    const time = timeNode ? timeNode.textContent || undefined : undefined;

    if (i > 0) {
      const prev = points[i - 1];
      accumDistance += calculateDistance(prev.lat, prev.lon, lat, lon);
    }

    points.push({
      lat,
      lon,
      ele,
      time,
      distance: accumDistance,
    });
  }

  return { name, points };
}

// Generate GPX XML from points list
export function generateGPX(name: string, points: GPXPoint[]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<gpx version="1.1" creator="Leaderboard Segment Manager" xmlns="http://www.topografix.com/GPX/1/1">\n';
  xml += '  <metadata>\n';
  xml += `    <name>${name}</name>\n`;
  xml += '  </metadata>\n';
  xml += '  <trk>\n';
  xml += `    <name>${name}</name>\n`;
  xml += '    <trkseg>\n';

  points.forEach((pt) => {
    xml += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
    if (!isNaN(pt.ele)) {
      xml += `        <ele>${pt.ele.toFixed(1)}</ele>\n`;
    }
    if (pt.time) {
      xml += `        <time>${pt.time}</time>\n`;
    }
    xml += '      </trkpt>\n';
  });

  xml += '    </trkseg>\n';
  xml += '  </trk>\n';
  xml += '</gpx>\n';
  return xml;
}
