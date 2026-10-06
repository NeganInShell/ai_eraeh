/* =========================================================
   ابزار کمکی چاپ
   هر صفحه، ارتفاع واقعی محتوای خود را پس از رسم کامل به پوسته اصلی
   گزارش می‌کند تا هنگام چاپ روی A4 هیچ بخشی از صفحه بریده نشود.
   این اندازه‌گیری در پهنای واقعی ناحیه قابل چاپ انجام می‌شود.
   ========================================================= */
(function () {
  // اگر صفحه به‌صورت مستقل (خارج از قاب) باز شده باشد، کاری لازم نیست
  if (window.parent === window) return;

  var PAGE_NAME = decodeURIComponent(window.location.pathname.split('/').pop() || '');
  var timer = null;

  /* ارتفاع واقعی محتوای بدنه.
     نکته: ارتفاع کل سند (scrollHeight) با ارتفاع پنجره بیشینه می‌شود،
     بنابراین فقط از ابعاد خودِ بدنه استفاده می‌کنیم.
     همچنین چون محتوای هر صفحه در یک قابِ بلند چیده می‌شود، ارتفاع بر حسب
     واحدهای چاپ (A4) گرد می‌شود تا کارت‌ها در مرز برگه‌ها نصفه نشوند.

     چون پوسته هنگام اندازه‌گیری، قاب را در پهنای چاپ می‌چیند، ارتفاع نیز
     باید از همان پهنای باشد. اگر پهنای واقعی بدنه با پهنای مورد انتظار
     (ناحیه چاپ A4) فرق داشته باشد، مقدار اندازه‌گیری‌شده برای پهنای
     دیگری است و قابل استفاده نیست؛ در این حالت صفر گزارش می‌شود تا
     پوسته از ارتفاع پشتیبانِ دقیق خودش استفاده کند. */
  var SHEET_PX = 277 * 96 / 25.4; // ارتفاع ناحیه قابل چاپ یک برگه A4 با حاشیه ۱۰ میلی‌متر
  var EXPECTED_WIDTH = 190 * 96 / 25.4; // پهنای ناحیه قابل چاپ A4 با حاشیه ۱۰ میلی‌متر

  function measureContentHeight() {
    var body = document.body;
    if (!body) return 0;
    var rect = body.getBoundingClientRect();
    // فقط وقتی اندازه‌گیری معتبر است که صفحه دقیقاً در پهنای ناحیه چاپ چیده شده باشد
    if (Math.abs(rect.width - EXPECTED_WIDTH) > 2) return 0;
    var raw = Math.ceil(Math.max(rect.height, body.scrollHeight, body.offsetHeight));
    // گرد کردن به مرز کامل برگه‌های چاپ
    return Math.ceil(raw / SHEET_PX) * SHEET_PX;
  }

  function reportHeight() {
    var height = measureContentHeight();
    if (!height) return;
    window.parent.postMessage({
      type: 'lucille-page-height',
      page: PAGE_NAME,
      height: height
    }, '*');
  }

  // گزارش‌های پشت سر هم پس از بارگذاری کامل
  function scheduleReport(delay) {
    clearTimeout(timer);
    timer = setTimeout(reportHeight, delay || 150);
  }

  /* با درخواست پوسته، نمودارها پس از چیده شدن در اندازه چاپ بازترسیم می‌شوند
     تا در خروجی چاپ خالی یا کم‌کیفیت نباشند.

     نکته: اگر صفحه زمانی رندر شده باشد که قاب آن پنهان بوده، بوم نمودار با
     ابعاد صفر ساخته می‌شود و دیگر خودبه‌خود ترسیم نمی‌شود. بنابراین همه
     نمودارهای ثبت‌شده در Chart.js صریحاً با ابعاد درست بازسازی می‌شوند. */
  function redrawCharts() {
    if (typeof Chart === 'undefined' || !Chart.instances) return;
    var charts = [];
    if (typeof Chart.instances.forEach === 'function') {
      Chart.instances.forEach(function (chart) { charts.push(chart); });
    } else {
      Object.keys(Chart.instances).forEach(function (key) { charts.push(Chart.instances[key]); });
    }
    charts.forEach(function (chart) {
      if (!chart) return;
      try {
        if (typeof chart.resize === 'function') chart.resize();
        if (typeof chart.update === 'function') chart.update('none');
        if (typeof chart.draw === 'function') chart.draw();
      } catch (error) {
        /* در صورت خطا، نمودار بدون تغییر باقی می‌ماند */
      }
    });
  }

  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'lucille-prepare-print') return;
    window.dispatchEvent(new Event('resize'));
    // دو نوبت با تأخیر، چون چیدمان در چند مرحله نهایی می‌شود
    setTimeout(function () { window.dispatchEvent(new Event('resize')); redrawCharts(); }, 120);
    setTimeout(function () { redrawCharts(); setTimeout(reportHeight, 300); }, 400);
  });

  window.addEventListener('load', function () {
    reportHeight();
    scheduleReport(400);
    scheduleReport(1200);
    scheduleReport(2800);
  });

  // پس از بارگذاری نهایی فونت‌ها چیدمان دوباره محاسبه می‌شود
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(function () { scheduleReport(200); });
  }

  /* با هر تغییر ابعاد بدنه (اعمال فونت، رسم نمودار و ...) اندازه‌گیری تکرار می‌شود
     تا هرگز مقدار ناقص یا قدیمی ثبت نشود. */
  if (typeof ResizeObserver === 'function') {
    var startObserver = function () {
      if (document.body) new ResizeObserver(function () { scheduleReport(200); }).observe(document.body);
    };
    if (document.body) startObserver();
    else window.addEventListener('DOMContentLoaded', startObserver);
  }

  window.addEventListener('resize', function () { scheduleReport(300); });
})();