import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Lazy initialization of the Google GenAI SDK
  let ai: GoogleGenAI | null = null;
  function getGeminiClient(): GoogleGenAI {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is not configured. Please set it in the Secrets panel in AI Studio.");
      }
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return ai;
  }

  // API route to parse milk orders using Gemini
  app.post("/api/parse-order", async (req, res) => {
    try {
      const { text, contactName } = req.body;
      if (!text) {
        return res.status(400).json({ error: "پیام ارسالی خالی است" });
      }

      const client = getGeminiClient();

      const systemInstruction = `
        You are an expert system that extracts milk order details from Persian chat messages or SMS received from fixed customers.
        Your goal is to parse the message and determine the quantity of milk (in kilograms/kg/کیلو) the customer wants for tomorrow (or today, if unspecified).
        
        Analyze the text carefully. Persian users use various expressions:
        - "فردا ۵۰ تا میخوام" or "واسه فردا ۵۰ کیلو" means milk_quantity = 50, is_cancelled = false, is_milk_request = true.
        - "فردا شیر نمیخوام" or "فردا کنسله" means milk_quantity = 0, is_cancelled = true, is_milk_request = true.
        - "سلام چطوری" or "پول واریز شد" is NOT a milk request. Set is_milk_request = false, milk_quantity = null, is_cancelled = false.
        - "۱۰۰ کیلو شیر برای فردا صبح زحمت بکشید" means milk_quantity = 100, is_cancelled = false, is_milk_request = true.
        
        Provide the response strictly according to the schema.
      `;

      const response = await client.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `پیام مشتری (${contactName || "نامشخص"}): "${text}"`,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              milk_quantity: {
                type: Type.NUMBER,
                description: "The amount of milk in kg requested. Set to 0 if cancelled or explicitly not wanted. Set to null if not a milk order or unspecified."
              },
              is_cancelled: {
                type: Type.BOOLEAN,
                description: "True if the user explicitly cancels or says they don't want milk tomorrow (e.g. 'شیر نمیخوام')."
              },
              is_milk_request: {
                type: Type.BOOLEAN,
                description: "True if the message is a request for milk or a cancellation of milk. False if it is just a greeting, payment confirmation, or unrelated chatter."
              },
              explanation: {
                type: Type.STRING,
                description: "A short, clear explanation in Persian summarizing what was understood from the text (e.g. 'درخواست ۷۰ کیلو شیر برای فردا')."
              }
            },
            required: ["is_cancelled", "is_milk_request", "explanation"]
          }
        }
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("پاسخی از هوش مصنوعی دریافت نشد.");
      }

      const result = JSON.parse(responseText.trim());
      res.json(result);
    } catch (error: any) {
      console.error("Error parsing order with Gemini:", error);
      res.status(500).json({ error: error.message || "خطا در تفسیر پیام توسط هوش مصنوعی" });
    }
  });

  // Vite dev server / static build serving middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
