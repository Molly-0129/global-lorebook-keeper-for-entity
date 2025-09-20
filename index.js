// Global Lorebook Keeper for Entity - v1.1
// 092025
// sleepyfish

import { getContext, extension_settings } from "../../../extensions.js";
import { world_info, selected_world_info, world_names } from "../../../world-info.js";
import { getPresetManager } from "../../../preset-manager.js";

const context = getContext();
const extensionName = "角色-预设-世界书绑定器";
const extensionSettingsKey = 'presetBinderSettings';

let lastPresetForApi = {};

function loadSettings() {
    const defaultSettings = {
        presetLorebookBindings: {},
        characterPresetBindings: {},
    };
    const settings = extension_settings[extensionName] ?? {};
    const loaded = settings[extensionSettingsKey] ?? defaultSettings;
    for (const key in loaded.presetLorebookBindings) {
        if (!Array.isArray(loaded.presetLorebookBindings[key])) {
            loaded.presetLorebookBindings[key] = [loaded.presetLorebookBindings[key]];
        }
    }
    return loaded;
}

async function saveSettings(data) {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    extension_settings[extensionName][extensionSettingsKey] = data;
    context.saveSettingsDebounced();
    console.log(`${extensionName}: Settings saved.`, data);
}

function handlePresetChange(event) {
    const selectElement = event.target;
    const apiId = $(selectElement).data('preset-manager-for');
    const newPresetName = $(selectElement).find('option:selected').text();
    const oldPresetName = lastPresetForApi[apiId] ?? null;

    if (newPresetName === oldPresetName) return;

    const settings = loadSettings();
    const worldsToDeactivate = settings.presetLorebookBindings[oldPresetName] || [];
    const worldsToActivate = settings.presetLorebookBindings[newPresetName] || [];
    const baseGlobalWorlds = new Set(selected_world_info);

    worldsToDeactivate.forEach(worldName => {
        if (!worldsToActivate.includes(worldName)) baseGlobalWorlds.delete(worldName);
    });
    worldsToActivate.forEach(worldName => baseGlobalWorlds.add(worldName));

    const finalLorebookNames = Array.from(baseGlobalWorlds);
    const isChanged = JSON.stringify(finalLorebookNames.sort()) !== JSON.stringify([...selected_world_info].sort());

    if (isChanged) {
        const finalLorebookIndices = finalLorebookNames.map(name => world_names.indexOf(name)).filter(index => index !== -1);
        selected_world_info.splice(0, selected_world_info.length, ...finalLorebookNames);
        context.saveSettingsDebounced();
        $('#world_info').val(finalLorebookIndices).trigger('change');
        context.eventSource.emit(context.eventTypes.WORLDINFO_SETTINGS_UPDATED);
        toastr.success('世界书已根据预设更新。');
    }

    lastPresetForApi[apiId] = newPresetName;
}

// 核心逻辑函数
function applyCharacterPreset() {
    // 1. 使用 getCurrentChatId()作为唯一可靠的信息来源
    const currentChatFileName = context.getCurrentChatId();
    if (!currentChatFileName) {
        return;
    }

    // 2. 查找与当前聊天文件匹配的角色
    const character = context.characters.find(c => c.chat === currentChatFileName);

    // 3. 如果找到角色，则执行绑定逻辑
    if (character) {
        const settings = loadSettings();
        const boundPresetName = settings.characterPresetBindings[character.avatar];

        if (boundPresetName) {
            const presetManager = getPresetManager();
            if (!presetManager) return;
            
            const presetValue = presetManager.findPreset(boundPresetName);
            if (presetValue !== undefined && presetValue !== null) {
                if (presetManager.getSelectedPresetName() !== boundPresetName) {
                    presetManager.selectPreset(presetValue);
                    toastr.success(`已为角色 ${character.name} 自动切换到预设：${boundPresetName}`);
                }
            } else {
                toastr.warning(`为角色 ${character.name} 绑定的预设 '${boundPresetName}' 未找到。`);
            }
        }
    }
}

