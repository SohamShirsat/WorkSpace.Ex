// Apply theme immediately from localStorage (sync, prevents flash)
(function(){
  var t = localStorage.getItem('workspace_theme');
  if (t && t !== 'system') document.documentElement.setAttribute('data-theme', t);
})();

const DEBUG = false;
function debug(...args) {
  if (DEBUG) console.log('[WorkSpace Popup]', ...args);
}

// Elements
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const mainContent = document.getElementById('mainContent');
const openTabsList = document.getElementById('openTabsList');
const workspacesList = document.getElementById('workspacesList');
const openTabsSection = document.getElementById('openTabsSection');
const emptyState = document.getElementById('emptyState');
const svgNoWorkspaces = document.getElementById('svgNoWorkspaces');

const addWorkspaceBtn = document.getElementById('addWorkspaceBtn');
const trackerBtn = document.getElementById('trackerBtn');
const scratchpadBtn = document.getElementById('scratchpadBtn');
const settingsBtn = document.getElementById('settingsBtn');
const saveSessionBtn = document.getElementById('saveSessionBtn');
const sequenceBtn = document.getElementById('sequenceBtn');
const focusToggleBtn = document.getElementById('focusToggleBtn');

const quickAddPanel = document.getElementById('quickAddPanel');
const closeQuickAddBtn = document.getElementById('closeQuickAddBtn');
const cancelQuickAddBtn = document.getElementById('cancelQuickAddBtn');
const saveQuickAddBtn = document.getElementById('saveQuickAddBtn');
const newWorkspaceName = document.getElementById('newWorkspaceName');
const newWorkspaceUrls = document.getElementById('newWorkspaceUrls');
const newWorkspaceGroup = document.getElementById('newWorkspaceGroup');
const newWorkspaceCloseOthers = document.getElementById('newWorkspaceCloseOthers');
const iconPickerBtn = document.getElementById('iconPickerBtn');
const iconPicker = document.getElementById('iconPicker');
const quickAddTitle = document.getElementById('quickAddTitle');
const colorSwatches = document.querySelectorAll('.color-swatch');

const contextMenu = document.getElementById('contextMenu');
const contextEdit = document.getElementById('contextEdit');
const contextDuplicate = document.getElementById('contextDuplicate');
const contextDelete = document.getElementById('contextDelete');

const deleteConfirmDialog = document.getElementById('deleteConfirmDialog');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

const duplicateBanner = document.getElementById('duplicateBanner');
const duplicateBannerText = document.getElementById('duplicateBannerText');
const cleanDuplicatesBtn = document.getElementById('cleanDuplicatesBtn');
const dismissDuplicatesBtn = document.getElementById('dismissDuplicatesBtn');

const timeTrackerView = document.getElementById('timeTrackerView');
const ttTodayBtn = document.getElementById('ttTodayBtn');
const ttWeekBtn = document.getElementById('ttWeekBtn');
const ttList = document.getElementById('ttList');
const ttStatusText = document.getElementById('ttStatusText');
const ttPulseDot = document.getElementById('ttPulseDot');

const scratchpadView = document.getElementById('scratchpadView');
const spPasteArea = document.getElementById('spPasteArea');
const spList = document.getElementById('spList');
const spOpenAllBtn = document.getElementById('spOpenAllBtn');
const spSaveWsBtn = document.getElementById('spSaveWsBtn');
const spClearBtn = document.getElementById('spClearBtn');
const spAddCurrentBtn = document.getElementById('spAddCurrentBtn');

// View management
function switchView(viewId) {
  mainContent.classList.add('hidden');
  searchResults.classList.add('hidden');
  emptyState.classList.add('hidden');
  timeTrackerView.classList.add('hidden');
  scratchpadView.classList.add('hidden');
  
  if (viewId === 'mainContent' && workspaces.length === 0) {
    emptyState.classList.remove('hidden');
  } else if (viewId === 'mainContent') {
    mainContent.classList.remove('hidden');
  } else if (viewId === 'searchResults') {
    searchResults.classList.remove('hidden');
  } else if (viewId === 'timeTrackerView') {
    timeTrackerView.classList.remove('hidden');
  } else if (viewId === 'scratchpadView') {
    scratchpadView.classList.remove('hidden');
  }
}

const newWorkspaceNotes = document.getElementById('newWorkspaceNotes');
const notesCharCount = document.getElementById('notesCharCount');
const notesSaveIndicator = document.getElementById('notesSaveIndicator');

// State
let workspaces = [];
let settings = {};
let focusModeActive = false;
let focusEndTime = null;          // ms timestamp when current timer expires
let focusCountdownInterval = null;
let openTabs = [];
let editingWorkspaceId = null;
let contextMenuTargetId = null;
let workspaceToDeleteId = null;

// Focus panel elements (populated after DOM ready)
let focusPanel, closeFocusPanelBtn, focusDurationInput,
    focusDurDecBtn, focusDurIncBtn,
    focusWorkspaceList, focusCloseTabsRow, focusCloseTabs,
    cancelFocusBtn, startFocusBtn;
let focusSelectedWsId = null;
let focusWsItems = [];  // [{id, name, emoji, closePreviousTabs}]

const ICONS = {
  compass: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
  building: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>',
  chart: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>',
  briefcase: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
  rocket: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
  book: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>',
  target: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  palette: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  laptop: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/></svg>',
  headphones: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
  wrench: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  package: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  smartphone: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
  gamepad: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="2"/></svg>',
  lightbulb: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1.3.5 2.6 1.5 3.5.8.8 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>',
  dollar: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
  flame: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  sparkles: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>',
  folder: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  note: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>'
};

/**
 * Initialization
 */
