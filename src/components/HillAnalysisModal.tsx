import React, { useState } from "react";
import type { CatalogSegment } from "../hooks/useGoogleDrive";

interface HillAnalysisModalProps {
  segment: CatalogSegment;
  onClose: () => void;
  onSaveStageMessages: (segmentId: string, messages: string[]) => void;
}

export const HillAnalysisModal: React.FC<HillAnalysisModalProps> = ({
  segment,
  onClose,
  onSaveStageMessages,
}) => {
  // Generate 10 default messages based on avg grade or existing stageMessages
  const getDefaultMessages = (): string[] => {
    if (segment.stageMessages && segment.stageMessages.length === 10) {
      return [...segment.stageMessages];
    }
    return [
      `🔥 [${segment.name}] 출발! 페이스 조절하고 시원하게 올라갑시다!`,
      `🚴‍♂️ 10% 돌파! 가볍게 케이던스 80+ 유지하세요!`,
      `💪 20% 지점! 호흡 다듬고 페이스 업!`,
      `⚡ 30% 지점! 경사도 업! 케이던스 킵하고 허벅지에 힘 집중!`,
      `🚴‍♂️ 40% 도달! 1등 기록과 팽팽한 대결 중!`,
      `🏔️ 50% 절반 통과! 딱 절반 왔습니다. 조금만 더 힘내세요!`,
      `🔥 60% 지점! 피치 올려서 계속 밀어붙이세요!`,
      `⚡ 70% 돌파! 고지가 멀지 않았습니다. 케이던스 킵!`,
      `💨 80% 지점! 정상이 코앞입니다! 라스트 스퍼트 준비!`,
      `🏁 90% 진입! 라스트 스퍼트!! 모든 힘을 쏟아부으세요!! 🔥`,
    ];
  };

  const [messages, setMessages] = useState<string[]>(getDefaultMessages());

  // Generate 10 estimated slopes based on overall average grade
  const generateSlopes = () => {
    const base = segment.avgGradePercent;
    return Array.from({ length: 10 }, (_, i) => {
      const variation = Math.sin((i / 10) * Math.PI) * 2.5;
      return Math.max(0.5, parseFloat((base + variation).toFixed(1)));
    });
  };

  const slopes = generateSlopes();

  const handleMessageChange = (index: number, val: string) => {
    const next = [...messages];
    next[index] = val;
    setMessages(next);
  };

  const handleAutoGenerateAI = () => {
    const aiMsgs = slopes.map((grade, idx) => {
      const stepPct = (idx + 1) * 10;
      if (idx === 0) return `🔥 [${segment.name}] 출발! 경사도 ${grade}% 구간 진입. 페이스를 다듬으세요!`;
      if (idx === 4) return `🏔️ 50% 절반 통과! 경사도 ${grade}%. 조금만 더 집중하세요!`;
      if (idx === 8) return `💨 80% 지점! 경사도 ${grade}%. 정상이 눈앞입니다! 스퍼트 준비!`;
      if (idx === 9) return `🏁 90% 라스트 스퍼트!! 경사도 ${grade}%. 남은 케이던스 올아웃!! 🔥`;

      if (grade >= 8) {
        return `⚠️ ${stepPct}% 지점! 경사도 ${grade}% 급경사 벽! 댄싱으로 체중 실어 돌파하세요!`;
      } else if (grade >= 5) {
        return `⚡ ${stepPct}% 지점! 경사도 ${grade}% 오르막. 케이던스 80+ 호흡 유지!`;
      } else {
        return `🚴‍♂️ ${stepPct}% 지점! 경사도 ${grade}% 완경사. 스피드 올리고 페이스 킵!`;
      }
    });
    setMessages(aiMsgs);
  };

  const handleSave = () => {
    onSaveStageMessages(segment.id, messages);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        style={{
          backgroundColor: "#18181C",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          border: "1px solid #2C2C35",
          boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
          color: "#FFF",
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid #2C2C35",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", color: "#FEE500" }}>
              ⛰️ 언덕 10단계 구간 분석 & 트레이너 코칭
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#A0A0AA" }}>
              {segment.name} ({segment.distanceMeters}m | 평균 경사도 {segment.avgGradePercent}%)
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "#8E8E93",
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <span style={{ fontSize: "13px", color: "#BBB" }}>
              📊 구간별 경사도 프로필 및 카카오톡 AI 말풍선 메시지
            </span>
            <button
              onClick={handleAutoGenerateAI}
              style={{
                backgroundColor: "#2A2A35",
                color: "#FEE500",
                border: "1px solid #444455",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              ✨ 경사도 기반 AI 말풍선 자동생성
            </button>
          </div>

          {/* 10 Stage List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {messages.map((msg, idx) => {
              const grade = slopes[idx];
              const badgeColor =
                grade >= 8 ? "#FF3B30" : grade >= 5 ? "#FF9500" : "#34C759";

              return (
                <div
                  key={idx}
                  style={{
                    backgroundColor: "#22222A",
                    padding: "12px",
                    borderRadius: "10px",
                    border: "1px solid #333340",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: "8px",
                    }}
                  >
                    <span style={{ fontSize: "13px", fontWeight: "bold", color: "#FEE500" }}>
                      Stage {idx + 1} ({idx * 10}% ~ {(idx + 1) * 10}%)
                    </span>
                    <span
                      style={{
                        backgroundColor: badgeColor,
                        color: "#FFF",
                        fontSize: "11px",
                        fontWeight: "bold",
                        padding: "2px 8px",
                        borderRadius: "12px",
                      }}
                    >
                      경사도 {grade}%
                    </span>
                  </div>
                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => handleMessageChange(idx, e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "#16161C",
                      border: "1px solid #444452",
                      borderRadius: "6px",
                      padding: "8px 10px",
                      color: "#FFF",
                      fontSize: "13px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #2C2C35",
            display: "flex",
            justifyContent: "flex-end",
            gap: "10px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2A2A35",
              color: "#BBB",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 20px",
              backgroundColor: "#FC6100",
              color: "#FFF",
              border: "none",
              borderRadius: "8px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            💾 저장 및 구글 드라이브 동기화
          </button>
        </div>
      </div>
    </div>
  );
};
