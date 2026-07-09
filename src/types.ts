export interface Customer {
  id: string;
  name: string;
  phone: string;
  alias: string; // Nickname or name variation that might appear in messages
  createdAt: string;
}

export interface MilkOrder {
  id: string;
  contactId: string; // References Customer.id
  contactName: string;
  contactPhone: string;
  messageText: string;
  receivedAt: string; // ISO 8601 string
  milkQuantity: number | null; // extracted quantity (kg) or null if unrelated
  isCancelled: boolean; // explicitly cancelled?
  isMilkRequest: boolean; // is it related to milk orders?
  explanation: string; // AI generated summary/description
  parsedSuccessfully: boolean;
}

export interface AppSettings {
  cutoffHour: number; // Hour from 0 to 23 (default 20 = 8:00 PM)
  cutoffMinute: number; // Minute (default 0)
}