async function init() {
  try {
    // Bind focus panel elements after DOM is ready
    focusPanel          = document.getElementById('focusPanel');
    closeFocusPanelBtn  = document.getElementById('closeFocusPanelBtn');
    focusDurationInput  = document.getElementById('focusDurationInput');
    focusDurDecBtn      = document.getElementById('focusDurDecBtn');
    focusDurIncBtn      = document.getElementById('focusDurIncBtn');
    focusWorkspaceList  = document.getElementById('focusWorkspaceList');
    focusCloseTabsRow   = document.getElementById('focusCloseTabsRow');
    focusCloseTabs      = document.getElementById('focusCloseTabs');
    cancelFocusBtn      = document.getElementById('cancelFocusBtn');
    startFocusBtn       = document.getElementById('startFocusBtn');
    initFocusPanel();

    const [localData, sessionData] = await Promise.all([
      chrome.storage.local.get(['workspaces', 'settings', 'focusModeActive']),
      chrome.storage.session.get(['tt_focusEndTime'])
    ]);
    workspaces     = localData.workspaces || [];
    settings       = localData.settings  || {};
    focusModeActive = localData.focusModeActive || false;
    focusEndTime   = (focusModeActive && sessionData.tt_focusEndTime) ? sessionData.tt_focusEndTime : null;

    updateFocusModeUI();
    renderWorkspaces();
    await fetchOpenTabs();
    checkDuplicates();
    renderOpenTabs();
    
    searchInput.focus();

    if (workspaces.length === 0) {
      showEmptyState();
    }
  } catch (e) {
    console.error('Init failed', e);
  }
}

/**
 * Tab Fetching
 */
async function fetchOpenTabs() {
  try {
    // Ignore internal URLs
    const allTabs = await chrome.tabs.query({});
    openTabs = allTabs.filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('about:') && !t.url.startsWith('edge://'));
  } catch (e) {
    console.error('Failed to fetch tabs', e);
  }
}

/**
 * Duplicate Tabs Logic
 */
let currentDuplicateSignature = "";
let duplicateTabGroups = {}; 

async function checkDuplicates() {
  duplicateTabGroups = {};
  let duplicatesCount = 0;
  
  for (const tab of openTabs) {
    let cleanUrl = tab.url;
    if (settings.ignoreHashForDuplicates !== false) {
      cleanUrl = cleanUrl.split('#')[0];
    }
    if (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    if (!duplicateTabGroups[cleanUrl]) {
      duplicateTabGroups[cleanUrl] = [tab];
    } else {
      duplicateTabGroups[cleanUrl].push(tab);
      duplicatesCount++;
    }
  }
  
  const duplicateIds = [];
  for (const url in duplicateTabGroups) {
    if (duplicateTabGroups[url].length > 1) {
      duplicateIds.push(...duplicateTabGroups[url].map(t => t.id));
    } else {
      delete duplicateTabGroups[url];
    }
  }
  
  if (duplicatesCount === 0) {
    duplicateBanner.classList.add('hidden');
    return;
  }
  
  duplicateIds.sort();
  currentDuplicateSignature = duplicateIds.join(',');
  
  const { dismissedDuplicateSignature } = await chrome.storage.local.get(['dismissedDuplicateSignature']);
  if (currentDuplicateSignature === dismissedDuplicateSignature) {
    duplicateBanner.classList.add('hidden');
    return;
  }
  
  duplicateBannerText.textContent = `${duplicatesCount} duplicate tab${duplicatesCount > 1 ? 's' : ''} found`;
  duplicateBanner.classList.remove('hidden');
}

cleanDuplicatesBtn.addEventListener('click', async () => {
  let closedCount = 0;
  const tabsToClose = [];
  for (const url in duplicateTabGroups) {
    const group = duplicateTabGroups[url];
    group.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const toClose = group.slice(1);
    tabsToClose.push(...toClose.map(t => t.id));
    closedCount += toClose.length;
  }
  
  if (tabsToClose.length > 0) {
    await chrome.tabs.remove(tabsToClose);
    duplicateBannerText.textContent = `${closedCount} tab${closedCount > 1 ? 's' : ''} closed`;
    cleanDuplicatesBtn.classList.add('hidden');
    dismissDuplicatesBtn.classList.add('hidden');
    setTimeout(() => {
      duplicateBanner.classList.add('hidden');
      cleanDuplicatesBtn.classList.remove('hidden');
      dismissDuplicatesBtn.classList.remove('hidden');
    }, 2000);
    
    openTabs = openTabs.filter(t => !tabsToClose.includes(t.id));
    renderOpenTabs();
    await chrome.storage.local.remove(['dismissedDuplicateSignature']);
  }
});

dismissDuplicatesBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ dismissedDuplicateSignature: currentDuplicateSignature });
  duplicateBanner.classList.add('hidden');
});

/**
 * Render standard open tabs list
 */
function renderOpenTabs() {
  if (openTabs.length === 0) {
    openTabsSection.classList.add('hidden');
    return;
  }
  openTabsSection.classList.remove('hidden');
  
  // Show max 3 recent/active tabs to save space
  const displayTabs = openTabs.slice(0, 3);
  openTabsList.innerHTML = displayTabs.map(tab => createTabHtml(tab)).join('');

  // Add listeners
  openTabsList.querySelectorAll('.tab-result').forEach(el => {
    el.addEventListener('click', () => switchToTab(parseInt(el.dataset.id), parseInt(el.dataset.windowId)));
  });
}

