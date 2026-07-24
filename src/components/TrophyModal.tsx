import React from "react";
import type { TrophyDefinition } from "../types/trophy";

interface TrophyModalProps {
  trophies: TrophyDefinition[];
  onClose: () => void;
  onViewTrophies: () => void;
}

export const TrophyModal: React.FC<TrophyModalProps> = ({ trophies, onClose, onViewTrophies }) => {
  if (!trophies || trophies.length === 0) return null;

  return (
    <div className="trophy-modal-backdrop" onClick={onClose}>
      <div className="trophy-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header Confetti & Title */}
        <div className="trophy-modal-header">
          <div className="trophy-modal-icon-badge">🎖️</div>
          <h2>축하합니다! 훈장 달성!</h2>
          <p className="trophy-modal-subtitle">
            이번 주행으로 <strong>{trophies.length}개</strong>의 영예로운 훈장/트로피를 달성했습니다!
          </p>
        </div>

        {/* Medal Ribbon Strip ("훈장 붙듯 주르륵!") */}
        <div className="trophy-medal-strip">
          {trophies.map((t, idx) => (
            <div
              key={t.id}
              className="medal-badge-card"
              style={{
                borderColor: t.badgeColor,
                backgroundColor: t.badgeBg,
                animationDelay: `${idx * 0.15}s`,
              }}
            >
              <div
                className="medal-badge-icon"
                style={{ backgroundColor: t.badgeColor }}
              >
                {t.icon}
              </div>
              <div className="medal-badge-info">
                <div className="medal-badge-header">
                  <span className="medal-badge-title" style={{ color: t.badgeColor }}>
                    {t.title}
                  </span>
                  <span className="medal-badge-tier">{t.tier.toUpperCase()}</span>
                </div>
                <div className="medal-badge-desc">{t.description}</div>
                <div className="medal-badge-praise">
                  💬 "{t.praiseMessage}"
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="trophy-modal-actions">
          <button className="btn btn-secondary btn-sm" onClick={onViewTrophies}>
            🏆 나의 훈장 수집함으로 이동
          </button>
          <button className="btn btn-primary btn-sm" onClick={onClose}>
            멋집니다! 확인
          </button>
        </div>
      </div>
    </div>
  );
};
