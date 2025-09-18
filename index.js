// Global Lorebook Keeper for Entity - v1.0
// 091825
// sleepyfish

import { getContext, extension_settings } from "../../../extensions.js";
import { world_info, selected_world_info, world_names } from "../../../world-info.js";
import { getPresetManager } from "../../../preset-manager.js";

const context = getContext();
const extensionName = "Preset Lorebook Binder";
const extensionSettingsKey = 'presetLorebookBindings';

let lastPresetForApi = {};

function loadSettings() {
    const settings = extension_settings[extensionName] ?? {};
    const bindings = settings[extensionSettingsKey] ?? {};
    for (const key in bindings) {
        if (!Array.isArray(bindings[key])) {
            bindings[key] = [bindings[key]];
        }
    }
    return bindings;
}

async function saveSettings(bindings) {
    if (!extension_settings[extensionName]) {
        extension_settings[extensionName] = {};
    }
    extension_settings[extensionName][extensionSettingsKey] = bindings;
    context.saveSettingsDebounced();
    console.log(`${extensionName}: Settings saved.`, bindings);
}

function handlePresetChange(event) {
    const selectElement = event.target;
    const apiId = $(selectElement).data('preset-manager-for');
    const newPresetName = $(selectElement).find('option:selected').text();
    const oldPresetName = lastPresetForApi[apiId] ?? null;

    if (newPresetName === oldPresetName) {
        return;
    }

    console.log(`${extensionName}: Preset for API '${apiId}' changed from '${oldPresetName}' to '${newPresetName}'.`);

    const bindings = loadSettings();
    const worldsToDeactivate = bindings[oldPresetName] || [];
    const worldsToActivate = bindings[newPresetName] || [];

    const baseGlobalWorlds = new Set(selected_world_info);

    worldsToDeactivate.forEach(worldName => {
        if (!worldsToActivate.includes(worldName)) {
            baseGlobalWorlds.delete(worldName);
        }
    });

    worldsToActivate.forEach(worldName => {
        baseGlobalWorlds.add(worldName);
    });

    const finalLorebookNames = Array.from(baseGlobalWorlds);
    const isChanged = JSON.stringify(finalLorebookNames.sort()) !== JSON.stringify([...selected_world_info].sort());

    if (isChanged) {
        console.log(`${extensionName}: Applying changes. New global lorebooks:`, finalLorebookNames);

        const finalLorebookIndices = finalLorebookNames.map(name => {
            return world_names.indexOf(name);
        }).filter(index => index !== -1);

        selected_world_info.splice(0, selected_world_info.length, ...finalLorebookNames);
        context.saveSettingsDebounced();
        $('#world_info').val(finalLorebookIndices).trigger('change');
        context.eventSource.emit(context.eventTypes.WORLDINFO_SETTINGS_UPDATED);
        toastr.success('Lorebooks updated based on preset.');
    }

    lastPresetForApi[apiId] = newPresetName;
}

