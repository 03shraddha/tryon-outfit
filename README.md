# Pose

A Chrome extension that replaces the model's face on any clothing product page with your face. Browse normally and a dressing room fills up with looks showing you wearing the clothes.

## How it works

1. You upload one photo of yourself in the extension popup.
2. As you browse clothing sites, the extension detects product images that have a person in them.
3. It sends each image to OpenAI gpt-image-1 along with your photo.
4. The AI replaces the model with you while keeping the clothing, pose, lighting, and background exactly the same.
5. All processed looks are saved to a dressing room page grouped by brand.

## Setup

**Prerequisites:** Node.js 18+, an OpenAI API key with access to gpt-image-1.

```bash
git clone https://github.com/03shraddha/tryon-outfit.git
cd tryon-outfit
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked** and select the `dist` folder
4. Click the Pose icon in the toolbar
5. Paste your OpenAI API key
6. Upload a clear photo of your face
7. Start browsing any clothing site

## Usage

Once set up, just browse normally. The extension runs in the background. When it detects a product image with a person, it queues it for processing. The badge number on the extension icon shows how many looks have been saved.

Click **Open Dressing Room** in the popup to see all your looks. Hover over any image to see the original model photo.

## Settings

| Setting | Default | Description |
|---|---|---|
| Enabled toggle | On | Pause detection without uninstalling |
| Daily limit | 50 images | Caps API spend per day |
| API key | None | Your OpenAI key, stored locally |

## Project structure

```
src/
  content/index.ts        detects model images as you scroll
  background/index.ts     processes the queue, calls OpenAI, stores results
  lib/db.ts               IndexedDB storage for all looks
  lib/openai.ts           gpt-image-1 API call
  popup/                  extension popup UI
  dressing-room/          gallery page
```

## Cost

Each image processed costs roughly $0.04 to $0.08 with gpt-image-1 at 1024x1024. The default daily limit of 50 images caps spend at around $4 per day.

## Notes

- Face detection uses the Chrome Shape Detection API when available. On sites where that fails due to cross-origin restrictions, it falls back to a portrait-ratio heuristic.
- All images and your selfie are stored locally in the browser. Nothing is sent anywhere except to the OpenAI API.
- The extension does not modify any page content. It only reads image URLs.
