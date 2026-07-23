import React, { useState, useEffect } from "react";
import { parseGPX, generateGPX } from "./utils/gpxParser";
import type { GPXData } from "./utils/gpxParser";
import { detectClimbs } from "./utils/hillDetector";
import type { ClimbCandidate } from "./utils/hillDetector";
import { useGoogleDrive } from "./hooks/useGoogleDrive";
import { MapView } from "./components/MapView";
import { ChartView } from "./components/ChartView";

export default function App() {
  const {
    accessToken,
    clientId,
    userEmail,
    loading,
    catalog,
    setClientId,
    login,
    logout,
    saveSegment,
  } = useGoogleDrive();

  const [gpxData, setGpxData] = useState<GPXData | null>(null);
  const [startIndex, setStartIndex] = useState<number>(0);
  const [endIndex, setEndIndex] = useState<number>(0);
  const [segmentName, setSegmentName] = useState<string>("");
  const [detectedClimbs, setDetectedClimbs] = useState<ClimbCandidate[]>([]);
  const [selectedClimbIdx, setSelectedClimbIdx] = useState<number>(-1);
  const [showSettings, setShowSettings] = useState<boolean>(!localStorage.getItem("gdrive_client_id"));
  const [tempClientId, setTempClientId] = useState<string>(clientId);

  // Sync client ID
  useEffect(() => {
    setTempClientId(clientId);
  }, [clientId]);

  // Handle GPX file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const parsed = parseGPX(text);
        if (parsed.points.length < 2) {
          alert("Invalid GPX: File must contain at least 2 points.");
          return;
        }
        setGpxData(parsed);
        setStartIndex(0);
        setEndIndex(parsed.points.length - 1);
        setSegmentName(parsed.name);

        // Run auto-detect climbs
        const climbs = detectClimbs(parsed.points);
        setDetectedClimbs(climbs);
        setSelectedClimbIdx(-1);
      } catch (err) {
        alert("Failed to parse GPX file. Make sure it's valid XML.");
      }
    };
    reader.readAsText(file);
  };

  const handleTrimChange = (start: number, end: number) => {
    setStartIndex(start);
    setEndIndex(end);
    setSelectedClimbIdx(-1); // Deselect preset if user manually adjusts
  };

  const applyPresetClimb = (climb: ClimbCandidate, idx: number) => {
    setStartIndex(climb.startIndex);
    setEndIndex(climb.endIndex);
    setSelectedClimbIdx(idx);
    setSegmentName(`${gpxData?.name || "Climb"} - Climb ${idx + 1}`);
  };

  const handleSaveSettings = () => {
    setClientId(tempClientId);
    setShowSettings(false);
    alert("Client ID saved. Please log in again to apply changes.");
    logout();
  };

  // Calculate current segment stats
  const getSegmentStats = () => {
    if (!gpxData || gpxData.points.length === 0) return { distance: 0, gain: 0, grade: 0 };
    const startPt = gpxData.points[startIndex];
    const endPt = gpxData.points[endIndex];
    const distance = endPt.distance - startPt.distance;
    const gain = Math.max(0, endPt.ele - startPt.ele);
    const grade = distance > 0 ? (gain / distance) * 100 : 0;
    return { distance, gain, grade };
  };

  const { distance, gain, grade } = getSegmentStats();

  const handleUploadToDrive = async () => {
    if (!gpxData) return;
    if (!segmentName.trim()) {
      alert("Please enter a segment name.");
      return;
    }

    const trimmedPoints = gpxData.points.slice(startIndex, endIndex + 1);
    const gpxXml = generateGPX(segmentName, trimmedPoints);

    const startPt = trimmedPoints[0];
    const endPt = trimmedPoints[trimmedPoints.length - 1];

    const success = await saveSegment(segmentName, gpxXml, {
      distanceMeters: parseFloat(distance.toFixed(1)),
      elevationGainMeters: parseFloat(gain.toFixed(1)),
      avgGradePercent: parseFloat(grade.toFixed(1)),
      startCoords: [startPt.lat, startPt.lon],
      endCoords: [endPt.lat, endPt.lon],
    });

    if (success) {
      alert("🎉 Segment successfully saved to Google Drive and catalog updated!");
    }
  };

  return (
    <div className="app-container">
      {/* 1. Header Toolbar */}
      <header className="app-header">
        <div className="header-logo">
          <span className="logo-icon">🏆</span>
          <h1>Leaderboard Segment Manager</h1>
        </div>
        <div className="header-actions">
          {accessToken ? (
            <div className="user-profile">
              <span className="user-email">{userEmail || "Connected"}</span>
              <button className="btn btn-secondary btn-sm" onClick={logout}>
                Logout
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={login}>
              Sign In with Google
            </button>
          )}
          <button className="btn-icon" onClick={() => setShowSettings(!showSettings)} title="Settings">
            ⚙️
          </button>
        </div>
      </header>

      {/* 2. Main Content Grid */}
      <main className="app-main">
        {/* Settings Overlay / Modal Panel */}
        {showSettings && (
          <div className="settings-modal">
            <div className="settings-card">
              <h3>Google API Configuration</h3>
              <p className="settings-guide">
                Configure your own Google Client ID. Create one in the{" "}
                <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">
                  Google Cloud Console
                </a>{" "}
                with Google Drive API enabled.
              </p>
              <div className="form-group">
                <label>OAuth Client ID</label>
                <input
                  type="text"
                  placeholder="Paste your Client ID here"
                  value={tempClientId}
                  onChange={(e) => setTempClientId(e.target.value)}
                />
              </div>
              <div className="settings-buttons">
                <button className="btn btn-primary" onClick={handleSaveSettings}>
                  Save Settings
                </button>
                <button className="btn btn-secondary" onClick={() => setShowSettings(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="main-grid">
          {/* Left Column: GPX Upload & Map */}
          <div className="grid-col left-col">
            <div className="card upload-card">
              <h3>Upload GPX Route File</h3>
              <div className="file-drop-zone">
                <input type="file" accept=".gpx" onChange={handleFileUpload} id="gpx-file-input" />
                <label htmlFor="gpx-file-input">
                  <span className="upload-icon">📂</span>
                  <strong>Choose a GPX file</strong> or drag it here
                </label>
              </div>
            </div>

            {gpxData && (
              <div className="card map-card">
                <h3>Route Map</h3>
                <div className="map-view-wrapper">
                  <MapView points={gpxData.points} startIndex={startIndex} endIndex={endIndex} />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Trimming Chart, Hill Analyzer, Drive Upload */}
          <div className="grid-col right-col">
            {gpxData ? (
              <>
                {/* Trimming Chart */}
                <div className="card chart-card">
                  <h3>Elevation Profile (Trim Segment)</h3>
                  <ChartView
                    points={gpxData.points}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    onTrimChange={handleTrimChange}
                  />
                  <div className="segment-metrics">
                    <div className="metric-box">
                      <span className="metric-val">{(distance / 1000).toFixed(2)} km</span>
                      <span className="metric-lbl">Distance</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-val">{gain.toFixed(0)} m</span>
                      <span className="metric-lbl">Elevation Gain</span>
                    </div>
                    <div className="metric-box">
                      <span className="metric-val">{grade.toFixed(1)}%</span>
                      <span className="metric-lbl">Avg Slope</span>
                    </div>
                  </div>
                </div>

                {/* Auto Detected Climbs List */}
                <div className="card climbs-card">
                  <h3>Auto-Detected Hills</h3>
                  {detectedClimbs.length > 0 ? (
                    <div className="climbs-list">
                      {detectedClimbs.map((climb, idx) => (
                        <div
                          key={idx}
                          className={`climb-item ${selectedClimbIdx === idx ? "active" : ""}`}
                          onClick={() => applyPresetClimb(climb, idx)}
                        >
                          <div className="climb-info">
                            <span className="climb-name">⛰️ Climb {idx + 1}</span>
                            <span className="climb-stats">
                              {(climb.distance / 1000).toFixed(2)} km, {climb.elevationGain.toFixed(0)}m Gain,{" "}
                              {climb.avgGrade.toFixed(1)}% Grade
                            </span>
                          </div>
                          <span className="climb-arrow">→</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-climbs-message">
                      No significant uphill climbs detected in this route. Adjust sliders manually.
                    </div>
                  )}
                </div>

                {/* Save segment to Drive */}
                <div className="card save-card">
                  <h3>Register Segment to Google Drive</h3>
                  <div className="form-group">
                    <label>Segment Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Namsan Uphill"
                      value={segmentName}
                      onChange={(e) => setSegmentName(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary btn-block btn-lg"
                    onClick={handleUploadToDrive}
                    disabled={loading || !accessToken}
                  >
                    {loading ? "Uploading..." : "Save to Google Drive"}
                  </button>
                  {!accessToken && (
                    <p className="login-warning">Please sign in with Google to enable Drive uploads.</p>
                  )}
                </div>
              </>
            ) : (
              <div className="card welcome-card">
                <h3>Welcome to Segment Manager</h3>
                <p>
                  To get started, upload a GPX ride track on the left panel. The app will automatically analyze
                  the elevation data to suggest climbs, and allow you to trim it and upload directly to Google Drive.
                </p>
                <div className="features-list">
                  <div className="feature-item">
                    <span>⛰️</span>
                    <strong>Automatic Hill Extraction:</strong> Instantly finds climbs from Valley-to-Summit.
                  </div>
                  <div className="feature-item">
                    <span>✂️</span>
                    <strong>Precise Trimming:</strong> Adjust start/end markers on the interactive elevation profile.
                  </div>
                  <div className="feature-item">
                    <span>☁️</span>
                    <strong>Google Drive Sync:</strong> Saves directly to cloud for auto-syncing with OsmAnd Leaderboard.
                  </div>
                </div>
              </div>
            )}

            {/* List of segments currently in Drive */}
            {accessToken && catalog.segments.length > 0 && (
              <div className="card catalog-card">
                <h3>Segments in Google Drive ({catalog.segments.length})</h3>
                <div className="catalog-list">
                  {catalog.segments.map((seg, idx) => (
                    <div key={idx} className="catalog-item">
                      <div className="catalog-info">
                        <span className="catalog-name">{seg.name}</span>
                        <span className="catalog-stats">
                          {(seg.distanceMeters / 1000).toFixed(2)} km, {seg.elevationGainMeters}m Gain,{" "}
                          {seg.avgGradePercent}% Avg
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
