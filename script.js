// Podešavanje PDF.js worker-a
if (window['pdfjsLib']) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// --- GLOBALNE STATIČKE VARIJABLE (ES5 kompatibilno) ---
var fontSize = 25;
var readerWidth = 40;
var marginEnabled = false;
var marginLeft = 10;
var marginRight = 10;
var marginThick = 2;
var marginColor = '#46b2e0';
var pacerColor = '#ffa8a8';

var words = [];
var currentFileName = '';
var pdfDoc = null;
var currentPage = 1;
var totalPages = 1;
var totalWordsInDoc = 0;
var pagesCache = {};

var posIndex = null;
var startIndex = null;
var endIndex = null;

// Countdown varijable
var cdtRemaining = 60;
var cdtRunning = false;
var cdtTimerId = null;
var cdtHasStarted = false;

// Stopwatch varijable
var swElapsed = 0;
var swRunning = false;
var swTimerId = null;

// Race & Pacer varijable
var raceActive = false;
var raceStats = [];
var raceLastTime = 0;
var pacerActive = false;
var pacerIndex = 0;
var pacerIntervalId = null;
var isPaused = false;

// Učitavanje lokalnih podešavanja pri startu
if (localStorage.getItem('margin_debljina'))
  marginThick = parseInt(localStorage.getItem('margin_debljina'), 10);
if (localStorage.getItem('margin_boja'))
  marginColor = localStorage.getItem('margin_boja');
if (localStorage.getItem('pacer_color'))
  pacerColor = localStorage.getItem('pacer_color');
if (localStorage.getItem('reader_width')) {
  readerWidth = parseInt(localStorage.getItem('reader_width'), 10);
  document.getElementById('readerWrap').style.width = readerWidth + '%';
  document.getElementById('readerWidthLbl').innerText = readerWidth + '%';
}
document.getElementById('marginThickLbl').innerText = marginThick;
document.getElementById('marginColorInput').value = marginColor;
document.getElementById('pacerColorInput').value = pacerColor;
document.documentElement.style.setProperty('--pace-mark-color', pacerColor);

// --- ESC TIPKA: toggle pacer i race ---
// --- ESC: play/pause pacer ---
var pacerPaused = false;
var racePausedAt = 0;

function getPacerInterval() {
  var wpm = parseInt(document.getElementById('pacerWpmInput').value) || 300;
  var chunk = parseInt(document.getElementById('pacerChunkSelect').value) || 2;
  return { wpm: wpm, chunk: chunk, intervalMs: (60000 / wpm) * chunk };
}

function resumePacer() {
  var cfg = getPacerInterval();
  pacerPaused = false;
  if (raceActive && racePausedAt > 0) {
    raceLastTime += new Date().getTime() - racePausedAt;
    racePausedAt = 0;
  }
  if (pacerIntervalId) {
    clearInterval(pacerIntervalId);
    pacerIntervalId = null;
  }
  pacerIntervalId = setInterval(function () {
    var totalChunks = Math.ceil(words.length / cfg.chunk);
    pacerIndex++;
    if (pacerIndex >= totalChunks) {
      // kraj stranice - pauziraj
      pacerPaused = true;
      if (raceActive) racePausedAt = new Date().getTime();
      if (pacerIntervalId) {
        clearInterval(pacerIntervalId);
        pacerIntervalId = null;
      }
    } else {
      displayWords();
    }
  }, cfg.intervalMs);
}

document.addEventListener('keydown', function (e) {
  var key = e.key || e.keyCode;
  if (key === 'Escape' || key === 27) {
    if (!currentFileName || !pacerActive) return;
    if (pacerPaused) {
      resumePacer();
    } else {
      pacerPaused = true;
      if (raceActive) racePausedAt = new Date().getTime();
      if (pacerIntervalId) {
        clearInterval(pacerIntervalId);
        pacerIntervalId = null;
      }
    }
  }
});

// --- POMOĆNE FUNKCIJE ---
function splitToWords(text) {
  if (!text) return [];
  var trimmed = text.trim();
  if (trimmed.length === 0) return [];
  return trimmed.split(/\s+/);
}

function formatTime(secs) {
  var m = Math.floor(secs / 60);
  var s = secs % 60;
  return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
}

