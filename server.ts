import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { loadDatabase, saveDatabase } from "./src/db-store";
import { Customer, MilkOrder } from "./src/types";
import { parseMilkMessageLocally } from "./src/localParser";

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
      const result = parseMilkMessageLocally(text, contactName || "نامشخص");
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

      // Interpret using our highly optimized local parser (no Gemini required!)
      console.log(`Analyzing SMS from ${matchedCustomer.name} using secure offline parser...`);
      const localResult = parseMilkMessageLocally(messageText, matchedCustomer.name);

      // Create new MilkOrder
      const now = new Date();
      const newOrder: MilkOrder = {
        id: "order-" + Date.now() + Math.random().toString(36).substring(2, 5),
        contactId: matchedCustomer.id,
        contactName: matchedCustomer.name,
        contactPhone: matchedCustomer.phone,
        messageText: messageText,
        receivedAt: now.toISOString(),
        milkQuantity: localResult.milk_quantity,
        isCancelled: !!localResult.is_cancelled,
        isMilkRequest: !!localResult.is_milk_request,
        explanation: localResult.explanation || "تفسیر خودکار پس‌زمینه",
        parsedSuccessfully: true
      };

      // Push to orders and save database
      db.orders.unshift(newOrder);
      saveDatabase(db);

      console.log("Successfully registered automatic order:", newOrder);

      res.json({
        success: true,
        status: "پیامک با موفقیت در پس‌زمینه دریافت، به روش آفلاین و ایمن تحلیل و ثبت شد.",
        order: newOrder,
        aiResult: localResult
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
