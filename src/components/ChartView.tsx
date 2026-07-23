import React, { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceArea } from "recharts";
import type { GPXPoint } from "../utils/gpxParser";

interface ChartViewProps {
  points: GPXPoint[];
  startIndex: number;
  endIndex: number;
  onTrimChange: (start: number, end: number) => void;
}

export const ChartView: React.FC<ChartViewProps> = ({ points, startIndex, endIndex, onTrimChange }) => {
  const [isZoomed, setIsZoomed] = useState<boolean>(true);

  if (points.length === 0) {
    return (
      <div className="empty-chart-placeholder">
        Upload a GPX file to view the elevation profile.
      </div>
    );
  }

  // Calculate zoom range
  const bufferCount = Math.max(10, Math.floor(points.length * 0.05)); // 5% buffer
  const zoomStart = isZoomed ? Math.max(0, startIndex - bufferCount) : 0;
  const zoomEnd = isZoomed ? Math.min(points.length - 1, endIndex + bufferCount) : points.length - 1;

  // Slice points for chart rendering
  const visiblePoints = points.slice(zoomStart, zoomEnd + 1);

  // Format data for Recharts
  const chartData = visiblePoints.map((p, idx) => {
    const originalIdx = zoomStart + idx;
    return {
      index: originalIdx,
      distanceKm: (p.distance / 1000).toFixed(2),
      elevation: parseFloat(p.ele.toFixed(1)),
    };
  });

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

  // Fine-tuning handlers (+/- 1 index shift)
  const adjustStart = (amount: number) => {
    const newStart = Math.max(0, Math.min(endIndex - 1, startIndex + amount));
    onTrimChange(newStart, endIndex);
  };

  const adjustEnd = (amount: number) => {
    const newEnd = Math.max(startIndex + 1, Math.min(points.length - 1, endIndex + amount));
    onTrimChange(startIndex, newEnd);
  };

  const visibleElevations = visiblePoints.map((p) => p.ele);
  const minElevation = Math.floor(Math.min(...visibleElevations) - 5);
  const maxElevation = Math.ceil(Math.max(...visibleElevations) + 5);

  return (
    <div className="chart-view-container">
      {/* Zoom Toggle Options */}
      <div className="chart-options-bar">
        <label className="zoom-toggle-label">
          <input
            type="checkbox"
            checked={isZoomed}
            onChange={(e) => setIsZoomed(e.target.checked)}
          />
          <span className="zoom-label-text">🔍 Zoom to Selected Segment (구간 확대 보기)</span>
        </label>
      </div>

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
              x1={points[startIndex]?.distance ? (points[startIndex].distance / 1000).toFixed(2) : undefined}
              x2={points[endIndex]?.distance ? (points[endIndex].distance / 1000).toFixed(2) : undefined}
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
        <div className="dual-slider-container">
          <input
            type="range"
            min={zoomStart}
            max={zoomEnd}
            value={startIndex}
            onChange={handleStartChange}
            className="thumb thumb--left"
            style={{ zIndex: startIndex > (zoomStart + zoomEnd) / 2 ? "5" : "3" }}
          />
          <input
            type="range"
            min={zoomStart}
            max={zoomEnd}
            value={endIndex}
            onChange={handleEndChange}
            className="thumb thumb--right"
            style={{ zIndex: "4" }}
          />
          <div className="slider-track" />
          <div
            className="slider-range-highlight"
            style={{
              left: `${((startIndex - zoomStart) / (zoomEnd - zoomStart)) * 100}%`,
              width: `${((endIndex - startIndex) / (zoomEnd - zoomStart)) * 100}%`,
            }}
          />
        </div>

        {/* Fine-tuning buttons for absolute precision */}
        <div className="fine-tuning-container">
          <div className="fine-tuning-group">
            <span className="tune-label">Start (시작선)</span>
            <div className="tune-buttons">
              <button className="btn btn-secondary btn-sm" onClick={() => adjustStart(-1)}>◀ -10m</button>
              <span className="tune-value">{(points[startIndex]?.distance / 1000).toFixed(3)} km</span>
              <button className="btn btn-secondary btn-sm" onClick={() => adjustStart(1)}>+10m ▶</button>
            </div>
          </div>

          <div className="fine-tuning-group">
            <span className="tune-label">Finish (종료선)</span>
            <div className="tune-buttons">
              <button className="btn btn-secondary btn-sm" onClick={() => adjustEnd(-1)}>◀ -10m</button>
              <span className="tune-value">{(points[endIndex]?.distance / 1000).toFixed(3)} km</span>
              <button className="btn btn-secondary btn-sm" onClick={() => adjustEnd(1)}>+10m ▶</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