// --- TAJMERI (LIJEVA TRAKA) ---
function updateCdtInput() {
  if (!cdtHasStarted) {
    var m = parseInt(document.getElementById('cdtMinInput').value) || 0;
    var s = parseInt(document.getElementById('cdtSecInput').value) || 0;
    cdtRemaining = m * 60 + s;
    document.getElementById('cdtDisplay').innerText = formatTime(cdtRemaining);
  }
}

function startCountdown() {
  if (cdtRunning) return;
  if (!cdtHasStarted || cdtRemaining <= 0) {
    var m = parseInt(document.getElementById('cdtMinInput').value) || 0;
    var s = parseInt(document.getElementById('cdtSecInput').value) || 0;
    cdtRemaining = m * 60 + s;
  }
  cdtHasStarted = true;
  cdtRunning = true;
  cdtTimerId = setInterval(function () {
    if (cdtRemaining <= 0) {
      pauseCountdown();
      alert('Vrijeme je isteklo!');
      return;
    }
    cdtRemaining--;
    document.getElementById('cdtDisplay').innerText = formatTime(cdtRemaining);
  }, 1000);
}

function pauseCountdown() {
  cdtRunning = false;
  if (cdtTimerId) {
    clearInterval(cdtTimerId);
    cdtTimerId = null;
  }
}

function resetCountdown() {
  pauseCountdown();
  cdtHasStarted = false;
  updateCdtInput();
}

function startStopwatch() {
  if (swRunning) return;
  swRunning = true;
  swTimerId = setInterval(function () {
    swElapsed++;
    document.getElementById('swDisplay').innerText = formatTime(swElapsed);
  }, 1000);
}

function pauseStopwatch() {
  swRunning = false;
  if (swTimerId) {
    clearInterval(swTimerId);
    swTimerId = null;
  }
}

function resetStopwatch() {
  pauseStopwatch();
  swElapsed = 0;
  document.getElementById('swDisplay').innerText = formatTime(swElapsed);
}

// --- PODEŠAVANJA IZ SIDEBAR-A ---
function changeMarginThickness(delta) {
  marginThick = Math.max(1, marginThick + delta);
  document.getElementById('marginThickLbl').innerText = marginThick;
  localStorage.setItem('margin_debljina', marginThick);
  applyMarginsStyle();
}

function changeMarginColor(val) {
  marginColor = val;
  localStorage.setItem('margin_boja', marginColor);
  applyMarginsStyle();
}

function changePacerColor(val) {
  pacerColor = val;
  localStorage.setItem('pacer_color', pacerColor);
  document.documentElement.style.setProperty('--pace-mark-color', pacerColor);
}

function resetMargins() {
  marginThick = 1;
  marginColor = '#46b2e0';
  document.getElementById('marginThickLbl').innerText = marginThick;
  document.getElementById('marginColorInput').value = marginColor;
  localStorage.setItem('margin_debljina', marginThick);
  localStorage.setItem('margin_boja', marginColor);
  applyMarginsStyle();
  alert('Margine resetovane!');
}

function resetPacerColor() {
  pacerColor = '#ffa8a8';
  document.getElementById('pacerColorInput').value = pacerColor;
  localStorage.setItem('pacer_color', pacerColor);
  document.documentElement.style.setProperty('--pace-mark-color', pacerColor);
  alert('Boja pacera resetovana!');
}

// --- READER KONTROLE ---
function changeFontSize(delta) {
  fontSize = Math.min(60, Math.max(12, fontSize + delta));
  document.getElementById('fontSizeLbl').innerText = fontSize;
  document.getElementById('readerContent').style.fontSize = fontSize + 'px';
}

function resetFontSize() {
  fontSize = 25;
  document.getElementById('fontSizeLbl').innerText = fontSize;
  document.getElementById('readerContent').style.fontSize = fontSize + 'px';
}

function changeReaderWidth(delta) {
  readerWidth = Math.min(100, Math.max(20, readerWidth + delta));
  document.getElementById('readerWidthLbl').innerText = readerWidth + '%';
  document.getElementById('readerWrap').style.width = readerWidth + '%';
  localStorage.setItem('reader_width', readerWidth);
}

function toggleMargins() {
  marginEnabled = document.getElementById('marginToggle').checked;
  applyMarginsStyle();
}

function changeMarginPos(side, delta) {
  if (side === 'left') {
    marginLeft = Math.min(40, Math.max(0, marginLeft + delta));
    document.getElementById('marginLeftLbl').innerText = marginLeft + '%';
  } else {
    marginRight = Math.min(40, Math.max(0, marginRight + delta));
    document.getElementById('marginRightLbl').innerText = marginRight + '%';
  }
  applyMarginsStyle();
}

