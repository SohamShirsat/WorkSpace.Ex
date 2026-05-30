const DEBUG = false;
/**
 * Log debugging information if DEBUG is true.
 * @param {...any} args
 */
function debug(...args) {
  if (DEBUG) console.log('[WorkSpace BG]', ...args);
}

// ─── WORKSPACE GROUP TRACKING ────────────────────────────────────────────────
// Tracks groupIds created by workspace launches so we can prevent Chrome from
// auto-saving them. Persisted to session storage to survive SW restarts.
const _wsGroupIds = new Set();

(async () => {
  try {
    const s = await chrome.storage.session.get(['_wsGroupIds']);
    if (Array.isArray(s._wsGroupIds)) s._wsGroupIds.forEach(id => _wsGroupIds.add(id));
  } catch (e) {}
})();

function _trackGroup(groupId) {
  _wsGroupIds.add(groupId);
  chrome.storage.session.set({ _wsGroupIds: [..._wsGroupIds] }).catch(() => {});
}

function _untrackGroup(groupId) {
  _wsGroupIds.delete(groupId);
  chrome.storage.session.set({ _wsGroupIds: [..._wsGroupIds] }).catch(() => {});
}

// When Chrome saves a workspace group (e.g. on close or sync), immediately unsave it.
if (chrome.tabGroups?.onUpdated) {
  chrome.tabGroups.onUpdated.addListener(async (group) => {
    if (_wsGroupIds.has(group.id) && group.saved === true) {
      try { await chrome.tabGroups.update(group.id, { saved: false }); } catch (e) {}
    }
  });
}

// Clean up tracking when a group is fully removed.
if (chrome.tabGroups?.onRemoved) {
  chrome.tabGroups.onRemoved.addListener((group) => _untrackGroup(group.id));
}

const DEFAULT_SETTINGS = {
  defaultLaunchMode: "current",
  showEmoji: true,
  showLastUsed: true,
  confirmBeforeClose: true,
  badgeColor: "#d4874a",
  focusModeWorkspaceId: null,
  focusModeCloseTabs: true,
  focusModeNewWindow: false,
  defaultGroupColor: "blue",
  autoGroupTabs: true,
  defaultGroupNameFormat: "{workspace_name}",
  ignoreHashForDuplicates: true,
  showDuplicateBadge: true
};

// Handle extension installation and setup default values
chrome.runtime.onInstalled.addListener(async () => {
  debug('Extension installed/updated');
  try {
    const data = await chrome.storage.local.get(null);
    if (!data.settings) {
      await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    }
    if (!data.workspaces) {
      await chrome.storage.local.set({ workspaces: [] });
    }
    if (data.focusModeActive === undefined) {
      await chrome.storage.local.set({ focusModeActive: false });
    }
    
    // Create Context Menus for Scratchpad
    chrome.contextMenus.create({
      id: "scratchpad-add",
      title: "Save to Scratchpad",
      contexts: ["page"]
    });
    chrome.contextMenus.create({
      id: "scratchpad-open-all",
      title: "Open all Scratchpad tabs",
      contexts: ["action"]
    });
  } catch (e) {
    console.error('Install init failed', e);
  }
});

// Handle keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
  debug('Command received', command);
  if (command === 'switch-workspace') {
    if (chrome.action && chrome.action.openPopup) {
      try {
        await chrome.action.openPopup();
      } catch (e) {
        console.error('Could not open popup programmatically', e);
      }
    }
  } else if (command === 'focus-mode-toggle') {
    await toggleFocusMode();
  }
});

// ─── FOCUS MODE ──────────────────────────────────────────────────────────────

/**
 * Start focus mode. Called from the popup panel (full options) or keyboard
 * shortcut (uses saved settings as defaults).
 * @param {object} opts
 * @param {string|null} opts.workspaceId   – workspace to launch (null = none)
 * @param {boolean|null} opts.closeTabs    – override workspace closePreviousTabs
 * @param {number} opts.durationMin        – timer duration in minutes (0 = no timer)
 * @param {number|null} opts.currentWindowId – Chrome window id from popup
 */
