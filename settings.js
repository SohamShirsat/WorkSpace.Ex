// Apply theme immediately from localStorage (sync, prevents flash)
(function(){
  var t = localStorage.getItem('workspace_theme');
  if (t && t !== 'system') document.documentElement.setAttribute('data-theme', t);
})();

const DEBUG = false;
function debug(...args) {
  if (DEBUG) console.log('[WorkSpace Settings]', ...args);
}

// Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');
const toast = document.getElementById('toast');
const openShortcutsBtn = document.getElementById('openShortcutsBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const importDataBtn = document.getElementById('importDataBtn');
const importFileInput = document.getElementById('importFileInput');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const deleteAllWorkspacesBtn = document.getElementById('deleteAllWorkspacesBtn');

// Dialog elements
const confirmDialog = document.getElementById('confirmDialog');
const confirmDialogText = document.getElementById('confirmDialogText');
const cancelConfirmBtn = document.getElementById('cancelConfirmBtn');
const proceedConfirmBtn = document.getElementById('proceedConfirmBtn');
let pendingConfirmAction = null;

// Settings Inputs
const inputs = {
  defaultLaunchMode: document.getElementById('defaultLaunchMode'),
  showEmoji: document.getElementById('showEmoji'),
  showLastUsed: document.getElementById('showLastUsed'),
  confirmBeforeClose: document.getElementById('confirmBeforeClose'),
  badgeColor: document.getElementById('badgeColor'),
  focusModeWorkspaceId: document.getElementById('focusModeWorkspaceId'),
  focusModeCloseTabs: document.getElementById('focusModeCloseTabs'),
  focusModeNewWindow: document.getElementById('focusModeNewWindow'),
  defaultGroupColor: document.getElementById('defaultGroupColor'),
  autoGroupTabs: document.getElementById('autoGroupTabs'),
  defaultGroupNameFormat: document.getElementById('defaultGroupNameFormat'),
  ignoreHashForDuplicates: document.getElementById('ignoreHashForDuplicates'),
  showDuplicateBadge: document.getElementById('showDuplicateBadge'),
  enableTimeTracker: document.getElementById('enableTimeTracker'),
  idleThreshold: document.getElementById('idleThreshold'),
  focusDuration: document.getElementById('focusDuration')
};

// Theme toggle
const themeButtons = document.querySelectorAll('.theme-btn');

function applyTheme(theme) {
  theme = theme || 'system';
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  themeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
}

themeButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const theme = btn.dataset.theme;
    applyTheme(theme);
    localStorage.setItem('workspace_theme', theme);
    try {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      settings.theme = theme;
      await chrome.storage.local.set({ settings });
      showToast();
    } catch (e) {
      console.error('Failed to save theme', e);
    }
  });
});

/**
 * Show a success toast message
 */
function showToast(message = "Saved ✓") {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 1500);
}

/**
 * Handle sidebar navigation
 */
navItems.forEach(item => {
  item.addEventListener('click', () => {
    navItems.forEach(n => n.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    
    item.classList.add('active');
    document.getElementById(item.dataset.target).classList.add('active');
  });
});

/**
 * Load settings and workspaces
 */
async function loadData() {
  try {
    const data = await chrome.storage.local.get(['settings', 'workspaces']);
    const settings = data.settings || {};
    const workspaces = data.workspaces || [];

    // Populate focus workspace dropdown
    inputs.focusModeWorkspaceId.innerHTML = '<option value="">None</option>';
    workspaces.forEach(w => {
      const opt = document.createElement('option');
      opt.value = w.id;
      opt.textContent = w.name;
      inputs.focusModeWorkspaceId.appendChild(opt);
    });

    // Apply saved theme
    applyTheme(settings.theme || 'system');

    // Populate inputs
    for (const [key, element] of Object.entries(inputs)) {
      if (settings[key] !== undefined) {
        if (element.type === 'checkbox') {
          element.checked = settings[key];
        } else {
          element.value = settings[key];
        }
      }
    }

    // Load shortcuts
    loadShortcuts();

    // Load regex rules
    renderRegexRules(settings.regexRules || []);

  } catch (e) {
    console.error('Failed to load settings', e);
  }
}

/**
 * Save settings when changed
 */
async function saveSettings() {
  try {
    const data = await chrome.storage.local.get(['settings']);
    const settings = data.settings || {};

    for (const [key, element] of Object.entries(inputs)) {
      if (element.type === 'checkbox') {
        settings[key] = element.checked;
      } else {
        settings[key] = element.value;
      }
    }

    await chrome.storage.local.set({ settings });
    showToast();
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}

// Add change listeners to all inputs
for (const element of Object.values(inputs)) {
  element.addEventListener('change', saveSettings);
  if (element.type === 'text') {
    element.addEventListener('input', () => {
      // Debounce text input saves
      clearTimeout(element.timeoutId);
      element.timeoutId = setTimeout(saveSettings, 500);
    });
  }
}

/**
 * Load Chrome keyboard shortcuts
 */
function loadShortcuts() {
  if (chrome.commands) {
    chrome.commands.getAll(commands => {
      commands.forEach(cmd => {
        if (cmd.name === '_execute_action') {
          document.getElementById('kbOpenPopup').textContent = cmd.shortcut || 'Unassigned';
        } else if (cmd.name === 'switch-workspace') {
          document.getElementById('kbSwitcher').textContent = cmd.shortcut || 'Unassigned';
        } else if (cmd.name === 'focus-mode-toggle') {
          document.getElementById('kbFocus').textContent = cmd.shortcut || 'Unassigned';
        }
      });
    });
  }
}

openShortcutsBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

/**
 * Export data
 */
exportDataBtn.addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(['workspaces']);
    const blob = new Blob([JSON.stringify(data.workspaces, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Exported ✓');
  } catch (e) {
    console.error('Export failed', e);
  }
});

/**
 * Import data
 */
importDataBtn.addEventListener('click', () => {
  importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedWorkspaces = JSON.parse(event.target.result);
      if (!Array.isArray(importedWorkspaces)) throw new Error('Invalid format');
      
      // Ensure all required fields exist
      const validWorkspaces = importedWorkspaces.map(w => ({
        id: w.id || crypto.randomUUID(),
        name: w.name || 'Imported Workspace',
        emoji: w.emoji || '📁',
        color: w.color || 'blue',
        urls: Array.isArray(w.urls) ? w.urls : [],
        groupName: w.groupName || '',
        groupColor: w.groupColor || 'blue',
        groupTabs: !!w.groupTabs,
        openInNewWindow: !!w.openInNewWindow,
        closePreviousTabs: !!w.closePreviousTabs,
        pinFirstTab: !!w.pinFirstTab,
        createdAt: w.createdAt || Date.now(),
        lastUsed: w.lastUsed || Date.now()
      }));

      await chrome.storage.local.set({ workspaces: validWorkspaces });
      showToast('Imported ✓');
      loadData(); // refresh dropdowns
    } catch (err) {
      alert('Error parsing import file: ' + err.message);
    }
    importFileInput.value = ''; // reset
  };
  reader.readAsText(file);
});