function createTabHtml(tab, index = -1) {
  const favicon = tab.favIconUrl || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3ciIHN0cm9rZS13aWR0aD0iMiI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiPjwvY2lyY2xlPjxsaW5lIHgxPSIyIiB5MT0iMTIiIHgyPSIyMiIgeTI9IjEyIj48L2xpbmU+PHBhdGggZD0iTTEyIDJhMTUuMyAxNS4zIDAgMCAxIDQgMTBhMTUuMyAxNS4zIDAgMCAxLTQgMTAgMTUuMyAxNS4zIDAgMCAxLTQtMTBhMTUuMyAxNS4zIDAgMCAxIDQtMTB6Ij48L3BhdGg+PC9zdmc+';
  const selectedClass = index === selectedResultIndex ? 'selected' : '';
  const urlTruncated = tab.url.length > 36 ? tab.url.substring(0, 36) + '...' : tab.url;
  
  let regexTagHtml = '';
  // Check if we are in sequencer context
  if (typeof getTabRuleIndex === 'function') {
    const ruleIndex = getTabRuleIndex(tab.url);
    if (ruleIndex !== -1) {
      const colors = ['var(--success)', 'var(--accent)', 'var(--warning)', 'var(--danger)', '#9b59b6'];
      const color = colors[ruleIndex % colors.length];
      regexTagHtml = `<span class="regex-tag"><span class="regex-tag-dot" style="background:${color}"></span>Seq ${ruleIndex + 1}</span>`;
    }
  }
  
  return `
    <div class="tab-result ${selectedClass}" data-id="${tab.id}" data-window-id="${tab.windowId}" data-index="${index}">
      <img src="${favicon}" class="tab-favicon" onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJjdXJyZW50Q29sb3ciIHN0cm9rZS13aWR0aD0iMiI+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMiIgcj0iMTAiPjwvY2lyY2xlPjxsaW5lIHgxPSIyIiB5MT0iMTIiIHgyPSIyMiIgeTI9IjEyIj48L2xpbmU+PHBhdGggZD0iTTEyIDJhMTUuMyAxNS4zIDAgMCAxIDQgMTBhMTUuMyAxNS4zIDAgMCAxLTQgMTAgMTUuMyAxNS4zIDAgMCAxLTQtMTBhMTUuMyAxNS4zIDAgMCAxIDQtMTB6Ij48L3BhdGg+PC9zdmc+'">
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title || 'New Tab')} ${regexTagHtml}</div>
        <div class="tab-url">${escapeHtml(urlTruncated)}</div>
      </div>
      <div class="tab-window">Win ${tab.windowId}</div>
    </div>
  `;
}

let combinedSearchResults = [];
let selectedResultIndex = -1;

/**
 * Search (Tabs & Workspaces)
 */
searchInput.addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    searchResults.classList.add('hidden');
    switchView('mainContent');
    selectedResultIndex = -1;
    return;
  }

  switchView('searchResults');

  const matchingWorkspaces = workspaces.filter(w => 
    w.name.toLowerCase().includes(query)
  ).map(w => ({ type: 'workspace', data: w }));

  const matchingTabs = openTabs.filter(t => 
    (t.title && t.title.toLowerCase().includes(query)) || 
    (t.url && t.url.toLowerCase().includes(query))
  ).map(t => ({ type: 'tab', data: t }));

  combinedSearchResults = [...matchingWorkspaces, ...matchingTabs];

  if (combinedSearchResults.length === 0) {
    searchResults.innerHTML = '';
    emptyState.innerHTML = `<p style="margin:0">No results found for '${escapeHtml(query)}'</p>`;
    emptyState.classList.remove('hidden');
    selectedResultIndex = -1;
  } else {
    emptyState.classList.add('hidden');
    selectedResultIndex = 0;
    renderSearchResults();
  }
});

searchInput.addEventListener('keydown', (e) => {
  if (searchResults.classList.contains('hidden') || combinedSearchResults.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedResultIndex = Math.min(selectedResultIndex + 1, combinedSearchResults.length - 1);
    renderSearchResults();
    scrollToSelected();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedResultIndex = Math.max(selectedResultIndex - 1, 0);
    renderSearchResults();
    scrollToSelected();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedResultIndex >= 0) {
      const selected = combinedSearchResults[selectedResultIndex];
      if (selected.type === 'tab') {
        switchToTab(selected.data.id, selected.data.windowId);
      } else if (selected.type === 'workspace') {
        launchWorkspace(selected.data.id);
      }
    }
  } else if (e.key === 'Escape') {
    window.close();
  }
});

function renderSearchResults() {
  let html = '';
  let currentWindowId = null;
  
  combinedSearchResults.forEach((result, i) => {
    if (result.type === 'workspace') {
      html += createWorkspaceHtml(result.data, i, true);
    } else if (result.type === 'tab') {
      const tab = result.data;
      if (tab.windowId !== currentWindowId) {
        if (currentWindowId !== null) {
          html += `<div style="height:1px; background:var(--border); margin:4px 0;"></div>`;
        }
        currentWindowId = tab.windowId;
      }
      html += createTabHtml(tab, i);
    }
  });

  searchResults.innerHTML = html;

  searchResults.querySelectorAll('.tab-result').forEach(el => {
    el.addEventListener('click', () => switchToTab(parseInt(el.dataset.id), parseInt(el.dataset.windowId)));
  });

  searchResults.querySelectorAll('.workspace-card').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-more') && !e.target.closest('.notes-indicator')) {
        launchWorkspace(id);
      }
    });
    const launchBtn = card.querySelector('.btn-launch');
    if (launchBtn) {
      launchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        launchWorkspace(id);
      });
    }
    const moreBtn = card.querySelector('.btn-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showContextMenu(e, id);
      });
    }
    const notesIndicator = card.querySelector('.notes-indicator');
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, id);
    });
  });
}

function scrollToSelected() {
  const selected = searchResults.querySelector('.selected');
  if (selected) {
    selected.scrollIntoView({ block: 'nearest' });
  }
}

async function switchToTab(tabId, windowId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(windowId, { focused: true });
    window.close();
  } catch (e) { console.error('Failed to switch tab', e); }
}

/**
 * Workspaces Rendering
 */
