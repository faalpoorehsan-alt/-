import { Customer, MilkOrder } from "./types";
import { getStableDateKey } from "./utils";

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: "cust-1",
    name: "علی رضایی (لبنیاتی رضایی)",
    phone: "09121112233",
    alias: "رضایی",
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "cust-2",
    name: "زهرا احمدی (سوپرمارکت احمدی)",
    phone: "09124445566",
    alias: "احمدی",
    createdAt: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "cust-3",
    name: "محمد کریمی (قنادی لادن)",
    phone: "09357778899",
    alias: "قنادی لادن",
    createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "cust-4",
    name: "حسین حسینی (کافه رضا)",
    phone: "09192223344",
    alias: "کافه رضا",
    createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: "cust-5",
    name: "سارا مرادی (تهیه غذا)",
    phone: "09301234567",
    alias: "مرادی",
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
  },
];

export interface MessageTemplate {
  text: string;
  senderName: string;
  phone: string;
  expectedResult: {
    milkQuantity: number | null;
    isCancelled: boolean;
    isMilkRequest: boolean;
    explanation: string;
  };
}

export const PERS_TEMPLATES: MessageTemplate[] = [
  {
    text: "سلام خسته نباشید، برای فردا ۵۰ کیلو شیر زحمت بکشید بفرستید. تشکر",
    senderName: "علی رضایی (لبنیاتی رضایی)",
    phone: "09121112233",
    expectedResult: {
      milkQuantity: 50,
      isCancelled: false,
      isMilkRequest: true,
      explanation: "درخواست ۵۰ کیلوگرم شیر برای فردا",
    },
  },
  {
    text: "سلام فردا شیر نمی‌خوام دستت درد نکنه برای پس‌فردا مزاحم میشم",
    senderName: "زهرا احمدی (سوپرمارکت احمدی)",
    phone: "09124445566",
    expectedResult: {
      milkQuantity: 0,
      isCancelled: true,
      isMilkRequest: true,
      explanation: "اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا",
    },
  },
  {
    text: "سلام مهندس وقت بخیر، قنادی لادن هستم. برای فردا ۱۲۰ کیلو شیر لازم داریم مثل همیشه باکیفیت باشه دستت درد نکنه",
    senderName: "محمد کریمی (قنادی لادن)",
    phone: "09357778899",
    expectedResult: {
      milkQuantity: 120,
      isCancelled: false,
      isMilkRequest: true,
      explanation: "درخواست ۱۲۰ کیلوگرم شیر برای فردا",
    },
  },
  {
    text: "سلام آقای فعالپور، فردا سفارش ما رو کنسل کنید فردا تعطیلیم شیر لازم نداریم",
    senderName: "حسین حسینی (کافه رضا)",
    phone: "09192223344",
    expectedResult: {
      milkQuantity: 0,
      isCancelled: true,
      isMilkRequest: true,
      explanation: "اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا به دلیل تعطیلی",
    },
  },
  {
    text: "سلام مرادی هستم، واسه فردا همان ۸۵ کیلو همیشگی رو بفرستید لطفا",
    senderName: "سارا مرادی (تهیه غذا)",
    phone: "09301234567",
    expectedResult: {
      milkQuantity: 85,
      isCancelled: false,
      isMilkRequest: true,
      explanation: "درخواست ۸۵ کیلوگرم شیر برای فردا",
    },
  },
  {
    text: "سلام خسته نباشید، مبلغ سفارش دیروز رو واریز کردم به حسابتون فیش رو براتون بفرستم؟",
    senderName: "علی رضایی (لبنیاتی رضایی)",
    phone: "09121112233",
    expectedResult: {
      milkQuantity: null,
      isCancelled: false,
      isMilkRequest: false,
      explanation: "پیام نامرتبط به سفارش جدید (توضیح درباره پرداخت مالی)",
    },
  },
  {
    text: "سلام فردا لطفا سفارش ما رو دوبرابر کنید یعنی ۲۰۰ کیلو بفرستید ممنون",
    senderName: "محمد کریمی (قنادی لادن)",
    phone: "09357778899",
    expectedResult: {
      milkQuantity: 200,
      isCancelled: false,
      isMilkRequest: true,
      explanation: "درخواست ۲۰۰ کیلوگرم شیر برای فردا (اصلاح و افزایش سفارش)",
    },
  },
  {
    text: "سلام فردا شیر نمیخوایم",
    senderName: "سارا مرادی (تهیه غذا)",
    phone: "09301234567",
    expectedResult: {
      milkQuantity: 0,
      isCancelled: true,
      isMilkRequest: true,
      explanation: "اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا",
    },
  },
];

