import React, { useState, useEffect, useMemo } from "react";
import {
  Home,
  Users,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  MessageSquare,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  Clock,
  Phone,
  Search,
  ChevronRight,
  Check,
  X,
  Bell,
  Info,
  ChevronLeft,
  RefreshCw,
  Sliders,
  Smartphone,
  Send,
  Calendar,
  Layers
} from "lucide-react";
import { Customer, MilkOrder, AppSettings } from "./types";
import { INITIAL_CUSTOMERS, PERS_TEMPLATES, generateMockHistory } from "./data";
import {
  formatPersianDateFull,
  formatPersianDateShort,
  formatPersianTime,
  formatPersianDateTime,
  getActiveDeliveryDate,
  getStableDateKey,
  getDeliveryDateForOrderReceivedAt
} from "./utils";

export default function App() {
  // --- Persistent States ---
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem("milk_customers");
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [orders, setOrders] = useState<MilkOrder[]>(() => {
    const saved = localStorage.getItem("milk_orders");
    if (saved) return JSON.parse(saved);
    // Generate some history with the customers
    return generateMockHistory(INITIAL_CUSTOMERS);
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("milk_settings");
    return saved ? JSON.parse(saved) : { cutoffHour: 20, cutoffMinute: 0 };
  });

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem("milk_customers", JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem("milk_orders", JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem("milk_settings", JSON.stringify(settings));
  }, [settings]);

  // --- Simulated Clock for Testing ---
  const [useSimulatedClock, setUseSimulatedClock] = useState<boolean>(false);
  const [simulatedHour, setSimulatedHour] = useState<number>(19); // 7:00 PM default for testing cutoff
  const [simulatedMinute, setSimulatedMinute] = useState<number>(30);
  const [realTime, setRealTime] = useState<Date>(new Date());

  // Update real clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Active Date calculation based on Simulated or Real time
  const currentAppTime = useMemo(() => {
    if (!useSimulatedClock) return realTime;
    const date = new Date(realTime);
    date.setHours(simulatedHour, simulatedMinute, 0, 0);
    return date;
  }, [useSimulatedClock, simulatedHour, simulatedMinute, realTime]);

  const activeDeliveryDate = useMemo(() => {
    return getActiveDeliveryDate(settings.cutoffHour, settings.cutoffMinute, currentAppTime);
  }, [settings, currentAppTime]);

  // Check if current system state is past the cutoff (night shift)
  const isPastCutoff = useMemo(() => {
    const currentHour = currentAppTime.getHours();
    const currentMinute = currentAppTime.getMinutes();
    const currentVal = currentHour * 60 + currentMinute;
    const cutoffVal = settings.cutoffHour * 60 + settings.cutoffMinute;
    return currentVal >= cutoffVal;
  }, [currentAppTime, settings]);

  // --- Active Tab ---
  // "dashboard" | "history" | "customers"
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // --- SMS Simulator State ---
  const [selectedSimSender, setSelectedSimSender] = useState<string>(customers[0]?.id || "");
  const [simMessageText, setSimMessageText] = useState<string>("");
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [simulationLogs, setSimulationLogs] = useState<string[]>([]);
  const [lastParsedResult, setLastParsedResult] = useState<any | null>(null);

  // --- Search & Filters ---
  const [historySearch, setHistorySearch] = useState<string>("");
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState<string>("all");
  const [customerSearch, setCustomerSearch] = useState<string>("");

  // --- Selected Customer Detail View (Modal/Drawer) ---
  const [selectedDetailCustomer, setSelectedDetailCustomer] = useState<Customer | null>(null);

  // --- Add Customer Form ---
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAlias, setNewCustAlias] = useState("");
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  // Auto-set simulator values
  useEffect(() => {
    if (customers.length > 0 && !selectedSimSender) {
      setSelectedSimSender(customers[0].id);
    }
  }, [customers, selectedSimSender]);

  // Add notification log
  const addSimLog = (msg: string) => {
    setSimulationLogs((prev) => [`[${formatPersianTime(new Date())}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // --- API Call to Parse Order with Gemini ---
  const handleSimulateSMS = async (overrideText?: string, overrideContactId?: string) => {
    const contactId = overrideContactId || selectedSimSender;
    const textToParse = overrideText || simMessageText;

    const contact = customers.find((c) => c.id === contactId);
    if (!contact) {
      setParsingError("لطفاً ابتدا یک مخاطب را انتخاب کنید.");
      return;
    }

    if (!textToParse.trim()) {
      setParsingError("متن پیامک نمی‌تواند خالی باشد.");
      return;
    }

    setIsParsing(true);
    setParsingError(null);
    setLastParsedResult(null);
    addSimLog(`شبیه‌سازی پیامک از ${contact.name}...`);

    try {
      const response = await fetch("/api/parse-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: textToParse,
          contactName: contact.name,
        }),
      });

      if (!response.ok) {
        throw new Error("خطا در پاسخ‌دهی سرور. وضعیت: " + response.status);
      }

      const result = await response.json();
      
      // Determine delivery date:
      // Orders received after the cutoff are generally processed next day.
      // But standard Persian text "برای فردا" means the delivery date is 1 day after the message arrival.
      const now = new Date(currentAppTime);
      const deliveryDate = getDeliveryDateForOrderReceivedAt(now);

      const newOrder: MilkOrder = {
        id: "order-" + Date.now(),
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        messageText: textToParse,
        receivedAt: now.toISOString(),
        milkQuantity: result.milk_quantity,
        isCancelled: !!result.is_cancelled,
        isMilkRequest: !!result.is_milk_request,
        explanation: result.explanation || "تفسیر خودکار",
        parsedSuccessfully: true,
      };

      setOrders((prev) => [newOrder, ...prev]);
      setLastParsedResult(result);
      addSimLog(`پیام با موفقیت تفسیر شد: ${result.explanation}`);
      
      // Clear manual input
      if (!overrideText) {
        setSimMessageText("");
      }
    } catch (err: any) {
      console.error(err);
      setParsingError(err.message || "برقراری ارتباط با سرور هوش مصنوعی ناموفق بود.");
      addSimLog(`خطا در تفسیر: ${err.message || "خطای نامشخص"}`);
    } finally {
      setIsParsing(false);
    }
  };

  // --- Orders Filtered by Active Delivery Date ---
  const activeDeliveryOrders = useMemo(() => {
    // Current display date in comparison format
    const activeDateKey = getStableDateKey(activeDeliveryDate);

    return orders.filter((order) => {
      // An order's target delivery is 1 day after it's received
      const orderReceivedDate = new Date(order.receivedAt);
      const orderDeliveryDate = getDeliveryDateForOrderReceivedAt(orderReceivedDate);
      const orderDeliveryDateKey = getStableDateKey(orderDeliveryDate);

      // Only show orders that match active display date and are actually milk requests
      return orderDeliveryDateKey === activeDateKey && order.isMilkRequest;
    });
  }, [orders, activeDeliveryDate]);

  // --- Calculate total milk needed for active display date ---
  const totalMilkQuantity = useMemo(() => {
    return activeDeliveryOrders.reduce((sum, order) => {
      // If order is cancelled, it adds 0
      if (order.isCancelled) return sum;
      return sum + (order.milkQuantity || 0);
    }, 0);
  }, [activeDeliveryOrders]);

  // --- Add Customer ---
  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      alert("نام و شماره تلفن اجباری هستند.");
      return;
    }

    const newCustomer: Customer = {
      id: "cust-" + Date.now(),
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      alias: newCustAlias.trim() || newCustName.trim(),
      createdAt: new Date().toISOString(),
    };

    setCustomers((prev) => [...prev, newCustomer]);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustAlias("");
    setShowAddCustomerModal(false);
    addSimLog(`مشتری جدید اضافه شد: ${newCustomer.name}`);
  };

  // --- Delete Customer ---
  const handleDeleteCustomer = (id: string, name: string) => {
    if (window.confirm(`آیا از حذف مشتری "${name}" اطمینان دارید؟ تمامی سفارشات این شخص نیز در لیست‌ها باقی می‌مانند ولی اتصالشان حذف می‌شود.`)) {
      setCustomers((prev) => prev.filter((c) => c.id !== id));
      addSimLog(`مشتری حذف شد: ${name}`);
      if (selectedDetailCustomer?.id === id) {
        setSelectedDetailCustomer(null);
      }
    }
  };

  // --- Quick Import Preset Customers if list gets empty ---
  const handleResetToPresets = () => {
    if (window.confirm("آیا مایلید لیست مشتریان و تاریخچه سفارشات به مقادیر اولیه و نمونه بازیابی شوند؟")) {
      setCustomers(INITIAL_CUSTOMERS);
      setOrders(generateMockHistory(INITIAL_CUSTOMERS));
      setSettings({ cutoffHour: 20, cutoffMinute: 0 });
      setUseSimulatedClock(false);
      addSimLog("کل سیستم به داده‌های نمونه اولیه ریست شد.");
    }
  };

  // --- Selected Customer Orders Timeline ---
  const customerHistoryTimeline = useMemo(() => {
    if (!selectedDetailCustomer) return [];
    return orders.filter((o) => o.contactId === selectedDetailCustomer.id);
  }, [selectedDetailCustomer, orders]);

  // Total lifetime milk for selected customer
  const customerLifetimeStats = useMemo(() => {
    if (!selectedDetailCustomer) return { total: 0, ordersCount: 0, cancelsCount: 0 };
    const customerOrders = orders.filter((o) => o.contactId === selectedDetailCustomer.id);
    const total = customerOrders.reduce((sum, o) => sum + (o.isCancelled ? 0 : o.milkQuantity || 0), 0);
    const cancels = customerOrders.filter((o) => o.isCancelled).length;
    return {
      total,
      ordersCount: customerOrders.length,
      cancelsCount: cancels,
    };
  }, [selectedDetailCustomer, orders]);

  // --- Filtered History Tab List ---
  const filteredHistoryOrders = useMemo(() => {
    return orders.filter((order) => {
      // Search match
      const query = historySearch.trim().toLowerCase();
      const matchSearch =
        order.contactName.toLowerCase().includes(query) ||
        order.messageText.toLowerCase().includes(query) ||
        order.explanation.toLowerCase().includes(query) ||
        order.contactPhone.includes(query);

      // Customer filter
      const matchCustomer = selectedHistoryCustomer === "all" || order.contactId === selectedHistoryCustomer;

      return matchSearch && matchCustomer;
    });
  }, [orders, historySearch, selectedHistoryCustomer]);

  return (
    <div id="main-app" className="min-h-screen bg-[#eceff1] flex flex-col md:flex-row p-0 md:p-6 lg:p-8 justify-center items-center font-sans gap-6 select-none overflow-x-hidden">
      
      {/* 
        ========================================================================
        RIGHT COLUMN: SMS & AI INTERPRETATION SIMULATOR PANEL (بخش شبیه‌ساز)
        ========================================================================
      */}
      <div className="w-full md:w-[480px] lg:w-[500px] bg-white rounded-3xl border border-slate-200 shadow-xl flex flex-col overflow-hidden max-h-[850px]">
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Sparkles className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">درگاه شبیه‌ساز پیامک و هوش مصنوعی</h2>
              <p className="text-[10px] text-slate-400">ارسال پیامک و بررسی نحوه تفسیر با Gemini 3.5</p>
            </div>
          </div>
          <button
            onClick={handleResetToPresets}
            title="بازیابی داده‌های پیش‌فرض"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* Instructions */}
          <div className="bg-blue-50/70 rounded-2xl p-4 border border-blue-100/50 flex gap-3 text-right">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-blue-900">چگونه برنامه را تست کنیم؟</h4>
              <p className="text-[11px] leading-relaxed text-blue-800">
                از بخش زیر، یکی از مخاطبین را انتخاب کنید و پیامکی آزمایشی با زبان عامیانه بنویسید (یا از قالب‌های آماده استفاده کنید). پس از کلیک روی دکمه ارسال، پیامک توسط هوش مصنوعی پردازش شده و به سفارش‌های روزانه افزوده می‌شود.
              </p>
            </div>
          </div>

          {/* Quick Templates Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-slate-500">قالب‌های آماده پیامک سفارش:</label>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">هوشمند فارسی</span>
            </div>
            <div className="grid grid-cols-1 gap-2 max-h-[220px] overflow-y-auto pr-1">
              {PERS_TEMPLATES.map((tpl, idx) => {
                const matchedContact = customers.find(c => c.phone === tpl.phone);
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (matchedContact) {
                        setSelectedSimSender(matchedContact.id);
                      }
                      setSimMessageText(tpl.text);
                    }}
                    className="p-2.5 text-right bg-slate-50 hover:bg-indigo-50/40 hover:border-indigo-200 rounded-xl border border-slate-200/60 transition-all text-xs flex flex-col gap-1 active:scale-[0.98]"
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-bold text-slate-700">{tpl.senderName}</span>
                      <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-100">{tpl.phone}</span>
                    </div>
                    <p className="text-slate-600 font-mono text-[11px] truncate w-full">{tpl.text}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Custom SMS Generator */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">فرستنده پیامک شبیه‌سازی‌شده:</label>
              {customers.length === 0 ? (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  هیچ مشتری ثابتی وجود ندارد! ابتدا در بخش مشتریان یک مخاطب بسازید.
                </div>
              ) : (
                <select
                  value={selectedSimSender}
                  onChange={(e) => setSelectedSimSender(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1.5">متن پیامک ارسالی:</label>
              <textarea
                value={simMessageText}
                onChange={(e) => setSimMessageText(e.target.value)}
                placeholder="مثال: سلام خسته نباشید واسه فردا ۵۰ کیلو شیر زحمت بکشید..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-right leading-relaxed"
              />
            </div>

            <button
              onClick={() => handleSimulateSMS()}
              disabled={isParsing || customers.length === 0}
              className={`w-full py-3 px-4 rounded-xl text-white text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                isParsing 
                  ? "bg-blue-400 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 active:scale-95"
              }`}
            >
              {isParsing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>هوش مصنوعی در حال تفسیر پیام...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 rotate-180" />
                  <span>ارسال پیامک شبیه‌سازی‌شده به گوشی</span>
                </>
              )}
            </button>

            {parsingError && (
              <div className="bg-red-50 text-red-700 p-3 rounded-xl border border-red-100 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{parsingError}</span>
              </div>
            )}
          </div>

          {/* Parsed Result Showcase */}
          {lastParsedResult && (
            <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-4 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  نتیجه تحلیل زنده Gemini:
                </span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-mono">200 OK</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                  <p className="text-[10px] text-slate-400">میزان شیر استخراج شده</p>
                  <p className="font-black text-slate-900 mt-0.5">
                    {lastParsedResult.milk_quantity !== null ? `${lastParsedResult.milk_quantity} کیلوگرم` : "نامشخص / غیرمرتبط"}
                  </p>
                </div>
                <div className="bg-white p-2.5 rounded-xl border border-emerald-100">
                  <p className="text-[10px] text-slate-400">وضعیت لغو سفارش</p>
                  <p className="font-bold mt-0.5">
                    {lastParsedResult.is_cancelled ? (
                      <span className="text-red-600">بله (کنسل شده)</span>
                    ) : (
                      <span className="text-emerald-600">خیر</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-emerald-100 text-xs text-slate-700 leading-relaxed">
                <span className="font-bold text-slate-800">توضیح هوش مصنوعی:</span> {lastParsedResult.explanation}
              </div>
            </div>
          )}

          {/* System Logs */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 block">لاگ وقایع دریافت پیامک (زنده):</span>
            <div className="bg-slate-900 text-slate-300 p-3 rounded-xl font-mono text-[10px] h-[130px] overflow-y-auto space-y-1.5">
              {simulationLogs.length === 0 ? (
                <p className="text-slate-500 italic text-center pt-8">پیامی ارسال نشده است...</p>
              ) : (
                simulationLogs.map((log, idx) => (
                  <p key={idx} className="truncate">{log}</p>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 
        ========================================================================
        LEFT COLUMN: ANDROID MOBILE INTERFACE SIMULATOR
        ========================================================================
      */}
      <div id="android-device" className="relative bg-slate-950 p-4 pb-14 pt-12 rounded-[50px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] border-4 border-slate-800 w-full max-w-[450px] aspect-[9/19] h-[850px] flex flex-col overflow-hidden">
        
        {/* Speaker Bezel */}
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-32 h-5 bg-slate-900 rounded-full flex items-center justify-center gap-1.5 z-50">
          <div className="w-12 h-1 bg-slate-700 rounded-full"></div>
          <div className="w-2.5 h-2.5 bg-slate-800 rounded-full border border-slate-700"></div>
        </div>

        {/* Screen Status Bar */}
        <div className="bg-[#1e293b] text-slate-200 px-6 pt-2 pb-1.5 flex justify-between items-center text-[10px] font-mono z-40 select-none">
          <span>{formatPersianTime(currentAppTime)}</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-blue-300">شیفت {isPastCutoff ? "شب" : "روز"}</span>
            <div className="w-5 h-2.5 bg-slate-700 rounded-sm relative flex items-center px-0.5">
              <div className="w-3.5 h-1.5 bg-green-500 rounded-xs"></div>
            </div>
          </div>
        </div>

        {/* Device Interface */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden relative rounded-2xl">
          
          {/* Active Date & Reporting Header */}
          <header className="bg-white border-b border-slate-200 p-4 shadow-sm shrink-0 flex flex-col gap-2.5">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">گزارش سفارشات شیر</h1>
                <p className="text-base font-black text-slate-800">
                  {formatPersianDateFull(activeDeliveryDate)}
                </p>
              </div>
              <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-2.5 py-1 text-[10px] font-bold text-center">
                تاریخ سفارش: {formatPersianDateShort(currentAppTime)}
              </div>
            </div>

            {/* Total Indicator Panel */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-3 flex justify-between items-center shadow-md">
              <div className="space-y-0.5">
                <span className="text-[10px] text-blue-100 font-bold block">مجموع کل شیر مورد نیاز فردا</span>
                <div className="text-2xl font-black flex items-baseline gap-1">
                  <span>{totalMilkQuantity.toLocaleString("fa-IR")}</span>
                  <span className="text-xs font-medium">کیلوگرم</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Layers className="w-5 h-5 text-white" />
              </div>
            </div>

            {/* Shift Banner & Shift Setting Indicator */}
            <div className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-[10px] text-amber-900 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-ping"></span>
                <span>
                  {isPastCutoff 
                    ? `ساعت کاری روز پایان یافته. نمایش سفارشات فردا` 
                    : `ساعت کاری روز در جریان است. سفارشات فعال امروز`
                  }
                </span>
              </div>
              <span className="bg-white text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded font-bold">
                تغییر شیفت: {settings.cutoffHour}:00
              </span>
            </div>
          </header>

          {/* 
            ========================================================================
            SCREEN CONTENT VIEWER
            ========================================================================
          */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {/* 1. DASHBOARD VIEW */}
            {activeTab === "dashboard" && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Active Deliveries List */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-black text-slate-700">ریز نیاز و جزئیات سفارشات</h3>
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-bold">
                      {activeDeliveryOrders.length} سفارش ثبت‌شده
                    </span>
                  </div>

                  {activeDeliveryOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto">
                        <Calendar className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-700">هیچ سفارشی ثبت نشده است</p>
                        <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs mx-auto">
                          برای این تاریخ هنوز پیامک تایید شده‌ای ثبت نشده است. از پانل سمت راست برای فرستادن پیامک تستی استفاده کنید.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeDeliveryOrders.map((order) => (
                        <div
                          key={order.id}
                          onClick={() => {
                            const c = customers.find(x => x.id === order.contactId);
                            if (c) setSelectedDetailCustomer(c);
                          }}
                          className={`p-3 bg-white rounded-2xl border transition-all hover:border-blue-300 shadow-xs cursor-pointer flex flex-col gap-2 relative group overflow-hidden ${
                            order.isCancelled ? "border-red-100 bg-red-50/20" : "border-slate-200/80"
                          }`}
                        >
                          {/* Cancel indicator accent */}
                          {order.isCancelled && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-red-500" />
                          )}
                          {!order.isCancelled && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-emerald-500" />
                          )}

                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                order.isCancelled ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"
                              }`}>
                                {order.contactName.substring(0, 2)}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800">{order.contactName}</h4>
                                <span className="text-[9px] text-slate-400">{order.contactPhone}</span>
                              </div>
                            </div>

                            <div className="text-left">
                              {order.isCancelled ? (
                                <span className="text-xs font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-lg">لغو شده</span>
                              ) : (
                                <span className="text-sm font-black text-slate-900 italic">
                                  {order.milkQuantity} <span className="text-[10px] font-normal not-italic">کیلو</span>
                                </span>
                              )}
                              <span className="text-[9px] text-slate-400 block mt-0.5">
                                {formatPersianTime(new Date(order.receivedAt))}
                              </span>
                            </div>
                          </div>

                          <div className="bg-slate-50/70 rounded-xl p-2 text-[10px] text-slate-500 border border-slate-100 space-y-1">
                            <p className="line-clamp-1"><strong className="text-slate-600">پیامک:</strong> {order.messageText}</p>
                            <p className="text-blue-600 font-bold flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-blue-500" />
                              <span>تعبیر: {order.explanation}</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Interactive Settings Inside Tab */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-slate-500" />
                      تنظیمات شیفت و زمان شبیه‌ساز
                    </h4>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <p className="font-bold text-slate-700">ساعت تغییر شیفت</p>
                        <p className="text-[9px] text-slate-400">سفارش فردا از ساعت چند نمایش داده شود؟</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={settings.cutoffHour}
                          onChange={(e) => setSettings({ ...settings, cutoffHour: parseInt(e.target.value) })}
                          className="bg-white border border-slate-200 rounded px-2 py-1 font-bold text-slate-800"
                        >
                          {Array.from({ length: 24 }).map((_, h) => (
                            <option key={h} value={h}>{h < 10 ? `0${h}` : h}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-bold text-slate-700">تست و تغییر زمان سیستم</p>
                          <p className="text-[9px] text-slate-400">برای آزمایش نحوه جابجایی خودکار شیفت‌ها</p>
                        </div>
                        <button
                          onClick={() => setUseSimulatedClock(!useSimulatedClock)}
                          className={`px-2.5 py-1 rounded text-[9px] font-black transition-all ${
                            useSimulatedClock 
                              ? "bg-blue-600 text-white" 
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {useSimulatedClock ? "ساعت مجازی" : "ساعت واقعی گوشی"}
                        </button>
                      </div>

                      {useSimulatedClock && (
                        <div className="flex gap-2 items-center justify-end pt-1 border-t border-slate-200/50">
                          <span className="text-[10px] text-slate-500">ساعت فرضی:</span>
                          <input
                            type="range"
                            min="0"
                            max="23"
                            value={simulatedHour}
                            onChange={(e) => setSimulatedHour(parseInt(e.target.value))}
                            className="w-24 accent-blue-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <span className="font-bold text-blue-600 bg-white border border-blue-100 px-1.5 py-0.5 rounded font-mono text-[10px]">
                            {simulatedHour < 10 ? `0${simulatedHour}` : simulatedHour}:00
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* 2. HISTORY VIEW */}
            {activeTab === "history" && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-700">تاریخچه کامل پیام‌ها و تحلیل‌ها</h3>
                </div>

                {/* Filter and Search controls */}
                <div className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2.5 shadow-xs">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="جستجو در پیام‌ها یا مخاطب..."
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                    />
                  </div>

                  <div className="flex gap-2 items-center">
                    <span className="text-[10px] font-bold text-slate-400 shrink-0">فیلتر مخاطب:</span>
                    <select
                      value={selectedHistoryCustomer}
                      onChange={(e) => setSelectedHistoryCustomer(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="all">همه مشتریان</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Logs Timeline */}
                <div className="space-y-2.5">
                  {filteredHistoryOrders.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
                      موردی یافت نشد.
                    </div>
                  ) : (
                    filteredHistoryOrders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => {
                          const c = customers.find(x => x.id === order.contactId);
                          if (c) setSelectedDetailCustomer(c);
                        }}
                        className="bg-white border border-slate-200 rounded-2xl p-3 shadow-xs space-y-2 hover:border-slate-300 transition-colors cursor-pointer"
                      >
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-bold text-slate-800">{order.contactName}</span>
                          <span className="text-[9px] text-slate-400 font-mono">
                            {formatPersianDateTime(new Date(order.receivedAt))}
                          </span>
                        </div>

                        <p className="text-slate-600 text-[10px] leading-relaxed bg-slate-50 p-2 rounded-xl font-mono text-right border border-slate-100">
                          {order.messageText}
                        </p>

                        <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                          <span className="text-[10px] text-blue-600 font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                            {order.explanation}
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                            order.isCancelled 
                              ? "bg-red-50 text-red-700 border border-red-100" 
                              : order.milkQuantity !== null 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : "bg-slate-100 text-slate-600"
                          }`}>
                            {order.isCancelled ? "لغو" : order.milkQuantity !== null ? `${order.milkQuantity} کیلو` : "نامرتبط"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 3. CUSTOMERS VIEW */}
            {activeTab === "customers" && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-black text-slate-700">لیست مشتریان ثابت</h3>
                  <button
                    onClick={() => setShowAddCustomerModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>مشتری جدید</span>
                  </button>
                </div>

                {/* Add Customer Form Modal Overlay */}
                {showAddCustomerModal && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-md space-y-3 animate-fadeIn">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <h4 className="text-xs font-black text-slate-800">افزودن مشتری ثابت جدید</h4>
                      <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
                      <div className="space-y-1">
                        <label className="text-slate-500 block font-bold">نام مشتری:</label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: اکبر محمدی (سوپرمارکت بهار)"
                          value={newCustName}
                          onChange={(e) => setNewCustName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 block font-bold">شماره تلفن همراه:</label>
                        <input
                          type="text"
                          required
                          placeholder="مثال: 09121234567"
                          value={newCustPhone}
                          onChange={(e) => setNewCustPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 block font-bold">شناسه مخفف/لقب (برای تشخیص هوشمند):</label>
                        <input
                          type="text"
                          placeholder="مثال: محمدی"
                          value={newCustAlias}
                          onChange={(e) => setNewCustAlias(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAddCustomerModal(false)}
                          className="bg-slate-100 text-slate-600 px-3 py-2 rounded-xl font-bold"
                        >
                          انصراف
                        </button>
                        <button
                          type="submit"
                          className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold"
                        >
                          ذخیره مشتری
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Customer Search */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="جستجو در بین مشتریان..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
                  />
                </div>

                {/* Customer list container */}
                <div className="space-y-2">
                  {customers
                    .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                    .map((customer) => (
                      <div
                        key={customer.id}
                        onClick={() => setSelectedDetailCustomer(customer)}
                        className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-xs hover:border-slate-300 transition-colors cursor-pointer flex justify-between items-center group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-slate-100 text-slate-700 font-black rounded-full flex items-center justify-center text-xs">
                            {customer.name.substring(0, 2)}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-800">{customer.name}</h4>
                            <span className="text-[9px] text-slate-400 font-mono">{customer.phone}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCustomer(customer.id, customer.name);
                            }}
                            className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="حذف مشتری"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <ChevronLeft className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-transform" />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

          </div>

          {/* 
            ========================================================================
            CUSTOMER DETAIL BOTTOM SHEET / MODAL CARD (کارنامه مشتری)
            ========================================================================
          */}
          {selectedDetailCustomer && (
            <div className="absolute inset-0 bg-black/40 z-50 flex flex-col justify-end animate-fadeIn">
              <div className="bg-white rounded-t-[30px] p-5 max-h-[85%] overflow-y-auto space-y-4 shadow-2xl border-t border-slate-200 transition-transform">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-black text-sm">
                      {selectedDetailCustomer.name.substring(0, 2)}
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-slate-800">{selectedDetailCustomer.name}</h4>
                      <p className="text-[10px] text-slate-400">{selectedDetailCustomer.phone}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDetailCustomer(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Lifetime Stats */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100">
                    <span className="text-[9px] text-slate-400 block">شیر خرید شده</span>
                    <span className="font-black text-indigo-900 mt-1 block">{customerLifetimeStats.total} کیلو</span>
                  </div>
                  <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100">
                    <span className="text-[9px] text-slate-400 block">تعداد سفارش</span>
                    <span className="font-black text-emerald-950 mt-1 block">{customerLifetimeStats.ordersCount} پیام</span>
                  </div>
                  <div className="bg-red-50/50 p-2.5 rounded-xl border border-red-100">
                    <span className="text-[9px] text-slate-400 block">تعداد لغو شده</span>
                    <span className="font-black text-red-950 mt-1 block">{customerLifetimeStats.cancelsCount} روز</span>
                  </div>
                </div>

                {/* Specific History Timeline */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 block">سابقه سفارشات ثبت شده و تفاسیر:</span>
                  
                  {customerHistoryTimeline.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic text-center py-4">هیچ سفارشی برای این مخاطب ثبت نشده است.</p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {customerHistoryTimeline.map((item) => (
                        <div key={item.id} className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl space-y-1 text-xs">
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span>{formatPersianDateTime(new Date(item.receivedAt))}</span>
                            <span className={`px-2 py-0.5 rounded-md font-bold ${
                              item.isCancelled ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"
                            }`}>
                              {item.isCancelled ? "لغو شده" : `${item.milkQuantity} کیلو`}
                            </span>
                          </div>
                          <p className="text-slate-600 font-mono italic">{item.messageText}</p>
                          <p className="text-blue-600 font-bold flex items-center gap-1 text-[10px]">
                            <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>تفصیر هوشمند: {item.explanation}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Set template text to quickly mock sms for this contact
                      setSelectedSimSender(selectedDetailCustomer.id);
                      setSimMessageText("سلام برای فردا زحمت بکشید ۷۵ کیلو بفرستید");
                      setSelectedDetailCustomer(null);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-3 rounded-xl text-xs font-bold transition-colors text-center"
                  >
                    شبیه‌سازی سفارش جدید
                  </button>
                  <button
                    onClick={() => {
                      handleDeleteCustomer(selectedDetailCustomer.id, selectedDetailCustomer.name);
                    }}
                    className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-2.5 rounded-xl text-xs"
                    title="حذف مخاطب"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Bottom Device Tab Bar Navigation */}
          <footer className="h-16 bg-white border-t border-slate-200 shrink-0 flex items-center justify-around px-2 z-40 select-none">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex flex-col items-center flex-1 py-2 gap-1 transition-all ${
                activeTab === "dashboard" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[9px] font-black">خانه</span>
            </button>

            <button
              onClick={() => setActiveTab("history")}
              className={`flex flex-col items-center flex-1 py-2 gap-1 transition-all ${
                activeTab === "history" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <HistoryIcon className="w-5 h-5" />
              <span className="text-[9px] font-black">تاریخچه</span>
            </button>

            <button
              onClick={() => setActiveTab("customers")}
              className={`flex flex-col items-center flex-1 py-2 gap-1 transition-all ${
                activeTab === "customers" ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[9px] font-black">مشتریان</span>
            </button>
          </footer>

        </div>

        {/* Android Home Navigation Pill Bar */}
        <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-slate-700 rounded-full"></div>
      </div>

    </div>
  );
}