function showSettingsPanel() {
    const settings = loadSettings();
    const presetManager = getPresetManager();
    if (!presetManager) {
        toastr.error("无法为当前API找到预设管理器。");
        return;
    }

    const allPresets = presetManager.getAllPresets();
    const allLorebooks = world_names || [];
    const allCharacters = context.characters || [];

    const panelHtml = `
        <div id="binder-main-panel">
            <h2>${extensionName}</h2>
            <div class="binder-tabs">
                <div class="binder-tab-button active" data-tab="preset-lorebook">预设-世界书 绑定</div>
                <div class="binder-tab-button" data-tab="char-preset">角色-预设 绑定</div>
            </div>
            <div id="tab-content-preset-lorebook" class="binder-tab-content active">
                <p>将一个或多个世界书绑定至一个预设。当该预设被选中时，绑定的世界书将被全局启用。</p>
                <div id="preset-lorebook-list" class="binder-list"></div>
                <button id="add-preset-lorebook" class="menu_button fa-solid fa-plus" title="添加新绑定"></button>
            </div>
            <div id="tab-content-char-preset" class="binder-tab-content">
                <p>将一个预设绑定至一个角色。当选中该角色时，将自动切换到绑定的预设。</p>
                <div id="char-preset-list" class="binder-list"></div>
                <button id="add-char-preset" class="menu_button fa-solid fa-plus" title="添加新绑定"></button>
            </div>
        </div>
    `;
    context.callGenericPopup(panelHtml, 'text', null, { wide: true, okButton: '关闭' });

    const plList = $('#preset-lorebook-list');
    for (const [preset, lorebookArray] of Object.entries(settings.presetLorebookBindings)) {
        plList.append(createPresetLorebookRow(preset, lorebookArray, allPresets, allLorebooks));
    }
    plList.find('.lorebook-select').select2({ placeholder: '-- 请选择世界书 --', width: '100%', closeOnSelect: false, dropdownParent: $('#binder-main-panel') });

    $('#add-preset-lorebook').on('click', () => {
        plList.append(createPresetLorebookRow('', [], allPresets, allLorebooks));
        plList.find('.preset-binder-row:last-child .lorebook-select').select2({ placeholder: '-- 请选择世界书 --', width: '100%', closeOnSelect: false, dropdownParent: $('#binder-main-panel') });
    });

    const cpList = $('#char-preset-list');
    for (const [charAvatar, presetName] of Object.entries(settings.characterPresetBindings)) {
        cpList.append(createCharPresetRow(charAvatar, presetName, allCharacters, allPresets));
    }

    $('.binder-tab-button').on('click', function() {
        $('.binder-tab-button').removeClass('active');
        $(this).addClass('active');
        $('.binder-tab-content').removeClass('active');
        $(`#tab-content-${$(this).data('tab')}`).addClass('active');
    });

    $(document).off('click', '.save-preset-lorebook').on('click', '.save-preset-lorebook', function() {
        const row = $(this).closest('.preset-binder-row');
        const selectedPreset = row.find('.preset-select').val();
        const selectedLorebooks = row.find('.lorebook-select').val();
        if (!selectedPreset || !selectedLorebooks || selectedLorebooks.length === 0) {
            toastr.warning("请选择一个预设和至少一个世界书。");
            return;
        }
        const oldPreset = row.data('key');
        const currentSettings = loadSettings();
        if (oldPreset && oldPreset !== selectedPreset) delete currentSettings.presetLorebookBindings[oldPreset];
        currentSettings.presetLorebookBindings[selectedPreset] = selectedLorebooks;
        saveSettings(currentSettings);
        row.data('key', selectedPreset);
        toastr.success(`已为预设 ${selectedPreset} 保存绑定`);
    });

    $(document).off('click', '.delete-preset-lorebook').on('click', '.delete-preset-lorebook', function() {
        const row = $(this).closest('.preset-binder-row');
        const key = row.data('key');
        if (key) {
            const currentSettings = loadSettings();
            delete currentSettings.presetLorebookBindings[key];
            saveSettings(currentSettings);
        }
        row.remove();
        toastr.info("绑定已移除。");
    });
    
    $('#add-char-preset').on('click', () => {
        cpList.append(createCharPresetRow('', '', allCharacters, allPresets));
    });

    $(document).off('click', '.save-char-preset').on('click', '.save-char-preset', function() {
        const row = $(this).closest('.char-binder-row');
        const selectedAvatar = row.find('.char-select').val();
        const selectedPreset = row.find('.preset-select').val();
        if (!selectedAvatar || !selectedPreset) {
            toastr.warning("请选择一个角色和一个预设。");
            return;
        }
        const oldAvatar = row.data('key');
        const currentSettings = loadSettings();
        if (oldAvatar && oldAvatar !== selectedAvatar) delete currentSettings.characterPresetBindings[oldAvatar];
        currentSettings.characterPresetBindings[selectedAvatar] = selectedPreset;
        saveSettings(currentSettings);
        row.data('key', selectedAvatar);
        const charName = allCharacters.find(c => c.avatar === selectedAvatar)?.name;
        toastr.success(`已为角色 ${charName} 绑定预设`);
    });

    $(document).off('click', '.delete-char-preset').on('click', '.delete-char-preset', function() {
        const row = $(this).closest('.char-binder-row');
        const key = row.data('key');
        if (key) {
            const currentSettings = loadSettings();
            delete currentSettings.characterPresetBindings[key];
            saveSettings(currentSettings);
        }
        row.remove();
        toastr.info("绑定已移除。");
    });
}

