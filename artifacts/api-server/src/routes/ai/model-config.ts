import { Router } from "express";

const router = Router();

/**
 * GET /api/ai/model-config
 *
 * Returns a versioned classifier configuration.
 * This is the only server call the app makes for AI — no photos are ever sent.
 * The app downloads this config once and applies all rules locally on-device.
 *
 * "Upgrading the AI" = updating this config and bumping the version number.
 */
router.get("/model-config", (_req, res) => {
  res.json(MODEL_CONFIG);
});

/**
 * The offline classifier config.
 * Update this on the server to improve detection without changing the app.
 * Version bump tells the app to re-download.
 */
const MODEL_CONFIG = {
  version: "1.2.0",
  updated_at: "2026-04-01",
  description: "Offline photo classifier — all analysis runs on-device",

  /** Filename pattern rules: matched against lowercased filename */
  filename_rules: [
    { pattern: "screenshot|screen.shot|screen_shot", tags: ["screenshot", "screen", "text"], weight: 10 },
    { pattern: "screen.rec|screenrecord", tags: ["screen recording", "video", "screen"], weight: 10 },
    { pattern: "whatsapp|telegram|signal|viber", tags: ["message", "chat", "conversation"], weight: 10 },
    { pattern: "scan|scanned|scanning", tags: ["scan", "document", "text"], weight: 9 },
    { pattern: "receipt|invoice|bill", tags: ["receipt", "document", "text"], weight: 10 },
    { pattern: "document|\\bdoc\\b", tags: ["document", "text"], weight: 9 },
    { pattern: "\\bid[_\\s\\-]|id_card|idcard|identity|passport|license|licence|national.id", tags: ["id", "document", "text", "id card"], weight: 10 },
    { pattern: "selfie", tags: ["selfie", "portrait", "person"], weight: 9 },
    { pattern: "burst", tags: ["burst", "action", "photo"], weight: 8 },
    { pattern: "panorama|pano", tags: ["panorama", "landscape", "outdoor"], weight: 9 },
    { pattern: "\\.raw$|\\.dng$", tags: ["raw", "photo"], weight: 7 },
    { pattern: "video|vid_|mov_", tags: ["video"], weight: 8 },
    { pattern: "live.photo|\\.livp$", tags: ["live photo", "photo"], weight: 8 },
    { pattern: "portrait.mode|depth.effect", tags: ["portrait", "depth", "person"], weight: 9 },
    { pattern: "slow.mo|slowmo|slo-mo", tags: ["slow motion", "video"], weight: 9 },
    { pattern: "timelapse|time.lapse", tags: ["timelapse", "video"], weight: 9 },
    { pattern: "photo.booth", tags: ["photo booth", "fun", "person"], weight: 8 },
    { pattern: "qr|barcode|qrcode", tags: ["qr code", "barcode", "scan"], weight: 9 },
    { pattern: "meme", tags: ["meme", "text", "fun"], weight: 8 },
    { pattern: "map|maps|location", tags: ["map", "navigation", "location"], weight: 8 }
  ],

  /** EXIF-based rules: applied when EXIF data is available */
  exif_rules: [
    // GPS present = taken outdoors
    { field: "has_gps", value: true, tags: ["outdoor", "location"], weight: 6 },
    // Flash fired = likely indoor
    { field: "flash_fired", value: true, tags: ["indoor", "flash"], weight: 4 },
    // Very high ISO = dark/night
    { field: "iso_high", threshold: 1600, tags: ["night", "dark", "indoor"], weight: 5 },
    // Wide angle (focal length < 28mm equivalent) = landscape/architecture
    { field: "focal_length_wide", threshold: 28, tags: ["wide angle", "landscape", "architecture"], weight: 4 },
    // Telephoto (focal length > 70mm equivalent) = portrait/zoom
    { field: "focal_length_tele", threshold: 70, tags: ["portrait", "zoom"], weight: 4 },
    // Front camera (some EXIF includes this)
    { field: "lens_front_camera", value: true, tags: ["selfie", "portrait", "person"], weight: 8 },
    // Long exposure = night/light trails
    { field: "long_exposure", threshold: 0.5, tags: ["night", "long exposure", "light trails"], weight: 6 }
  ],

  /** Dimension-based rules: applied to all photos */
  dimension_rules: [
    // Exact screen ratio (9:19.5 for iPhone) = screenshot
    { type: "aspect_ratio_range", min: 0.46, max: 0.47, tags: ["screenshot", "screen"], weight: 8 },
    // Near 9:19.5 and tall = likely screenshot
    { type: "aspect_ratio_range", min: 0.44, max: 0.50, tags_hint: "tall_portrait", weight: 3 },
    // Very wide = panorama
    { type: "aspect_ratio_range", min: 2.5, max: 99, tags: ["panorama", "landscape", "outdoor"], weight: 9 },
    // Square-ish = social media / food photo
    { type: "aspect_ratio_range", min: 0.95, max: 1.05, tags: ["square"], weight: 3 },
    // Standard landscape photo
    { type: "aspect_ratio_range", min: 1.3, max: 1.8, tags: ["photo"], weight: 2 },
    // Standard portrait photo
    { type: "aspect_ratio_range", min: 0.55, max: 0.78, tags: ["portrait"], weight: 2 }
  ],

  /** Common iPhone screen resolutions — used to detect screenshots precisely */
  screen_resolutions: [
    [430, 932], [393, 852], [390, 844], [375, 812], [414, 896], [414, 736],
    [375, 667], [320, 568], [428, 926], [390, 844], [320, 480]
  ],

  /** Search query → tag expansions */
  search_aliases: {
    "id": ["id", "id card", "document", "identity", "passport", "license"],
    "ids": ["id", "id card", "document", "identity"],
    "id card": ["id", "id card", "document", "identity"],
    "passport": ["id", "id card", "document", "passport"],
    "license": ["id", "document", "license"],
    "driver license": ["id", "document", "license"],
    "doc": ["document", "text", "scan"],
    "docs": ["document", "text", "scan"],
    "document": ["document", "text", "scan", "receipt"],
    "receipt": ["receipt", "document", "text"],
    "bill": ["receipt", "document", "text"],
    "invoice": ["receipt", "document", "text"],
    "text": ["text", "document", "screenshot", "scan"],
    "screenshot": ["screenshot", "screen"],
    "screenshots": ["screenshot", "screen"],
    "screen": ["screenshot", "screen"],
    "vid": ["video"],
    "vids": ["video"],
    "videos": ["video"],
    "movie": ["video"],
    "clip": ["video"],
    "selfie": ["selfie", "portrait", "person"],
    "selfies": ["selfie", "portrait", "person"],
    "portrait": ["selfie", "portrait", "person"],
    "chat": ["message", "chat", "conversation"],
    "message": ["message", "chat", "conversation"],
    "whatsapp": ["message", "chat", "whatsapp"],
    "telegram": ["message", "chat", "telegram"],
    "scan": ["scan", "document", "text"],
    "scans": ["scan", "document", "text"],
    "panorama": ["panorama", "landscape"],
    "pano": ["panorama", "landscape"],
    "slow motion": ["slow motion", "video"],
    "slow mo": ["slow motion", "video"],
    "slo mo": ["slow motion", "video"],
    "live photo": ["live photo", "photo"],
    "night": ["night", "dark", "long exposure"],
    "outdoor": ["outdoor", "location", "nature"],
    "outdoors": ["outdoor", "location", "nature"],
    "indoor": ["indoor", "flash"],
    "location": ["location", "outdoor", "map"],
    "qr": ["qr code", "barcode", "scan"],
    "barcode": ["qr code", "barcode", "scan"],
    "meme": ["meme", "text", "fun"],
    "burst": ["burst", "action"],
    "timelapse": ["timelapse", "video"],
    "raw": ["raw", "photo"]
  },

  /** Suggestion chips shown on the Search tab */
  suggestions: [
    "screenshots", "selfies", "videos", "documents", "ID",
    "receipts", "scans", "panoramas", "night", "outdoor", "slow motion", "live photos"
  ]
};

export default router;
