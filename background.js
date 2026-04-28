const DEBUG = false;
/**
 * Log debugging information if DEBUG is true.
 * @param {...any} args
 */
function debug(...args) {
  if (DEBUG) console.log('[WorkSpace BG]', ...args);
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

/**
 * Toggle Focus Mode state globally and launch focus workspace if set.
 */
async function toggleFocusMode() {
  try {
    const data = await chrome.storage.local.get(['focusModeActive', 'settings', 'workspaces']);
    const isActive = data.focusModeActive;
    const settings = data.settings || DEFAULT_SETTINGS;
    
    const newActiveState = !isActive;
    await chrome.storage.local.set({ focusModeActive: newActiveState });
    
    await updateBadge(newActiveState, settings.badgeColor);

    if (newActiveState && settings.focusModeWorkspaceId) {
      const workspace = data.workspaces?.find(w => w.id === settings.focusModeWorkspaceId);
      if (workspace) {
        await launchWorkspace(workspace, settings);
      }
    }
  } catch (e) {
    console.error('Error toggling focus mode', e);
  }
}

/**
 * Update extension badge based on focus mode state.
 * @param {boolean} isActive
 * @param {string} color
 */
async function updateBadge(isActive, color) {
  if (isActive) {
    await chrome.action.setBadgeText({ text: "●" });
    await chrome.action.setBadgeBackgroundColor({ color: color || "#d4874a" });
  } else {
    // Check duplicates to restore badge if needed
    checkForDuplicates();
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
          await chrome.tabGroups.update(groupId, {
            title: settings.defaultGroupNameFormat.replace('{workspace_name}', workspace.name),
            color: workspace.groupColor || settings.defaultGroupColor
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
        await chrome.tabGroups.update(groupId, {
          title: settings.defaultGroupNameFormat.replace('{workspace_name}', workspace.name),
          color: workspace.groupColor || settings.defaultGroupColor
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

// Initial badge check
chrome.storage.local.get(['focusModeActive', 'settings'], async (data) => {
  if (data.focusModeActive) {
    await updateBadge(true, data.settings?.badgeColor);
  } else {
    checkForDuplicates();
  }
});

// Listen for storage changes to sync badge
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.focusModeActive) {
    chrome.storage.local.get(['settings'], async (data) => {
      await updateBadge(changes.focusModeActive.newValue, data.settings?.badgeColor);
    });
  }
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleFocusMode') {
    toggleFocusMode().then(() => sendResponse({ success: true }));
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
          await chrome.tabGroups.update(groupId, { title: groupLabel, color: groupColor });
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
        await chrome.tabGroups.update(groupId, { title: groupLabel, color: groupColor });
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
let activeDomain = null;
let domainStartTime = null;
let isTrackerIdle = false;

function getDomain(url) {
  try {
    const urlObj = new URL(url);
    if (['http:', 'https:'].includes(urlObj.protocol)) {
      return urlObj.hostname;
    }
  } catch(e) {}
  return null;
}

function getTodayString() {
  const d = new Date();
  // Adjust for local timezone offset to get local YYYY-MM-DD
  const offset = d.getTimezoneOffset() * 60000;
  const localDate = new Date(d.getTime() - offset);
  return localDate.toISOString().split('T')[0];
}

async function flushTimeData() {
  if (!activeDomain || !domainStartTime || isTrackerIdle) return;
  
  const now = Date.now();
  const elapsedSec = Math.floor((now - domainStartTime) / 1000);
  if (elapsedSec <= 0) return;
  
  try {
    const data = await chrome.storage.local.get(['timeTracker', 'settings']);
    const settings = data.settings || {};
    if (!settings.timeTrackerEnabled) return;

    const tracker = data.timeTracker || {};
    const today = getTodayString();
    
    if (!tracker[today]) tracker[today] = {};
    tracker[today][activeDomain] = (tracker[today][activeDomain] || 0) + elapsedSec;
    
    // Purge older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const offset = sevenDaysAgo.getTimezoneOffset() * 60000;
    const localSevenDaysAgo = new Date(sevenDaysAgo.getTime() - offset);
    const cutoff = localSevenDaysAgo.toISOString().split('T')[0];
    
    for (const date in tracker) {
      if (date < cutoff) {
        delete tracker[date];
      }
    }

    await chrome.storage.local.set({ timeTracker: tracker });
    domainStartTime = now;
  } catch(e) {}
}

async function handleTabFocusChange(tabId, windowId) {
  const data = await chrome.storage.local.get(['settings']);
  if (!data.settings?.timeTrackerEnabled) return;

  await flushTimeData();

  if (windowId === chrome.windows.WINDOW_ID_NONE || isTrackerIdle) {
    activeDomain = null;
    return;
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    activeDomain = getDomain(tab.url);
    domainStartTime = Date.now();
  } catch(e) {
    activeDomain = null;
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabFocusChange(activeInfo.tabId, activeInfo.windowId);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushTimeData();
    activeDomain = null;
  } else {
    try {
      const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
      if (tabs.length > 0) {
        handleTabFocusChange(tabs[0].id, windowId);
      }
    } catch(e) {}
  }
});

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    isTrackerIdle = true;
    await flushTimeData();
    activeDomain = null;
  } else if (newState === 'active') {
    isTrackerIdle = false;
    try {
      const window = await chrome.windows.getLastFocused();
      const tabs = await chrome.tabs.query({ active: true, windowId: window.id });
      if (tabs.length > 0) {
        handleTabFocusChange(tabs[0].id, window.id);
      }
    } catch(e) {}
  }
});

// Settings watcher to update idle threshold
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.settings) {
    const newSettings = changes.settings.newValue || {};
    if (newSettings.timeTrackerEnabled && newSettings.timeTrackerIdle) {
      chrome.idle.setDetectionInterval(newSettings.timeTrackerIdle * 60);
    }
  }
});

// Periodic flush every 30s using alarms for MV3 compatibility
chrome.alarms.create("timeTrackerFlush", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "timeTrackerFlush") {
    await flushTimeData();
  }
});

// Initial idle threshold set
chrome.storage.local.get(['settings'], (data) => {
  const settings = data.settings || {};
  if (settings.timeTrackerEnabled && settings.timeTrackerIdle) {
    chrome.idle.setDetectionInterval(settings.timeTrackerIdle * 60);
  } else {
    chrome.idle.setDetectionInterval(120); // Default 2 mins
  }
});