function createPresetLorebookRow(preset, lorebookArray, allPresets, allLorebooks) {
    const presetOptions = allPresets.map(p => `<option value="${p}" ${p === preset ? 'selected' : ''}>${p}</option>`).join('');
    const lorebookOptions = allLorebooks.map(l => `<option value="${l}" ${(lorebookArray || []).includes(l) ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="preset-binder-row" data-key="${preset || ''}">
        <select class="preset-select text_pole"><option value="">-- 请选择预设 --</option>${presetOptions}</select>
        <i class="fa-solid fa-arrow-right-long"></i>
        <select class="lorebook-select text_pole" multiple>${lorebookOptions}</select>
        <div class="binder-buttons">
            <button class="save-preset-lorebook menu_button fa-solid fa-save" title="保存绑定"></button>
            <button class="delete-preset-lorebook menu_button fa-solid fa-trash" title="删除绑定"></button>
        </div>
    </div>`;
}

function createCharPresetRow(charAvatar, presetName, allCharacters, allPresets) {
    const charOptions = allCharacters.map(c => `<option value="${c.avatar}" ${c.avatar === charAvatar ? 'selected' : ''}>${c.name}</option>`).join('');
    const presetOptions = allPresets.map(p => `<option value="${p}" ${p === presetName ? 'selected' : ''}>${p}</option>`).join('');
    return `<div class="char-binder-row" data-key="${charAvatar || ''}">
        <select class="char-select text_pole"><option value="">-- 请选择角色 --</option>${charOptions}</select>
        <i class="fa-solid fa-arrow-right-long"></i>
        <select class="preset-select text_pole"><option value="">-- 请选择预设 --</option>${presetOptions}</select>
        <div class="binder-buttons">
            <button class="save-char-preset menu_button fa-solid fa-save" title="保存绑定"></button>
            <button class="delete-char-preset menu_button fa-solid fa-trash" title="删除绑定"></button>
        </div>
    </div>`;
}

// 插件初始化
$(document).ready(function () {
    let menuItemAdded = false;
    function addExtensionMenuItem() {
        if (menuItemAdded || $('#preset-binder-menu-item').length > 0) return;
        if ($('#extensionsMenu').length === 0) return; 
        const menuItemHtml = `<a id="preset-binder-menu-item" class="dropdown-item"><i class="fa-solid fa-fw fa-link"></i><span>${extensionName}</span></a>`;
        $('#extensionsMenu').append(menuItemHtml);
        $('#preset-binder-menu-item').on('click', showSettingsPanel);
        menuItemAdded = true;
    }

    // 使用 CHAT_CHANGED 作为唯一的触发器
    context.eventSource.on(context.eventTypes.CHAT_CHANGED, () => {
        addExtensionMenuItem();
        applyCharacterPreset();
    });
    
    addExtensionMenuItem();

    $(document).on('change', 'select[data-preset-manager-for]', handlePresetChange);
    $('select[data-preset-manager-for]').each(function() {
        const apiId = $(this).data('preset-manager-for');
        lastPresetForApi[apiId] = $(this).find('option:selected').text();
    });

    console.log(`${extensionName} loaded with Character-Preset binding feature.`);
});