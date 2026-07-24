import React, { useState } from "react";
import { TROPHY_REGISTRY } from "../utils/trophyEngine";
import type { UnlockedTrophy } from "../types/trophy";

interface TrophyRoomProps {
  unlockedTrophies: UnlockedTrophy[];
}

export const TrophyRoom: React.FC<TrophyRoomProps> = ({ unlockedTrophies }) => {
  const [selectedCat, setSelectedCat] = useState<string>("all");

  const unlockedMap = new Map<string, UnlockedTrophy>();
  unlockedTrophies.forEach((u) => unlockedMap.set(u.trophyId, u));

  const totalCount = TROPHY_REGISTRY.length;
  const unlockedCount = unlockedMap.size;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);

  const filteredTrophies = TROPHY_REGISTRY.filter((t) => {
    if (selectedCat === "all") return true;
    return t.category === selectedCat;
  });

  return (
    <div className="trophy-room-container">
      {/* Header & Progress Card */}
      <div className="trophy-room-header card">
        <div className="trophy-header-info">
          <h2>🎖️ 나의 훈장 수집함</h2>
          <p>열심히 주행하여 달성한 모든 영예로운 훈장과 격려 메시지를 한눈에 확인하세요.</p>
        </div>

        <div className="trophy-progress-box">
          <div className="progress-labels">
            <span className="progress-text">훈장 수집 현황</span>
            <span className="progress-value">
              <strong>{unlockedCount}</strong> / {totalCount}개 ({progressPercent}%)
            </span>
          </div>
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="trophy-filter-tabs">
        <button
          className={`filter-btn ${selectedCat === "all" ? "active" : ""}`}
          onClick={() => setSelectedCat("all")}
        >
          전체 보기 ({totalCount})
        </button>
        <button
          className={`filter-btn ${selectedCat === "streak" ? "active" : ""}`}
          onClick={() => setSelectedCat("streak")}
        >
          🔥 연속 주행
        </button>
        <button
          className={`filter-btn ${selectedCat === "improvement" ? "active" : ""}`}
          onClick={() => setSelectedCat("improvement")}
        >
          ⏱️ 기록 단축
        </button>
        <button
          className={`filter-btn ${selectedCat === "volume" ? "active" : ""}`}
          onClick={() => setSelectedCat("volume")}
        >
          🎯 완주 누적
        </button>
        <button
          className={`filter-btn ${selectedCat === "rank" ? "active" : ""}`}
          onClick={() => setSelectedCat("rank")}
        >
          👑 순위 & PR
        </button>
        <button
          className={`filter-btn ${selectedCat === "speed" ? "active" : ""}`}
          onClick={() => setSelectedCat("speed")}
        >
          🚄 속도 & 퍼포먼스
        </button>
        <button
          className={`filter-btn ${selectedCat === "time" ? "active" : ""}`}
          onClick={() => setSelectedCat("time")}
        >
          🌙 시각 & 요일
        </button>
      </div>

      {/* Trophy Grid */}
      <div className="trophy-grid">
        {filteredTrophies.map((t) => {
          const unlockedInfo = unlockedMap.get(t.id);
          const isUnlocked = !!unlockedInfo;

          return (
            <div
              key={t.id}
              className={`trophy-room-card ${isUnlocked ? "unlocked" : "locked"}`}
              style={{
                borderColor: isUnlocked ? t.badgeColor : "#E6E6EB",
                backgroundColor: isUnlocked ? t.badgeBg : "#FAFAFC",
              }}
            >
              <div
                className="trophy-room-icon"
                style={{
                  backgroundColor: isUnlocked ? t.badgeColor : "#E0E0E6",
                  color: isUnlocked ? "#FFF" : "#A0A0AA",
                }}
              >
                {isUnlocked ? t.icon : "🔒"}
              </div>

              <div className="trophy-room-details">
                <div className="trophy-room-title-row">
                  <span className="trophy-room-title" style={{ color: isUnlocked ? t.badgeColor : "#888" }}>
                    {t.title}
                  </span>
                  <span className="trophy-room-tier">{t.tier.toUpperCase()}</span>
                </div>

                <div className="trophy-room-desc">{t.description}</div>

                {isUnlocked ? (
                  <div className="trophy-room-praise">
                    💬 "{t.praiseMessage}"
                    <div className="trophy-room-date">
                      달성일: {unlockedInfo.unlockedAt} ({unlockedInfo.segmentName})
                    </div>
                  </div>
                ) : (
                  <div className="trophy-room-locked-text">
                    🔒 아직 달성하지 못한 훈장입니다.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
