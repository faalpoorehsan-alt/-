import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { loadDatabase, saveDatabase } from "./src/db-store";
import { Customer, MilkOrder } from "./src/types";

dotenv.config();

// Helper to normalize phone numbers for Iranian formats
function normalizePhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-\+\(\)]/g, "");
  // If it starts with 98, map it to 09...
  if (cleaned.startsWith("98")) {
    cleaned = "0" + cleaned.substring(2);
  } else if (cleaned.startsWith("0098")) {
    cleaned = "0" + cleaned.substring(4);
  }
  return cleaned;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  // Support urlencoded bodies in case some SMS gateways send form-urlencoded instead of JSON
  app.use(express.urlencoded({ extended: true }));

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

  // Helper to call Gemini AI and interpret any text
  async function parseWithGemini(text: string, contactName: string) {
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
      contents: `پیام مشتری (${contactName}): "${text}"`,
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

    return JSON.parse(responseText.trim());
  }

  // --- API Routes for JSON DB ---

  // Get all data
  app.get("/api/data", (req, res) => {
    try {
      const db = loadDatabase();
      res.json(db);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Save full state or partials
  app.post("/api/save-state", (req, res) => {
    try {
      const { customers, orders, settings } = req.body;
      const db = loadDatabase();
      if (customers) db.customers = customers;
      if (orders) db.orders = orders;
      if (settings) db.settings = settings;
      saveDatabase(db);
      res.json({ success: true, db });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Single manual parse route (kept for manual test buttons)
  app.post("/api/parse-order", async (req, res) => {
    try {
      const { text, contactName } = req.body;
      if (!text) {
        return res.status(400).json({ error: "پیام ارسالی خالی است" });
      }
      const result = await parseWithGemini(text, contactName || "نامشخص");
      res.json(result);
    } catch (error: any) {
      console.error("Error parsing order:", error);
      res.status(500).json({ error: error.message || "خطا در تفسیر پیام" });
    }
  });

  // --- CRITICAL AUTOMATION WEBHOOK: /api/incoming-sms ---
  // This endpoint can receive POST requests directly from ANY mobile SMS Gateway app.
  // It handles typical payload keys like: 'from', 'sender', 'phone', 'address' AND 'text', 'message', 'body', 'msg'.
  app.post("/api/incoming-sms", async (req, res) => {
    try {
      // Extract properties supporting various mobile gateway configurations
      const rawFrom = req.body.from || req.body.sender || req.body.phone || req.body.address || req.body.phoneNumber || req.query.from;
      const rawText = req.body.text || req.body.message || req.body.body || req.body.msg || req.body.content || req.query.text;

      console.log("Received background SMS Webhook:", { rawFrom, rawText });

      if (!rawFrom || !rawText) {
        return res.status(400).json({ 
          error: "ورودی نامعتبر است. پارامترهای شماره فرستنده و متن پیامک دریافت نشد.",
          receivedPayload: req.body
        });
      }

      const senderPhone = normalizePhoneNumber(String(rawFrom));
      const messageText = String(rawText).trim();

      // Load database to find a matching customer
      const db = loadDatabase();
      let matchedCustomer = db.customers.find(
        (c) => normalizePhoneNumber(c.phone) === senderPhone
      );

      // If no customer exists with this phone, auto-create a persistent record so we never lose their orders
      if (!matchedCustomer) {
        matchedCustomer = {
          id: "cust-" + Date.now(),
          name: `مشتری جدید (${senderPhone})`,
          phone: senderPhone,
          alias: senderPhone,
          createdAt: new Date().toISOString()
        };
        db.customers.push(matchedCustomer);
      }

      // Interpret using Gemini
      console.log(`Analyzing SMS from ${matchedCustomer.name} using Gemini 3.5...`);
      const aiResult = await parseWithGemini(messageText, matchedCustomer.name);

      // Create new MilkOrder
      const now = new Date();
      const newOrder: MilkOrder = {
        id: "order-" + Date.now(),
        contactId: matchedCustomer.id,
        contactName: matchedCustomer.name,
        contactPhone: matchedCustomer.phone,
        messageText: messageText,
        receivedAt: now.toISOString(),
        milkQuantity: aiResult.milk_quantity,
        isCancelled: !!aiResult.is_cancelled,
        isMilkRequest: !!aiResult.is_milk_request,
        explanation: aiResult.explanation || "تفسیر خودکار پس‌زمینه",
        parsedSuccessfully: true
      };

      // Push to orders and save database
      db.orders.unshift(newOrder);
      saveDatabase(db);

      console.log("Successfully registered automatic order:", newOrder);

      res.json({
        success: true,
        status: "پیامک با موفقیت در پس‌زمینه دریافت، تحلیل و ثبت شد.",
        order: newOrder,
        aiResult
      });
    } catch (error: any) {
      console.error("Error in SMS Webhook handler:", error);
      res.status(500).json({ 
        success: false, 
        error: error.message || "خطای ناشناخته در پردازش خودکار پیامک" 
      });
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