function createWorkspaceHtml(w, index = -1, isSearchResult = false) {
  let timeStr = '';
  if (settings.showLastUsed && w.lastUsed) {
    const diff = Date.now() - w.lastUsed;
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) timeStr = 'used recently';
    else if (hours < 24) timeStr = `used ${hours}h ago`;
    else timeStr = `used ${Math.floor(hours/24)}d ago`;
  }

  let iconHtml = '';
  if (settings.showEmoji !== false) {
    if (w.iconId && ICONS[w.iconId]) {
      iconHtml = `<span class="workspace-icon" style="display:inline-flex; align-items:center; vertical-align:middle; margin-right:6px;">${ICONS[w.iconId]}</span>`;
    } else if (w.emoji) {
      iconHtml = `<span class="workspace-icon" style="margin-right:6px;">${w.emoji}</span>`;
    }
  }
  const color = w.groupColor || settings.defaultGroupColor || 'blue';
  const borderColors = {
    grey: '#bdc3c7', blue: '#3498db', red: '#e74c3c', yellow: '#f1c40f',
    green: '#2ecc71', pink: '#ff9ff3', purple: '#9b59b6', cyan: '#00cec9'
  };
  const borderColor = borderColors[color] || 'var(--accent)';
  const selectedClass = (index === selectedResultIndex && isSearchResult) ? 'selected' : '';

  const notesIndicator = (w.notes && w.notes.trim() !== '') ? `<span class="notes-indicator" title="${escapeHtml(w.notes)}" data-id="${w.id}">${ICONS.note}</span>` : '';

  return `
    <div class="workspace-card ${selectedClass}" data-id="${w.id}" style="border-left-color: ${borderColor}">
      <div class="workspace-info">
        <div class="workspace-name">${iconHtml}${escapeHtml(w.name)}${notesIndicator}</div>
        <div class="workspace-meta">${w.urls.length} tabs ${timeStr ? '· ' + timeStr : ''}</div>
      </div>
      <div class="workspace-actions">
        <button class="btn-launch" title="Launch workspace">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M1.5 1.2l8 4.3-8 4.3V1.2z"/></svg>
        </button>
        <button class="btn-more" title="More options">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="6" cy="2" r="1.2"/><circle cx="6" cy="6" r="1.2"/><circle cx="6" cy="10" r="1.2"/></svg>
        </button>
      </div>
    </div>
  `;
}

function renderWorkspaces() {
  if (workspaces.length === 0) return;
  emptyState.classList.add('hidden');
  
  workspacesList.innerHTML = workspaces.map(w => createWorkspaceHtml(w)).join('');

  // Add listeners
  workspacesList.querySelectorAll('.workspace-card').forEach(card => {
    const id = card.dataset.id;
    const launchBtn = card.querySelector('.btn-launch');
    const moreBtn = card.querySelector('.btn-more');
    const notesIndicator = card.querySelector('.notes-indicator');

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.btn-more') && !e.target.closest('.notes-indicator')) {
        launchWorkspace(id);
      }
    });

    launchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      launchWorkspace(id);
    });

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showContextMenu(e, id);
    });
    
    // Right click
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e, id);
    });
  });
}

function showEmptyState() {
  emptyState.innerHTML = `
    <div class="empty-illustration">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 64" fill="none">
        <!-- back folder -->
        <path d="M10 22 Q10 18 14 18 L34 18 L38 14 L66 14 Q70 14 70 18 L70 52 Q70 56 66 56 L14 56 Q10 56 10 52 Z"
              fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" opacity="0.5"/>
        <!-- front folder -->
        <path d="M6 30 Q6 26 10 26 L32 26 L36 22 L62 22 Q66 22 66 26 L66 56 Q66 60 62 60 L10 60 Q6 60 6 56 Z"
              fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.8" stroke-linejoin="round"/>
        <!-- tab nub glow -->
        <path d="M6 30 L36 30" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" opacity="0.6"/>
        <!-- plus sign -->
        <line x1="36" y1="43" x2="36" y2="51" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
        <line x1="32" y1="47" x2="40" y2="47" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </div>
    <p class="empty-title">No workspaces yet</p>
    <p class="empty-sub">Group your tabs and switch contexts in one click</p>
    <button class="primary-btn empty-cta">+ Create First Workspace</button>
    <div class="empty-hints">
      <span class="empty-hint"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg> Focus Mode</span>
      <span class="empty-hint"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Time Tracker</span>
      <span class="empty-hint"><svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3v18"/><path d="m10 18-3 3-3-3"/><path d="M7 21V3"/><path d="m20 6-3-3-3 3"/></svg> Tab Sequencer</span>
    </div>
  `;
  emptyState.querySelector('.empty-cta').addEventListener('click', () => openQuickAdd());
  emptyState.classList.remove('hidden');
  mainContent.classList.add('hidden');
}

/**
 * Context Menu
 */
function showContextMenu(e, id) {
  contextMenuTargetId = id;
  const rect = mainContent.getBoundingClientRect();
  // Simple positioning
  let top = e.clientY;
  let left = e.clientX - 100; // open to the left

  contextMenu.style.top = `${top}px`;
  contextMenu.style.left = `${left}px`;
  contextMenu.classList.remove('hidden');
}

document.addEventListener('click', (e) => {
  if (!contextMenu.contains(e.target)) {
    contextMenu.classList.add('hidden');
  }
});

contextEdit.addEventListener('click', () => {
  contextMenu.classList.add('hidden');
  const w = workspaces.find(w => w.id === contextMenuTargetId);
  if (w) openQuickAdd(w);
});

contextDuplicate.addEventListener('click', async () => {
  contextMenu.classList.add('hidden');
  const w = workspaces.find(w => w.id === contextMenuTargetId);
  if (w) {
    const dup = {
      ...w,
      id: crypto.randomUUID(),
      name: `${w.name} (Copy)`,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };
    workspaces.push(dup);
    await saveWorkspaces();
  }
});

contextDelete.addEventListener('click', () => {
  contextMenu.classList.add('hidden');
  workspaceToDeleteId = contextMenuTargetId;
  deleteConfirmDialog.classList.remove('hidden');
});

cancelDeleteBtn.addEventListener('click', () => {
  deleteConfirmDialog.classList.add('hidden');
  workspaceToDeleteId = null;
});

confirmDeleteBtn.addEventListener('click', async () => {
  if (workspaceToDeleteId) {
    workspaces = workspaces.filter(w => w.id !== workspaceToDeleteId);
    await saveWorkspaces();
  }
  deleteConfirmDialog.classList.add('hidden');
});

/**
 * Launch Workspace
 * Confirmation happens here (popup context); actual tab/group creation is
 * delegated to the background service worker so it is not interrupted when
 * the popup closes mid-flight (which kills pending awaits).
 */