function applyMarginsStyle() {
  var ml = document.getElementById('marginLineLeft');
  var mr = document.getElementById('marginLineRight');
  if (marginEnabled) {
    ml.classList.remove('d-none');
    mr.classList.remove('d-none');
    ml.style.left = marginLeft + '%';
    ml.style.backgroundColor = marginColor;
    ml.style.width = marginThick + 'px';
    mr.style.right = marginRight + '%';
    mr.style.backgroundColor = marginColor;
    mr.style.width = marginThick + 'px';
  } else {
    ml.classList.add('d-none');
    mr.classList.add('d-none');
  }
}

// --- TEKST / PASTE BROJANJE ---
function onTextPasteInput() {
  var val = document.getElementById('pastedTextArea').value;
  var cnt = splitToWords(val).length;
  document.getElementById('pastedStatsLbl').innerHTML =
    'Riječi: ' + cnt + ' &nbsp;|&nbsp; Selektovano riječi: 0';
}

function onTextPasteSelect() {
  var ta = document.getElementById('pastedTextArea');
  var start = ta.selectionStart;
  var end = ta.selectionEnd;
  var val = ta.value;
  var selCnt = 0;
  if (end > start) {
    selCnt = splitToWords(val.substring(start, end)).length;
  }
  var totalCnt = splitToWords(val).length;
  document.getElementById('pastedStatsLbl').innerHTML =
    'Riječi: ' + totalCnt + ' &nbsp;|&nbsp; Selektovano riječi: ' + selCnt;
}

function clearTextArea() {
  document.getElementById('pastedTextArea').value = '';
  onTextPasteInput();
}

var taRacing = false;
var taStartTime = 0;
function toggleTaRace() {
  var val = document.getElementById('pastedTextArea').value;
  if (!val.trim()) {
    alert('Nema teksta za mjerenje.');
    return;
  }
  if (!taRacing) {
    taRacing = true;
    taStartTime = new Date().getTime();
    document.getElementById('taRaceBtn').innerText = '⏹ Stop';
    document.getElementById('taRaceBtn').className = 'btn btn-danger btn-sm';
  } else {
    var secs = (new Date().getTime() - taStartTime) / 1000;
    var wordsCnt = splitToWords(val).length;
    var mins = secs / 60;
    var wpm = mins > 0 ? Math.round(wordsCnt / mins) : 0;
    taRacing = false;
    document.getElementById('taRaceBtn').innerText = '🏁 Start';
    document.getElementById('taRaceBtn').className = 'btn btn-warning btn-sm';
    alert(
      'Rezultat - Riječi: ' +
        wordsCnt +
        ', Vrijeme: ' +
        secs.toFixed(1) +
        's, WPM: ' +
        wpm,
    );
  }
}

// --- FILE SELECT ---
function handleFileSelect(e) {
  var file = e.target.files[0];
  if (!file) return;
  var name = file.name.toLowerCase();
  var isPdf = name.indexOf('.pdf') !== -1;
  var isTxt = name.indexOf('.txt') !== -1;

  if (isPdf) {
    if (window['pdfjsLib']) {
      loadPdfFile(file);
    } else {
      alert('PDF nije podržan na ovom uređaju. Koristi .txt fajl.');
    }
  } else if (isTxt) {
    loadTxtFile(file);
  } else {
    alert('Podržani formati: PDF i TXT.');
  }
}

// --- PDF UČITAVANJE ---
function loadPdfFile(file) {
  var reader = new FileReader();
  reader.onload = function (event) {
    var typedarray = new Uint8Array(event.target.result);
    pdfjsLib.getDocument(typedarray).promise.then(function (doc) {
      pdfDoc = doc;
      totalPages = doc.numPages;
      currentFileName = file.name;
      currentPage = 1;
      pagesCache = {};
      words = [];
      posIndex = null;
      startIndex = null;
      endIndex = null;

      document.getElementById('pastedSection').classList.add('d-none');
      document.getElementById('pdfSection').classList.remove('d-none');
      document.getElementById('pdfBottomControls').classList.remove('d-none');
      document.getElementById('closePdfBtn').classList.remove('d-none');

      renderPage(1);
      extractAllPagesAsync();
    });
  };
  reader.readAsArrayBuffer(file);
}

