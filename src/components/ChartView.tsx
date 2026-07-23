import React from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea } from "recharts";
import type { GPXPoint } from "../utils/gpxParser";

interface ChartViewProps {
  points: GPXPoint[];
  startIndex: number;
  endIndex: number;
  onTrimChange: (start: number, end: number) => void;
}

export const ChartView: React.FC<ChartViewProps> = ({ points, startIndex, endIndex, onTrimChange }) => {
  if (points.length === 0) {
    return (
      <div className="empty-chart-placeholder">
        Upload a GPX file to view the elevation profile.
      </div>
    );
  }

  // Format data for Recharts
  const chartData = points.map((p, idx) => ({
    index: idx,
    distanceKm: (p.distance / 1000).toFixed(2),
    elevation: parseFloat(p.ele.toFixed(1)),
  }));

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val < endIndex) {
      onTrimChange(val, endIndex);
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (val > startIndex) {
      onTrimChange(startIndex, val);
    }
  };

  const minElevation = Math.floor(Math.min(...points.map((p) => p.ele)) - 10);
  const maxElevation = Math.ceil(Math.max(...points.map((p) => p.ele)) + 10);

  return (
    <div className="chart-view-container">
      {/* 2D Elevation Area Chart */}
      <div className="elevation-chart" style={{ width: "100%", height: "240px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="distanceKm" stroke="#808080" fontSize={11} tickLine={false} unit=" km" />
            <YAxis domain={[minElevation, maxElevation]} stroke="#808080" fontSize={11} tickLine={false} unit=" m" />
            <Tooltip
              contentStyle={{ backgroundColor: "#1E1E24", borderColor: "#4A4A52", borderRadius: "8px" }}
              labelStyle={{ color: "#FFF", fontWeight: "bold" }}
              formatter={(value: any) => [`${value} m`, "Elevation"]}
              labelFormatter={(label) => `Distance: ${label} km`}
            />
            {/* Draw complete elevation profile in dark gray */}
            <Area type="monotone" dataKey="elevation" stroke="#8884d8" fill="url(#colorEle)" strokeWidth={1} />
            {/* Highlight selected segment area */}
            <ReferenceArea
              x1={chartData[startIndex]?.distanceKm}
              x2={chartData[endIndex]?.distanceKm}
              fill="#1A73E8"
              fillOpacity={0.25}
            />
            <defs>
              <linearGradient id="colorEle" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8884d8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8884d8" stopOpacity={0.0} />
              </linearGradient>
            </defs>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Dual Range Trimming Slider Controls */}
      <div className="slider-controls-wrapper">
        <div className="slider-labels">
          <span>Start Point: {(points[startIndex]?.distance / 1000).toFixed(2)} km</span>
          <span>Finish Point: {(points[endIndex]?.distance / 1000).toFixed(2)} km</span>
        </div>
        
        <div className="dual-slider-container">
          <input
            type="range"
            min="0"
            max={points.length - 1}
            value={startIndex}
            onChange={handleStartChange}
            className="thumb thumb--left"
            style={{ zIndex: startIndex > points.length / 2 ? "5" : "3" }}
          />
          <input
            type="range"
            min="0"
            max={points.length - 1}
            value={endIndex}
            onChange={handleEndChange}
            className="thumb thumb--right"
            style={{ zIndex: "4" }}
          />
          <div className="slider-track" />
          <div
            className="slider-range-highlight"
            style={{
              left: `${(startIndex / (points.length - 1)) * 100}%`,
              width: `${((endIndex - startIndex) / (points.length - 1)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
};