async function startFocusMode({ workspaceId = null, closeTabs = null, durationMin = 0, currentWindowId = null } = {}) {
  try {
    const data = await chrome.storage.local.get(['settings', 'workspaces']);
    const settings = data.settings || DEFAULT_SETTINGS;

    await chrome.storage.local.set({ focusModeActive: true });

    // ── Timer ────────────────────────────────────────────────────────────────
    let endTime = null;
    if (durationMin > 0) {
      endTime = Date.now() + durationMin * 60 * 1000;
      await chrome.storage.session.set({ tt_focusEndTime: endTime });
      // Tick every minute to refresh badge
      chrome.alarms.create('focusTimerTick', { periodInMinutes: 1 });
      // Fire exactly when the session ends
      chrome.alarms.create('focusTimerEnd', { when: endTime });
    } else {
      await chrome.storage.session.remove('tt_focusEndTime');
    }

    await updateFocusBadge(endTime, settings.badgeColor);

    // ── Launch workspace ──────────────────────────────────────────────────────
    const wsId = workspaceId ?? settings.focusModeWorkspaceId ?? null;
    if (wsId) {
      const workspace = (data.workspaces || []).find(w => w.id === wsId);
      if (workspace) {
        const shouldClose = closeTabs !== null ? closeTabs : (workspace.closePreviousTabs ?? settings.focusModeCloseTabs);
        const wsWithOverride = { ...workspace, closePreviousTabs: shouldClose };
        if (currentWindowId) {
          await handlePopupLaunch(wsId, currentWindowId, wsWithOverride);
        } else {
          await launchWorkspace(wsWithOverride, settings);
        }
      }
    }
  } catch (e) {
    console.error('startFocusMode failed', e);
  }
}

/**
 * Stop focus mode: clear timer, badge, and storage state.
 */
async function stopFocusMode() {
  try {
    await chrome.storage.local.set({ focusModeActive: false });
    await chrome.storage.session.remove('tt_focusEndTime');
    chrome.alarms.clear('focusTimerTick');
    chrome.alarms.clear('focusTimerEnd');
    await chrome.action.setBadgeText({ text: '' });
    checkForDuplicates();
  } catch (e) {
    console.error('stopFocusMode failed', e);
  }
}

/**
 * Update the extension badge to show the focus countdown (or active dot).
 * Badge fits ~4 chars cleanly:  "25m" / "9:45" / "●"
 * @param {number|null} endTime  – ms timestamp when timer ends, null = no timer
 * @param {string} badgeColor
 */
async function updateFocusBadge(endTime, badgeColor) {
  const color = badgeColor || '#d4874a';
  await chrome.action.setBadgeBackgroundColor({ color });

  if (!endTime) {
    await chrome.action.setBadgeText({ text: '●' });
    return;
  }

  const remainSec = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
  if (remainSec === 0) {
    await chrome.action.setBadgeText({ text: '✓' });
    return;
  }
  const remainMin = Math.ceil(remainSec / 60);
  // ≥ 10 min → "25m"  |  < 10 min → "9:45"
  let text;
  if (remainMin >= 10) {
    text = `${remainMin}m`;
  } else {
    const mm = Math.floor(remainSec / 60);
    const ss = String(remainSec % 60).padStart(2, '0');
    text = `${mm}:${ss}`;
  }
  await chrome.action.setBadgeText({ text });
}

/**
 * Keyboard-shortcut toggle — uses saved settings as defaults.
 */
async function toggleFocusMode() {
  try {
    const data = await chrome.storage.local.get(['focusModeActive', 'settings']);
    if (data.focusModeActive) {
      await stopFocusMode();
    } else {
      const s = data.settings || DEFAULT_SETTINGS;
      await startFocusMode({
        workspaceId:  s.focusModeWorkspaceId || null,
        closeTabs:    s.focusModeCloseTabs ?? true,
        durationMin:  parseInt(s.focusDuration) || 0
      });
    }
  } catch (e) {
    console.error('toggleFocusMode failed', e);
  }
}

/**
 * Launch the specified workspace.
 * @param {object} workspace
 * @param {object} settings
 */
