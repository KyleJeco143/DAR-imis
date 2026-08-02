// Intercepts the third-party CDN scripts/styles that index.html loads
// (Font Awesome, xlsx/SheetJS, @supabase/supabase-js, Leaflet, Google Fonts)
// and serves locally installed copies instead. This keeps tests hermetic
// and fast — no dependency on those CDNs being reachable, in this sandbox
// or in CI.
const fs = require('fs');
const path = require('path');

const NM = path.join(__dirname, '..', '..', 'node_modules');

const FILE_MAP = [
  {
    match: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    file: path.join(NM, 'xlsx', 'dist', 'xlsx.full.min.js'),
    contentType: 'application/javascript',
  },
  {
    match: 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
    file: path.join(NM, 'exceljs', 'dist', 'exceljs.min.js'),
    contentType: 'application/javascript',
  },
  {
    match: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    file: path.join(NM, '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'),
    contentType: 'application/javascript',
  },
  {
    match: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    file: path.join(NM, 'leaflet', 'dist', 'leaflet.js'),
    contentType: 'application/javascript',
  },
  {
    match: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    file: path.join(NM, 'leaflet', 'dist', 'leaflet.css'),
    contentType: 'text/css',
  },
  {
    match: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    file: path.join(NM, '@fortawesome', 'fontawesome-free', 'css', 'all.min.css'),
    contentType: 'text/css',
  },
];

/** Registers all vendor-asset and web-font route mocks on a Playwright page. */
async function mockVendorAssets(page) {
  for (const { match, file, contentType } of FILE_MAP) {
    await page.route(match, (route) =>
      route.fulfill({ body: fs.readFileSync(file), contentType })
    );
  }

  // Font Awesome's CSS references its own webfonts with paths relative to
  // the cdnjs URL above; serve those from the local package too.
  await page.route('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/webfonts/**', (route) => {
    const url = new URL(route.request().url());
    const filename = path.basename(url.pathname);
    const file = path.join(NM, '@fortawesome', 'fontawesome-free', 'webfonts', filename);
    if (fs.existsSync(file)) {
      route.fulfill({ body: fs.readFileSync(file), contentType: 'font/woff2' });
    } else {
      route.fulfill({ status: 404, body: '' });
    }
  });

  // Google Fonts are decorative only — serve an empty stylesheet instead of
  // depending on fonts.googleapis.com/fonts.gstatic.com being reachable.
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ body: '', contentType: 'text/css' })
  );
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 404, body: '' })
  );
}

module.exports = { mockVendorAssets };
