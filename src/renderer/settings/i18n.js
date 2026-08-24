// Settings localisation, English and Arabic.
//
// Keyed by the ENGLISH SOURCE STRING rather than by invented keys, and
// applied by walking the DOM. The alternative — a data-i18n attribute on
// every element — means 140 hand-added attributes that silently stop
// working the moment someone edits the markup without updating one. Here,
// untranslated text simply stays English, which is a visible and harmless
// failure rather than a blank label.
//
// Whitespace is normalised before matching, because the markup wraps long
// sentences across several indented lines.

// Arabic first, because it is the default — a language list whose first
// entry is not the default reads as though English were.
export const LANGUAGES = Object.freeze([
  { id: 'ar', label: 'العربية' },
  { id: 'en', label: 'English' }
]);

/** Right-to-left languages. Drives `dir` on the document. */
const RTL = new Set(['ar']);

export const isRtl = (language) => RTL.has(language);

const AR = {
  // --- chrome -------------------------------------------------------
  'Settings': 'الإعدادات',
  "Qur'an": 'القرآن',
  'Athan': 'الأذان',
  'Azkar': 'الأذكار',
  'Fasting': 'الصيام',
  'General': 'عام',
  'About': 'حول',
  'Save': 'حفظ',
  'Show a verse now': 'اعرض آية الآن',

  // --- schedule -----------------------------------------------------
  'Schedule': 'التذكير',
  'Every N min': 'كل ن دقيقة',
  'Minute of hour': 'دقيقة من الساعة',
  'Daily times': 'أوقات يومية',
  'Every': 'كل',
  'minutes': 'دقيقة',
  'At minute(s)': 'عند الدقيقة/الدقائق',
  'At time(s)': 'عند الوقت/الأوقات',

  // --- quiet hours --------------------------------------------------
  'Quiet hours': 'ساعات الهدوء',
  'From': 'من',
  'To': 'إلى',
  'Silences verse reminders only. Prayer reminders still come through — an overnight window would otherwise hide Fajr and Isha.':
    'تُسكِت تذكيرات الآيات فقط. تذكيرات الصلاة تصل كالمعتاد، وإلا لأخفت فترةُ الليل الفجرَ والعشاء.',

  // --- translation --------------------------------------------------
  'Translation': 'الترجمة',
  'Shown beneath the Arabic on the verse card. Translations are downloaded from':
    'تظهر أسفل النص العربي في بطاقة الآية. تُنزَّل الترجمات من',
  'when you pick one — none is bundled with the app, and they are provided for non-commercial use.':
    'عند اختيار واحدة — لا تأتي أي ترجمة مع التطبيق، وهي متاحة للاستخدام غير التجاري.',
  'Language': 'اللغة',
  'Remove': 'إزالة',
  'Download': 'تنزيل',
  'None — Arabic only': 'بدون — العربية فقط',
  'Downloading…': 'جارٍ التنزيل…',
  'Downloaded and in use.': 'تم التنزيل وهي قيد الاستخدام.',
  'Not downloaded yet.': 'لم تُنزَّل بعد.',
  'Download failed.': 'فشل التنزيل.',
  'No translation — the card shows Arabic only.': 'بدون ترجمة — تعرض البطاقة العربية فقط.',

  // --- verse text size ----------------------------------------------
  'Verse text size': 'حجم نص الآية',
  'Size of the Arabic text on the notification card': 'حجم النص العربي في بطاقة التنبيه',
  'Decrease verse text size': 'تصغير حجم نص الآية',
  'Increase verse text size': 'تكبير حجم نص الآية',

  // --- verse order --------------------------------------------------
  'Verse order': 'ترتيب الآيات',
  'Random': 'عشوائي',
  'Sequential': 'بالترتيب',
  'Reset position': 'إعادة ضبط الموضع',
  'Khitmah progress': 'تقدّم الختمة',

  // --- onboarding ---------------------------------------------------
  'Welcome to Mihrab': 'أهلًا بك في محراب',
  'Choose your location below. Prayer times are calculated on your own machine from these coordinates — nothing is sent anywhere — and adhkar and fasting reminders follow from them.':
    'اختر موقعك أدناه. تُحسب أوقات الصلاة على جهازك من هذه الإحداثيات — لا يُرسل شيء إلى أي جهة — وتتبعها تذكيرات الأذكار والصيام.',
  "Until you do, only Qur'an verse reminders are active.":
    'إلى أن تفعل ذلك، تعمل تذكيرات آيات القرآن فقط.',

  // --- location -----------------------------------------------------
  'Location': 'الموقع',
  'Prayer times are calculated on your machine from these coordinates. Nothing is sent anywhere.':
    'تُحسب أوقات الصلاة على جهازك من هذه الإحداثيات. لا يُرسل شيء إلى أي جهة.',
  'Search for your city': 'ابحث عن مدينتك',
  'No location set': 'لم يُحدَّد موقع',
  'Enter coordinates': 'إدخال الإحداثيات',
  'Latitude': 'خط العرض',
  'Longitude': 'خط الطول',
  'Label': 'التسمية',
  'Use these coordinates': 'استخدم هذه الإحداثيات',
  'Use my location': 'حدّد موقعي',
  'Your coordinates are stored on this machine and are never sent anywhere by Mihrab.':
    'تُحفظ إحداثياتك على هذا الجهاز ولا يرسلها محراب إلى أي جهة.',
  'Asking your system for your location…': 'جارٍ سؤال النظام عن موقعك…',
  'Location permission was denied. You can search for your city instead.':
    'رُفض إذن الموقع. يمكنك البحث عن مدينتك بدلًا من ذلك.',
  'This system does not offer a location service.': 'لا يوفّر هذا النظام خدمة تحديد الموقع.',

  // --- prayer times -------------------------------------------------
  'Prayer times': 'أوقات الصلاة',
  'Set a location above to enable prayer reminders.': 'حدّد موقعًا أعلاه لتفعيل تذكيرات الصلاة.',
  'Calculation method': 'طريقة الحساب',
  'Asr calculation': 'حساب العصر',
  'High latitude rule': 'قاعدة خطوط العرض العالية',
  'Only affects places far from the equator, where twilight can last all night.':
    'تؤثر فقط في الأماكن البعيدة عن خط الاستواء، حيث قد يمتد الشفق طوال الليل.',
  'Prayer': 'الصلاة',
  'On': 'تشغيل',
  'On time': 'في وقتها',
  'Early': 'قبلها',
  'Adjust': 'تعديل',
  'Today': 'اليوم',
  'See what a prayer reminder looks like': 'شاهد شكل تذكير الصلاة',
  'Show a sample': 'اعرض نموذجًا',
  'notifies at the prayer time itself.': 'ينبّه في وقت الصلاة نفسه.',
  'adds a separate warning that many minutes beforehand — set both to get two notifications, or turn off “On time” to get only the warning.':
    'يضيف تنبيهًا منفصلًا قبل ذلك بعدد الدقائق المحدد — فعّل الاثنين لتصلك رسالتان، أو أوقف «في وقتها» للاكتفاء بالتنبيه المبكر.',
  'shifts a prayer by up to 59 minutes to match your local mosque.':
    'يزيح وقت الصلاة حتى ٥٩ دقيقة ليطابق مسجدك.',

  // --- azkar --------------------------------------------------------
  'Morning and evening adhkar': 'أذكار الصباح والمساء',
  'Set a location in the Athan tab to enable adhkar reminders.':
    'حدّد موقعًا في تبويب الأذان لتفعيل تذكيرات الأذكار.',
  'Adhkar follow the prayer times rather than the clock, so the reminder stays in its proper window as the day length changes through the year.':
    'ترتبط الأذكار بأوقات الصلاة لا بالساعة، فيبقى التذكير في وقته الصحيح مع تغيّر طول النهار عبر السنة.',
  'Morning': 'الصباح',
  'Anchor': 'المرجع',
  'Minutes after': 'دقائق بعده',
  'At a set time': 'في وقت محدد',
  'Time': 'الوقت',
  'Evening': 'المساء',
  'Each reminder shows one dhikr with its repeat count, moving to the next one the following day — in order, not at random.':
    'يعرض كل تذكير ذكرًا واحدًا مع عدد مرات تكراره، وينتقل إلى التالي في اليوم التالي — بالترتيب لا عشوائيًا.',
  'See what an adhkar reminder looks like': 'شاهد شكل تذكير الأذكار',
  'Which adhkar': 'أي الأذكار',
  'Untick any you would rather not be reminded of, or add your own below.':
    'أزل علامة أي ذكر لا تريد التذكير به، أو أضف أذكارك أدناه.',
  'Show': 'إظهار',
  'All': 'الكل',
  'Morning only': 'الصباح فقط',
  'Evening only': 'المساء فقط',
  'Add your own': 'أضف ذكرًا',
  'Arabic': 'العربية',
  'Repeat': 'التكرار',
  'When': 'الوقت',
  'Morning and evening': 'الصباح والمساء',
  'Add dhikr': 'إضافة الذكر',
  'After Fajr': 'بعد الفجر',
  'After sunrise': 'بعد الشروق',
  'After Asr': 'بعد العصر',
  'After Maghrib': 'بعد المغرب',
  'Remove this dhikr': 'إزالة هذا الذكر',
  'Nothing matches this filter.': 'لا شيء يطابق هذا التصفية.',

  // --- fasting ------------------------------------------------------
  'Fasting reminders': 'تذكيرات الصيام',
  'Set a location in the Athan tab to enable fasting reminders.':
    'حدّد موقعًا في تبويب الأذان لتفعيل تذكيرات الصيام.',
  'day before': 'اليوم السابق',
  'White days': 'الأيام البيض',
  'The 13th, 14th and 15th of every Hijri month': 'الثالث عشر والرابع عشر والخامس عشر من كل شهر هجري',
  'Mondays and Thursdays': 'الاثنين والخميس',
  'Every week': 'كل أسبوع',
  "Tasu'a and Ashura": 'تاسوعاء وعاشوراء',
  '9 and 10 Muharram': '٩ و١٠ محرم',
  'Day of Arafah': 'يوم عرفة',
  '9 Dhu al-Hijjah': '٩ ذو الحجة',
  'Six days of Shawwal': 'ست من شوال',
  'A reminder across Shawwal 2-7; they need not be consecutive':
    'تذكير خلال ٢–٧ شوال، ولا يلزم أن تكون متتابعة',
  'Remind me at': 'ذكّرني عند',
  'See what a fasting reminder looks like': 'شاهد شكل تذكير الصيام',

  // --- sound / startup ----------------------------------------------
  'Sound': 'الصوت',
  'Volume': 'مستوى الصوت',
  'Test': 'تجربة',
  'Could not play the test sound.': 'تعذّر تشغيل صوت التجربة.',
  'Saved': 'تم الحفظ',
  'Startup': 'بدء التشغيل',
  'Start Mihrab automatically when you sign in to Windows.':
    'تشغيل محراب تلقائيًا عند الدخول إلى ويندوز.',

  // --- fasting sentence fragments -----------------------------------
  // Split across inline <strong> tags in the markup, so each side of the
  // emphasis is its own text node and has to be translated separately.
  'Reminders arrive the': 'تصل التذكيرات في',
  ', so there is still time to prepare and to make suhoor.':
    '، ليبقى وقت للتحضير وللسحور.',
  'Ramadan is deliberately not included — its daily rhythm is already covered by the Fajr and Maghrib reminders.':
    'رمضان غير مُدرَج عمدًا — فإيقاعه اليومي تغطيه أصلًا تذكيرات الفجر والمغرب.',

  // --- general ------------------------------------------------------
  'Settings language': 'لغة الإعدادات',
  'Changes this window only. Verses, prayer names and adhkar are always shown in Arabic.':
    'يغيّر هذه النافذة فقط. الآيات وأسماء الصلوات والأذكار تُعرض بالعربية دائمًا.',

  // --- accessible names and placeholders ----------------------------
  'Settings sections': 'أقسام الإعدادات',
  'Schedule mode': 'نمط التذكير',
  'e.g. Jerusalem, Cairo, London': 'مثال: القدس، القاهرة، لندن',
  'e.g. 9:00, 20:30': 'مثال: ٩:٠٠، ٢٠:٣٠',
  'e.g. 0, 30': 'مثال: ٠، ٣٠',
  'Home': 'المنزل',
  'Optional': 'اختياري',
  'Remind me about this prayer at all': 'هل أذكّرك بهذه الصلاة أصلًا',
  'Notify at the prayer time itself': 'التنبيه في وقت الصلاة نفسه',
  'Also notify this many minutes early': 'تنبيه إضافي قبلها بهذا العدد من الدقائق',
  'Shift this prayer to match your local mosque': 'إزاحة هذه الصلاة لتطابق مسجدك',

  // --- about --------------------------------------------------------
  'Built by': 'من إعداد',
  // Attribution sentences. The project and library NAMES are deliberately
  // left untranslated everywhere they appear — Tanzil, adhan, GeoNames and
  // Amiri are proper nouns, and a reader chasing an attribution needs the
  // name they will actually find on the web.
  'Prayer times calculated locally with': 'تُحسب أوقات الصلاة محليًا باستخدام',
  '(MIT). City coordinates from': '(رخصة MIT). إحداثيات المدن من',
  ', used under Creative Commons Attribution 4.0 (CC-BY 4.0).':
    '، مستخدمة بموجب رخصة المشاع الإبداعي — النسب ٤٫٠ (CC-BY 4.0).',
  'Quran text from the': 'نص القرآن من',
  '(Uthmani, v1.1), used under Creative Commons Attribution 3.0 (CC-BY 3.0). No translation is bundled.':
    '(العثماني، الإصدار ١٫١)، مستخدم بموجب رخصة المشاع الإبداعي — النسب ٣٫٠ (CC-BY 3.0). لا تأتي أي ترجمة مع التطبيق.',
  'Arabic text set in Amiri Quran, © The Amiri Project Authors, licensed under the SIL Open Font License 1.1.':
    'النص العربي بخط أميري قرآن، © مؤلفو مشروع أميري، بموجب رخصة الخطوط المفتوحة SIL 1.1.'
};

