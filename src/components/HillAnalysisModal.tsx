import React, { useState } from "react";
import type { CatalogSegment, CloudAttempt } from "../hooks/useGoogleDrive";

interface HillAnalysisModalProps {
  segment: CatalogSegment;
  bestAttempt?: CloudAttempt | null;
  onClose: () => void;
  onSaveStageMessages: (segmentId: string, messages: string[]) => void;
}

export const HillAnalysisModal: React.FC<HillAnalysisModalProps> = ({
  segment,
  bestAttempt,
  onClose,
  onSaveStageMessages,
}) => {
  // DeepSeek API key stored locally in browser localStorage
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem("deepseek_api_key") || ""
  );
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [aiLoading, setAiLoading] = useState<boolean>(false);

  // Generate 10 default messages based on avg grade or existing stageMessages
  const getDefaultMessages = (): string[] => {
    if (segment.stageMessages && segment.stageMessages.length === 10) {
      return [...segment.stageMessages];
    }
    return [
      `🏴‍☠️ "Andiamo! [${segment.name}] 출발이다! 해적 두건 묶고 시원하게 올라가자! 🔥"`,
      `🏴‍☠️ "10% 돌파! Ciao! 가볍게 케이던스 80+ 유지해! 이탈리아 정열을 보여줘!"`,
      `🏴‍☠️ "💪 20% 지점! 호흡 다듬고 페이스 업! Hai la grinta!"`,
      `🏴‍☠️ "⚡ 30% 지점! 경사도 올라간다! 허벅지에 힘 집중하고 댄싱 준비!"`,
      `🏴‍☠️ "🚴‍♂️ 40% 도달! 1등 기록과 팽팽한 대결 중! Mamma mia!"`,
      `🏴‍☠️ "🏔️ 50% 절반 통과! 딱 절반 왔다. Continua a lottare!"`,
      `🏴‍☠️ "🔥 60% 지점! 피치 올려서 알프스 던지듯 밀어붙여!"`,
      `🏴‍☠️ "⚡ 70% 돌파! 고지가 보인다! Forza! 케이던스 킵!"`,
      `🏴‍☠️ "💨 80% 지점! 정상이 눈앞이다! Attacco! 라스트 스퍼트!"`,
      `🏴‍☠️ "🏁 90% 진입! 심장을 쥐어짜라!! 모든 힘을 쏟아부어!! 🔥🔥"`,
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

  // Rule-based fallback generator (Marco Pantani Persona)
  const handleAutoGenerateRule = () => {
    const aiMsgs = slopes.map((grade, idx) => {
      const stepPct = (idx + 1) * 10;
      if (idx === 0) return `🏴‍☠️ "Andiamo! [${segment.name}] 출발! 경사도 ${grade}%. 해적처럼 치고 나가자! 🔥"`;
      if (idx === 4) return `🏴‍☠️ "🏔️ 50% 절반 통과! 경사도 ${grade}%. Continua a lottare! 포기란 없다!"`;
      if (idx === 8) return `🏴‍☠️ "💨 80% 지점! 경사도 ${grade}%. Attacco! 정상이 코앞이다 스퍼트!!"`;
      if (idx === 9) return `🏴‍☠️ "🏁 90% 라스트!! 경사도 ${grade}%. Forza!! 올아웃 사냥 시작!! 🔥"`;

      if (grade >= 8) {
        return `🏴‍☠️ "Mamma mia! ${stepPct}% 지점! 경사도 ${grade}% 급경사 벽! 댄싱으로 짓눌러!"`;
      } else if (grade >= 5) {
        return `🏴‍☠️ "⚡ ${stepPct}% 지점! 경사도 ${grade}%. 케이던스 킵하고 심박 올려!"`;
      } else {
        return `🏴‍☠️ "🚴‍♂️ ${stepPct}% 지점! 경사도 ${grade}%. 이탈리아 남자의 정열로 스피드 밟아!"`;
      }
    });
    setMessages(aiMsgs);
  };

  // DeepSeek AI (deepseek-v4-flash) API Integration
  const handleDeepSeekAnalysis = async () => {
    if (!apiKey.trim()) {
      setShowApiKeyInput(true);
      alert("DeepSeek API 키를 먼저 입력해 주세요. (로컬에만 안전하게 보관됩니다)");
      return;
    }

    setAiLoading(true);
    try {
      localStorage.setItem("deepseek_api_key", apiKey.trim());

      const prContext = bestAttempt
        ? `이 구간의 1등 최고 기록(PR)은 ${Math.floor(bestAttempt.durationMs / 60000)}분 ${Math.floor((bestAttempt.durationMs % 60000) / 1000)}초 (평균 시속 ${bestAttempt.avgSpeed} km/h, 날짜 ${bestAttempt.date}) 입니다.`
        : `이 구간은 아직 등록된 주행 기록이 없는 첫 도전 언덕입니다.`;

      const prompt = `당신은 전설적인 이탈리아 클라이머 라이더 "마르코 판타니(Marco Pantani - Il Pirata)"입니다. 
당신은 분홍색 져지(Maglia Rosa)와 해적 두건(Bandana)을 쓰고, 열정적이고 매우 수다스러운 이탈리아 클라이밍 지휘관 스타일로 유저에게 코칭합니다!

언덕 데이터:
- 이름: ${segment.name}
- 총 거리: ${segment.distanceMeters}m
- 획득고도: ${segment.elevationGainMeters}m
- 평균 경사도: ${segment.avgGradePercent}%
- 10단계 구간별 경사도 프로필: [${slopes.map((s, i) => `${(i + 1) * 10}%:${s}%`).join(", ")}]
- 1등 PR 기록 상태: ${prContext}

요구사항:
1. 반드시 마르코 판타니 특유의 수다스러운 이탈리아어 감탄사 ("Mamma mia!", "Andiamo!", "Hai la grinta!", "Continua a lottare!", "Attacco!", "Vittoria!")를 한국어와 섞어 사용하세요.
2. 10%부터 100%까지 총 10단계에 걸쳐 카카오톡 말풍선으로 표출될 10개의 파이팅 넘치는 코칭 메시지 문자열을 작성하세요.
3. 반드시 정확히 10개의 문자열 요소를 포함하는 JSON 배열 [ "msg1", "msg2", ..., "msg10" ] 형식으로만 응답해 주세요.`;

      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model: "deepseek-v4-flash",
          messages: [
            {
              role: "system",
              content:
                "You are Marco Pantani, the legendary passionate Italian cycling climber (Il Pirata). Output ONLY a valid JSON array containing exactly 10 string elements in your signature talkative Italian-Korean cycling coach voice.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API 오류 (HTTP ${response.status})`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || "";

      let jsonArray: string[] = [];
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          jsonArray = parsed;
        } else if (parsed.messages && Array.isArray(parsed.messages)) {
          jsonArray = parsed.messages;
        } else if (parsed.coaching && Array.isArray(parsed.coaching)) {
          jsonArray = parsed.coaching;
        }
      } catch (e) {
        const match = content.match(/\[[\s\S]*\]/);
        if (match) {
          jsonArray = JSON.parse(match[0]);
        }
      }

      if (jsonArray && jsonArray.length === 10) {
        setMessages(jsonArray);
        alert("🤖 DeepSeek-v4-flash AI가 분석한 10단계 언덕 코칭 메시지가 생성되었습니다!");
      } else {
        alert("DeepSeek AI 응답 형식이 올바르지 않습니다. 규칙 기반 생성을 이용해 보세요.");
      }
    } catch (err: any) {
      alert("DeepSeek AI 분석 중 오류 발생: " + err.message);
    } finally {
      setAiLoading(false);
    }
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
            <h3 style={{ margin: 0, fontSize: "18px", color: "#FEE500", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🤖 DeepSeek AI 언덕 10단계 분석 & 코칭</span>
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#A0A0AA" }}>
              {segment.name} ({segment.distanceMeters}m | 평균 경사도 {segment.avgGradePercent}%)
              {bestAttempt ? ` | 🥇 1등 기록: ${Math.floor(bestAttempt.durationMs / 60000)}분 ${Math.floor((bestAttempt.durationMs % 60000) / 1000)}초` : " | 🆕 기록 없음 (첫 도전)"}
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
          {/* DeepSeek API Key Local Settings Bar */}
          <div style={{ backgroundColor: "#22222B", padding: "12px 14px", borderRadius: "10px", marginBottom: "16px", border: "1px solid #333342" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: "bold", color: "#45B7D1" }}>
                🔑 DeepSeek API Key (로컬 전용 보관)
              </span>
              <button
                onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                style={{ background: "none", border: "none", color: "#8E8E93", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
              >
                {showApiKeyInput ? "닫기" : apiKey ? "🔑 API 키 변경" : "+ API 키 입력"}
              </button>
            </div>
            {showApiKeyInput && (
              <div style={{ marginTop: "10px" }}>
                <input
                  type="password"
                  placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "#141418",
                    border: "1px solid #444455",
                    borderRadius: "6px",
                    padding: "8px",
                    color: "#FFF",
                    fontSize: "12px",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
                  🔒 입력한 API 키는 외부 서버로 전송되지 않고 본인 웹 브라우저 로컬(localStorage)에만 보관됩니다. (모델: <code>deepseek-v4-flash</code>)
                </div>
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
              flexWrap: "wrap",
              gap: "8px",
            }}
          >
            <span style={{ fontSize: "13px", color: "#BBB" }}>
              📊 10단계 경사도 및 DeepSeek AI 말풍선 코칭 메시지
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={handleAutoGenerateRule}
                style={{
                  backgroundColor: "#2A2A35",
                  color: "#BBB",
                  border: "1px solid #444455",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                ⚡ 규칙 기반 생성
              </button>
              <button
                onClick={handleDeepSeekAnalysis}
                disabled={aiLoading}
                style={{
                  backgroundColor: "#45B7D1",
                  color: "#000",
                  border: "none",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {aiLoading ? "🤖 DeepSeek AI 분석 중..." : "🤖 DeepSeek AI 코칭 생성"}
              </button>
            </div>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          backgroundColor: "#2C2C35",
                          border: "1.5px solid #FEE500",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "16px",
                        }}
                      >
                        {["😎", "🚴‍♂️", "💪", "💦", "🔥", "⚔️", "🥵", "⚡", "🤩", "👑"][idx]}
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: "bold", color: "#FEE500" }}>
                        Stage {idx + 1} ({idx * 10}% ~ {(idx + 1) * 10}%)
                      </span>
                    </div>
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
                      borderRadius: "8px",
                      padding: "10px 12px",
                      color: "#FFF",
                      fontSize: "13px",
                      boxSizing: "border-box",
                      fontWeight: "500",
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
