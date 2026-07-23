import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { GPXPoint } from "../utils/gpxParser";

interface MapViewProps {
  points: GPXPoint[];
  startIndex: number;
  endIndex: number;
}

export const MapView: React.FC<MapViewProps> = ({ points, startIndex, endIndex }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fullPathRef = useRef<L.Polyline | null>(null);
  const segmentPathRef = useRef<L.Polyline | null>(null);
  const startMarkerRef = useRef<L.CircleMarker | null>(null);
  const endMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Use default OSM tile layer
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

  // Update Path Overlays
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;

    const latLons = points.map((p) => L.latLng(p.lat, p.lon));

    // Draw full path (gray)
    if (fullPathRef.current) {
      fullPathRef.current.setLatLngs(latLons);
    } else {
      fullPathRef.current = L.polyline(latLons, {
        color: "#4A4A52",
        weight: 4,
        opacity: 0.6,
      }).addTo(map);
    }

    // Draw selected segment path (blue)
    const segmentPoints = points.slice(startIndex, endIndex + 1);
    const segmentLatLons = segmentPoints.map((p) => L.latLng(p.lat, p.lon));

    if (segmentPathRef.current) {
      segmentPathRef.current.setLatLngs(segmentLatLons);
    } else {
      segmentPathRef.current = L.polyline(segmentLatLons, {
        color: "#1A73E8",
        weight: 6,
        opacity: 0.9,
      }).addTo(map);
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
        }).addTo(map).bindTooltip("🏁 Start Line", { permanent: false });
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
        }).addTo(map).bindTooltip("🏁 Finish Line", { permanent: false });
      }
    }

    // Adjust map bounds to fit the full path
    if (fullPathRef.current) {
      map.fitBounds(fullPathRef.current.getBounds(), { padding: [20, 20] });
    }
  }, [points, startIndex, endIndex]);

  return (
    <div
      ref={mapContainerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "350px",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    />
  );
};
