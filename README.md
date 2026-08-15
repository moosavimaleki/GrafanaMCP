[English version](README.en.md)

# Grafana MCP

سرور MCP محلی و فقط‌خواندنی برای بررسی داشبوردهای Grafana، متریک‌های
Prometheus/VictoriaMetrics و لاگ‌های VictoriaLogs است. این سرور از طریق
Grafana به datasourceها متصل می‌شود و هرگز مستقیماً به Prometheus یا
VictoriaMetrics وصل نمی‌شود.

## امکانات

- فهرست و جست‌وجوی داشبوردها، پنل‌ها، متغیرها و queryهای پنل‌ها
- اجرای PromQL و MetricsQL با بازهٔ زمانی و فیلترهای موردنظر
- کشف datasource، metric، label و مقدار label
- خواندن لاگ‌ها و آمارهای VictoriaLogs با LogSQL
- خواندن annotation، alert rule و ساخت deeplink برای داشبورد یا پنل
- خلاصه‌سازی مقدارهای هر سری متریک: آخرین مقدار، کمینه، بیشینه و میانگین

تمام ابزارها فقط‌خواندنی هستند؛ این پروژه داشبورد، alert، datasource یا
دادهٔ مانیتورینگ را تغییر نمی‌دهد.

## پیش‌نیازها

- Node.js 20 یا جدیدتر
- یک حساب Grafana با دسترسی خواندن به داشبوردها و datasourceهای لازم
- URL، نام کاربری و گذرواژهٔ Grafana در محیط اجرای MCP

## نصب

```sh
git clone git@github.com:moosavimaleki/GrafanaMCP.git
cd GrafanaMCP
npm install
npm run check
npm test
```

برای اجرای دستی سرور:

```sh
export GRAFANA_BASE_URL='https://grafana.example.com'
export GRAFANA_USERNAME='your-username'
export GRAFANA_PASSWORD='your-password'
export GRAFANA_ORG_ID='1' # اختیاری؛ مقدار پیش‌فرض 1 است
npm start
```

## نصب در Codex

در `~/.codex/config.toml` یک MCP محلی اضافه کنید. مسیر را با مسیر واقعی
clone جایگزین کنید و هرگز این فایل را commit نکنید.

```toml
[mcp_servers.grafana]
command = "node"
args = ["/absolute/path/to/GrafanaMCP/src/index.js"]

[mcp_servers.grafana.env]
GRAFANA_BASE_URL = "https://grafana.example.com"
GRAFANA_ORG_ID = "1"
GRAFANA_USERNAME = "your-username"
GRAFANA_PASSWORD = "your-password"
```

Codex را دوباره اجرا کنید، سپس با `codex mcp list` فعال‌بودن سرور را بررسی
کنید. نمونهٔ بدون اطلاعات حساس در [mcp.json.example](mcp.json.example) است.

## نصب در Claude Code

Claude Code می‌تواند این سرور را در scope کاربر اضافه کند. مقادیر نمونه را
با اطلاعات واقعیِ محیط خود جایگزین کنید؛ این دستور را با رمز واقعی در تاریخچهٔ
shell مشترک اجرا نکنید.

```sh
claude mcp add grafana --scope user \
  --env GRAFANA_BASE_URL='https://grafana.example.com' \
  --env GRAFANA_ORG_ID='1' \
  --env GRAFANA_USERNAME='your-username' \
  --env GRAFANA_PASSWORD='your-password' \
  -- node /absolute/path/to/GrafanaMCP/src/index.js
```

با `claude mcp list` اتصال را بررسی کنید. برای پیکربندی پروژه‌ای، فایل
`.mcp.json` بسازید اما آن را commit نکنید؛ این مخزن آن فایل را در `.gitignore`
نادیده می‌گیرد. Claude Code در فایل پروژه از `${VARIABLE}` برای دریافت مقادیر
از محیط پشتیبانی می‌کند.

## احراز هویت و امنیت

سرور با `POST /login` وارد Grafana می‌شود. cookieهای HttpOnly جلسه فقط در
حافظه نگه‌داری می‌شوند؛ فایل cookie jar، Chrome DevTools و endpoint
`/api/user/auth-tokens/rotate` استفاده نمی‌شوند.

مقدارهای `Set-Cookie` در همهٔ پاسخ‌ها دریافت می‌شوند. اگر درخواست `401` بگیرد،
سرور فقط یک‌بار دوباره login می‌کند و همان درخواست را تکرار می‌کند. درخواست‌های
هم‌زمان از یک login مشترک استفاده می‌کنند.

این موارد را هرگز commit نکنید:

- URL داخلی Grafana، نام کاربری یا گذرواژه
- cookieهای `grafana_session` و `grafana_session_expiry`
- خروجی query، log، screenshot یا فایل تنظیمات محلی

فایل `.gitignore` برای جلوگیری از commit فایل‌های پیکربندی محلی، credential و
session در نظر گرفته شده است؛ بااین‌حال پیش از push حتماً تغییرات stageشده را
مرور کنید.

## راهنمای query

برای متریک‌ها، PromQL و افزونه‌های VictoriaMetrics را در مستندات MetricsQL
بررسی کنید. برای لاگ‌ها از LogSQL استفاده کنید. پاسخ ابزارها نیز لینک مرتبط را
بازمی‌گردانند.

- [راهنمای MetricsQL][metricsql]
- [راهنمای LogSQL][logsql]

[metricsql]: https://docs.victoriametrics.com/victoriametrics/metricsql/
[logsql]: https://docs.victoriametrics.com/victorialogs/logsql/
