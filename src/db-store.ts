import fs from "fs";
import path from "path";
import { Customer, MilkOrder, AppSettings } from "./types";
import { INITIAL_CUSTOMERS, generateMockHistory } from "./data";

const DB_FILE = path.join(process.cwd(), "database.json");

interface DatabaseSchema {
  customers: Customer[];
  orders: MilkOrder[];
  settings: AppSettings;
}

export function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading database file, resetting to defaults...", err);
  }

  // Default database initialization
  const defaultDb: DatabaseSchema = {
    customers: [],
    orders: [],
    settings: { cutoffHour: 20, cutoffMinute: 0 }
  };
  
  saveDatabase(defaultDb);
  return defaultDb;
}

export function saveDatabase(data: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing to database file:", err);
  }
}