function showSettingsPanel() {
    const bindings = loadSettings();
    const presetManager = getPresetManager();
    
    if (!presetManager) {
        toastr.error("Could not find a preset manager for the current API.");
        return;
    }

    const allPresets = presetManager.getAllPresets();
    const allLorebooks = world_names || [];

    let bindingRows = '';
    for (const [preset, lorebookArray] of Object.entries(bindings)) {
        bindingRows += createBindingRow(preset, lorebookArray, allPresets, allLorebooks);
    }

    const panelHtml = `
        <div id="preset-binder-panel">
            <h2>${extensionName}</h2>
            <p>绑定一个或多个世界书到预设。当预设被选中时，世界书将全局启用。</p>
            <div id="preset-binder-list">
                ${bindingRows}
            </div>
            <button id="preset-binder-add" class="menu_button fa-solid fa-plus" title="Add new binding"></button>
        </div>
    `;

    context.callGenericPopup(panelHtml, 'text', null, { wide: true, okButton: 'Close' });

    // 【UI修正】为所有现有的多选框初始化select2，并指定dropdownParent
    $('.lorebook-select').select2({
        placeholder: '-- 请选择世界书 --',
        width: '100%',
        closeOnSelect: false,
        dropdownParent: $('#preset-binder-panel') // <--- 这是关键的修正！
    });

    $('#preset-binder-add').on('click', () => {
        const newRowHtml = createBindingRow('', [], allPresets, allLorebooks);
        $('#preset-binder-list').append(newRowHtml);
        
        // 【UI修正】对新添加的行也进行同样的操作
        $('#preset-binder-list .preset-binder-row:last-child .lorebook-select').select2({
            placeholder: '-- 请选择世界书 --',
            width: '100%',
            closeOnSelect: false,
            dropdownParent: $('#preset-binder-panel') // <--- 这是关键的修正！
        });
    });

    $(document).off('click', '.preset-binder-save').on('click', '.preset-binder-save', function() {
        const row = $(this).closest('.preset-binder-row');
        const selectedPreset = row.find('.preset-select').val();
        const selectedLorebooks = row.find('.lorebook-select').val();

        if (!selectedPreset || !selectedLorebooks || selectedLorebooks.length === 0) {
            toastr.warning("请至少选择一个预设和一个世界书。");
            return;
        }
        
        const oldPreset = row.data('preset-key');
        const currentBindings = loadSettings();

        if (oldPreset && oldPreset !== selectedPreset) {
            delete currentBindings[oldPreset];
        }
        
        currentBindings[selectedPreset] = selectedLorebooks;
        saveSettings(currentBindings);
        
        row.data('preset-key', selectedPreset);
        toastr.success(`Binding saved for preset: ${selectedPreset}`);
    });

    $(document).off('click', '.preset-binder-delete').on('click', '.preset-binder-delete', function() {
        const row = $(this).closest('.preset-binder-row');
        const presetKey = row.data('preset-key');
        
        if (presetKey) {
            const currentBindings = loadSettings();
            delete currentBindings[presetKey];
            saveSettings(currentBindings);
        }
        
        row.remove();
        toastr.info("Binding removed.");
    });
}

function createBindingRow(preset, lorebookArray, allPresets, allLorebooks) {
    const presetOptions = allPresets.map(p => `<option value="${p}" ${p === preset ? 'selected' : ''}>${p}</option>`).join('');
    const lorebookOptions = allLorebooks.map(l => `<option value="${l}" ${(lorebookArray || []).includes(l) ? 'selected' : ''}>${l}</option>`).join('');

    return `
        <div class="preset-binder-row" data-preset-key="${preset || ''}">
            <select class="preset-select text_pole">
                <option value="">-- 选择预设 --</option>
                ${presetOptions}
            </select>
            <i class="fa-solid fa-arrow-right-long"></i>
            <select class="lorebook-select text_pole" multiple>
                ${lorebookOptions}
            </select>
            <button class="preset-binder-save menu_button fa-solid fa-save" title="保存绑定"></button>
            <button class="preset-binder-delete menu_button fa-solid fa-trash" title="删除绑定"></button>
        </div>
    `;
}

// 插件初始化
$(document).ready(function () {
    const floatingButtonHtml = `
        <div id="preset-binder-FAB" title="Open Preset Lorebook Binder">
            <i class="fa-solid fa-link"></i>
        </div>
    `;

    $('body').append(floatingButtonHtml);
    $('#preset-binder-FAB').on('click', showSettingsPanel);

    $(document).on('change', 'select[data-preset-manager-for]', handlePresetChange);
    
    $('select[data-preset-manager-for]').each(function() {
        const apiId = $(this).data('preset-manager-for');
        lastPresetForApi[apiId] = $(this).find('option:selected').text();
    });

    console.log(`${extensionName} loaded.`);
});