async function launchWorkspace(workspace, settings) {
  const rawUrls = workspace.urls.filter(u => u.trim() !== '');
  if (rawUrls.length === 0) return;

  const urls = rawUrls.map(u => {
    if (!/^https?:\/\//i.test(u) && !/^chrome:\/\//i.test(u) && !/^chrome-extension:\/\//i.test(u) && !/^about:/i.test(u)) {
      return (u.startsWith('localhost') || u.startsWith('127.0.0.1')) ? 'http://' + u : 'https://' + u;
    }
    return u;
  });

  const openInNewWindow = workspace.openInNewWindow ?? settings.focusModeNewWindow;
  const closePrevious = workspace.closePreviousTabs ?? settings.focusModeCloseTabs;
  const groupTabs = workspace.groupTabs ?? settings.autoGroupTabs;
  const pinFirstTab = workspace.pinFirstTab ?? false;

  if (openInNewWindow) {
    const win = await chrome.windows.create({ url: urls, focused: true });
    
    // Check if first tab should be pinned
    if (pinFirstTab) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      if (tabs.length > 0) {
        await chrome.tabs.update(tabs[0].id, { pinned: true });
      }
    }

    if (groupTabs && chrome.tabs.group) {
      const tabs = await chrome.tabs.query({ windowId: win.id });
      // Chrome does not allow grouping chrome:// or chrome-extension:// tabs
      const groupableTabIds = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')).map(t => t.id);
      
      if (groupableTabIds.length > 0) {
        try {
          const groupId = await chrome.tabs.group({ createProperties: { windowId: win.id }, tabIds: groupableTabIds });
          _trackGroup(groupId);
          await chrome.tabGroups.update(groupId, {
            title: settings.defaultGroupNameFormat.replace('{workspace_name}', workspace.name),
            color: workspace.groupColor || settings.defaultGroupColor,
            saved: false
          });
        } catch (e) { console.error('Grouping failed', e); }
      }
    }
  } else {
    // Current window
    const currentWin = await chrome.windows.getCurrent();
    const existingTabs = await chrome.tabs.query({ windowId: currentWin.id });
    
    const newTabIds = [];
    const groupableTabIds = [];
    for (let i = 0; i < urls.length; i++) {
      try {
        const tab = await chrome.tabs.create({ url: urls[i], windowId: currentWin.id, active: false, pinned: pinFirstTab && i === 0 });
        newTabIds.push(tab.id);
        if (!urls[i].startsWith('chrome://') && !urls[i].startsWith('chrome-extension://')) {
          groupableTabIds.push(tab.id);
        }
      } catch (e) { console.error('Failed to create tab:', urls[i], e); }
    }
    
    if (newTabIds.length > 0) {
      await chrome.tabs.update(newTabIds[0], { active: true });
    }

    if (groupTabs && chrome.tabs.group && groupableTabIds.length > 0) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: groupableTabIds });
        _trackGroup(groupId);
        await chrome.tabGroups.update(groupId, {
          title: settings.defaultGroupNameFormat.replace('{workspace_name}', workspace.name),
          color: workspace.groupColor || settings.defaultGroupColor,
          saved: false
        });
      } catch (e) { console.error('Grouping failed', e); }
    }

    if (closePrevious) {
      const tabsToClose = existingTabs.map(t => t.id);
      try {
        await chrome.tabs.remove(tabsToClose);
      } catch (e) { console.error('Close previous failed. Chrome prevents closing the last tab', e); }
    }
  }

  // Update last used
  workspace.lastUsed = Date.now();
  const { workspaces } = await chrome.storage.local.get(['workspaces']);
  const updatedWorkspaces = workspaces.map(w => w.id === workspace.id ? workspace : w);
  await chrome.storage.local.set({ workspaces: updatedWorkspaces });
}

// Initial badge check on SW startup
chrome.storage.local.get(['focusModeActive', 'settings'], async (data) => {
  if (data.focusModeActive) {
    const session = await chrome.storage.session.get(['tt_focusEndTime']);
    await updateFocusBadge(session.tt_focusEndTime || null, data.settings?.badgeColor);
  } else {
    checkForDuplicates();
  }
});

// Unified storage change listener
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;

  // Sync badge when focus mode is deactivated externally
  if (changes.focusModeActive && !changes.focusModeActive.newValue) {
    chrome.action.setBadgeText({ text: '' });
    checkForDuplicates();
  }

  // Update idle detection threshold when settings change
  if (changes.settings) {
    const s = changes.settings.newValue || {};
    chrome.idle.setDetectionInterval(parseInt(s.idleThreshold) || 120);
  }
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleFocusMode') {
    toggleFocusMode().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'startFocusMode') {
    startFocusMode(request).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'stopFocusMode') {
    stopFocusMode().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (request.action === 'launchWorkspace') {
    handlePopupLaunch(request.workspaceId, request.currentWindowId)
      .catch(e => console.error('Launch failed', e));
    sendResponse({ ok: true });
    return true;
  }
});

