(function () {
  'use strict';
  var DATA = window.POSTER_DATA_JSON;
  var s = DATA.summary;

  function peso(n, decimals) {
    if (n == null) return '—';
    return '₱' + (n / 1e6).toFixed(decimals == null ? 1 : decimals) + 'M';
  }
  function pesoM(n) {
    if (n == null) return '—';
    return '₱' + (n / 1e6).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + 'M';
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---------- stat row ----------
  function renderStats() {
    var slip = DATA.slippage;
    var html =
      '<div class="stat-card"><div class="icon total">🏗️</div><div><div class="num">' + s.total + '</div><div class="lbl">Total Projects</div></div></div>' +
      '<div class="stat-card"><div class="icon completed">✓</div><div><div class="num">' + s.completed + '</div><div class="lbl">Completed</div><div class="sub">' + s.completed_pct + '%</div></div></div>' +
      '<div class="stat-card"><div class="icon ongoing">⚒</div><div><div class="num">' + s.ongoing + '</div><div class="lbl">On-going</div><div class="sub">' + s.ongoing_pct + '%</div></div></div>' +
      '<div class="stat-card"><div class="icon other">…</div><div><div class="num">' + s.other + '</div><div class="lbl">No Status Recorded</div><div class="sub">' + s.other_pct + '%</div></div></div>' +
      '<div class="stat-card"><div class="icon budget">🎯</div><div><div class="num">' + pesoM(s.total_saro) + '</div><div class="lbl">Total Approved Budget</div><div class="sub">per SARO</div></div></div>' +
      '<div class="stat-card"><div class="icon slippage">📉</div><div><div class="num">' + slip.province_avg_slippage.toFixed(1) + ' pts</div><div class="lbl">Avg. Slippage</div><div class="sub">physical − financial</div></div></div>';
    document.getElementById('stat-row').innerHTML = html;
  }

  // ---------- donut ----------
  function renderDonut() {
    var segs = [
      { n: s.completed, color: cssVar('--status-good'), label: 'Completed' },
      { n: s.ongoing, color: cssVar('--status-warn'), label: 'On-going' },
      { n: s.other, color: cssVar('--status-neutral'), label: 'No status' },
    ];
    var r = 70, cx = 84, cy = 84, sw = 22;
    var circ = 2 * Math.PI * r;
    var offset = 0;
    var arcs = segs.map(function (seg) {
      var frac = seg.n / s.total;
      var len = frac * circ;
      var el = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + seg.color + '" stroke-width="' + sw +
        '" stroke-dasharray="' + len + ' ' + (circ - len) + '" stroke-dashoffset="' + (-offset) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')" stroke-linecap="butt"></circle>';
      offset += len;
      return el;
    }).join('');
    document.getElementById('donut-svg').innerHTML =
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + cssVar('--border') + '" stroke-width="' + sw + '"></circle>' + arcs;
    document.getElementById('donut-total').textContent = s.total;
    document.getElementById('donut-legend').innerHTML = segs.map(function (seg) {
      return '<div class="row"><span><span class="sw" style="background:' + seg.color + '"></span>' + seg.label + '</span><span class="n">' + seg.n + '</span></div>';
    }).join('');
  }

  // ---------- municipality combo chart ----------
  function renderMuniChart() {
    var list = DATA.muni_status;
    var W = 560, H = 190, padL = 26, padR = 10, padT = 10, padB = 46;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = list.length;
    var maxTotal = Math.max.apply(null, list.map(function (m) { return m.total; }));
    var groupW = innerW / n;
    var barW = Math.min(10, groupW * 0.32);

    var colorCompleted = cssVar('--chart-a');
    var colorOngoing = cssVar('--gold');
    var colorOther = cssVar('--status-neutral');
    var colorLine = cssVar('--ink-soft');

    function y(v) { return padT + innerH - (v / maxTotal) * innerH; }

    var bars = '';
    var linePts = [];
    list.forEach(function (m, i) {
      var gx = padL + i * groupW + groupW / 2;
      var x1 = gx - barW - 1, x2 = gx + 1;
      var hC = (m.completed / maxTotal) * innerH;
      var hO = (m.ongoing / maxTotal) * innerH;
      bars += '<rect x="' + x1 + '" y="' + (padT + innerH - hC) + '" width="' + barW + '" height="' + hC + '" fill="' + colorCompleted + '"></rect>';
      bars += '<rect x="' + x2 + '" y="' + (padT + innerH - hO) + '" width="' + barW + '" height="' + hO + '" fill="' + colorOngoing + '"></rect>';
      linePts.push(gx + ',' + y(m.total));
      bars += '<text x="' + gx + '" y="' + (H - padB + 14) + '" font-size="8.5" fill="' + cssVar('--muted') +
        '" text-anchor="end" transform="rotate(-40 ' + gx + ' ' + (H - padB + 14) + ')" font-family="IBM Plex Sans, sans-serif">' + m.muni + '</text>';
    });
    var linePath = '<polyline points="' + linePts.join(' ') + '" fill="none" stroke="' + colorLine + '" stroke-width="1.6" stroke-dasharray="3,2"></polyline>';
    var dots = list.map(function (m, i) {
      var gx = padL + i * groupW + groupW / 2;
      return '<circle cx="' + gx + '" cy="' + y(m.total) + '" r="2.4" fill="' + colorLine + '"></circle>';
    }).join('');

    var gridLines = '';
    for (var gv = 0; gv <= maxTotal; gv += Math.ceil(maxTotal / 4)) {
      var gy = y(gv);
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="' + cssVar('--border') + '" stroke-width="1"></line>';
      gridLines += '<text x="' + (padL - 5) + '" y="' + (gy + 3) + '" font-size="8" fill="' + cssVar('--muted') + '" text-anchor="end" font-family="IBM Plex Mono, monospace">' + gv + '</text>';
    }

    document.getElementById('muni-svg').setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    document.getElementById('muni-svg').innerHTML = gridLines + bars + linePath + dots;
  }

  // ---------- financial bars ----------
  function renderFinancial() {
    var maxV = Math.max(s.total_obligated, s.total_disbursed) * 1.08;
    var obH = (s.total_obligated / maxV) * 100;
    var diH = (s.total_disbursed / maxV) * 100;
    document.getElementById('bar-obligated').style.height = obH + '%';
    document.getElementById('bar-disbursed').style.height = diH + '%';
    document.getElementById('amt-obligated').textContent = peso(s.total_obligated, 1);
    document.getElementById('amt-disbursed').textContent = peso(s.total_disbursed, 1);
    document.getElementById('fin-pct-value').textContent = s.pct_disbursed + '%';
    document.getElementById('fin-pct-n').textContent = 'based on ' + s.n_obligated + ' of ' + s.total + ' projects with figures on file';
  }

  // ---------- trend chart ----------
  function renderTrend() {
    var list = DATA.trend;
    var W = 900, H = 140, padL = 34, padR = 20, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = list.length;
    function x(i) { return padL + (i / (n - 1)) * innerW; }
    function y(pct) { return padT + innerH - (pct / 100) * innerH; }

    var pts = list.map(function (t, i) { return x(i) + ',' + y(t.pct); });
    var linePath = 'M ' + pts.join(' L ');
    var areaPath = linePath + ' L ' + x(n - 1) + ',' + (padT + innerH) + ' L ' + x(0) + ',' + (padT + innerH) + ' Z';

    var gridLines = '';
    [0, 25, 50, 75, 100].forEach(function (gv) {
      var gy = y(gv);
      gridLines += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="' + cssVar('--border') + '" stroke-width="1"></line>';
      gridLines += '<text x="' + (padL - 6) + '" y="' + (gy + 3) + '" font-size="9" fill="' + cssVar('--muted') + '" text-anchor="end" font-family="IBM Plex Mono, monospace">' + gv + '%</text>';
    });
    var labels = list.map(function (t, i) {
      return '<text x="' + x(i) + '" y="' + (H - 6) + '" font-size="9" fill="' + cssVar('--muted') + '" text-anchor="middle" font-family="IBM Plex Mono, monospace">' + t.label + '</text>';
    }).join('');
    var dots = list.map(function (t, i) {
      var last = i === n - 1;
      return '<circle cx="' + x(i) + '" cy="' + y(t.pct) + '" r="' + (last ? 4 : 2.6) + '" fill="' + cssVar('--ink') + '"></circle>' +
        (last ? '<text x="' + x(i) + '" y="' + (y(t.pct) - 10) + '" font-size="10" font-weight="700" fill="' + cssVar('--ink') + '" text-anchor="end" font-family="Roboto Slab, serif">' + t.pct + '%</text>' : '');
    }).join('');

    var svg = document.getElementById('trend-svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML =
      '<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + cssVar('--gold') + '" stop-opacity="0.28"></stop>' +
      '<stop offset="100%" stop-color="' + cssVar('--gold') + '" stop-opacity="0"></stop></linearGradient></defs>' +
      gridLines +
      '<path d="' + areaPath + '" fill="url(#trendFill)"></path>' +
      '<path d="' + linePath + '" fill="none" stroke="' + cssVar('--gold') + '" stroke-width="2.2"></path>' +
      dots + labels;
  }

  // ---------- slippage analysis ----------
  function slipColor(v) {
    if (v == null) return cssVar('--status-neutral');
    if (v > 40) return cssVar('--status-bad');
    if (v > 15) return cssVar('--status-warn');
    return cssVar('--status-good');
  }

  function renderSlippageChart() {
    var list = DATA.slippage.muni_slippage;
    var W = 620, H = 400, padL = 92, padR = 46, padT = 22, padB = 22;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var n = list.length;
    var rowH = innerH / n, barH = Math.min(9, rowH * 0.34);

    function x(v) { return padL + (v / 100) * innerW; }

    var gridLines = '';
    [0, 25, 50, 75, 100].forEach(function (gv) {
      var gx = x(gv);
      gridLines += '<line x1="' + gx + '" y1="' + padT + '" x2="' + gx + '" y2="' + (padT + innerH) + '" stroke="' + cssVar('--border') + '" stroke-width="1"></line>';
      gridLines += '<text x="' + gx + '" y="' + (padT + innerH + 14) + '" font-size="8" fill="' + cssVar('--muted') + '" text-anchor="middle" font-family="IBM Plex Mono, monospace">' + gv + '%</text>';
    });

    var rows = list.map(function (m, i) {
      var y0 = padT + i * rowH;
      var label = '<text x="' + (padL - 6) + '" y="' + (y0 + rowH / 2 + 3) + '" font-size="9" fill="' + cssVar('--ink-soft') + '" text-anchor="end" font-family="IBM Plex Sans, sans-serif">' + m.muni + '</text>';
      if (m.avg_phys == null || m.avg_fin == null) {
        return label + '<text x="' + padL + '" y="' + (y0 + rowH / 2 + 3) + '" font-size="8.5" fill="' + cssVar('--muted') + '" font-style="italic" font-family="IBM Plex Sans, sans-serif">no matching physical/financial data</text>';
      }
      var physY = y0 + rowH / 2 - barH - 1, finY = y0 + rowH / 2 + 1;
      var physBar = '<rect x="' + padL + '" y="' + physY + '" width="' + (x(m.avg_phys) - padL) + '" height="' + barH + '" rx="1.5" fill="' + cssVar('--chart-a') + '"></rect>';
      var finBar = '<rect x="' + padL + '" y="' + finY + '" width="' + (x(m.avg_fin) - padL) + '" height="' + barH + '" rx="1.5" fill="' + cssVar('--gold') + '"></rect>';
      var gapText = m.avg_slippage > 0.5
        ? '<text x="' + (x(m.avg_phys) + 5) + '" y="' + (y0 + rowH / 2 + 3) + '" font-size="8.5" font-weight="700" fill="' + slipColor(m.avg_slippage) + '" font-family="IBM Plex Mono, monospace">+' + m.avg_slippage.toFixed(0) + '</text>'
        : '';
      return label + physBar + finBar + gapText;
    }).join('');

    var legend =
      '<rect x="' + padL + '" y="4" width="8" height="8" rx="1.5" fill="' + cssVar('--chart-a') + '"></rect>' +
      '<text x="' + (padL + 12) + '" y="11" font-size="8.5" fill="' + cssVar('--ink-soft') + '" font-family="IBM Plex Sans, sans-serif">Physical %</text>' +
      '<rect x="' + (padL + 90) + '" y="4" width="8" height="8" rx="1.5" fill="' + cssVar('--gold') + '"></rect>' +
      '<text x="' + (padL + 102) + '" y="11" font-size="8.5" fill="' + cssVar('--ink-soft') + '" font-family="IBM Plex Sans, sans-serif">Financial %</text>';

    var svg = document.getElementById('slip-svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = legend + gridLines + rows;
  }

  function renderSlippageSide() {
    var slip = DATA.slippage;
    document.getElementById('slip-avg').textContent = slip.province_avg_slippage.toFixed(1) + ' pts';
    document.getElementById('slip-flagged-list').innerHTML = slip.top_flagged.map(function (p) {
      return '<div class="flag-row">' +
        '<span class="dot" style="background:' + slipColor(p.slippage) + '"></span>' +
        '<span class="fname"><span class="m">' + p.muni + ' — ' + p.brgy + '</span><span class="p">' + p.name + '</span></span>' +
        '<span class="fgap">+' + p.slippage.toFixed(0) + '</span>' +
      '</div>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderStats();
    renderDonut();
    renderMuniChart();
    renderFinancial();
    renderTrend();
    renderSlippageChart();
    renderSlippageSide();
    document.getElementById('period-label').textContent = s.period + ' · As of ' + s.as_of;
  });

  window.addEventListener('resize', function () {
    renderMuniChart();
    renderTrend();
    renderSlippageChart();
  });
})();
