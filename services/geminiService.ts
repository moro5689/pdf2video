
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { pcmToWav } from "./audioUtils.ts";
import { VideoMetadata } from "../types.ts";

const getApiKey = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    // NOTE: 本番環境ではAPIキーは必ずサーバー側または安全なストレージで管理してください。
    throw new Error(
      "Gemini APIキーが設定されていません。.env.local に VITE_GEMINI_API_KEY=... を設定してから再度お試しください。",
    );
  }
  return apiKey;
};

// Helper to resize image for AI consumption (reduces payload size significantly)
const resizeImageForAI = async (blob: Blob, maxWidth = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas context not available"));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to low-quality JPEG for AI analysis (efficient)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      URL.revokeObjectURL(url);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
};

export const generateScripts = async (imageBlobs: Blob[], characterPrompt: string): Promise<string[]> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  
  try {
    const imageParts = await Promise.all(imageBlobs.map(async (blob) => ({
      inlineData: {
        data: await resizeImageForAI(blob),
        mimeType: 'image/jpeg'
      }
    })));

    const systemPrompt = `
      あなたは以下のキャラクターになりきって、提供されたスライド画像全体の台本を作成してください。
      
      【キャラクター設定】
      ${characterPrompt}
      
      【要件】
      - 出力はJSON配列のみ（Array<string>）。各要素が各スライドの台本に対応する。
      - 1スライドあたり10〜30秒程度で話せる分量。
      - 文脈を意識して、スライド間のつながりを自然にする。
      - テンションはキャラクターに合わせて適切に設定する。
      - 挨拶から始まり、締めの言葉で終わる構成にする。
      - スライドの内容を解説しつつ、キャラクターらしい視点や感想を交える。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        { role: 'user', parts: [...imageParts, { text: "これらのスライドの台本を作ってくれ！" }] }
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    let jsonText = response.text || "[]";
    jsonText = jsonText.replace(/```json\n?|\n?```/g, "").trim();

    try {
      const parsed = JSON.parse(jsonText) as string[];
      if (parsed.length !== imageBlobs.length) {
        while (parsed.length < imageBlobs.length) {
          parsed.push("（台本生成エラー：スライド数と不一致）");
        }
      }
      return parsed;
    } catch (e) {
      console.error("Failed to parse script JSON", e, jsonText);
      return new Array(imageBlobs.length).fill("台本の生成に失敗しました（JSON解析エラー）。");
    }
  } catch (err) {
    console.error("Gemini API Error in generateScripts:", err);
    throw err;
  }
};

export const generateSingleScript = async (imageBlob: Blob, contextText: string, characterPrompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const base64 = await resizeImageForAI(imageBlob);

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      { 
        role: 'user', 
        parts: [
          { inlineData: { data: base64, mimeType: 'image/jpeg' } },
          { text: `このスライドの台本を再生成してくれ。文脈: ${contextText}` } 
        ] 
      }
    ],
    config: {
      systemInstruction: `あなたは以下のキャラクターになりきって、この1枚のスライドについて、15秒程度で語る台本を作ってください。出力はテキストのみ。
      
      【キャラクター設定】
      ${characterPrompt}`,
    }
  });

  return response.text || "";
};

export const generateSpeech = async (text: string, characterPrompt: string, voiceName: string): Promise<Blob> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  // Add delivery instructions to the text prompt to guide the TTS engine
  const fullText = `感情・性格指示: ${characterPrompt}\n\n台本:\n${text}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts', 
    contents: [{ parts: [{ text: fullText }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voiceName } 
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!base64Audio) {
    throw new Error("No audio data returned");
  }

  return pcmToWav(base64Audio);
};

export const generateVideoMetadata = async (scripts: string[]): Promise<VideoMetadata> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });
  const fullScript = scripts.join("\n\n");

  const prompt = `
  以下の動画台本を元に、YouTube用のタイトルと概要文を作成してください。
  
  【要件】
  - タイトル: SEOを意識、煽りあり、30-40文字。
  - 概要文: ネタバレなし、冒頭でテーマ提示、箇条書き、100-200文字。
  - 出力フォーマット: JSON
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ parts: [{ text: prompt }, { text: `台本:\n${fullScript}` }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["title", "description"]
      }
    }
  });

  let jsonText = response.text || "{}";
  jsonText = jsonText.replace(/```json\n?|\n?```/g, "").trim();

  try {
    return JSON.parse(jsonText) as VideoMetadata;
  } catch (e) {
    return { title: "生成エラー", description: "メタデータの生成に失敗しました。" };
  }
};