/**
 * Confirmation dialog logic
 */
function showConfirm(text, action) {
  confirmDialogText.textContent = text;
  pendingConfirmAction = action;
  confirmDialog.classList.remove('hidden');
}

cancelConfirmBtn.addEventListener('click', () => {
  confirmDialog.classList.add('hidden');
  pendingConfirmAction = null;
});

proceedConfirmBtn.addEventListener('click', async () => {
  if (pendingConfirmAction) {
    await pendingConfirmAction();
    showToast('Done ✓');
    loadData();
  }
  confirmDialog.classList.add('hidden');
  pendingConfirmAction = null;
});

resetSettingsBtn.addEventListener('click', () => {
  showConfirm('Reset all settings to default?', async () => {
    const DEFAULT_SETTINGS = {
      theme: "system",
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
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    applyTheme('system');
    localStorage.setItem('workspace_theme', 'system');
  });
});

deleteAllWorkspacesBtn.addEventListener('click', () => {
  showConfirm('Delete ALL workspaces? This cannot be undone.', async () => {
    await chrome.storage.local.set({ workspaces: [] });
  });
});

// Regex Rules Logic
const regexRulesList = document.getElementById('regexRulesList');
const addRegexRuleBtn = document.getElementById('addRegexRuleBtn');

function renderRegexRules(rules) {
  regexRulesList.innerHTML = '';
  if (!rules || rules.length === 0) {
    regexRulesList.innerHTML = `<div style="color: var(--text-muted); font-size: 11px;">No rules defined.</div>`;
    return;
  }
  
  rules.forEach((rule, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = rule.pattern;
    input.placeholder = '^https://.*google\\.com';
    input.style.flex = '1';
    
    input.addEventListener('change', async () => {
      try {
        new RegExp(input.value);
        input.style.borderColor = 'var(--border)';
      } catch (e) {
        input.style.borderColor = 'var(--danger)';
        showToast('Invalid Regex');
        return;
      }
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      settings.regexRules[index].pattern = input.value;
      await chrome.storage.local.set({ settings });
      showToast('Saved ✓');
    });
    
    const delBtn = document.createElement('button');
    delBtn.className = 'danger-btn';
    delBtn.innerHTML = '×';
    delBtn.style.padding = '4px 8px';
    delBtn.style.flex = '0';
    delBtn.addEventListener('click', async () => {
      const data = await chrome.storage.local.get(['settings']);
      const settings = data.settings || {};
      settings.regexRules.splice(index, 1);
      await chrome.storage.local.set({ settings });
      renderRegexRules(settings.regexRules);
      showToast('Deleted ✓');
    });
    
    row.appendChild(input);
    row.appendChild(delBtn);
    regexRulesList.appendChild(row);
  });
}

addRegexRuleBtn.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || {};
  if (!settings.regexRules) settings.regexRules = [];
  settings.regexRules.push({ pattern: '' });
  await chrome.storage.local.set({ settings });
  renderRegexRules(settings.regexRules);
});

// Init
loadData();
