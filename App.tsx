
import React, { useState, useRef, useCallback } from 'react';
import { Slide, AppStatus, VideoMetadata } from './types.ts';
import { convertPdfToImages } from './services/pdfService.ts';
import { generateScripts, generateSpeech, generateSingleScript, generateVideoMetadata } from './services/geminiService.ts';
import { getAudioDuration } from './services/audioUtils.ts';
import { generateVideo } from './services/videoService.ts';
import SlideEditor from './components/SlideEditor.tsx';

// Safe ID generator that works even in non-secure contexts
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VideoMetadata>({ title: '', description: '' });
  const [characterPrompt, setCharacterPrompt] = useState<string>('関西弁の競馬ファン');
  const [selectedVoice, setSelectedVoice] = useState<string>('Charon'); // Default to male (Charon)
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to re-index slides after any structural change
  const reindexSlides = (currentSlides: Slide[]): Slide[] => {
    return currentSlides.map((s, i) => ({ ...s, pageIndex: i }));
  };

  // --- Step 1: Upload ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset previous slide resources
    slides.forEach(s => {
      URL.revokeObjectURL(s.imageUrl);
      if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
    });

    setSlides([]);
    setVideoUrl(null);
    setMetadata({ title: '', description: '' });

    setStatus(AppStatus.PROCESSING_PDF);
    setProgressMsg("PDFを画像に変換中...");

    try {
      const images = await convertPdfToImages(file);
      
      const newSlides: Slide[] = images.map((blob, index) => ({
        id: generateId(),
        pageIndex: index,
        imageBlob: blob,
        imageUrl: URL.createObjectURL(blob),
        script: '',
        audioBlob: null,
        audioUrl: null,
        duration: 0,
        isProcessing: false,
        status: 'pending'
      }));
      setSlides(newSlides);
      setStatus(AppStatus.IDLE);
      setProgressMsg("PDFの読み込みが完了しました。キャラクター設定を確認して台本作成を始めてください。");
    } catch (e: any) {
      console.error(e);
      setStatus(AppStatus.ERROR);
      setProgressMsg(`PDF処理中にエラーが発生しました: ${e.message || "不明なエラー"}`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Step 2: Batch Processing ---
  const handleBatchScriptGeneration = async () => {
    if (slides.length === 0) return;
    setStatus(AppStatus.GENERATING_SCRIPTS);
    setProgressMsg("全スライドの台本を作成中...");

    try {
      const images = slides.map(s => s.imageBlob);
      const scripts = await generateScripts(images, characterPrompt);
      
      setSlides(prev => prev.map((slide, i) => ({
        ...slide,
        script: scripts[i] || slide.script
      })));
      
      setStatus(AppStatus.IDLE);
      setProgressMsg("台本の生成が完了しました");
    } catch (e: any) {
      console.error("Batch script generation failed:", e);
      setStatus(AppStatus.ERROR);
      setProgressMsg(`台本生成中にエラーが発生しました: ${e.message || "不明なエラー"}`);
    }
  };

  const handleBatchAudioGeneration = async () => {
    if (slides.length === 0) return;
    
    if (slides.some(s => !s.script.trim())) {
      window.alert("台本が入力されていないスライドがあります。");
      return;
    }

    setStatus(AppStatus.GENERATING_AUDIO);
    
    const slidesToProcess = [...slides];
    
    try {
      for (let i = 0; i < slidesToProcess.length; i++) {
        const targetSlide = slidesToProcess[i];
        if (!targetSlide.script.trim()) continue;

        setProgressMsg(`音声生成中... ${i + 1}/${slidesToProcess.length}`);
        
        setSlides(prev => prev.map(s => s.id === targetSlide.id ? { ...s, isProcessing: true } : s));

        try {
          const audioBlob = await generateSpeech(targetSlide.script, characterPrompt, selectedVoice);
          const duration = await getAudioDuration(audioBlob);
          const audioUrl = URL.createObjectURL(audioBlob);
          
          setSlides(prev => prev.map(s => {
            if (s.id === targetSlide.id) {
              if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
              return {
                ...s,
                isProcessing: false,
                audioBlob,
                audioUrl,
                duration,
                status: 'ready' as const
              };
            }
            return s;
          }));
        } catch (err) {
          console.error(`Failed to generate audio for slide ${targetSlide.id}`, err);
          setSlides(prev => prev.map(s => s.id === targetSlide.id ? { ...s, isProcessing: false, status: 'error' as const } : s));
        }
      }
      setStatus(AppStatus.IDLE);
      setProgressMsg("全音声の生成が完了しました");
    } catch (e: any) {
      console.error("Batch audio generation failed:", e);
      setStatus(AppStatus.ERROR);
      setProgressMsg(`音声生成中にエラーが発生しました: ${e.message || "不明なエラー"}`);
    }
  };

  // --- Slide Interactions ---
  const handleUpdateScript = useCallback((id: string, newScript: string) => {
    setSlides(prev => prev.map(s => s.id === id ? { ...s, script: newScript, status: 'pending' as const } : s));
  }, []);

  const handleDeleteSlide = useCallback((id: string) => {
    setSlides(prev => {
      const slideToDelete = prev.find(s => s.id === id);
      if (slideToDelete) {
        URL.revokeObjectURL(slideToDelete.imageUrl);
        if (slideToDelete.audioUrl) URL.revokeObjectURL(slideToDelete.audioUrl);
      }
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({ ...s, pageIndex: i }));
    });
  }, []);


  const handleMoveSlide = useCallback((id: string, direction: 'up' | 'down') => {
    setSlides(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (index === -1) return prev;
      if (direction === 'up' && index === 0) return prev;
      if (direction === 'down' && index === prev.length - 1) return prev;

      const newSlides = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newSlides[index], newSlides[targetIndex]] = [newSlides[targetIndex], newSlides[index]];
      
      return reindexSlides(newSlides);
    });
  }, []);

  const handleInsertSlide = async (index: number, file: File) => {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const newSlide: Slide = {
      id: generateId(),
      pageIndex: index,
      imageBlob: blob,
      imageUrl: URL.createObjectURL(blob),
      script: '',
      audioBlob: null,
      audioUrl: null,
      duration: 0,
      isProcessing: false,
      status: 'pending'
    };

    setSlides(prev => {
      const newSlides = [...prev];
      newSlides.splice(index, 0, newSlide);
      return reindexSlides(newSlides);
    });
  };

  const handleRegenerateScript = async (id: string) => {
    const slideIndex = slides.findIndex(s => s.id === id);
    if (slideIndex === -1) return;
    const slide = slides[slideIndex];
    setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: true } : s));
    try {
      const context = slideIndex > 0 ? slides[slideIndex - 1].script : "冒頭";
      const newScript = await generateSingleScript(slide.imageBlob, context, characterPrompt);
      setSlides(prev => prev.map(s => s.id === id ? { ...s, script: newScript, isProcessing: false, status: 'pending' as const } : s));
    } catch (e) {
      console.error(e);
      setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: false } : s));
    }
  };

  const handleRegenerateAudio = async (id: string) => {
    const slide = slides.find(s => s.id === id);
    if (!slide) return;
    setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: true } : s));
    try {
      const audioBlob = await generateSpeech(slide.script, characterPrompt, selectedVoice);
      const duration = await getAudioDuration(audioBlob);
      setSlides(prev => prev.map(s => {
        if (s.id === id) {
          if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
          return { 
            ...s, 
            isProcessing: false, 
            audioBlob, 
            audioUrl: URL.createObjectURL(audioBlob),
            duration,
            status: 'ready' as const
          };
        }
        return s;
      }));
    } catch (e) {
      console.error(e);
      setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: false } : s));
    }
  };

  const handleRegenerateBoth = async (id: string) => {
    const slideIndex = slides.findIndex(s => s.id === id);
    if (slideIndex === -1) return;
    const slide = slides[slideIndex];
    setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: true } : s));
    try {
      const context = slideIndex > 0 ? slides[slideIndex - 1].script : "冒頭";
      const newScript = await generateSingleScript(slide.imageBlob, context, characterPrompt);
      const audioBlob = await generateSpeech(newScript, characterPrompt, selectedVoice);
      const duration = await getAudioDuration(audioBlob);
      setSlides(prev => prev.map(s => {
        if (s.id === id) {
          if (s.audioUrl) URL.revokeObjectURL(s.audioUrl);
          return { 
            ...s, 
            script: newScript,
            isProcessing: false, 
            audioBlob, 
            audioUrl: URL.createObjectURL(audioBlob),
            duration,
            status: 'ready' as const
          };
        }
        return s;
      }));
    } catch (e) {
      console.error("Regeneration failed:", e);
      setSlides(prev => prev.map(s => s.id === id ? { ...s, isProcessing: false } : s));
      window.alert("再生成に失敗しました。");
    }
  };

  const handleGenerateVideo = async () => {
    const pendingSlides = slides.filter(s => s.status !== 'ready');
    if (pendingSlides.length > 0) {
      window.alert("音声を生成していないスライドがあります。全ての音声を用意してください。");
      return;
    }
    setStatus(AppStatus.GENERATING_VIDEO);
    try {
      const blob = await generateVideo(slides, (msg) => setProgressMsg(msg));
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
      setProgressMsg("YouTube用メタデータを生成中...");
      const meta = await generateVideoMetadata(slides.map(s => s.script));
      setMetadata(meta);
      setStatus(AppStatus.COMPLETED);
    } catch (e: any) {
      console.error("Video generation error", e);
      setStatus(AppStatus.ERROR);
      setProgressMsg(`動画生成に失敗しました: ${e.message || "不明なエラー"}`);
    }
  };

  return (
    <div className="min-h-screen pb-20">
      <header className="bg-white border-b border-slate-200 py-6 mb-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center justify-center gap-2">
            <span>🐎</span> Keiba Slide AI
          </h1>
          <p className="text-slate-500 text-sm mt-1">PDF to Kansai-dialect Video Generator (Ojisan ver.)</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 space-y-12">
        <section>
          <h2 className="text-lg font-bold text-slate-800 mb-4">1. PDFをアップロード</h2>
          <div 
            className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center bg-white hover:bg-slate-50 transition cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              accept="application/pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <div className="flex flex-col items-center gap-2">
              <button className="bg-white border border-slate-300 px-4 py-2 rounded text-slate-700 font-medium hover:bg-slate-50 shadow-sm">
                PDFファイルの選択
              </button>
              <span className="text-slate-400 text-sm">
                {slides.length > 0 ? `${slides.length}枚のスライドを読み込み済み` : "ファイルを選択してください"}
              </span>
            </div>
          </div>
        </section>

        {/* Character Settings */}
        {slides.length > 0 && (
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              キャラクター設定
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-600">
                  振る舞い・話し方の指示
                </label>
                <input 
                  type="text"
                  value={characterPrompt}
                  onChange={(e) => setCharacterPrompt(e.target.value)}
                  placeholder="例: 情熱的な関西弁のおじさん..."
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm shadow-sm"
                />
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-600">
                  ベースボイス（性別・声質）
                </label>
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm shadow-sm bg-white"
                >
                  <option value="Charon">Charon (男性・落ち着いた/低音)</option>
                  <option value="Puck">Puck (男性・快活な/中音)</option>
                  <option value="Fenrir">Fenrir (男性・力強い)</option>
                  <option value="Kore">Kore (女性・標準的)</option>
                  <option value="Zephyr">Zephyr (女性/中性・なめらか)</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-4">※ ボイスの選択は音声生成（TTS）の基本モデルを決定し、キャラクター指示はそのモデルに対する「演技」を指示します。</p>
          </section>
        )}

        {/* Global Batch Controls */}
        {slides.length > 0 && (
          <section className="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-blue-800 font-bold mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.047a1 1 0 01.897.95V6h4.803a1 1 0 01.707 1.707l-7.746 7.747a1 1 0 01-.897.95V14H4.26a1 1 0 01-.707-1.707l7.746-7.747a1 1 0 01.897-.95V1.047z" clipRule="evenodd" />
              </svg>
              一括生成ツール
            </h2>
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleBatchScriptGeneration}
                disabled={status !== AppStatus.IDLE}
                className="flex-1 min-w-[200px] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition shadow-md disabled:bg-slate-300"
              >
                AIで全台本を一括作成
              </button>
              <button
                onClick={handleBatchAudioGeneration}
                disabled={status !== AppStatus.IDLE || slides.every(s => !s.script)}
                className="flex-1 min-w-[200px] bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 px-6 rounded-lg transition shadow-md disabled:bg-slate-300"
              >
                全スライドの音声を作成
              </button>
            </div>
          </section>
        )}

        {(status !== AppStatus.IDLE && status !== AppStatus.COMPLETED && status !== AppStatus.ERROR) && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
              <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">処理中...</h3>
              <p className="text-slate-600">{progressMsg}</p>
            </div>
          </div>
        )}
        
        {status === AppStatus.ERROR && (
           <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full text-center border-l-4 border-red-500">
              <div className="text-red-500 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-red-600 mb-2">エラーが発生しました</h3>
              <p className="text-slate-600 mb-6 break-all">{progressMsg}</p>
              <button onClick={() => setStatus(AppStatus.IDLE)} className="bg-slate-800 text-white px-6 py-2 rounded hover:bg-slate-700 transition">閉じる</button>
            </div>
          </div>
        )}

        {slides.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-4">2. 編集</h2>
            <div className="space-y-4">
              {slides.map((slide, index) => (
                <SlideEditor 
                  key={slide.id} 
                  slide={slide}
                  isFirst={index === 0}
                  isLast={index === slides.length - 1}
                  onUpdateScript={handleUpdateScript}
                  onRegenerateScript={handleRegenerateScript}
                  onRegenerateAudio={handleRegenerateAudio}
                  onRegenerateBoth={handleRegenerateBoth}
                  onDelete={handleDeleteSlide}
                  onMove={handleMoveSlide}
                  onInsert={handleInsertSlide}
                />
              ))}
              <div className="flex justify-center pt-4">
                <label className="cursor-pointer bg-slate-200 hover:bg-slate-300 text-slate-600 px-6 py-2 rounded-full text-sm font-medium transition flex items-center gap-2 border border-slate-300 shadow-sm">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleInsertSlide(slides.length, file);
                      e.target.value = '';
                    }} />
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  最後にスライドを追加
                </label>
              </div>
            </div>
          </section>
        )}

        {slides.length > 0 && (
          <section className="text-center pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-6">3. 動画作成</h2>
            <button onClick={handleGenerateVideo} className="bg-blue-400 hover:bg-blue-500 text-white font-bold py-4 px-12 rounded-full shadow-lg hover:shadow-xl transition transform hover:-translate-y-1 flex items-center gap-2 mx-auto text-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              動画を作成してプレビュー
            </button>
          </section>
        )}

        {videoUrl && (
          <section className="bg-white rounded-xl shadow-lg p-8 border border-slate-200 scroll-mt-10" id="result">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><span className="text-green-500">✔</span> 完成！</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">プレビュー</label>
                <video src={videoUrl} controls className="w-full rounded-lg shadow bg-black aspect-video" />
                <a href={videoUrl} download="keiba_slide_video.mp4" className="mt-4 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded flex items-center justify-center gap-2 text-center transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  MP4をダウンロード
                </a>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">YouTubeタイトル</label>
                  <input type="text" value={metadata.title} onChange={(e) => setMetadata({...metadata, title: e.target.value})} className="w-full p-2 border border-slate-300 rounded font-medium focus:ring-2 focus:ring-blue-400 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">概要文</label>
                  <textarea value={metadata.description} onChange={(e) => setMetadata({...metadata, description: e.target.value})} className="w-full h-40 p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-400 focus:outline-none text-sm leading-relaxed" />
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