async function launchWorkspace(id) {
  try {
    const workspace = workspaces.find(w => w.id === id);
    if (!workspace) return;

    const urls = workspace.urls.filter(u => u.trim() !== '');
    if (urls.length === 0) return;

    const closePrevious = workspace.closePreviousTabs ?? false;

    // Confirm must happen in popup — confirm() is not available in background
    if (closePrevious && settings.confirmBeforeClose) {
      if (!confirm(`Close existing tabs and open "${workspace.name}"?`)) return;
    }

    // Capture the current window ID now — it won't be available after popup closes
    const currentWin = await chrome.windows.getCurrent();

    chrome.runtime.sendMessage({
      action: 'launchWorkspace',
      workspaceId: id,
      currentWindowId: currentWin.id
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Runtime error:', chrome.runtime.lastError);
        // Fallback for debugging when the background script might be disconnected
        alert("Failed to launch workspace: " + chrome.runtime.lastError.message + "\n\nPlease try reloading the extension.");
        return;
      }
      window.close();
    });
  } catch (err) {
    console.error('Launch Workspace Error:', err);
    alert('An unexpected error occurred: ' + err.message);
  }
}

/**
 * Focus Mode — button click
 */
focusToggleBtn.addEventListener('click', () => {
  if (focusModeActive) {
    // Stop focus mode immediately
    chrome.runtime.sendMessage({ action: 'stopFocusMode' }, () => {
      focusModeActive = false;
      focusEndTime    = null;
      updateFocusModeUI();
    });
  } else {
    // Open focus panel
    openFocusPanel();
  }
});

/**
 * Update focus button appearance + live countdown.
 */
function updateFocusModeUI() {
  clearInterval(focusCountdownInterval);

  if (focusModeActive) {
    focusToggleBtn.classList.add('active');

    if (focusEndTime && focusEndTime > Date.now()) {
      // Live countdown — updates every second
      const tick = () => {
        const remain = Math.max(0, focusEndTime - Date.now());
        const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
        const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
        focusToggleBtn.innerHTML = `${ICONS.target} ${mm}:${ss}`;
        if (remain <= 0) {
          clearInterval(focusCountdownInterval);
          focusModeActive = false;
          focusEndTime    = null;
          updateFocusModeUI();
        }
      };
      tick();
      focusCountdownInterval = setInterval(tick, 1000);
    } else {
      focusToggleBtn.innerHTML = `${ICONS.target} Focus On`;
    }
  } else {
    focusToggleBtn.classList.remove('active');
    focusToggleBtn.innerHTML = `${ICONS.target} Focus`;
  }
}

// ─── FOCUS PANEL ─────────────────────────────────────────────────────────────

function initFocusPanel() {
  // +/− duration buttons
  focusDurDecBtn.addEventListener('click', () => {
    focusDurationInput.value = Math.max(1, (parseInt(focusDurationInput.value) || 25) - 5);
  });
  focusDurIncBtn.addEventListener('click', () => {
    focusDurationInput.value = Math.min(240, (parseInt(focusDurationInput.value) || 25) + 5);
  });

  closeFocusPanelBtn.addEventListener('click', closeFocusPanel);
  cancelFocusBtn.addEventListener('click', closeFocusPanel);
  startFocusBtn.addEventListener('click', confirmStartFocus);

  // Keyboard navigation on the workspace chip list
  focusWorkspaceList.addEventListener('keydown', e => {
    if (!focusWsItems.length) return;
    const chips = [...focusWorkspaceList.querySelectorAll('.focus-ws-chip')];
    let idx = focusWsItems.findIndex(i => i.id === focusSelectedWsId);

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      idx = (idx + 1) % chips.length;
      selectFocusWs(idx);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      idx = (idx - 1 + chips.length) % chips.length;
      selectFocusWs(idx);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      confirmStartFocus();
    }
  });

  // Global Escape / Enter shortcuts while panel is open
  document.addEventListener('keydown', e => {
    if (focusPanel.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      closeFocusPanel();
    } else if (e.key === 'Enter') {
      const tag = document.activeElement.tagName;
      // Don't intercept Enter on focusWorkspaceList (handled above) or buttons
      if (tag !== 'BUTTON' && document.activeElement !== focusWorkspaceList) {
        e.preventDefault();
        confirmStartFocus();
      }
    }
  });
}

function openFocusPanel() {
  // Pre-fill duration from settings
  focusDurationInput.value = Math.max(1, parseInt(settings.focusDuration) || 25);
  renderFocusWorkspaces();
  focusPanel.classList.remove('hidden');
  mainContent.style.opacity = '0.3';
  mainContent.style.pointerEvents = 'none';
  // Auto-focus duration input for immediate keyboard input
  requestAnimationFrame(() => {
    focusDurationInput.focus();
    focusDurationInput.select();
  });
}

function closeFocusPanel() {
  focusPanel.classList.add('hidden');
  mainContent.style.opacity = '';
  mainContent.style.pointerEvents = '';
}

function renderFocusWorkspaces() {
  // Build item list: None first, then all workspaces
  focusWsItems = [
    { id: null, name: 'No workspace', emoji: null, closePreviousTabs: false },
    ...workspaces.map(w => ({
      id: w.id,
      name: w.name,
      iconId: w.iconId,
      emoji: w.emoji,
      closePreviousTabs: w.closePreviousTabs
    }))
  ];
  focusSelectedWsId = null; // default: no workspace

  focusWorkspaceList.innerHTML = '';
  focusWsItems.forEach((item, i) => {
    const chip = document.createElement('button');
    chip.className = 'focus-ws-chip' + (i === 0 ? ' selected' : '');
    chip.setAttribute('role', 'option');
    chip.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    chip.dataset.idx = i;

    let iconHtml;
    if (item.id === null) {
      // "None" — no icon, just a dash
      iconHtml = `<span class="focus-ws-icon focus-ws-none-icon">⊘</span>`;
    } else if (item.iconId && ICONS[item.iconId]) {
      iconHtml = `<span class="focus-ws-icon">${ICONS[item.iconId]}</span>`;
    } else {
      iconHtml = `<span class="focus-ws-icon focus-ws-emoji">${item.emoji || '📁'}</span>`;
    }

    chip.innerHTML = `${iconHtml}<span class="focus-ws-name">${escapeHtml(item.name)}</span>`;
    chip.addEventListener('click', () => selectFocusWs(i));
    focusWorkspaceList.appendChild(chip);
  });

  updateFocusCloseRow();
}