/**
 * Handle a workspace launch triggered from the popup.
 * Runs entirely in the background so closing the popup mid-flight doesn't
 * interrupt tab creation or grouping.
 */
async function handlePopupLaunch(workspaceId, currentWindowId) {
  const data = await chrome.storage.local.get(['workspaces', 'settings']);
  const workspace = (data.workspaces || []).find(w => w.id === workspaceId);
  const settings = data.settings || DEFAULT_SETTINGS;
  if (!workspace) return;

  const rawUrls = workspace.urls.filter(u => u.trim() !== '');
  if (rawUrls.length === 0) return;

  const urls = rawUrls.map(u => {
    if (!/^https?:\/\//i.test(u) && !/^chrome:\/\//i.test(u) && !/^chrome-extension:\/\//i.test(u) && !/^about:/i.test(u)) {
      return (u.startsWith('localhost') || u.startsWith('127.0.0.1')) ? 'http://' + u : 'https://' + u;
    }
    return u;
  });

  const openInNewWindow = workspace.openInNewWindow ?? settings.defaultLaunchMode === 'new';
  const closePrevious   = workspace.closePreviousTabs ?? false;
  const groupTabs       = workspace.groupTabs ?? settings.autoGroupTabs ?? false;

  // Group label always uses workspace name; include emoji when enabled
  const groupLabel = (settings.showEmoji !== false && workspace.emoji)
    ? `${workspace.emoji} ${workspace.name}`
    : workspace.name;
  const groupColor = workspace.groupColor || settings.defaultGroupColor || 'blue';

  if (openInNewWindow) {
    const win = await chrome.windows.create({ url: urls, focused: true });
    if (groupTabs && chrome.tabs.group) {
      try {
        const tabs   = await chrome.tabs.query({ windowId: win.id });
        const groupableTabIds = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')).map(t => t.id);
        if (groupableTabIds.length > 0) {
          const groupId = await chrome.tabs.group({ createProperties: { windowId: win.id }, tabIds: groupableTabIds });
          _trackGroup(groupId);
          await chrome.tabGroups.update(groupId, { title: groupLabel, color: groupColor, saved: false });
        }
      } catch (e) { console.error('Grouping failed (new window)', e); }
    }

  } else {
    const existingTabs = await chrome.tabs.query({ windowId: currentWindowId });

    const newTabIds = [];
    const groupableTabIds = [];
    for (const url of urls) {
      try {
        const tab = await chrome.tabs.create({ url, windowId: currentWindowId, active: false });
        newTabIds.push(tab.id);
        if (!url.startsWith('chrome://') && !url.startsWith('chrome-extension://')) {
          groupableTabIds.push(tab.id);
        }
      } catch (e) {
        console.error('Failed to create tab for URL:', url, e);
      }
    }

    if (newTabIds.length > 0) {
      await chrome.tabs.update(newTabIds[0], { active: true });
    }

    if (groupTabs && chrome.tabs.group && groupableTabIds.length > 0) {
      try {
        const groupId = await chrome.tabs.group({ tabIds: groupableTabIds });
        _trackGroup(groupId);
        await chrome.tabGroups.update(groupId, { title: groupLabel, color: groupColor, saved: false });
      } catch (e) { console.error('Grouping failed (current window)', e); }
    }

    if (closePrevious) {
      await chrome.tabs.remove(existingTabs.map(t => t.id))
        .catch(e => console.warn('Could not close previous tabs', e));
    }
  }

  // Update lastUsed timestamp
  workspace.lastUsed = Date.now();
  const updated = (data.workspaces || []).map(w => w.id === workspaceId ? workspace : w);
  await chrome.storage.local.set({ workspaces: updated });
}

// Tab event listeners for duplicate detection and regex evaluation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    checkForDuplicates();
    
    // Evaluate Regex Rules
    try {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      if (settings.regexRulesEnabled && settings.regexRules) {
        // Regex rules are evaluated here. For "sequence" action,
        // it purely groups tabs visually in the popup or on button click.
        // Future actions like auto-adding to workspace would be triggered here.
      }
    } catch(e) {}
  }
});