const DICTIONARIES = { ar: AR };

const squash = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * Translate a single string, or return it unchanged.
 * Exported so JS-generated text can use the same table.
 */
export function t(text, language) {
  const dictionary = DICTIONARIES[language];
  if (!dictionary) return text;
  return dictionary[squash(text)] ?? text;
}

// The original English of everything touched, so switching back restores
// exactly what was there rather than round-tripping through Arabic.
const originals = new WeakMap();
const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

function walkTextNodes(root, visit) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip whitespace-only nodes and anything inside a script/style.
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const tag = node.parentElement?.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode())) visit(node);
}

/**
 * Apply a language to the whole document.
 *
 * Safe to call repeatedly, and must be called again after any render that
 * creates new nodes — the prayer table, the azkar list, the city results —
 * because those are built in JS after this has already run.
 */
export function applyLanguage(language, root = document.body) {
  walkTextNodes(root, (node) => {
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    const source = originals.get(node);
    const translated = t(source, language);
    // Re-attach the node's own leading/trailing whitespace rather than
    // substituting into the source: long strings are wrapped across
    // indented lines in the markup, so the squashed form never appears in
    // the original literally and a substitution would silently do nothing.
    // The surrounding whitespace matters — the markup relies on it to keep
    // adjacent inline elements from running together.
    const leading = source.match(/^\s*/)[0];
    const trailing = source.match(/\s*$/)[0];
    node.nodeValue = leading + translated + trailing;
  });

  for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const attr of TRANSLATABLE_ATTRS) {
      const value = el.getAttribute(attr);
      if (value === null) continue;
      const key = `${attr}:${value}`;
      if (!originals.has(el)) originals.set(el, {});
      const cache = originals.get(el);
      if (cache[key] === undefined) cache[key] = value;
      el.setAttribute(attr, t(cache[key], language));
    }
  }

  document.documentElement.lang = language;
  document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr';
}