function selectFocusWs(idx) {
  if (idx < 0 || idx >= focusWsItems.length) return;
  const item = focusWsItems[idx];
  focusSelectedWsId = item.id;

  // Update chip visual state
  focusWorkspaceList.querySelectorAll('.focus-ws-chip').forEach((c, i) => {
    const active = i === idx;
    c.classList.toggle('selected', active);
    c.setAttribute('aria-selected', active ? 'true' : 'false');
    // Scroll selected chip into view
    if (active) c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  updateFocusCloseRow();
}

function updateFocusCloseRow() {
  if (focusSelectedWsId) {
    const ws = focusWsItems.find(i => i.id === focusSelectedWsId);
    focusCloseTabs.checked = !!(ws && ws.closePreviousTabs);
    focusCloseTabsRow.classList.remove('hidden');
  } else {
    focusCloseTabsRow.classList.add('hidden');
  }
}

async function confirmStartFocus() {
  const durationMin  = Math.max(0, parseInt(focusDurationInput.value) || 0);
  const closeTabs    = focusSelectedWsId ? focusCloseTabs.checked : false;

  // Get current window id to pass to background
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentWindowId = tab?.windowId ?? null;

  closeFocusPanel();

  chrome.runtime.sendMessage({
    action: 'startFocusMode',
    workspaceId: focusSelectedWsId,
    closeTabs,
    durationMin,
    currentWindowId
  }, () => {
    focusModeActive = true;
    focusEndTime    = durationMin > 0 ? Date.now() + durationMin * 60 * 1000 : null;
    updateFocusModeUI();
    // Close popup if a workspace is being launched (tabs will change)
    if (focusSelectedWsId) setTimeout(() => window.close(), 150);
  });
}

/**
 * Quick Add Panel
 */
addWorkspaceBtn.addEventListener('click', () => openQuickAdd());
closeQuickAddBtn.addEventListener('click', closeQuickAdd);
cancelQuickAddBtn.addEventListener('click', closeQuickAdd);

function openQuickAdd(workspaceToEdit = null) {
  quickAddPanel.classList.remove('hidden');
  mainContent.style.opacity = '0.3';
  mainContent.style.pointerEvents = 'none';

  if (workspaceToEdit) {
    editingWorkspaceId = workspaceToEdit.id;
    quickAddTitle.textContent = 'Edit Workspace';
    newWorkspaceName.value = workspaceToEdit.name;
    newWorkspaceUrls.value = workspaceToEdit.urls.join('\n');
    newWorkspaceNotes.value = workspaceToEdit.notes || '';
    newWorkspaceGroup.checked = workspaceToEdit.groupTabs;
    newWorkspaceCloseOthers.checked = workspaceToEdit.closePreviousTabs;
    iconPickerBtn.dataset.iconId = workspaceToEdit.iconId || '';
    iconPickerBtn.innerHTML = workspaceToEdit.iconId && ICONS[workspaceToEdit.iconId] ? ICONS[workspaceToEdit.iconId] : (workspaceToEdit.emoji || ICONS.compass);
  } else {
    editingWorkspaceId = null;
    quickAddTitle.textContent = 'New Workspace';
    newWorkspaceName.value = '';
    newWorkspaceUrls.value = '';
    newWorkspaceNotes.value = '';
    newWorkspaceGroup.checked = settings.autoGroupTabs !== false;
    newWorkspaceCloseOthers.checked = false;
    iconPickerBtn.dataset.iconId = 'compass';
    iconPickerBtn.innerHTML = ICONS.compass;
  }
  
  // Set color picker
  const colorToSelect = workspaceToEdit ? (workspaceToEdit.groupColor || workspaceToEdit.color || 'blue') : (settings.defaultGroupColor || 'blue');
  colorSwatches.forEach(swatch => {
    swatch.classList.toggle('selected', swatch.dataset.color === colorToSelect);
  });

  updateCharCount();
  newWorkspaceName.focus();
}

newWorkspaceNotes.addEventListener('input', updateCharCount);

function updateCharCount() {
  const len = newWorkspaceNotes.value.length;
  if (len >= 450) {
    notesCharCount.textContent = `${len}/500`;
    notesCharCount.classList.toggle('near-limit', len >= 450);
  } else {
    notesCharCount.textContent = '';
  }
}

newWorkspaceNotes.addEventListener('blur', async () => {
  if (editingWorkspaceId) {
    const idx = workspaces.findIndex(w => w.id === editingWorkspaceId);
    if (idx !== -1) {
      workspaces[idx].notes = newWorkspaceNotes.value;
      await saveWorkspaces();
      
      notesSaveIndicator.classList.remove('hidden', 'fading');
      setTimeout(() => {
        notesSaveIndicator.classList.add('fading');
        setTimeout(() => notesSaveIndicator.classList.add('hidden'), 1500);
      }, 1000);
    }
  }
});

function closeQuickAdd() {
  quickAddPanel.classList.add('hidden');
  mainContent.style.opacity = '1';
  mainContent.style.pointerEvents = 'auto';
  iconPicker.classList.add('hidden');
}

saveQuickAddBtn.addEventListener('click', async () => {
  const name = newWorkspaceName.value.trim();
  const rawUrls = newWorkspaceUrls.value.split('\n').map(u => u.trim()).filter(u => u);

  const urls = rawUrls.map(u => {
    if (!/^https?:\/\//i.test(u) && !/^chrome:\/\//i.test(u) && !/^chrome-extension:\/\//i.test(u) && !/^about:/i.test(u)) {
      if (u.startsWith('localhost') || u.startsWith('127.0.0.1')) {
        return 'http://' + u;
      }
      return 'https://' + u;
    }
    return u;
  });

  if (!name || urls.length === 0) return; // Simple validation

  const selectedSwatch = document.querySelector('.color-swatch.selected');
  const selectedColor = selectedSwatch ? selectedSwatch.dataset.color : 'blue';

  if (editingWorkspaceId) {
    const idx = workspaces.findIndex(w => w.id === editingWorkspaceId);
    if (idx !== -1) {
      workspaces[idx] = {
        ...workspaces[idx],
        name,
        iconId: iconPickerBtn.dataset.iconId,
        urls,
        notes: newWorkspaceNotes.value,
        color: selectedColor,
        groupColor: selectedColor,
        groupTabs: newWorkspaceGroup.checked,
        closePreviousTabs: newWorkspaceCloseOthers.checked
      };
    }
  } else {
    const newWs = {
      id: crypto.randomUUID(),
      name,
      iconId: iconPickerBtn.dataset.iconId,
      color: selectedColor,
      urls,
      notes: newWorkspaceNotes.value,
      groupName: '',
      groupColor: selectedColor,
      groupTabs: newWorkspaceGroup.checked,
      openInNewWindow: settings.defaultLaunchMode === 'new',
      closePreviousTabs: newWorkspaceCloseOthers.checked,
      pinFirstTab: false,
      createdAt: Date.now(),
      lastUsed: Date.now()
    };
    workspaces.push(newWs);
  }

  await saveWorkspaces();
  closeQuickAdd();
});

colorSwatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    colorSwatches.forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
  });
});

