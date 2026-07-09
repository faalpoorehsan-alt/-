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
import { Customer, MilkOrder, AppSettings, DeliveryRecord } from "./types";
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
import { parseMilkMessageLocally } from "./localParser";

export default function App() {
  // --- Persistent States ---
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem("milk_customers");
    return saved ? JSON.parse(saved) : [];
  });

  const [orders, setOrders] = useState<MilkOrder[]>(() => {
    const saved = localStorage.getItem("milk_orders");
    return saved ? JSON.parse(saved) : [];
  });

  const [deliveryRecords, setDeliveryRecords] = useState<DeliveryRecord[]>(() => {
    const saved = localStorage.getItem("milk_delivery_records");
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem("milk_settings");
    return saved ? JSON.parse(saved) : { cutoffHour: 20, cutoffMinute: 0 };
  });

  const [isSyncing, setIsSyncing] = useState(false);

  // Keep track of the last state that was loaded/synced to the server to prevent infinite loops
  const lastServerStateRef = React.useRef({
    customers: "",
    orders: "",
    settings: "",
    deliveryRecords: ""
  });

  // Load from Server on Mount
  useEffect(() => {
    const fetchFromServer = async () => {
      try {
        const res = await fetch("/api/data");
        if (res.ok) {
          const data = await res.json();
          if (data.customers) {
            lastServerStateRef.current.customers = JSON.stringify(data.customers);
            setCustomers(data.customers);
          }
          if (data.orders) {
            lastServerStateRef.current.orders = JSON.stringify(data.orders);
            setOrders(data.orders);
          }
          if (data.settings) {
            lastServerStateRef.current.settings = JSON.stringify(data.settings);
            setSettings(data.settings);
          }
          if (data.deliveryRecords) {
            lastServerStateRef.current.deliveryRecords = JSON.stringify(data.deliveryRecords);
            setDeliveryRecords(data.deliveryRecords);
          }
        }
      } catch (err) {
        console.warn("Could not fetch initial database state from server. Operating in offline/local-first mode:", err);
      }
    };
    fetchFromServer();
  }, []);

  // Save to server & localStorage in a unified, debounced way to avoid race conditions
  useEffect(() => {
    // 1. Always update local storage
    localStorage.setItem("milk_customers", JSON.stringify(customers));
    localStorage.setItem("milk_orders", JSON.stringify(orders));
    localStorage.setItem("milk_settings", JSON.stringify(settings));
    localStorage.setItem("milk_delivery_records", JSON.stringify(deliveryRecords));

    // 2. Check if local state is actually mutated from what we last loaded/sent
    const currentCustStr = JSON.stringify(customers);
    const currentOrdStr = JSON.stringify(orders);
    const currentSetStr = JSON.stringify(settings);
    const currentDelStr = JSON.stringify(deliveryRecords);

    const isCustChanged = currentCustStr !== lastServerStateRef.current.customers;
    const isOrdChanged = currentOrdStr !== lastServerStateRef.current.orders;
    const isSetChanged = currentSetStr !== lastServerStateRef.current.settings;
    const isDelChanged = currentDelStr !== lastServerStateRef.current.deliveryRecords;

    if (isCustChanged || isOrdChanged || isSetChanged || isDelChanged) {
      const timer = setTimeout(async () => {
        try {
          setIsSyncing(true);
          await fetch("/api/save-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customers: isCustChanged ? customers : undefined,
              orders: isOrdChanged ? orders : undefined,
              settings: isSetChanged ? settings : undefined,
              deliveryRecords: isDelChanged ? deliveryRecords : undefined
            })
          });
          // Update the references to reflect the successfully saved state
          lastServerStateRef.current.customers = currentCustStr;
          lastServerStateRef.current.orders = currentOrdStr;
          lastServerStateRef.current.settings = currentSetStr;
          lastServerStateRef.current.deliveryRecords = currentDelStr;
        } catch (err) {
          console.warn("Failed to sync local changes with server:", err);
        } finally {
          setIsSyncing(false);
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [customers, orders, settings, deliveryRecords]);

  // Polling for new background SMS orders every 5 seconds
  useEffect(() => {
    let active = true;

    // Check if we have any pending local changes that are not synced yet
    const localCustStr = JSON.stringify(customers);
    const localOrdStr = JSON.stringify(orders);
    const localSetStr = JSON.stringify(settings);
    const localDelStr = JSON.stringify(deliveryRecords);

    const hasUnsavedChanges =
      localCustStr !== lastServerStateRef.current.customers ||
      localOrdStr !== lastServerStateRef.current.orders ||
      localSetStr !== lastServerStateRef.current.settings ||
      localDelStr !== lastServerStateRef.current.deliveryRecords;

    const interval = setInterval(async () => {
      // If we are actively saving or have pending local changes, skip polling to avoid race conditions/overwriting
      if (hasUnsavedChanges || isSyncing) {
        return;
      }

      try {
        const res = await fetch("/api/data");
        if (res.ok && active) {
          const data = await res.json();
          
          const serverCustStr = JSON.stringify(data.customers || []);
          const serverOrdStr = JSON.stringify(data.orders || []);
          const serverSetStr = JSON.stringify(data.settings || {});
          const serverDelStr = JSON.stringify(data.deliveryRecords || []);

          const currentCustStr = JSON.stringify(customers);
          const currentOrdStr = JSON.stringify(orders);
          const currentSetStr = JSON.stringify(settings);
          const currentDelStr = JSON.stringify(deliveryRecords);

          // Update only if server differs from our last state, AND we haven't mutated it differently locally
          if (serverCustStr !== lastServerStateRef.current.customers && serverCustStr !== currentCustStr) {
            lastServerStateRef.current.customers = serverCustStr;
            setCustomers(data.customers);
          }
          if (serverOrdStr !== lastServerStateRef.current.orders && serverOrdStr !== currentOrdStr) {
            lastServerStateRef.current.orders = serverOrdStr;
            setOrders(data.orders);
          }
          if (serverSetStr !== lastServerStateRef.current.settings && serverSetStr !== currentSetStr) {
            lastServerStateRef.current.settings = serverSetStr;
            setSettings(data.settings);
          }
          if (serverDelStr !== lastServerStateRef.current.deliveryRecords && serverDelStr !== currentDelStr) {
            lastServerStateRef.current.deliveryRecords = serverDelStr;
            setDeliveryRecords(data.deliveryRecords);
          }
        }
      } catch (err) {
        // Polling failed (e.g. temporary offline/rebuilding state). Quiet log to prevent console spam.
        console.log("Database sync check deferred: Network unavailable or connection paused.");
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [customers, orders, settings, deliveryRecords, isSyncing]);

  // --- Real Time Clock ---
  const [realTime, setRealTime] = useState<Date>(new Date());

  // Update real clock every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRealTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const currentAppTime = realTime;

  // --- Active Delivery Date Toggle Mode ---
  // "today" (shows today's delivery) | "tomorrow" (shows tomorrow's delivery)
  const [dashboardDateMode, setDashboardDateMode] = useState<"today" | "tomorrow">("today");

  const activeDeliveryDate = useMemo(() => {
    if (dashboardDateMode === "today") {
      return new Date(currentAppTime);
    }
    const tomorrow = new Date(currentAppTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }, [dashboardDateMode, currentAppTime]);

  // Check if the currently viewed delivery date is today
  const isViewingToday = useMemo(() => {
    const activeKey = getStableDateKey(activeDeliveryDate);
    const todayKey = getStableDateKey(currentAppTime);
    return activeKey === todayKey;
  }, [activeDeliveryDate, currentAppTime]);



  // --- Active Tab ---
  // "dashboard" | "history" | "customers"
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [dashboardViewMode, setDashboardViewMode] = useState<"list" | "details">("list");

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

  // --- Cleaner UI Modals ---
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPasteSMSModal, setShowPasteSMSModal] = useState(false);

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

  // --- 100% Offline Local Parser (No Server/API required) ---
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
    addSimLog(`در حال تفسیر آفلاین پیامک از ${contact.name}...`);

    // Simulate a ultra-fast local processing latency of 150ms for elegant UI feedback
    await new Promise((resolve) => setTimeout(resolve, 150));

    try {
      const result = parseMilkMessageLocally(textToParse, contact.name);
      
      const now = new Date(currentAppTime);
      const deliveryDate = getDeliveryDateForOrderReceivedAt(now, settings.cutoffHour, settings.cutoffMinute);

      const newOrder: MilkOrder = {
        id: "order-" + Date.now() + Math.random().toString(36).substring(2, 5),
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        messageText: textToParse,
        receivedAt: now.toISOString(),
        milkQuantity: result.milk_quantity,
        isCancelled: result.is_cancelled,
        isMilkRequest: result.is_milk_request,
        isIncremental: result.is_incremental,
        explanation: result.explanation,
        parsedSuccessfully: true,
      };

      setOrders((prev) => [newOrder, ...prev]);
      setLastParsedResult(result);
      addSimLog(`[پردازش محلی] پیامک با موفقیت تفسیر شد: ${result.explanation}`);
      
      // Clear manual input
      if (!overrideText) {
        setSimMessageText("");
      }
    } catch (err: any) {
      console.error(err);
      setParsingError(err.message || "خطا در پردازش آفلاین پیام.");
      addSimLog(`خطا در تفسیر: ${err.message || "خطای نامشخص"}`);
    } finally {
      setIsParsing(false);
    }
  };

  // --- Orders Filtered by Active Delivery Date (Deduplicated, keeping latest per customer) ---
  const activeDeliveryOrders = useMemo(() => {
    // Current display date in comparison format
    const activeDateKey = getStableDateKey(activeDeliveryDate);

    // 1. Get all requests for this delivery date
    const matchingRequests = orders.filter((order) => {
      const orderReceivedDate = new Date(order.receivedAt);
      const orderDeliveryDate = getDeliveryDateForOrderReceivedAt(orderReceivedDate, settings.cutoffHour, settings.cutoffMinute);
      const orderDeliveryDateKey = getStableDateKey(orderDeliveryDate);
      return orderDeliveryDateKey === activeDateKey && order.isMilkRequest;
    });

    // 2. Resolve duplicates and cumulative orders per customer chronologically
    const customerOrdersState: Record<string, {
      quantity: number;
      isCancelled: boolean;
      explanation: string;
      latestOrder: MilkOrder;
      history: { q: number | null, isC: boolean, isInc: boolean, text: string }[];
    }> = {};

    // Sort oldest to newest, so we compute from first request to latest
    const sortedRequests = [...matchingRequests].sort((a, b) => 
      new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
    );

    for (const order of sortedRequests) {
      // Group by contactId (or phone if unknown contact)
      const key = order.contactId || order.contactPhone;
      
      if (!customerOrdersState[key]) {
        customerOrdersState[key] = {
          quantity: 0,
          isCancelled: false,
          explanation: "",
          latestOrder: order,
          history: []
        };
      }
      
      const state = customerOrdersState[key];
      state.latestOrder = order; // update latest order reference
      
      const q = order.milkQuantity ?? 0;
      
      if (order.isCancelled) {
        state.quantity = 0;
        state.isCancelled = true;
        state.explanation = "لغو سفارش";
        state.history.push({ q: 0, isC: true, isInc: false, text: order.messageText });
      } else if (order.isIncremental) {
        const prevQ = state.quantity;
        state.quantity = prevQ + q;
        state.isCancelled = false;
        state.explanation = `افزایش سفارش: ${prevQ} + ${q} = ${state.quantity} کیلو`;
        state.history.push({ q, isC: false, isInc: true, text: order.messageText });
      } else {
        state.quantity = q;
        state.isCancelled = false;
        state.explanation = `ثبت سفارش جدید: ${q} کیلو`;
        state.history.push({ q, isC: false, isInc: false, text: order.messageText });
      }
    }

    // Construct virtual MilkOrders representing the final active state for each customer
    const compiledOrders: MilkOrder[] = Object.entries(customerOrdersState).map(([key, state]) => {
      const latest = state.latestOrder;
      
      // Let's build a nice explanation showing the progression if there was history
      let finalExplanation = latest.explanation;
      if (state.history.length > 1) {
        const steps = [...state.history].map(h => {
          if (h.isC) return "کنسلی";
          if (h.isInc) return `+${h.q}`;
          return `${h.q}`;
        }).join(" 🡰 ");
        finalExplanation = `مجموع سفارش: ${state.quantity} کیلوگرم (روند: ${steps})`;
      }

      return {
        ...latest,
        milkQuantity: state.isCancelled ? 0 : state.quantity,
        isCancelled: state.isCancelled,
        explanation: finalExplanation,
      };
    });

    // 3. Return as a list, sorted newest-first for UI presentation
    return compiledOrders.sort((a, b) => 
      new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
    );
  }, [orders, activeDeliveryDate]);

  // --- Merge Compiled Orders with Delivery Checklist Status and Custom Quantity Overrides ---
  const ordersWithDeliveryStatus = useMemo(() => {
    const dateKey = getStableDateKey(activeDeliveryDate);
    return activeDeliveryOrders.map((order) => {
      const custId = order.contactId || order.contactPhone;
      const record = deliveryRecords.find(
        (r) => r.dateKey === dateKey && r.customerId === custId
      );

      return {
        ...order,
        isDelivered: record ? record.isDelivered : false,
        deliveredQuantity: record ? record.deliveredQuantity : (order.milkQuantity || 0),
      };
    });
  }, [activeDeliveryOrders, deliveryRecords, activeDeliveryDate]);

  // --- Calculate total milk ordered for active display date ---
  const totalMilkQuantity = useMemo(() => {
    return ordersWithDeliveryStatus.reduce((sum, order) => {
      if (order.isCancelled) return sum;
      return sum + (order.milkQuantity || 0);
    }, 0);
  }, [ordersWithDeliveryStatus]);

  // --- Calculate remaining milk to deliver ---
  const remainingMilkQuantity = useMemo(() => {
    return ordersWithDeliveryStatus.reduce((sum, order) => {
      if (order.isCancelled || order.isDelivered) return sum;
      return sum + (order.deliveredQuantity || 0);
    }, 0);
  }, [ordersWithDeliveryStatus]);

  // --- Toggle Delivery Status ---
  const handleToggleDelivered = (order: any) => {
    const dateKey = getStableDateKey(activeDeliveryDate);
    const custId = order.contactId || order.contactPhone;

    setDeliveryRecords((prev) => {
      const existingIdx = prev.findIndex(
        (r) => r.dateKey === dateKey && r.customerId === custId
      );

      const defaultQty = order.milkQuantity || 0;

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          isDelivered: !updated[existingIdx].isDelivered,
        };
        return updated;
      } else {
        const newRecord: DeliveryRecord = {
          id: `del-${custId}-${dateKey}-${Date.now()}`,
          dateKey,
          customerId: custId,
          isDelivered: true,
          deliveredQuantity: defaultQty,
        };
        return [...prev, newRecord];
      }
    });
  };

  // --- Update Delivered Quantity Overrides ---
  const handleUpdateDeliveredQuantity = (order: any, quantity: number) => {
    const dateKey = getStableDateKey(activeDeliveryDate);
    const custId = order.contactId || order.contactPhone;

    setDeliveryRecords((prev) => {
      const existingIdx = prev.findIndex(
        (r) => r.dateKey === dateKey && r.customerId === custId
      );

      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          deliveredQuantity: quantity,
        };
        return updated;
      } else {
        const newRecord: DeliveryRecord = {
          id: `del-${custId}-${dateKey}-${Date.now()}`,
          dateKey,
          customerId: custId,
          isDelivered: false,
          deliveredQuantity: quantity,
        };
        return [...prev, newRecord];
      }
    });
  };

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
  const handleResetToPresets = async () => {
    if (window.confirm("آیا مایلید لیست مشتریان و تاریخچه سفارشات به مقادیر اولیه و نمونه بازیابی شوند؟")) {
      const mockOrders = generateMockHistory(INITIAL_CUSTOMERS);
      const defaultSettings = { cutoffHour: 20, cutoffMinute: 0 };
      const defaultDeliveryRecords: DeliveryRecord[] = [];

      // Update states immediately
      setCustomers(INITIAL_CUSTOMERS);
      setOrders(mockOrders);
      setSettings(defaultSettings);
      setDeliveryRecords(defaultDeliveryRecords);

      // Clear local storage immediately
      localStorage.setItem("milk_customers", JSON.stringify(INITIAL_CUSTOMERS));
      localStorage.setItem("milk_orders", JSON.stringify(mockOrders));
      localStorage.setItem("milk_settings", JSON.stringify(defaultSettings));
      localStorage.setItem("milk_delivery_records", JSON.stringify(defaultDeliveryRecords));

      // Synchronize lastServerStateRef immediately to prevent subsequent overwrite
      lastServerStateRef.current = {
        customers: JSON.stringify(INITIAL_CUSTOMERS),
        orders: JSON.stringify(mockOrders),
        settings: JSON.stringify(defaultSettings),
        deliveryRecords: JSON.stringify(defaultDeliveryRecords),
      };

      addSimLog("کل سیستم به داده‌های نمونه اولیه ریست شد.");

      // Direct synchronous POST to central server to avoid any race conditions
      try {
        await fetch("/api/save-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customers: INITIAL_CUSTOMERS,
            orders: mockOrders,
            settings: defaultSettings,
            deliveryRecords: defaultDeliveryRecords
          }),
        });
      } catch (err) {
        console.error("Direct save failed:", err);
      }
    }
  };

  // --- Wipe entire database ---
  const handleClearDatabase = async () => {
    if (window.confirm("⚠️ آیا از حذف کل داده‌های مشتریان و کل تاریخچه سفارشات اطمینان دارید؟ این عمل غیرقابل بازگشت است.")) {
      const emptyCust: Customer[] = [];
      const emptyOrd: MilkOrder[] = [];
      const defaultSettings = { cutoffHour: 20, cutoffMinute: 0 };
      const emptyDelRec: DeliveryRecord[] = [];

      // Update states immediately
      setCustomers(emptyCust);
      setOrders(emptyOrd);
      setDeliveryRecords(emptyDelRec);
      setSettings(defaultSettings);

      // Clear local storage immediately
      localStorage.setItem("milk_customers", JSON.stringify(emptyCust));
      localStorage.setItem("milk_orders", JSON.stringify(emptyOrd));
      localStorage.setItem("milk_delivery_records", JSON.stringify(emptyDelRec));
      localStorage.setItem("milk_settings", JSON.stringify(defaultSettings));

      // Synchronize lastServerStateRef immediately to prevent subsequent overwrite
      lastServerStateRef.current = {
        customers: JSON.stringify(emptyCust),
        orders: JSON.stringify(emptyOrd),
        settings: JSON.stringify(defaultSettings),
        deliveryRecords: JSON.stringify(emptyDelRec),
      };

      addSimLog("کل پایگاه داده سیستم پاکسازی و خالی شد.");

      // Direct synchronous POST to central server to avoid any race conditions
      try {
        await fetch("/api/save-state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customers: emptyCust,
            orders: emptyOrd,
            settings: defaultSettings,
            deliveryRecords: emptyDelRec
          }),
        });
      } catch (err) {
        console.error("Direct save failed:", err);
      }
    }
  };

  // --- Import from native Android contacts via Contact Picker API ---
  const handleImportFromAndroidContacts = async () => {
    if ("contacts" in navigator && "select" in (navigator as any).contacts) {
      try {
        const props = ["name", "tel"];
        const opts = { multiple: true };
        const contactsList = await (navigator as any).contacts.select(props, opts);
        
        if (contactsList && contactsList.length > 0) {
          const newCustomers: Customer[] = contactsList
            .map((c: any) => {
              const name = c.name && c.name[0] ? c.name[0] : "مخاطب جدید";
              const phone = c.tel && c.tel[0] ? c.tel[0].replace(/\s+/g, "") : "";
              return {
                id: "cust-" + Date.now() + Math.random().toString(36).substr(2, 5),
                name: name,
                phone: phone,
                alias: name.split(" ")[0] || name,
                createdAt: new Date().toISOString(),
              };
            })
            .filter((c: Customer) => c.phone !== "");

          if (newCustomers.length > 0) {
            setCustomers((prev) => {
              const existingPhones = new Set(prev.map((item) => item.phone));
              const filteredNew = newCustomers.filter((item) => !existingPhones.has(item.phone));
              return [...prev, ...filteredNew];
            });
            addSimLog(`${newCustomers.length} مخاطب با موفقیت از دفترچه تلفن گوشی اندروید وارد شد.`);
          } else {
            alert("هیچ شماره تلفن معتبری در مخاطبین انتخاب شده یافت نشد.");
          }
        }
      } catch (err: any) {
        console.error(err);
        addSimLog(`خطا در دسترسی به مخاطبین: ${err.message}`);
      }
    } else {
      alert(
        "این امکان فقط بر روی مرورگرهای اندروید (مانند Chrome یا Samsung Internet) پشتیبانی می‌شود.\n\nجهت استفاده، وب‌اپلیکیشن را طبق راهنما به صفحه اصلی اندروید اضافه کنید تا به عنوان برنامه محلی با ویژگی‌های کامل اجرا گردد."
      );
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
    <div id="main-app" className="min-h-screen bg-[#eceff1] flex flex-col p-0 lg:p-6 justify-center items-center font-sans select-none overflow-x-hidden">
      
      {/* 
        ========================================================================
        PRODUCTION MOBILE INTERFACE (CENTRAL DEVICE STAGE)
        ========================================================================
      */}
      <div id="android-device" className="w-full h-screen lg:h-[850px] lg:max-w-[450px] lg:aspect-[9/19] lg:relative lg:bg-slate-950 lg:p-4 lg:pb-14 lg:pt-12 lg:rounded-[50px] lg:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.4)] lg:border-4 lg:border-slate-800 flex flex-col overflow-hidden bg-slate-50">
        
        {/* Speaker Bezel */}
        <div className="hidden lg:flex absolute top-4 left-1/2 transform -translate-x-1/2 w-32 h-5 bg-slate-900 rounded-full items-center justify-center gap-1.5 z-50">
          <div className="w-12 h-1 bg-slate-700 rounded-full"></div>
          <div className="w-2.5 h-2.5 bg-slate-800 rounded-full border border-slate-700"></div>
        </div>

        {/* Screen Status Bar */}
        <div className="bg-[#1e293b] text-slate-200 px-6 pt-2.5 pb-1.5 flex justify-between items-center text-[10px] font-mono z-40">
          <span>{formatPersianTime(currentAppTime)}</span>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-blue-400" />
            <span className="text-blue-300 font-bold">برنامه توزیع هوشمند</span>
            <div className="w-5 h-2.5 bg-slate-700 rounded-sm relative flex items-center px-0.5">
              <div className="w-3.5 h-1.5 bg-green-500 rounded-xs"></div>
            </div>
          </div>
        </div>

        {/* Device Interface */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden relative lg:rounded-2xl">
          
          {/* Active Date & Reporting Header */}
          <header className="bg-white border-b border-slate-200 p-4 shadow-sm shrink-0 flex flex-col gap-2.5">
            <div className="flex justify-between items-start gap-2">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">سیستم توزیع شیر</h1>
                  <button 
                    onClick={async () => {
                      setIsParsing(true);
                      try {
                        const res = await fetch("/api/data");
                        if (res.ok) {
                          const data = await res.json();
                          setCustomers(data.customers);
                          setOrders(data.orders);
                          setSettings(data.settings);
                          if (data.deliveryRecords) {
                            setDeliveryRecords(data.deliveryRecords);
                          }
                          addSimLog("مجدداً از سرور مرکزی همگام‌سازی شد.");
                        }
                      } catch (e) {
                        console.error(e);
                      } finally {
                        setIsParsing(false);
                      }
                    }}
                    className="p-1.5 rounded-full text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="بروزرسانی داده‌ها"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isParsing ? "animate-spin text-blue-600" : ""}`} />
                  </button>
                  {isSyncing && (
                    <span className="text-[8px] text-slate-400 font-bold bg-slate-100 px-1 py-0.5 rounded animate-pulse">همگام‌سازی...</span>
                  )}
                </div>
                <p className="text-base font-black text-slate-800">
                  {formatPersianDateFull(activeDeliveryDate)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <div className="bg-blue-50 text-blue-800 border border-blue-100 rounded-xl px-2.5 py-1 text-[10px] font-bold text-center">
                  امروز: {formatPersianDateShort(currentAppTime)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPasteSMSModal(true)}
                    className="bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 h-10 px-3.5 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 text-xs font-black active:scale-95 shadow-sm"
                    title="ثبت دستی متن پیامک"
                  >
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <span>ثبت پیامک</span>
                  </button>
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 h-10 px-3.5 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 text-xs font-black active:scale-95 shadow-sm"
                    title="تنظیمات پایگاه داده"
                  >
                    <SettingsIcon className="w-4 h-4 text-slate-500" />
                    <span>تنظیمات</span>
                  </button>
                </div>
              </div>
            </div>
          </header>
          
          {/* Scrollable Screen Content */}
          <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
            
            {/* Date Mode Segmented Control Tab */}
            <div className="bg-slate-100/90 p-1.5 rounded-xl flex gap-1.5 border border-slate-200/60 shadow-xs shrink-0">
              <button
                onClick={() => setDashboardDateMode("today")}
                className={`flex-1 py-2 text-center rounded-lg text-[10px] font-black transition-all ${
                  dashboardDateMode === "today"
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                توزیع شیر امروز ({formatPersianDateShort(currentAppTime)})
              </button>
              
              <button
                onClick={() => setDashboardDateMode("tomorrow")}
                className={`flex-1 py-2 text-center rounded-lg text-[10px] font-black transition-all ${
                  dashboardDateMode === "tomorrow"
                    ? "bg-white text-blue-700 shadow-xs border border-slate-200/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                سفارشات فردا ({
                  (() => {
                    const tm = new Date(currentAppTime);
                    tm.setDate(tm.getDate() + 1);
                    return formatPersianDateShort(tm);
                  })()
                })
              </button>
            </div>

            {/* Total & Remaining Indicators Panel Grid */}
            <div className="grid grid-cols-2 gap-3 animate-fadeIn">
              <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-3 flex flex-col justify-between shadow-md border border-blue-500/20">
                <span className="text-[10px] text-blue-100 font-bold block mb-1">کل شیر سفارش شده</span>
                <p className="text-lg font-black font-mono">
                  {totalMilkQuantity.toLocaleString("fa-IR")} <span className="text-[10px] font-normal font-sans">کیلوگرم</span>
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-3 flex flex-col justify-between shadow-md border border-emerald-500/20">
                <span className="text-[10px] text-emerald-100 font-bold block mb-1">باقیمانده برای توزیع</span>
                <p className="text-lg font-black font-mono">
                  {remainingMilkQuantity.toLocaleString("fa-IR")} <span className="text-[10px] font-normal font-sans">کیلوگرم</span>
                </p>
              </div>
            </div>

            {/* 1. DASHBOARD VIEW */}
            {activeTab === "dashboard" && (
              <div className="space-y-4 animate-fadeIn">
                
                {/* Active Deliveries List */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-xs font-black text-slate-700">برنامه توزیع شیر {isViewingToday ? "امروز" : "فردا"}</h3>
                      <p className="text-[9px] text-slate-400">آخرین وضعیت سفارش هر مشتری ثابت</p>
                    </div>
                    
                    {/* View Mode Toggle */}
                    <div className="bg-slate-100 p-0.5 rounded-lg flex items-center">
                      <button
                        onClick={() => setDashboardViewMode("list")}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all ${
                          dashboardViewMode === "list"
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        لیست توزیع (خلاصه)
                      </button>
                      <button
                        onClick={() => setDashboardViewMode("details")}
                        className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all ${
                          dashboardViewMode === "details"
                            ? "bg-white text-blue-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        جزئیات پیامک‌ها
                      </button>
                    </div>
                  </div>

                  {ordersWithDeliveryStatus.length === 0 ? (
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
                  ) : dashboardViewMode === "list" ? (
                    /* HIGH DENSITY DISTRIBUTION MANIFEST LIST */
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                      <table className="w-full text-right text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                            <th className="p-2.5 text-center w-10">تحویل</th>
                            <th className="p-2.5">نام مشتری</th>
                            <th className="p-2.5 text-center">ساعت</th>
                            <th className="p-2.5 text-left pl-3">مقدار توزیعی (کیلو)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {ordersWithDeliveryStatus.map((order, index) => (
                            <tr
                              key={order.id}
                              onClick={() => {
                                const c = customers.find(x => x.id === order.contactId);
                                if (c) setSelectedDetailCustomer(c);
                              }}
                              className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                                order.isCancelled ? "bg-red-50/10 text-slate-400" : ""
                              } ${order.isDelivered ? "bg-emerald-50/20" : ""}`}
                            >
                              <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleDelivered(order)}
                                  className={`w-6 h-6 rounded-lg flex items-center justify-center mx-auto transition-all border ${
                                    order.isDelivered
                                      ? "bg-emerald-500 border-emerald-500 text-white shadow-sm"
                                      : "bg-white border-slate-300 text-transparent hover:border-blue-500"
                                  }`}
                                >
                                  <Check className="w-4 h-4 stroke-[3px]" />
                                </button>
                              </td>
                              <td className="p-2.5 font-bold text-slate-800">
                                <div className="flex items-center gap-1.5">
                                  <span className={order.isDelivered ? "line-through text-slate-400" : "text-slate-800"}>
                                    {order.contactName}
                                  </span>
                                  {order.isCancelled && (
                                    <span className="text-[8px] bg-red-100 text-red-700 font-black px-1 rounded">کنسل</span>
                                  )}
                                </div>
                              </td>
                              <td className="p-2.5 text-center text-slate-500 font-mono">
                                {formatPersianTime(new Date(order.receivedAt))}
                              </td>
                              <td className="p-2.5 text-left pl-3 font-mono" onClick={(e) => e.stopPropagation()}>
                                {order.isCancelled ? (
                                  <span className="text-red-600 font-bold line-through pl-4">۰</span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    {order.deliveredQuantity !== order.milkQuantity && (
                                      <span className="text-[9px] text-slate-400 line-through">
                                        {order.milkQuantity}
                                      </span>
                                    )}
                                    <input
                                      type="number"
                                      min="0"
                                      value={order.deliveredQuantity}
                                      onChange={(e) => handleUpdateDeliveredQuantity(order, Number(e.target.value))}
                                      className={`w-14 p-1 rounded-lg text-center font-bold text-xs border transition-all ${
                                        order.isDelivered
                                          ? "bg-emerald-100 border-emerald-200 text-emerald-800"
                                          : "bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-800"
                                      }`}
                                    />
                                    <span className="text-[10px] text-slate-400">کیلو</span>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="bg-slate-50/50 p-2.5 border-t border-slate-200 flex justify-between items-center text-[10px] text-slate-500 font-bold">
                        <span>مجموع شیر سفارش داده شده:</span>
                        <span className="text-blue-700 font-black text-xs">
                          {totalMilkQuantity.toLocaleString("fa-IR")} کیلوگرم
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* DETAILED CARDS VIEW WITH ORIGINAL SMS TEXT */
                    <div className="space-y-2">
                      {ordersWithDeliveryStatus.map((order) => (
                        <div
                          key={order.id}
                          onClick={() => {
                            const c = customers.find(x => x.id === order.contactId);
                            if (c) setSelectedDetailCustomer(c);
                          }}
                          className={`p-3 bg-white rounded-2xl border transition-all hover:border-blue-300 shadow-xs cursor-pointer flex flex-col gap-2 relative group overflow-hidden ${
                            order.isCancelled 
                              ? "border-red-100 bg-red-50/20" 
                              : order.isDelivered 
                                ? "border-emerald-200 bg-emerald-50/5" 
                                : "border-slate-200/80"
                          }`}
                        >
                          {/* Cancel/Delivered indicator accent */}
                          {order.isCancelled && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-red-500" />
                          )}
                          {!order.isCancelled && order.isDelivered && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-emerald-500" />
                          )}
                          {!order.isCancelled && !order.isDelivered && (
                            <div className="absolute top-0 right-0 h-full w-1 bg-blue-500" />
                          )}

                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                                order.isCancelled 
                                  ? "bg-red-100 text-red-700" 
                                  : order.isDelivered
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-blue-100 text-blue-700"
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
                                <div className="flex flex-col items-end">
                                  <span className={`text-sm font-black italic ${order.isDelivered ? "text-emerald-700" : "text-slate-900"}`}>
                                    {order.deliveredQuantity} <span className="text-[10px] font-normal not-italic">کیلو</span>
                                  </span>
                                  {order.deliveredQuantity !== order.milkQuantity && (
                                    <span className="text-[9px] text-slate-400 line-through">
                                      سفارش: {order.milkQuantity} کیلو
                                    </span>
                                  )}
                                </div>
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
                              <span>تفسیر: {order.explanation}</span>
                            </p>
                          </div>

                          {/* Quick Delivery Actions inside detailed card */}
                          <div className="flex justify-between items-center mt-1 pt-2 border-t border-slate-150" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => handleToggleDelivered(order)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black transition-all ${
                                order.isDelivered
                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                  : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{order.isDelivered ? "تحویل شده" : "علامت تحویل"}</span>
                            </button>

                            {!order.isCancelled && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-bold">توزیع:</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={order.deliveredQuantity}
                                  onChange={(e) => handleUpdateDeliveredQuantity(order, Number(e.target.value))}
                                  className="w-14 p-1 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-lg text-center font-bold text-xs"
                                />
                                <span className="text-[10px] text-slate-400">کیلو</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Clean Guide Banner instead of clunky settings */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200/60 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-blue-800">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    <span className="text-[11px] font-black">راهنمای هوشمند توزیع شیر</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    این سیستم برای توزیع روزانه شیر طراحی شده است. تمام سفارشات دریافتی امروز به صورت خودکار برای تحویل فردا برنامه‌ریزی می‌شوند. برای دسترسی به مدیریت کل داده‌ها و پاکسازی پایگاه داده، از دکمه تنظیمات در بالای صفحه استفاده کنید.
                  </p>
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
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5 space-y-2 text-[10.5px] leading-relaxed text-slate-600">
                  <div className="flex items-center gap-1.5 text-blue-700 font-bold">
                    <Smartphone className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>راهنمای نصب اندروید (PWA)</span>
                  </div>
                  <p>
                    این برنامه به صورت یک <b>وب‌اپلیکیشن پیشرونده (PWA)</b> برای اندروید بهینه‌سازی شده است. کافیست در مرورگر <b>Chrome</b> گوشی خود دکمه <span className="font-bold">سه نقطه</span> بالا را لمس کرده و گزینه <b>«نصب برنامه» (Install App)</b> یا <b>«افزودن به صفحه اصلی» (Add to Home screen)</b> را بزنید تا با آیکون اختصاصی روی گوشی نصب شده و مستقیماً به امکانات سیستمی متصل گردد.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddCustomerModal(true)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>افزودن دستی مشتری</span>
                  </button>
                  <button
                    onClick={handleImportFromAndroidContacts}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition-all"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>وارد کردن از مخاطبین گوشی</span>
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

          {/* Manual SMS Entry Modal Sheet */}
          {showPasteSMSModal && (
            <div className="absolute inset-0 bg-black/40 z-50 flex flex-col justify-end animate-fadeIn">
              <div className="bg-white rounded-t-[30px] p-5 max-h-[85%] overflow-y-auto space-y-4 shadow-2xl border-t border-slate-200 transition-transform">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-600" />
                    <h4 className="text-xs font-black text-slate-800">ثبت دستی متن پیامک</h4>
                  </div>
                  <button
                    onClick={() => setShowPasteSMSModal(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div className="space-y-1">
                    <label className="text-slate-500 block font-bold">انتخاب مشتری فرستنده:</label>
                    {customers.length === 0 ? (
                      <div className="text-[10px] text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100">
                        هیچ مشتری ثابتی یافت نشد. ابتدا در بخش مشتریان دستی یا از دفترچه تلفن یکی اضافه کنید.
                      </div>
                    ) : (
                      <select
                        value={selectedSimSender}
                        onChange={(e) => setSelectedSimSender(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-500 block font-bold">متن کامل پیامک دریافت شده:</label>
                    <textarea
                      placeholder="مثال: سلام اکبر هستم فردا واسه ما زحمت بکشید ۴۵ کیلو شیر بفرستید دستت درد نکنه"
                      value={simMessageText}
                      onChange={(e) => setSimMessageText(e.target.value)}
                      rows={4}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed text-right"
                    />
                  </div>

                  <button
                    onClick={async () => {
                      if (customers.length === 0) {
                        alert("لطفا ابتدا یک مشتری ثبت کنید.");
                        return;
                      }
                      if (!simMessageText.trim()) {
                        alert("متن پیامک نمی‌تواند خالی باشد.");
                        return;
                      }
                      await handleSimulateSMS(simMessageText, selectedSimSender);
                      setShowPasteSMSModal(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-black transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
                  >
                    <span>پردازش و ثبت سفارش</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Settings Modal Sheet */}
          {showSettingsModal && (
            <div className="absolute inset-0 bg-black/40 z-50 flex flex-col justify-end animate-fadeIn">
              <div className="bg-white rounded-t-[30px] p-5 max-h-[85%] overflow-y-auto space-y-4 shadow-2xl border-t border-slate-200 transition-transform">
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <SettingsIcon className="w-5 h-5 text-blue-600" />
                    <h4 className="text-xs font-black text-slate-800">تنظیمات و مدیریت پایگاه داده</h4>
                  </div>
                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Workflow Guide */}
                  <div className="space-y-1.5 bg-blue-50/50 p-3 rounded-2xl border border-blue-100">
                    <span className="font-bold text-blue-800 block">نحوه کارکرد توزیع روزانه:</span>
                    <p className="text-[10px] text-slate-600 leading-relaxed">
                      سیستم هوشمند به گونه‌ای طراحی شده است که تمام پیامک‌های دریافت شده امروز را به عنوان سفارش شیر برای فردا تفسیر می‌کند. 
                      برنامه توزیع به شما اجازه می‌دهد در طول روز تحویل هر مشتری را علامت بزنید و در صورت نیاز مقدار تحویل داده شده را در محل ویرایش کنید.
                    </p>
                  </div>

                  {/* Database Management Tools */}
                  <div className="space-y-2 pt-2">
                    <span className="font-bold text-slate-700 block">مدیریت اطلاعات و پاکسازی:</span>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      برای شروع به کار با داده‌های واقعی خود، می‌توانید اطلاعات فرضی و دمو سیستم را به طور کامل پاک کنید.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={async () => {
                          await handleClearDatabase();
                          setShowSettingsModal(false);
                        }}
                        className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 py-2.5 rounded-xl font-bold text-[10px] transition-colors"
                      >
                        پاکسازی کامل داده‌ها
                      </button>
                      <button
                        onClick={async () => {
                          await handleResetToPresets();
                          setShowSettingsModal(false);
                        }}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 py-2.5 rounded-xl font-bold text-[10px] transition-colors"
                      >
                        بازیابی داده‌های دمو
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSettingsModal(false)}
                    className="w-full bg-slate-900 text-white py-2.5 rounded-xl font-bold hover:bg-slate-800 transition-colors mt-2"
                  >
                    بستن پنجره
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