// --- TXT UČITAVANJE ---
function loadTxtFile(file) {
  var reader = new FileReader();
  reader.onload = function (event) {
    var text = event.target.result;
    var allWords = splitToWords(text);

    var PAGE_SIZE = 300;
    pagesCache = {};
    totalPages = Math.max(1, Math.ceil(allWords.length / PAGE_SIZE));
    for (var p = 1; p <= totalPages; p++) {
      pagesCache[p] = allWords.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
    }

    pdfDoc = null;
    currentFileName = file.name;
    currentPage = 1;
    totalWordsInDoc = allWords.length;
    words = [];
    posIndex = null;
    startIndex = null;
    endIndex = null;

    document.getElementById('totalDocWordsLbl').innerText = totalWordsInDoc;
    document.getElementById('pastedSection').classList.add('d-none');
    document.getElementById('pdfSection').classList.remove('d-none');
    document.getElementById('pdfBottomControls').classList.remove('d-none');
    document.getElementById('closePdfBtn').classList.remove('d-none');

    renderPage(1);
  };
  reader.readAsText(file, 'UTF-8');
}

function extractAllPagesAsync() {
  var totalW = 0;
  var completed = 0;
  for (var p = 1; p <= totalPages; p++) {
    (function (pageNum) {
      pdfDoc.getPage(pageNum).then(function (page) {
        page.getTextContent().then(function (tc) {
          var raw = tc.items
            .map(function (item) {
              return item.str;
            })
            .join(' ');
          var cleaned = raw.replace(/\s+/g, ' ').trim();
          var pw = splitToWords(cleaned);
          pagesCache[pageNum] = pw;
          totalW += pw.length;
          completed++;
          if (completed === totalPages) {
            totalWordsInDoc = totalW;
            document.getElementById('totalDocWordsLbl').innerText =
              totalWordsInDoc;
          }
        });
      });
    })(p);
  }
}

function renderPage(pageNum, callback) {
  if (pageNum < 1) pageNum = 1;
  if (pageNum > totalPages) pageNum = totalPages;
  currentPage = pageNum;

  if (pagesCache[pageNum]) {
    words = pagesCache[pageNum];
    displayWords();
    document.getElementById('pageWordCountLbl').innerText =
      'Riječi na stranici: ' + words.length;
    if (callback) callback();
  } else if (pdfDoc) {
    pdfDoc.getPage(pageNum).then(function (page) {
      page.getTextContent().then(function (tc) {
        var raw = tc.items
          .map(function (item) {
            return item.str;
          })
          .join(' ');
        var cleaned = raw.replace(/\s+/g, ' ').trim();
        words = splitToWords(cleaned);
        pagesCache[pageNum] = words;
        displayWords();
        document.getElementById('pageWordCountLbl').innerText =
          'Riječi na stranici: ' + words.length;
        if (callback) callback();
      });
    });
  }

  document.getElementById('pageInfoLbl').innerText =
    'Stranica: ' + currentPage + ' / ' + totalPages;
  if (currentFileName)
    localStorage.setItem('pdf_page_' + currentFileName, currentPage);
}

function displayWords() {
  var container = document.getElementById('readerContent');
  var html = '';
  for (var i = 0; i < words.length; i++) {
    var cls = 'word';
    if (posIndex === i) cls += ' pos-mark';
    if (startIndex === i) cls += ' start-mark';
    if (endIndex === i) cls += ' end-mark';
    if (pacerActive && isWordInPace(i)) cls += ' pace-mark';
    html +=
      '<span class="' +
      cls +
      '" onclick="wordClick(' +
      i +
      ')">' +
      words[i] +
      '</span> ';
  }
  container.innerHTML = html;
}

function wordClick(idx) {
  posIndex = idx;
  displayWords();
}

function nextPage() {
  if (currentPage < totalPages) {
    if (isPaused) {
      alert('Klikni "Nastavi" prije prelaska na sljedeću stranicu.');
      return;
    }
    recordRacePage();
    pacerIndex = 0;
    document.getElementById('pageTop').scrollIntoView();
    var wasActive = pacerActive;
    renderPage(currentPage + 1, function () {
      if (wasActive) resumePacer();
    });
  }
}

function prevPage() {
  if (currentPage > 1) {
    renderPage(currentPage - 1);
    if (pacerActive) {
      pacerIndex = 0;
    }
  }
}

