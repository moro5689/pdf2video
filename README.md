<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

## 概要

このリポジトリは、PDF をスライド画像に変換し、Gemini で台本生成 → Gemini TTS で音声生成 → ブラウザ上で画像+音声から動画を生成する React (TypeScript) アプリです。

元々は Google AI Studio の importmap/CDN ベースの環境向けに作られていましたが、現在は Vite + React + TypeScript + Tailwind CSS でローカル開発できる構成になっています。

> 注意: このアプリは「ローカル PC で自分用に動かす」用途を想定しています。Gemini の API キーはフロントエンドから直接利用しており、本番公開用途では別途バックエンドを挟むなどの対策を推奨します。

## 必要環境

- Node.js 20 以上を推奨
- npm (または互換パッケージマネージャ)
- 最新版の Chromium 系ブラウザ (Chrome / Edge 等)

## セットアップ手順

1. 依存関係のインストール

    ```bash
    npm install
    ```

2. 環境変数ファイルの作成

    [.env.local.example](.env.local.example) を参考に、ルートディレクトリに .env.local を作成します。

    ```bash
    cp .env.local.example .env.local
    ```

    .env.local を開き、Gemini の API キーを設定します。

    ```dotenv
    VITE_GEMINI_API_KEY=あなたの_Gemini_APIキー
    ```

    - Vite の仕様上、`VITE_` プレフィックスが付いた環境変数のみフロントエンドから参照されます。
    - 本番公開する場合は、このキーをリポジトリに含めないよう注意してください。

3. 開発サーバーの起動

    ```bash
    npm run dev
    ```

    ブラウザで表示された URL (通常は http://localhost:3000) を開きます。

## 実装のポイント

### Vite + React + TypeScript

- エントリポイント: [index.html](index.html) → [index.tsx](index.tsx) → [App.tsx](App.tsx)
- Vite 標準の `import.meta.env` を利用して、Gemini の API キーを参照しています。
   - [services/geminiService.ts](services/geminiService.ts) 内で `import.meta.env.VITE_GEMINI_API_KEY` を読み取り、未設定の場合は分かりやすいエラーを投げます。

### Tailwind CSS

- CDN 版 Tailwind は削除し、Vite + PostCSS 経由で Tailwind を適用しています。
- 主な設定ファイル:
   - [tailwind.config.ts](tailwind.config.ts)
   - [postcss.config.cjs](postcss.config.cjs)
   - [index.css](index.css)
- [index.html](index.html) では `/index.css` を読み込み、既存の Tailwind クラス付き UI をそのまま利用できるようにしています。

### pdf.js Worker

- pdf.js の worker は CDN ではなくローカルバンドルを利用します。
- [services/pdfService.ts](services/pdfService.ts) で、Vite の `?url` インポートを使って worker を設定しています。
   - `import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';`
   - `pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;`

### Gemini API 連携

- すべての Gemini 呼び出しは [services/geminiService.ts](services/geminiService.ts) に集約されています。
- API キーの取得:
   - `const apiKey = import.meta.env.VITE_GEMINI_API_KEY;`
   - 未設定の場合は、明示的なエラーメッセージをスローします。
- 利用している主な機能:
   - 画像を元にした台本生成 (複数枚 / 単枚)
   - TTS (Gemini TTS → PCM → WAV Blob 変換)
   - YouTube 用タイトル/概要文生成

### 動画生成 (MediaRecorder / AudioContext)

- [services/videoService.ts](services/videoService.ts) で以下を行っています:
   - Canvas にスライド画像を描画
   - AudioContext で各スライドの音声を再生
   - `canvas.captureStream()` と `MediaStreamDestination` を合成し、`MediaRecorder` で録画

#### ブラウザごとのコンテナ形式について

- ブラウザによっては `MediaRecorder.isTypeSupported('video/mp4')` が `false` となり、mp4 ではなく webm (VP9 / H.264) などのコンテナになる場合があります。
- 本リポジトリでは、サポートされていれば mp4 を優先し、そうでない場合は webm 系を自動選択します。
- そのため、ダウンロードボタンのファイル名は `*.mp4` ですが、実際のコンテナが mp4 でない場合があります。YouTube など一般的な動画プラットフォームは webm をそのまま受け付けることが多いですが、必要に応じて ffmpeg 等で再エンコードしてください。

## よくあるハマりどころ

- **Gemini API キー未設定エラー**
   - `.env.local` の `VITE_GEMINI_API_KEY` が未設定・誤設定だと、台本生成 / TTS 呼び出し時に明示的なエラーが表示されます。

- **ブラウザの音声再生制限**
   - ブラウザによっては、ユーザー操作 (クリック等) を行う前にオーディオコンテキストを開始できない場合があります。問題が起きた場合は、PDF アップロードなどのユーザー操作後に動画生成を試してください。

- **PDF の変換品質 / 透かし削除**
   - [services/pdfService.ts](services/pdfService.ts) では、スライド画像の画質向上と簡易的なウォーターマーク削除ロジックを組み込んでいます。

## 開発メモ / ベストプラクティス

- 本番用途では、フロントエンドから直接 Gemini API キーを呼ぶのではなく、バックエンド(APIサーバーやCloud Functions等)を経由させてください。
- このリポジトリはあくまで「ローカル PC で完結する簡易ツール」として設計されています。