/**
 * Save Current Session
 */
saveSessionBtn.addEventListener('click', async () => {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const validTabs = tabs.filter(t => !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('about:'));
    if (validTabs.length === 0) return;
    const urls = validTabs.map(t => t.url).join('\n');
    openQuickAdd();
    newWorkspaceUrls.value = urls;
    newWorkspaceName.value = 'My Session';
    newWorkspaceName.focus();
    newWorkspaceName.select();
  } catch (e) {
    console.error('Failed to save current window session', e);
  }
});

/**
 * Icon Picker
 */
iconPickerBtn.addEventListener('click', () => {
  if (iconPicker.classList.contains('hidden')) {
    iconPicker.innerHTML = Object.entries(ICONS).map(([id, svg]) => `<div class="icon-item" data-id="${id}">${svg}</div>`).join('');
    iconPicker.classList.remove('hidden');
    
    iconPicker.querySelectorAll('.icon-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const iconItem = e.target.closest('.icon-item');
        if (iconItem) {
          iconPickerBtn.dataset.iconId = iconItem.dataset.id;
          iconPickerBtn.innerHTML = iconItem.innerHTML;
          iconPicker.classList.add('hidden');
        }
      });
    });
  } else {
    iconPicker.classList.add('hidden');
  }
});

/**
 * Settings navigation
 */
settingsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('settings.html'));
  }
});

/**
 * Utils
 */
async function saveWorkspaces() {
  await chrome.storage.local.set({ workspaces });
  renderWorkspaces();
  if (workspaces.length > 0) {
    mainContent.classList.remove('hidden');
    emptyState.classList.add('hidden');
  } else {
    showEmptyState();
  }
}

function escapeHtml(unsafe) {
  return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// Start

/* ── TIME TRACKER LOGIC ─────────────────────────────────────── */
trackerBtn.addEventListener('click', () => {
  switchView('timeTrackerView');
  renderTimeTracker();
});

ttTodayBtn.addEventListener('click', () => {
  ttTodayBtn.classList.add('active');
  ttWeekBtn.classList.remove('active');
  renderTimeTracker();
});

ttWeekBtn.addEventListener('click', () => {
  ttWeekBtn.classList.add('active');
  ttTodayBtn.classList.remove('active');
  renderTimeTracker();
});

async function renderTimeTracker() {
  if (!settings.enableTimeTracker) {
    ttList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">Time Tracker is disabled. Enable it in Settings.</div>`;
    ttStatusText.textContent = 'Tracking disabled';
    ttPulseDot.classList.remove('active');
    return;
  }
  
  const data = await chrome.storage.local.get('timeTracker');
  const trackerData = data.timeTracker || {};
  
  let totalData = {};
  const todayDate = new Date().toISOString().split('T')[0];
  
  if (ttTodayBtn.classList.contains('active')) {
    totalData = trackerData[todayDate] || {};
  } else {
    // This Week (last 7 days)
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayData = trackerData[dateStr] || {};
      for (const [domain, time] of Object.entries(dayData)) {
        totalData[domain] = (totalData[domain] || 0) + time;
      }
    }
  }
  
  const sorted = Object.entries(totalData).sort((a, b) => b[1] - a[1]);
  
  if (sorted.length === 0) {
    ttList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">No activity recorded.</div>`;
  } else {
    ttList.innerHTML = sorted.map(([domain, seconds]) => {
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      let timeStr = '';
      if (hrs > 0) timeStr += `${hrs}h `;
      timeStr += `${mins}m`;
      if (hrs === 0 && mins === 0) timeStr = '<1m';
      
      return `
        <div class="tt-row">
          <div class="tt-domain">${escapeHtml(domain)}</div>
          <div class="tt-time">${timeStr}</div>
        </div>
      `;
    }).join('');
  }

  // Check tracking status
  chrome.idle.queryState(parseInt(settings.idleThreshold) || 300, (state) => {
    if (state === 'active') {
      ttStatusText.textContent = 'Tracking active';
      ttPulseDot.classList.add('active');
    } else {
      ttStatusText.textContent = 'Tracking paused (Idle)';
      ttPulseDot.classList.remove('active');
    }
  });
}

/* ── SCRATCHPAD LOGIC ───────────────────────────────────────── */
scratchpadBtn.addEventListener('click', () => {
  switchView('scratchpadView');
  renderScratchpad();
});

