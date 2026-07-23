import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GPXPoint } from "../utils/gpxParser";

interface MapViewProps {
  points: GPXPoint[];
  startIndex: number;
  endIndex: number;
  activeSplitNum?: number | null;
}

export const MapView: React.FC<MapViewProps> = ({ points, startIndex, endIndex, activeSplitNum }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fullPathRef = useRef<L.Polyline | null>(null);
  const segmentPathRef = useRef<L.Polyline | null>(null);
  const splitPathRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [37.5, 127.0],
      zoom: 12,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Path Overlays and Highlights
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    const latLons = points.map((p) => L.latLng(p.lat, p.lon));

    // Draw full path (gray)
    if (fullPathRef.current) {
      fullPathRef.current.setLatLngs(latLons);
    } else {
      fullPathRef.current = L.polyline(latLons, {
        color: "#E6E6EB",
        weight: 3,
        opacity: 0.5,
      }).addTo(map);
    }

    // Draw segment path (blue by default, grayed out if split is highlighted)
    const segmentPoints = points.slice(startIndex, endIndex + 1);
    const segmentLatLons = segmentPoints.map((p) => L.latLng(p.lat, p.lon));

    if (segmentPathRef.current) {
      segmentPathRef.current.setLatLngs(segmentLatLons);
      segmentPathRef.current.setStyle({
        color: activeSplitNum ? "#CCCCCC" : "#1A73E8",
        weight: activeSplitNum ? 4 : 6,
        opacity: activeSplitNum ? 0.4 : 0.9,
      });
    } else {
      segmentPathRef.current = L.polyline(segmentLatLons, {
        color: activeSplitNum ? "#CCCCCC" : "#1A73E8",
        weight: activeSplitNum ? 4 : 6,
        opacity: activeSplitNum ? 0.4 : 0.9,
      }).addTo(map);
    }

    // Draw/update highlighted split path
    if (activeSplitNum && segmentPoints.length > 0) {
      const pointsPerSplit = segmentPoints.length / 10;
      const sIdx = Math.floor((activeSplitNum - 1) * pointsPerSplit);
      const eIdx = Math.min(segmentPoints.length - 1, Math.floor(activeSplitNum * pointsPerSplit));
      const splitPoints = segmentPoints.slice(sIdx, eIdx + 1);
      const splitLatLons = splitPoints.map((p) => L.latLng(p.lat, p.lon));

      if (splitPathRef.current) {
        splitPathRef.current.setLatLngs(splitLatLons);
      } else {
        splitPathRef.current = L.polyline(splitLatLons, {
          color: "#FC6100", // Bright Strava Orange for active split
          weight: 8,
          opacity: 1.0,
        }).addTo(map);
      }
    } else {
      if (splitPathRef.current) {
        splitPathRef.current.remove();
        splitPathRef.current = null;
      }
    }

    // Start Marker (Green Circle)
    if (points[startIndex]) {
      const startPt = points[startIndex];
      if (startMarkerRef.current) {
        startMarkerRef.current.setLatLng([startPt.lat, startPt.lon]);
      } else {
        startMarkerRef.current = L.circleMarker([startPt.lat, startPt.lon], {
          color: "#4CAF50",
          fillColor: "#4CAF50",
          fillOpacity: 1,
          radius: 8,
        }).addTo(map).bindTooltip("🏁 구간 시작점", { permanent: false });
      }
    }

    // End Marker (Red Circle)
    if (points[endIndex]) {
      const endPt = points[endIndex];
      if (endMarkerRef.current) {
        endMarkerRef.current.setLatLng([endPt.lat, endPt.lon]);
      } else {
        endMarkerRef.current = L.circleMarker([endPt.lat, endPt.lon], {
          color: "#F44336",
          fillColor: "#F44336",
          fillOpacity: 1,
          radius: 8,
        }).addTo(map).bindTooltip("🏁 구간 종료점", { permanent: false });
      }
    }

    // Adjust map bounds to fit the segment path so it stays focused!
    if (segmentPathRef.current) {
      map.fitBounds(segmentPathRef.current.getBounds(), { padding: [40, 40], maxZoom: 16 });
    }
  }, [points, startIndex, endIndex, activeSplitNum]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "350px",
        borderRadius: "8px",
        border: "1px solid #E6E6EB",
        overflow: "hidden",
      }}
    />
  );
};
