
import React, { useState, memo } from 'react';
import { Slide } from '../types.ts';

interface SlideEditorProps {
  slide: Slide;
  isFirst: boolean;
  isLast: boolean;
  onUpdateScript: (id: string, newScript: string) => void;
  onRegenerateScript: (id: string) => void;
  onRegenerateAudio: (id: string) => void;
  onRegenerateBoth: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onInsert: (index: number, file: File) => void;
}

const SlideEditor: React.FC<SlideEditorProps> = ({
  slide,
  isFirst,
  isLast,
  onUpdateScript,
  onRegenerateScript,
  onRegenerateAudio,
  onRegenerateBoth,
  onDelete,
  onMove,
  onInsert
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(true);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowConfirm(false);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Confirming delete for slide ID:", slide.id);
    onDelete(slide.id);
    setShowConfirm(false);
  };

  return (
    <div className="group relative z-0">
      {/* Insert above indicator */}
      <div className="opacity-0 group-hover:opacity-100 absolute -top-4 left-0 right-0 z-20 flex justify-center transition-opacity pointer-events-none">
        <label className="cursor-pointer bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-4 py-1.5 text-xs font-bold shadow-md flex items-center gap-1 pointer-events-auto transform transition hover:scale-105 active:scale-95">
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onInsert(slide.pageIndex, file);
              e.target.value = '';
            }}
          />
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          ここにスライドを挿入
        </label>
      </div>

      <div className="bg-white rounded-lg shadow-md p-5 flex flex-col md:flex-row gap-6 border border-slate-200 group-hover:border-blue-300 transition-colors relative z-10">
        {/* Left: Image Preview & Order Controls */}
        <div className="w-full md:w-1/3 flex-shrink-0 flex flex-col relative">
          <div className="relative aspect-video bg-slate-100 rounded-lg overflow-hidden border border-slate-200 shadow-inner">
            <img 
              src={slide.imageUrl} 
              alt={`Slide ${slide.pageIndex + 1}`} 
              className="w-full h-full object-contain"
            />
            
            {/* Overlay Page Number */}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm backdrop-blur-sm">
              PAGE {slide.pageIndex + 1}
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onMove(slide.id, 'up'); }}
              disabled={isFirst}
              className={`flex-1 flex items-center justify-center gap-1 border rounded-lg py-1.5 text-xs font-medium transition-all
                ${isFirst ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-400 active:bg-blue-50'}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              上へ
            </button>
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); onMove(slide.id, 'down'); }}
              disabled={isLast}
              className={`flex-1 flex items-center justify-center gap-1 border rounded-lg py-1.5 text-xs font-medium transition-all
                ${isLast ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-400 active:bg-blue-50'}
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              下へ
            </button>
          </div>

          {!showConfirm ? (
            <button 
              type="button"
              onClick={handleDeleteClick}
              className="mt-6 w-full text-red-500 hover:text-white bg-red-50 hover:bg-red-500 rounded-lg py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-red-200 shadow-sm active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              このスライドを削除
            </button>
          ) : (
            <div className="mt-6 flex flex-col gap-2 p-2 bg-red-50 rounded-lg border border-red-200 animate-in fade-in duration-200">
              <p className="text-[10px] text-red-700 font-bold text-center">本当に削除しますか？</p>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 text-white rounded py-1.5 text-[10px] font-bold hover:bg-red-700 transition-colors"
                >
                  はい
                </button>
                <button 
                  type="button"
                  onClick={handleCancelDelete}
                  className="flex-1 bg-white text-slate-600 border border-slate-300 rounded py-1.5 text-[10px] font-bold hover:bg-slate-50 transition-colors"
                >
                  いいえ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Editor Area */}
        <div className="flex-grow flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="flex flex-col gap-1">
               <span className="font-bold text-slate-700 flex items-center gap-2">
                 台本設定
                 {slide.status === 'ready' ? (
                    <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                      準備完了
                    </span>
                 ) : (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                      未完成
                    </span>
                 )}
               </span>
            </div>
            
            <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onRegenerateBoth(slide.id); }}
                className="text-xs bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-3 py-2 flex items-center gap-1.5 font-bold transition-all shadow-md active:scale-95 disabled:bg-slate-300"
                disabled={slide.isProcessing}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                まとめて生成
              </button>
              
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); onRegenerateScript(slide.id); }}
                className="text-[11px] text-slate-600 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 flex items-center transition-colors disabled:opacity-50"
                disabled={slide.isProcessing}
              >
                台本のみ
              </button>
            </div>
          </div>

          <textarea
            value={slide.script}
            onChange={(e) => onUpdateScript(slide.id, e.target.value)}
            className="w-full h-36 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none resize-none text-sm leading-relaxed shadow-inner"
            placeholder="ここに台本を入力するか、生成ボタンでAIに作成させてください..."
          />

          {/* Audio Controls */}
          <div className="flex items-center gap-4 mt-auto">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRegenerateAudio(slide.id); }}
              disabled={slide.isProcessing || !slide.script}
              className={`px-5 py-2.5 rounded-lg text-white text-sm font-bold flex items-center gap-2 transition-all shadow-md active:scale-95
                ${(slide.isProcessing || !slide.script) ? 'bg-slate-300 cursor-not-allowed shadow-none' : 'bg-slate-800 hover:bg-slate-900'}
              `}
            >
              {slide.isProcessing ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  処理中...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.983 5.983 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  音声のみ
                </>
              )}
            </button>

            <div className="flex-grow bg-slate-50 rounded-lg h-12 flex items-center px-4 border border-slate-200 shadow-inner">
               {slide.audioUrl ? (
                 <audio controls src={slide.audioUrl} className="w-full h-8" />
               ) : (
                 <span className="text-xs text-slate-400 font-medium italic">音声未生成</span>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default memo(SlideEditor);
