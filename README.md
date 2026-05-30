# Pose

A Chrome extension that swaps the clothing model's face with yours as you browse. Browse any fashion site and a dressing room fills up with looks of you wearing the clothes.

## Setup

You need Node.js 18+ and an OpenAI API key with access to gpt-image-1.

```bash
git clone https://github.com/03shraddha/tryon-outfit.git
cd tryon-outfit
npm install
npm run build
```

Load the extension in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist` folder
4. Click the Pose icon in the toolbar
5. Upload a clear photo of your face
6. Paste your OpenAI API key
7. Start browsing any clothing site

## How it works

As you scroll, the extension detects product images that show a person wearing clothing. It sends each one to OpenAI gpt-image-1 along with your photo, which swaps the model with you while keeping the clothing, pose, lighting, and background the same. Results are saved to a dressing room page grouped by brand.

## Settings

- **Enabled toggle** - pause the extension without uninstalling
- **Daily limit** - caps how many images get processed per day (default 50, roughly $2-4)
- **API key** - your OpenAI key, stored locally in the browser

## Project structure

```
src/
  background/background.ts   processes the queue, calls OpenAI, stores results
  content/index.ts           detects model images as you scroll
  lib/db.ts                  IndexedDB storage
  lib/openai.ts              gpt-image-1 API call
  lib/imageUrl.ts            URL normalization and filtering
  popup/                     extension popup UI
  dressing-room/             gallery page
```

## Notes

- Your selfie and all processed images are stored locally. The only external call is to the OpenAI API.
- The extension does not modify any page content, it only reads image URLs.
- Each image costs roughly $0.04-0.08 with gpt-image-1 at 1024x1024.
