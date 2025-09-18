// Global Lorebook Keeper for Entity - v1.0
// 091825
// sleepyfish

import { getContext, extension_settings } from "../../../extensions.js";
import { world_info, selected_world_info, world_names } from "../../../world-info.js";
import { getPresetManager } from "../../../preset-manager.js";

const context = getContext();
const extensionName = "Preset Lorebook Binder"; // Per request, this remains in English.
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
        toastr.success('世界书已根据预设更新。');
    }

    lastPresetForApi[apiId] = newPresetName;
}

function showSettingsPanel() {
    const bindings = loadSettings();
    const presetManager = getPresetManager();
    
    if (!presetManager) {
        toastr.error("无法为当前API找到预设管理器。");
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
            <p>将一个或多个世界书绑定至一个预设。当该预设被选中时，绑定的世界书将被全局启用。</p>
            <div id="preset-binder-list">
                ${bindingRows}
            </div>
            <button id="preset-binder-add" class="menu_button fa-solid fa-plus" title="添加新绑定"></button>
        </div>
    `;

    context.callGenericPopup(panelHtml, 'text', null, { wide: true, okButton: '关闭' });

    $('.lorebook-select').select2({
        placeholder: '-- 请选择世界书 --',
        width: '100%',
        closeOnSelect: false,
        dropdownParent: $('#preset-binder-panel')
    });

    $('#preset-binder-add').on('click', () => {
        const newRowHtml = createBindingRow('', [], allPresets, allLorebooks);
        $('#preset-binder-list').append(newRowHtml);
        $('#preset-binder-list .preset-binder-row:last-child .lorebook-select').select2({
            placeholder: '-- 请选择世界书 --',
            width: '100%',
            closeOnSelect: false,
            dropdownParent: $('#preset-binder-panel')
        });
    });

    $(document).off('click', '.preset-binder-save').on('click', '.preset-binder-save', function() {
        const row = $(this).closest('.preset-binder-row');
        const selectedPreset = row.find('.preset-select').val();
        const selectedLorebooks = row.find('.lorebook-select').val();

        if (!selectedPreset || !selectedLorebooks || selectedLorebooks.length === 0) {
            toastr.warning("请选择一个预设和至少一个世界书。");
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
        toastr.success(`已为预设 ${selectedPreset} 保存绑定`);
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
        toastr.info("绑定已移除。");
    });
}

function createBindingRow(preset, lorebookArray, allPresets, allLorebooks) {
    const presetOptions = allPresets.map(p => `<option value="${p}" ${p === preset ? 'selected' : ''}>${p}</option>`).join('');
    const lorebookOptions = allLorebooks.map(l => `<option value="${l}" ${(lorebookArray || []).includes(l) ? 'selected' : ''}>${l}</option>`).join('');

    return `
        <div class="preset-binder-row" data-preset-key="${preset || ''}">
            <select class="preset-select text_pole">
                <option value="">-- 请选择预设 --</option>
                ${presetOptions}
            </select>
            <i class="fa-solid fa-arrow-right-long"></i>
            <select class="lorebook-select text_pole" multiple>
                ${lorebookOptions}
            </select>
            <div class="binder-buttons">
                <button class="preset-binder-save menu_button fa-solid fa-save" title="保存绑定"></button>
                <button class="preset-binder-delete menu_button fa-solid fa-trash" title="删除绑定"></button>
            </div>
        </div>
    `;
}

$(document).ready(function () {
    const floatingButtonHtml = `
        <div id="preset-binder-FAB" title="打开预设-世界书绑定器">
            <i class="fa-solid fa-link"></i>
        </div>
    `;
    $('body').append(floatingButtonHtml);

    const fab = $('#preset-binder-FAB');
    let isDragging = false;
    let hasDragged = false;
    let offsetX, offsetY;

    const doDrag = (event) => {
        if (!isDragging) return;
        hasDragged = true;

        const touch = event.type.startsWith('touch') ? event.originalEvent.touches[0] : event;
        let newX = touch.clientX - offsetX;
        let newY = touch.clientY - offsetY;

        const screenWidth = $(window).width();
        const screenHeight = $(window).height();
        newX = Math.max(0, Math.min(newX, screenWidth - fab.outerWidth()));
        newY = Math.max(0, Math.min(newY, screenHeight - fab.outerHeight()));

        fab.css({ top: `${newY}px`, left: `${newX}px`, right: 'auto', bottom: 'auto' });
    };

    const endDrag = () => {
        if (!isDragging) return;
        isDragging = false;
        fab.removeClass('dragging');
        
        $(document).off('mousemove.fabdrag touchmove.fabdrag');
        $(document).off('mouseup.fabdrag touchend.fabdrag');

        if (!hasDragged) {
            showSettingsPanel();
        }
    };

    const startDrag = (event) => {
        isDragging = true;
        hasDragged = false;
        fab.addClass('dragging');

        const touch = event.type.startsWith('touch') ? event.originalEvent.touches[0] : event;
        const rect = fab[0].getBoundingClientRect();
        
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;

        event.preventDefault();

        $(document).on('mousemove.fabdrag touchmove.fabdrag', doDrag);
        $(document).on('mouseup.fabdrag touchend.fabdrag', endDrag);
    };

    fab.on('mousedown.fabdrag touchstart.fabdrag', startDrag);

    $(document).on('change', 'select[data-preset-manager-for]', handlePresetChange);
    
    $('select[data-preset-manager-for]').each(function() {
        const apiId = $(this).data('preset-manager-for');
        lastPresetForApi[apiId] = $(this).find('option:selected').text();
    });

    console.log(`${extensionName} loaded.`);
});