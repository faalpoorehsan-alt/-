/**
 * Highly robust local Persian text parser for milk orders.
 * Operates 100% client-side/offline without any external API calls,
 * keeping the user's data completely private and safe.
 */

// Mapping of Persian/Arabic digits to English digits
const PERSIAN_DIGITS_MAP: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9"
};

export function convertPersianDigitsToEnglish(str: string): string {
  return str.replace(/[۰-۹٠-٩]/g, (char) => PERSIAN_DIGITS_MAP[char] || char);
}

export interface LocalParsedResult {
  milk_quantity: number | null;
  is_cancelled: boolean;
  is_milk_request: boolean;
  explanation: string;
}

export function parseMilkMessageLocally(text: string, contactName: string = "مشتری"): LocalParsedResult {
  const normalizedText = convertPersianDigitsToEnglish(text.trim().toLowerCase());

  // 1. Check for Cancellation patterns
  // Examples: "فردا شیر نمیخوام", "کنسله واسه فردا", "شیر نیارید فردا", "فردا تعطیلیم نفرست"
  const cancelKeywords = [
    "نمیخوام", "نمی‌خوام", "نمی خوام", "کنسل", "نیار", "نفرست", "تعطیل", "حذف", "بدون شیر"
  ];
  
  const hasCancelKeyword = cancelKeywords.some(keyword => normalizedText.includes(keyword));

  // 2. Check for general milk requests keywords to confirm it's related to milk
  const milkKeywords = [
    "شیر", "کیلو", "تا", "گرم", "سفارش", "بفرست", "بیار", "بده", "زحمت", "کیسه", "لیتر"
  ];
  const hasMilkKeyword = milkKeywords.some(keyword => normalizedText.includes(keyword));

  // 3. Extract numbers from text
  // Let's find all numbers that could be associated with milk quantity
  // Patterns like: "50 کیلو", "120 تا", "60", "صد کیلو" (textual numbers can be supported)
  
  // Replace textual Persian numbers for common amounts
  let textWithNumbers = normalizedText
    .replace(/صد\s+و\s+بیست/g, "120")
    .replace(/صد\s+و\s+پنجاه/g, "150")
    .replace(/دویست/g, "200")
    .replace(/صد/g, "100")
    .replace(/نود/g, "90")
    .replace(/هشتاد/g, "80")
    .replace(/هفتاد/g, "70")
    .replace(/شصت/g, "60")
    .replace(/پنجاه/g, "50")
    .replace(/چهل/g, "40")
    .replace(/سی/g, "30")
    .replace(/بیست/g, "20")
    .replace(/ده/g, "10")
    .replace(/پانزده/g, "15")
    .replace(/دوازده/g, "12")
    .replace(/یک/g, "1")
    .replace(/دو/g, "2")
    .replace(/سه/g, "3")
    .replace(/چهار/g, "4")
    .replace(/پنج/g, "5")
    .replace(/شش/g, "6")
    .replace(/هفت/g, "7")
    .replace(/هشت/g, "8")
    .replace(/نه/g, "9");

  // Regex to extract numbers. We look for digits, possibly accompanied by units.
  // We prefer numbers followed or preceded by words like "کیلو", "تا", "شیر"
  const numberRegex = /(\d+)\s*(کیلو|تا|لیتر|گرم|عدد|شیر)?/g;
  let matches: { value: number; hasUnit: boolean; index: number }[] = [];
  let match;

  while ((match = numberRegex.exec(textWithNumbers)) !== null) {
    const val = parseInt(match[1], 10);
    const unit = match[2];
    matches.push({
      value: val,
      hasUnit: !!unit,
      index: match.index
    });
  }

  // Determine final quantity
  let quantity: number | null = null;
  if (matches.length > 0) {
    // If there is a match with a unit (like "50 کیلو"), prefer that
    const matchWithUnit = matches.find(m => m.hasUnit);
    if (matchWithUnit) {
      quantity = matchWithUnit.value;
    } else {
      // Otherwise, take the first extracted number
      quantity = matches[0].value;
    }
  }

  // 4. Determine if it is a valid milk order request
  let isMilkRequest = false;
  let explanation = "";

  if (hasCancelKeyword && (hasMilkKeyword || quantity !== null || normalizedText.includes("شیر"))) {
    isMilkRequest = true;
    explanation = `اعلام عدم نیاز (کنسلی) سفارش شیر برای فردا`;
    return {
      milk_quantity: 0,
      is_cancelled: true,
      is_milk_request: true,
      explanation
    };
  }

  if (quantity !== null && (hasMilkKeyword || normalizedText.length < 50)) {
    isMilkRequest = true;
    explanation = `درخواست ${quantity} کیلوگرم شیر برای فردا`;
    return {
      milk_quantity: quantity,
      is_cancelled: false,
      is_milk_request: true,
      explanation
    };
  }

  // Fallback: If it mentions milk and "فردا" or basic order expressions but has no numbers
  if (hasMilkKeyword && (normalizedText.includes("فردا") || normalizedText.includes("سفارش"))) {
    isMilkRequest = true;
    explanation = `گفتگو در مورد سفارش شیر (نیاز به تایید مقدار)`;
    return {
      milk_quantity: null,
      is_cancelled: false,
      is_milk_request: true,
      explanation
    };
  }

  // Casual message
  return {
    milk_quantity: null,
    is_cancelled: false,
    is_milk_request: false,
    explanation: `پیام عمومی یا نامرتبط (غیر سفارشی)`
  };
}