chrome.tabs.onRemoved.addListener(() => {
  checkForDuplicates();
});

async function checkForDuplicates() {
  try {
    const data = await chrome.storage.local.get(['settings', 'focusModeActive']);
    const settings = data.settings || DEFAULT_SETTINGS;
    const focusModeActive = data.focusModeActive || false;
    
    const allTabs = await chrome.tabs.query({});
    const urlMap = {};
    let duplicatesCount = 0;

    for (const tab of allTabs) {
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('about:')) {
        continue;
      }
      
      let cleanUrl = tab.url;
      if (settings.ignoreHashForDuplicates !== false) {
        cleanUrl = cleanUrl.split('#')[0];
      }
      if (cleanUrl.endsWith('/')) {
        cleanUrl = cleanUrl.slice(0, -1);
      }
      
      if (!urlMap[cleanUrl]) {
        urlMap[cleanUrl] = [tab.id];
      } else {
        urlMap[cleanUrl].push(tab.id);
        duplicatesCount++;
      }
    }

    const allDuplicateIds = [];
    for (const urls in urlMap) {
      if (urlMap[urls].length > 1) {
        allDuplicateIds.push(...urlMap[urls]);
      }
    }
    allDuplicateIds.sort();
    const signature = allDuplicateIds.join(',');

    await chrome.storage.local.set({ duplicateSignature: signature });

    if (!focusModeActive) {
      if (duplicatesCount > 0 && settings.showDuplicateBadge !== false) {
        await chrome.action.setBadgeText({ text: duplicatesCount.toString() });
        await chrome.action.setBadgeBackgroundColor({ color: "#c0614e" });
      } else {
        await chrome.action.setBadgeText({ text: "" });
      }
    }
  } catch (e) {
    console.error('Duplicate detection failed', e);
  }
}

// --- SCRATCHPAD CONTEXT MENU LOGIC ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "scratchpad-add") {
    if (!tab || !tab.url) return;
    const data = await chrome.storage.local.get(['scratchpad']);
    const pad = data.scratchpad || [];
    if (!pad.find(i => i.url === tab.url)) {
      pad.unshift({
        url: tab.url,
        title: tab.title || tab.url,
        favicon: tab.favIconUrl || null,
        savedAt: Date.now()
      });
      await chrome.storage.local.set({ scratchpad: pad.slice(0, 50) });
    }
  } else if (info.menuItemId === "scratchpad-open-all") {
    const data = await chrome.storage.local.get(['scratchpad']);
    const pad = data.scratchpad || [];
    for (const item of pad) {
      chrome.tabs.create({ url: item.url, active: false });
    }
  }
});

// --- TIME TRACKER LOGIC ---
// BUG FIXES:
//   1. Key was `timeTrackerEnabled` in bg but settings saves as `enableTimeTracker` → tracker never ran
//   2. Key was `timeTrackerIdle` in bg but settings saves as `idleThreshold`, and was wrongly * 60
//   3. MV3 service workers are killed ~30s after inactivity — in-memory state (activeDomain,
//      domainStartTime) was wiped on every restart, so the alarm woke the SW but found null and bailed.
//      Fix: persist tracking state to chrome.storage.session (survives SW restarts within a session).

let activeDomain = null;
let domainStartTime = null;
let isTrackerIdle = false;

/** Persist tracking state to session storage so it survives SW restarts */
async function saveTrackerState() {
  try {
    await chrome.storage.session.set({
      tt_activeDomain: activeDomain,
      tt_domainStartTime: domainStartTime,
      tt_isIdle: isTrackerIdle
    });
  } catch(e) {}
}

/** Restore tracking state from session storage after a SW restart */
async function restoreTrackerState() {
  try {
    const s = await chrome.storage.session.get(['tt_activeDomain', 'tt_domainStartTime', 'tt_isIdle']);
    if (s.tt_activeDomain)    activeDomain    = s.tt_activeDomain;
    if (s.tt_domainStartTime) domainStartTime = s.tt_domainStartTime;
    if (s.tt_isIdle !== undefined) isTrackerIdle = s.tt_isIdle;
  } catch(e) {}
}

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    if (['http:', 'https:'].includes(urlObj.protocol)) return urlObj.hostname;
  } catch(e) {}
  return null;
}