function goToPageNum() {
  var target = parseInt(document.getElementById('goToPageInput').value, 10);
  if (isNaN(target)) return;
  if (isPaused) {
    alert('Klikni "Nastavi" prije skoka na drugu stranicu.');
    return;
  }
  renderPage(target);
  if (pacerActive) {
    pacerIndex = 0;
  }
}

function closePdf() {
  pdfDoc = null;
  currentFileName = '';
  words = [];
  pagesCache = {};
  stopPacer();
  raceActive = false;
  isPaused = false;
  document.getElementById('pdfSection').classList.add('d-none');
  document.getElementById('pdfBottomControls').classList.add('d-none');
  document.getElementById('closePdfBtn').classList.add('d-none');
  document.getElementById('pastedSection').classList.remove('d-none');
  document.getElementById('readerContent').innerHTML =
    '<span class="text-muted">Izaberite PDF fajl gore ili unesite tekst u polje iznad...</span>';
  document.getElementById('pdfFileInput').value = '';
}

// --- MARKERI ---
function setMarker(type) {
  if (posIndex === null) {
    alert('Prvo klikni na riječ u tekstu.');
    return;
  }
  if (type === 'start') {
    startIndex = posIndex;
  } else {
    if (startIndex === null) {
      alert('Prvo postavi Marker Početak.');
      return;
    }
    endIndex = posIndex;
    var cnt = Math.abs(endIndex - startIndex) + 1;
    document.getElementById('markerCountLbl').innerText =
      'Pročitano: ' + cnt + ' riječi';
  }
  displayWords();
}

function clearMarkers() {
  startIndex = null;
  endIndex = null;
  document.getElementById('markerCountLbl').innerText = '';
  displayWords();
}

// --- POZICIJA U LOCALSTORAGE ---
function savePosition() {
  if (!currentFileName) return;
  localStorage.setItem('pdf_page_' + currentFileName, currentPage);
  document.getElementById('prevPosLbl').innerText =
    'Sačuvana stranica: ' + currentPage;
  alert('Pozicija sačuvana!');
}

function goToSavedPositionModal() {
  if (!currentFileName) return;
  var saved = localStorage.getItem('pdf_page_' + currentFileName);
  if (!saved) {
    alert('Nema sačuvane pozicije za ovaj fajl.');
    return;
  }
  renderPage(parseInt(saved, 10));
}

// --- PRETRAGA ---
function runSearch() {
  var q = document.getElementById('searchInput').value.trim().toLowerCase();
  var box = document.getElementById('searchResultsBox');
  if (!q) {
    box.classList.add('d-none');
    return;
  }

  var results = [];
  for (var p = 1; p <= totalPages; p++) {
    var pw = pagesCache[p];
    if (!pw) continue;
    for (var i = 0; i < pw.length; i++) {
      if (pw[i].toLowerCase().indexOf(q) !== -1) {
        var start = Math.max(0, i - 4);
        var end = Math.min(pw.length, i + 5);
        var ctx = pw.slice(start, end).join(' ');
        results.push({ page: p, idx: i, context: ctx });
        if (results.length >= 50) break;
      }
    }
    if (results.length >= 50) break;
  }

  if (results.length === 0) {
    box.innerHTML = '<div class="info">Nema rezultata.</div>';
  } else {
    var html = '<div class="info mb-1">Rezultata: ' + results.length + '</div>';
    for (var r = 0; r < results.length; r++) {
      html +=
        '<div class="search-result-item" onclick="goToSearchResult(' +
        results[r].page +
        ', ' +
        results[r].idx +
        ')">' +
        '<span class="badge bg-secondary me-2">str. ' +
        results[r].page +
        '</span>' +
        results[r].context +
        '</div>';
    }
    box.innerHTML = html;
  }
  box.classList.remove('d-none');
}

function goToSearchResult(page, idx) {
  renderPage(page);
  posIndex = idx;
  displayWords();
}

function handleTapPause() {
  if (!pacerActive) return;
  if (pacerPaused) {
    resumePacer();
  } else {
    pacerPaused = true;
    if (raceActive) racePausedAt = new Date().getTime();
    if (pacerIntervalId) {
      clearInterval(pacerIntervalId);
      pacerIntervalId = null;
    }
  }
}