async function renderScratchpad() {
  const data = await chrome.storage.local.get('scratchpad');
  const spItems = data.scratchpad || [];
  
  if (spItems.length === 0) {
    spList.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 12px;">Scratchpad is empty.<br><br>Paste URLs above, or right click any page to save.</div>`;
  } else {
    spList.innerHTML = spItems.map((item, index) => `
      <div class="sp-row">
        <img src="${item.favicon || 'icons/icon-16.png'}" class="sp-favicon" onerror="this.src='icons/icon-16.png'">
        <div class="sp-info">
          <div class="sp-title">${escapeHtml(item.title || item.url)}</div>
          <div class="sp-meta">${new Date(item.savedAt).toLocaleString()}</div>
        </div>
        <div class="sp-row-actions">
          <button class="sp-action-btn delete" data-index="${index}" title="Remove">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>
    `).join('');
    
    // Attach delete handlers
    document.querySelectorAll('.sp-action-btn.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.index, 10);
        spItems.splice(idx, 1);
        await chrome.storage.local.set({ scratchpad: spItems });
        renderScratchpad();
      });
    });
  }
}

spAddCurrentBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || tab.url.startsWith('chrome://')) return;
  
  const data = await chrome.storage.local.get('scratchpad');
  const spItems = data.scratchpad || [];
  spItems.unshift({
    url: tab.url,
    title: tab.title,
    favicon: tab.favIconUrl,
    savedAt: Date.now()
  });
  
  if (spItems.length > 50) spItems.length = 50;
  await chrome.storage.local.set({ scratchpad: spItems });
  renderScratchpad();
});

spPasteArea.addEventListener('paste', async (e) => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  if (!text) return;
  
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = text.match(urlRegex);
  if (!urls) return;
  
  const data = await chrome.storage.local.get('scratchpad');
  const spItems = data.scratchpad || [];
  
  for (const url of urls) {
    spItems.unshift({
      url: url,
      title: url,
      favicon: null,
      savedAt: Date.now()
    });
  }
  
  if (spItems.length > 50) spItems.length = 50;
  await chrome.storage.local.set({ scratchpad: spItems });
  spPasteArea.value = '';
  renderScratchpad();
});

spClearBtn.addEventListener('click', async () => {
  if (confirm("Clear all items from Scratchpad?")) {
    await chrome.storage.local.set({ scratchpad: [] });
    renderScratchpad();
  }
});

spOpenAllBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('scratchpad');
  const spItems = data.scratchpad || [];
  if (spItems.length === 0) return;
  
  for (const item of spItems) {
    chrome.tabs.create({ url: item.url, active: false });
  }
});

spSaveWsBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get('scratchpad');
  const spItems = data.scratchpad || [];
  if (spItems.length === 0) return;
  
  const urls = spItems.map(item => item.url).join('\n');
  newWorkspaceUrls.value = urls;
  openQuickAdd();
});

/* ── TAB SEQUENCER LOGIC ────────────────────────────────────── */
sequenceBtn.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const hasRules = settings.regexRulesEnabled && settings.regexRules && settings.regexRules.length > 0;

  // Chrome tab group members come first (preserve their current order / group structure)
  const groupedTabs   = tabs.filter(t => t.groupId !== -1);
  const ungroupedTabs = tabs.filter(t => t.groupId === -1);

  let sortedUngrouped;
  let mode;

  if (hasRules) {
    // Rules mode: matched ungrouped tabs first (rule order), unmatched fall back to auto
    const matched   = ungroupedTabs.filter(t => getTabRuleIndex(t.url) !== -1);
    const unmatched = ungroupedTabs.filter(t => getTabRuleIndex(t.url) === -1);
    matched.sort((a, b) => getTabRuleIndex(a.url) - getTabRuleIndex(b.url));
    sortedUngrouped = [...matched, ...sortByDomainFrequency(unmatched)];
    mode = 'rules';
  } else {
    sortedUngrouped = sortByDomainFrequency(ungroupedTabs);
    mode = 'auto';
  }

  // Final order: existing Chrome groups → sorted ungrouped tabs
  const sortedTabs = [...groupedTabs, ...sortedUngrouped];

  for (let i = 0; i < sortedTabs.length; i++) {
    await chrome.tabs.move(sortedTabs[i].id, { index: i });
  }

  const originalHtml = sequenceBtn.innerHTML;
  const label = mode === 'rules' ? 'Sequenced by rules ✓' : 'Sequenced by domain ✓';
  sequenceBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: text-bottom; margin-right: 4px;"><polyline points="20 6 9 17 4 12"/></svg> ${label}`;
  setTimeout(() => { sequenceBtn.innerHTML = originalHtml; }, 2000);
});

function sortByDomainFrequency(tabs) {
  function getHostname(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  // Normalize http → https so http:// tabs don't sort before https:// tabs of the same domain
  function normalizeUrlForSort(url) {
    return url.replace(/^http:\/\//, 'https://');
  }

  const domainCount = {};
  for (const tab of tabs) {
    const d = getHostname(tab.url);
    domainCount[d] = (domainCount[d] || 0) + 1;
  }

  const groups = {};
  for (const tab of tabs) {
    const d = getHostname(tab.url);
    if (!groups[d]) groups[d] = [];
    groups[d].push(tab);
  }

  // Sort tabs within each domain group by full URL (normalized) for stable, deterministic order
  for (const d of Object.keys(groups)) {
    groups[d].sort((a, b) => normalizeUrlForSort(a.url).localeCompare(normalizeUrlForSort(b.url)));
  }

  // Higher count first; ties broken alphabetically (unique-domain tabs end up last, A-Z)
  const sortedDomains = Object.keys(domainCount).sort((a, b) => {
    const diff = domainCount[b] - domainCount[a];
    return diff !== 0 ? diff : a.localeCompare(b);
  });

  return sortedDomains.flatMap(d => groups[d]);
}

function getTabRuleIndex(url) {
  if (!settings.regexRules) return -1;
  for (let i = 0; i < settings.regexRules.length; i++) {
    const rule = settings.regexRules[i];
    try {
      const regex = new RegExp(rule.pattern, 'i');
      if (regex.test(url)) return i;
    } catch (e) {
      // Invalid regex
    }
  }
  return -1;
}

init();
