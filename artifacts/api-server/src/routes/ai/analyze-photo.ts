import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const SYSTEM_PROMPT = `You are a photo analysis assistant. Analyze the image and return a JSON object with:
- "tags": an array of 5-15 concise, lowercase single-word or short-phrase tags describing the photo's content
- "description": a single short sentence (under 20 words) describing the photo
- "mainSubject": the primary subject (e.g. "person", "document", "food", "animal", "landscape", "building", "vehicle", "text")

Tag guidelines:
- Be precise: use "id card" for identity documents, "passport" for passports, "receipt" for receipts
- For people: include "person", "selfie" (if front-facing), "portrait", "group" (if multiple)
- For documents: include "document", "text", and the specific type (e.g. "id card", "receipt", "invoice", "scan", "handwritten")
- For screenshots: include "screenshot" and "text"
- For nature: include specific elements like "sky", "trees", "mountains", "beach", "ocean"
- For food: include specific items like "coffee", "pizza", "fruit", etc.
- For animals: include the specific animal type
- For vehicles: include the specific type (car, bus, plane, etc.)
- Always include the primary content category as a tag

Return ONLY valid JSON, no markdown or explanation.`;

router.post("/analyze-photo", async (req, res) => {
  try {
    const { imageBase64, mediaType = "image/jpeg" } = req.body as {
      imageBase64: string;
      mediaType?: string;
    };

    if (!imageBase64) {
      res.status(400).json({ error: "imageBase64 is required" });
      return;
    }

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 512,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${imageBase64}`,
                detail: "low",
              },
            },
            {
              type: "text",
              text: "Analyze this photo and return the JSON.",
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    let parsed: { tags?: string[]; description?: string; mainSubject?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { tags: [], description: "", mainSubject: "" };
    }

    res.json({
      tags: parsed.tags ?? [],
      description: parsed.description ?? "",
      mainSubject: parsed.mainSubject ?? "",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    console.error("Photo analysis error:", message);
    res.status(500).json({ error: message });
  }
});

export default router;