/**
 * Helper to generate pre-populated milk orders for the last few days
 * so the history tab has beautiful and realistic data!
 */
export function generateMockHistory(customers: Customer[]): MilkOrder[] {
  const history: MilkOrder[] = [];
  const now = new Date();

  // Let's generate orders for the last 3 days
  for (let i = 3; i >= 1; i--) {
    const date = new Date();
    date.setDate(now.getDate() - i);
    // Setting various times: mostly around 5:00 PM to 9:30 PM (17:00 to 21:30)
    
    // Customer 1: Ali Rezaei (Requests 50kg, 60kg, 50kg)
    const dateC1 = new Date(date);
    dateC1.setHours(17, 30, 0, 0);
    history.push({
      id: `order-c1-${i}`,
      contactId: "cust-1",
      contactName: customers[0]?.name || "علی رضایی (لبنیاتی رضایی)",
      contactPhone: customers[0]?.phone || "09121112233",
      messageText: `سلام خسته نباشید، برای فردا ${40 + i * 10} کیلو شیر زحمت بکشید بفرستید. تشکر`,
      receivedAt: dateC1.toISOString(),
      milkQuantity: 40 + i * 10,
      isCancelled: false,
      isMilkRequest: true,
      explanation: `درخواست ${40 + i * 10} کیلوگرم شیر برای فردا`,
      parsedSuccessfully: true,
    });

    // Customer 2: Zahra Ahmadi (Requests 30kg, then cancels on day 2, requests 40kg)
    const dateC2 = new Date(date);
    dateC2.setHours(18, 15, 0, 0);
    const isCancelled = i === 2;
    history.push({
      id: `order-c2-${i}`,
      contactId: "cust-2",
      contactName: customers[1]?.name || "زهرا احمدی (سوپرمارکت احمدی)",
      contactPhone: customers[1]?.phone || "09124445566",
      messageText: isCancelled 
        ? "سلام فردا شیر نمی‌خوام دستت درد نکنه مغازه تعطیله" 
        : `فردا لطفا ${20 + i * 10} کیلو شیر بفرستید ممنون`,
      receivedAt: dateC2.toISOString(),
      milkQuantity: isCancelled ? 0 : 20 + i * 10,
      isCancelled: isCancelled,
      isMilkRequest: true,
      explanation: isCancelled 
        ? "اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا" 
        : `درخواست ${20 + i * 10} کیلوگرم شیر برای فردا`,
      parsedSuccessfully: true,
    });

    // Customer 3: Mohammad Karimi (Requests 100kg, 120kg, 110kg)
    const dateC3 = new Date(date);
    dateC3.setHours(19, 45, 0, 0);
    history.push({
      id: `order-c3-${i}`,
      contactId: "cust-3",
      contactName: customers[2]?.name || "محمد کریمی (قنادی لادن)",
      contactPhone: customers[2]?.phone || "09357778899",
      messageText: `سلام مهندس وقت بخیر کریمی هستم از قنادی لادن. برای فردا زحمت ۱۰۰ کیلو شیر رو بکشید دمتون گرم`,
      receivedAt: dateC3.toISOString(),
      milkQuantity: 100,
      isCancelled: false,
      isMilkRequest: true,
      explanation: "درخواست ۱۰۰ کیلوگرم شیر برای فردا",
      parsedSuccessfully: true,
    });

    // Customer 4: Hossein Hosseini (Requests 15kg, 15kg, cancels on day 1)
    const dateC4 = new Date(date);
    dateC4.setHours(20, 20, 0, 0);
    const c4Cancelled = i === 1;
    history.push({
      id: `order-c4-${i}`,
      contactId: "cust-4",
      contactName: customers[3]?.name || "حسین حسینی (کافه رضا)",
      contactPhone: customers[3]?.phone || "09192223344",
      messageText: c4Cancelled 
        ? "سلام آقای فعالپور فردا شیر نمیخوام ممنون" 
        : "سلام خسته نباشید ۱۵ کیلو شیر برای فردا صبح کافه رضا بفرستید دست شما درد نکنه",
      receivedAt: dateC4.toISOString(),
      milkQuantity: c4Cancelled ? 0 : 15,
      isCancelled: c4Cancelled,
      isMilkRequest: true,
      explanation: c4Cancelled ? "اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا" : "درخواست ۱۵ کیلوگرم شیر برای فردا",
      parsedSuccessfully: true,
    });
  }

  return history;
}