// --- RACE MOD ---
function toggleRace() {
  if (!currentFileName) {
    alert('Prvo učitaj fajl.');
    return;
  }
  if (!raceActive) {
    raceActive = true;
    raceStats = [];
    raceLastTime = new Date().getTime();
    document.getElementById('raceToggleBtn').innerText = '⏹ Stop Race';
    document.getElementById('raceToggleBtn').className =
      'btn btn-danger btn-sm';
  } else {
    recordRacePage();
    raceActive = false;
    document.getElementById('raceToggleBtn').innerText = '🏁 Start Race';
    document.getElementById('raceToggleBtn').className =
      'btn btn-warning btn-sm';
    stopPacer();
  }
}

function recordRacePage() {
  if (!raceActive) return;
  var now = new Date().getTime();
  var secs = (now - raceLastTime) / 1000;
  var mins = secs / 60;
  var wpm = mins > 0 ? Math.round(words.length / mins) : 0;
  raceStats.push({
    page: currentPage,
    words: words.length,
    seconds: secs,
    wpm: wpm,
  });
  raceLastTime = now;

  var html = '';
  var totalW = 0,
    totalS = 0;
  for (var i = 0; i < raceStats.length; i++) {
    html +=
      '<div class="info">Str. ' +
      raceStats[i].page +
      ': <strong>' +
      raceStats[i].wpm +
      ' wpm</strong> (' +
      raceStats[i].words +
      ' riječi, ' +
      raceStats[i].seconds.toFixed(1) +
      's)</div>';
    totalW += raceStats[i].words;
    totalS += raceStats[i].seconds;
  }
  if (!raceActive && raceStats.length > 0) {
    var avgMins = totalS / 60;
    var avgWpm = avgMins > 0 ? Math.floor(totalW / avgMins) : 0;
    html +=
      '<hr class="my-1"/><div class="info text-info fw-bold">Prosjek: <strong class="text-danger">' +
      avgWpm +
      ' wpm</strong></div>';
  }
  document.getElementById('raceStatsBox').innerHTML = html;
}

// --- PACER MOD ---
function isWordInPace(i) {
  var chunk = parseInt(document.getElementById('pacerChunkSelect').value) || 2;
  var start = pacerIndex * chunk;
  var end = start + chunk;
  return i >= start && i < end;
}

function startPacer() {
  if (!currentFileName) {
    alert('Prvo učitaj fajl.');
    return;
  }
  pacerActive = true;
  document.getElementById('tapOverlay').classList.remove('d-none');
  pacerIndex = 0;
  pacerPaused = false;
  racePausedAt = 0;
  document.getElementById('pacerControls').classList.add('d-none');
  document.getElementById('pacerActiveBox').classList.remove('d-none');
  document.getElementById('pacerActiveBox').classList.add('d-flex');
  var cfg = getPacerInterval();
  document.getElementById('pacerStatusLbl').innerText =
    'Tempo: ' + cfg.wpm + ' wpm, grupa: ' + cfg.chunk;
  resumePacer();
}

function stopPacer() {
  document.getElementById('tapOverlay').classList.add('d-none');
  if (pacerIntervalId) {
    clearInterval(pacerIntervalId);
    pacerIntervalId = null;
  }
  pacerActive = false;
  pacerPaused = false;
  pacerIndex = 0;
  racePausedAt = 0;
  if (raceActive) {
    recordRacePage();
    raceActive = false;
    document.getElementById('raceToggleBtn').innerText = '🏁 Start Race';
    document.getElementById('raceToggleBtn').className =
      'btn btn-warning btn-sm';
  }
  document.getElementById('pacerControls').classList.remove('d-none');
  document.getElementById('pacerActiveBox').classList.add('d-none');
  document.getElementById('pacerActiveBox').classList.remove('d-flex');
  displayWords();
}

function togglePauseSession() {
  isPaused = !isPaused;
  document.getElementById('pauseResumeBtn').innerText = isPaused
    ? '▶ Nastavi'
    : '⏸ Pauza';
  document.getElementById('pauseResumeBtn').className = isPaused
    ? 'btn btn-success btn-sm'
    : 'btn btn-outline-secondary btn-sm';
}

// --- EVENT LISTENER ZA FILE INPUT (kompatibilnost sa starim browserom) ---
document
  .getElementById('pdfFileInput')
  .addEventListener('change', function (e) {
    handleFileSelect(e);
  });