function getTodayString() {
  const d = new Date();
  const localDate = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return localDate.toISOString().split('T')[0];
}

async function flushTimeData() {
  // Recover in-memory state if SW was killed and restarted
  if (!activeDomain || !domainStartTime) await restoreTrackerState();
  if (!activeDomain || !domainStartTime || isTrackerIdle) return;

  const now = Date.now();
  const elapsedSec = Math.floor((now - domainStartTime) / 1000);
  if (elapsedSec <= 0) return;

  try {
    const data = await chrome.storage.local.get(['timeTracker', 'settings']);
    const settings = data.settings || {};
    if (!settings.enableTimeTracker) return;           // FIX 1: was timeTrackerEnabled

    const tracker = data.timeTracker || {};
    const today = getTodayString();
    if (!tracker[today]) tracker[today] = {};
    tracker[today][activeDomain] = (tracker[today][activeDomain] || 0) + elapsedSec;

    // Purge data older than 7 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoff = new Date(cutoffDate.getTime() - cutoffDate.getTimezoneOffset() * 60000)
      .toISOString().split('T')[0];
    for (const date in tracker) {
      if (date < cutoff) delete tracker[date];
    }

    await chrome.storage.local.set({ timeTracker: tracker });
    domainStartTime = now;
    await saveTrackerState();                          // FIX 3: persist updated start time
  } catch(e) { console.error('flushTimeData failed', e); }
}

async function handleTabFocusChange(tabId, windowId) {
  const data = await chrome.storage.local.get(['settings']);
  if (!data.settings?.enableTimeTracker) return;       // FIX 1: was timeTrackerEnabled

  await flushTimeData();

  if (windowId === chrome.windows.WINDOW_ID_NONE || isTrackerIdle) {
    activeDomain = null;
    domainStartTime = null;
    await saveTrackerState();
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    activeDomain   = getDomain(tab.url);
    domainStartTime = activeDomain ? Date.now() : null;
  } catch(e) {
    activeDomain   = null;
    domainStartTime = null;
  }
  await saveTrackerState();                            // FIX 3: persist new domain
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabFocusChange(activeInfo.tabId, activeInfo.windowId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushTimeData();
    activeDomain   = null;
    domainStartTime = null;
    await saveTrackerState();
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (tabs.length > 0) handleTabFocusChange(tabs[0].id, windowId);
    } catch(e) {}
  }
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    isTrackerIdle  = true;
    await flushTimeData();
    activeDomain   = null;
    domainStartTime = null;
    await saveTrackerState();
  } else if (newState === 'active') {
    isTrackerIdle = false;
    try {
      const win  = await chrome.windows.getLastFocused();
      const tabs = await chrome.tabs.query({ active: true, windowId: win.id });
      if (tabs.length > 0) handleTabFocusChange(tabs[0].id, win.id);
    } catch(e) {}
  }
});

// Idle-threshold update is handled by the unified storage.onChanged listener above.

// Alarms — MV3 requires alarms instead of setInterval in service workers
chrome.alarms.create('timeTrackerFlush', { periodInMinutes: 0.5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'timeTrackerFlush') {
    await flushTimeData();

  } else if (alarm.name === 'focusTimerTick') {
    // Refresh badge countdown every minute
    const [localData, sessionData] = await Promise.all([
      chrome.storage.local.get(['settings', 'focusModeActive']),
      chrome.storage.session.get(['tt_focusEndTime'])
    ]);
    if (localData.focusModeActive && sessionData.tt_focusEndTime) {
      await updateFocusBadge(sessionData.tt_focusEndTime, localData.settings?.badgeColor);
    }

  } else if (alarm.name === 'focusTimerEnd') {
    // Timer expired — stop focus mode and notify
    await stopFocusMode();
    try {
      chrome.notifications.create('focusDone', {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Focus session complete!',
        message: 'Great work — your focus timer has ended.'
      });
    } catch (e) { /* notifications permission missing */ }
  }
});

// Set idle detection threshold on SW startup
chrome.storage.local.get(['settings'], (data) => {
  const s = data.settings || {};
  // FIX 1 + 2: was timeTrackerEnabled / timeTrackerIdle * 60
  chrome.idle.setDetectionInterval(parseInt(s.idleThreshold) || 120);
});
