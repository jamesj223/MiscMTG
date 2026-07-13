(function () {
    "use strict";

    const STORE_KEY = "commanderBagState_v2";
    const BRACKETS = [1, 2, 3, 4, 5];
    const COLORS = ['W', 'U', 'B', 'R', 'G', 'C'];
    const COLOR_VARS = { W: 'var(--mana-w)', U: 'var(--mana-u)', B: 'var(--mana-b)', R: 'var(--mana-r)', G: 'var(--mana-g)', C: 'var(--mana-c)' };

    function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2)); }
    function todayStr() { return new Date().toISOString().slice(0, 10); }

    function getArtBgHtml(deck) {
        if (deck.commanderImage && deck.commanderImage2) {
            return `
        <div class="art-bg-split" style="position:absolute; inset:0; z-index:0; pointer-events:none; overflow:hidden; border-radius:inherit;">
          <div class="art-bg-left" style="background-image:url(${deck.commanderImage}); position:absolute; inset:0; background-size:cover; background-position:center; clip-path:polygon(0 0, 60% 0, 40% 100%, 0 100%);"></div>
          <div class="art-bg-right" style="background-image:url(${deck.commanderImage2}); position:absolute; inset:0; background-size:cover; background-position:center; clip-path:polygon(60% 0, 100% 0, 100% 100%, 40% 100%);"></div>
        </div>`;
        } else if (deck.commanderImage) {
            return `
        <div class="art-bg-single" style="position:absolute; inset:0; z-index:0; pointer-events:none; background-image:url(${deck.commanderImage}); background-size:cover; background-position:center; border-radius:inherit;"></div>`;
        }
        return '';
    }

    function defaultState() {
        return {
            decks: [],
            bagSlotCount: 4,
            bag: [null, null, null, null],
            filters: {},        // key -> 'include' | 'exclude'  (keys: bracket:N, color:X, or a raw tag string)
            sortMode: 'recommended',
            varietyWeight: 0.6
        };
    }

    function migrateOld() {
        // pull from the v1 key if present, so upgrading doesn't lose data
        try {
            const raw = localStorage.getItem('bagCheckState_v1');
            if (!raw) return null;
            const old = JSON.parse(raw);
            old.decks.forEach(d => { if (d.colors === undefined) d.colors = []; });
            return old;
        } catch (e) { return null; }
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORE_KEY);
            if (!raw) {
                const migrated = migrateOld();
                return migrated || defaultState();
            }
            const parsed = JSON.parse(raw);
            if (!parsed.decks) return defaultState();
            parsed.decks.forEach(d => { if (d.colors === undefined) d.colors = []; });
            while (parsed.bag.length < parsed.bagSlotCount) parsed.bag.push(null);
            return parsed;
        } catch (e) {
            console.error("Failed to load state, starting fresh.", e);
            return defaultState();
        }
    }

    let state = load();

    function save() {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch (e) {
            console.error("Failed to save state", e);
            alert("Couldn't save — your browser storage may be full. Export a backup if this keeps happening.");
        }
    }

    function deckById(id) { return state.decks.find(d => d.id === id); }

    function allCustomTags() {
        const custom = new Set();
        state.decks.forEach(d => (d.tags || []).forEach(t => custom.add(t)));
        return Array.from(custom).sort((a, b) => a.localeCompare(b));
    }

    // ---------- SCORING ----------
    function daysSince(dateStr) {
        if (!dateStr) return 9999;
        const then = new Date(dateStr + 'T00:00:00');
        const now = new Date();
        return Math.max(0, Math.round((now - then) / 86400000));
    }

    function scoreDeck(deck, bagDecks, varietyWeight) {
        const recency = Math.min(1, daysSince(deck.lastPlayed) / 365);
        if (bagDecks.length === 0) return recency;

        let themeOverlap = 0, bracketMatches = 0, bracketComparable = 0, colorOverlap = 0, colorComparable = 0;
        bagDecks.forEach(bd => {
            themeOverlap += (deck.tags || []).filter(t => (bd.tags || []).includes(t)).length;
            if (deck.bracket != null && bd.bracket != null) {
                bracketComparable++;
                if (bd.bracket === deck.bracket) bracketMatches++;
            }
            if ((deck.colors || []).length && (bd.colors || []).length) {
                colorComparable++;
                colorOverlap += (deck.colors || []).filter(c => (bd.colors || []).includes(c)).length;
            }
        });

        const normTheme = Math.min(1, themeOverlap / Math.max(1, bagDecks.length * 3));
        const normBracket = bracketComparable ? (bracketMatches / bracketComparable) : 0;
        const normColor = colorComparable ? Math.min(1, colorOverlap / (colorComparable * 3)) : 0;

        // theme weighted highest, bracket next, color lightest — per spec
        const similarity = normTheme * 0.55 + normBracket * 0.28 + normColor * 0.17;
        const variety = 1 - similarity;
        return varietyWeight * variety + (1 - varietyWeight) * recency;
    }

    // ---------- FILTERS ----------
    function deckMatchesFilters(deck) {
        for (const [key, mode] of Object.entries(state.filters)) {
            let has;
            if (key.startsWith('bracket:')) has = ('bracket:' + deck.bracket) === key;
            else if (key.startsWith('color:')) has = (deck.colors || []).includes(key.slice(6));
            else has = (deck.tags || []).includes(key);
            if (mode === 'include' && !has) return false;
            if (mode === 'exclude' && has) return false;
        }
        return true;
    }

    // ---------- RENDER: BAG ----------
    function renderBag() {
        document.getElementById('slotCountLabel').textContent = state.bagSlotCount;
        const bagEl = document.getElementById('bagSlots');
        bagEl.innerHTML = '';
        for (let i = 0; i < state.bagSlotCount; i++) {
            const deckId = state.bag[i];
            const slot = document.createElement('div');
            slot.className = 'slot ' + (deckId ? 'filled' : 'empty');
            slot.dataset.index = i;
            if (deckId) {
                const deck = deckById(deckId);
                if (deck) {
                    slot.style.backgroundImage = 'none';
                    slot.draggable = true;
                    slot.innerHTML = `
            ${getArtBgHtml(deck)}
            <div class="remove-x" title="Remove from bag">✕</div>
            <div class="nameplate">
              <div class="cmdr">${escapeHtml(deck.commander2 ? `${deck.commander} & ${deck.commander2}` : (deck.commander || deck.name))}</div>
              <div class="subrow">
                <span class="bracket">${deck.bracket ? 'BR ' + deck.bracket : 'BR —'}</span>
              </div>
            </div>`;
                    slot.querySelector('.remove-x').addEventListener('click', (e) => {
                        e.stopPropagation();
                        state.bag[i] = null; save(); renderAll();
                    });
                    slot.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'slot', index: i }));
                        slot.classList.add('dragging');
                    });
                    slot.addEventListener('dragend', () => slot.classList.remove('dragging'));
                }
            } else {
                slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('dragover'); });
                slot.addEventListener('dragleave', () => slot.classList.remove('dragover'));
            }
            slot.addEventListener('dragover', (e) => e.preventDefault());
            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('dragover');
                let data;
                try { data = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (err) { return; }
                if (data.from === 'grid') {
                    state.bag[i] = data.deckId;
                } else if (data.from === 'slot') {
                    const tmp = state.bag[i];
                    state.bag[i] = state.bag[data.index];
                    state.bag[data.index] = tmp;
                }
                save(); renderAll();
            });
            bagEl.appendChild(slot);
        }
    }

    function pipsHtml(colors) {
        if (!colors || colors.length === 0) return '';
        return colors.map(c => `<span class="pip" style="background:${COLOR_VARS[c] || '#888'}"></span>`).join('');
    }

    // ---------- RENDER: FILTER CHIPS ----------
    function renderChips() {
        const wrap = document.getElementById('filterChips');
        wrap.innerHTML = '';
        const makeChip = (key, label, extraClass, pipColor) => {
            const chip = document.createElement('div');
            const mode = state.filters[key];
            chip.className = 'chip' + (extraClass ? ' ' + extraClass : '') + (mode ? ' ' + mode : '');
            chip.innerHTML = (pipColor ? `<span class="pip" style="background:${pipColor}"></span>` : '') + escapeHtml(label);
            chip.title = mode ? (mode === 'include' ? 'Including — click to exclude' : 'Excluding — click to clear') : 'Click to include';
            chip.addEventListener('click', () => {
                const cur = state.filters[key];
                if (!cur) state.filters[key] = 'include';
                else if (cur === 'include') state.filters[key] = 'exclude';
                else delete state.filters[key];
                save(); renderAll();
            });
            wrap.appendChild(chip);
        };
        BRACKETS.forEach(b => makeChip('bracket:' + b, 'BR ' + b, 'bracket'));
        allCustomTags().forEach(t => makeChip(t, t, null));
    }

    // ---------- RENDER: DECK GRID ----------
    function renderGrid() {
        const grid = document.getElementById('deckGrid');
        const emptyState = document.getElementById('emptyState');
        grid.innerHTML = '';

        if (state.decks.length === 0) {
            emptyState.style.display = 'block';
            grid.style.display = 'none';
            return;
        }
        emptyState.style.display = 'none';
        grid.style.display = 'grid';

        const bagIds = new Set(state.bag.filter(Boolean));
        const bagDecks = state.bag.filter(Boolean).map(deckById).filter(Boolean);
        const vw = state.varietyWeight;

        let candidates = state.decks
            .filter(d => !bagIds.has(d.id))
            .filter(deckMatchesFilters)
            .map(d => ({ deck: d, score: scoreDeck(d, bagDecks, vw) }));

        if (state.sortMode === 'recommended') {
            candidates.sort((a, b) => b.score - a.score);
        } else if (state.sortMode === 'az') {
            candidates.sort((a, b) => (a.deck.name || '').localeCompare(b.deck.name || ''));
        } else if (state.sortMode === 'bracket') {
            candidates.sort((a, b) => (a.deck.bracket || 99) - (b.deck.bracket || 99));
        }

        const maxScore = Math.max(0.001, ...candidates.map(c => c.score));

        candidates.forEach(({ deck, score }) => {
            const card = document.createElement('div');
            card.className = 'deck-card';
            const opacity = bagDecks.length ? (0.4 + 0.6 * (score / maxScore)) : 1;
            card.style.opacity = opacity.toFixed(2);
            card.style.filter = opacity < 0.6 ? 'saturate(0.45)' : 'none';
            card.innerHTML = `
        <button class="add-btn" title="Add to bag">+ Bag</button>
        <div class="hint-tag">click to edit</div>
        <div class="art" draggable="true" style="position:relative; overflow:hidden;">
          ${getArtBgHtml(deck)}
          <div class="nameplate">
            <div class="deckname">${escapeHtml(deck.name)}</div>
            <div class="cmdr">${escapeHtml(deck.commander2 ? `${deck.commander} & ${deck.commander2}` : deck.commander)}</div>
          </div>
        </div>
        <div class="meta">
          <span class="br">${deck.bracket ? 'BR ' + deck.bracket : 'unrated'}</span>
          <span class="pips">${pipsHtml(deck.colors)}</span>
          <span>${deck.lastPlayed ? deck.lastPlayed : 'never'}</span>
        </div>`;
            card.querySelector('.art').addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ from: 'grid', deckId: deck.id }));
            });
            card.querySelector('.add-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                const emptyIdx = state.bag.findIndex(x => x === null);
                if (emptyIdx === -1) { alert('Bag is full — remove a deck first, or add more slots.'); return; }
                state.bag[emptyIdx] = deck.id;
                save(); renderAll();
            });
            card.addEventListener('click', () => openDeckModal(deck.id));
            grid.appendChild(card);
        });
    }

    function renderAll() {
        renderBag();
        renderChips();
        renderGrid();
        document.getElementById('varietySlider').value = Math.round(state.varietyWeight * 100);
        document.querySelectorAll('#sortPills button').forEach(b => {
            b.classList.toggle('active', b.dataset.sort === state.sortMode);
        });
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }

    // ---------- BAG SIZE CONTROLS ----------
    document.getElementById('slotPlus').addEventListener('click', () => {
        state.bagSlotCount = Math.min(16, state.bagSlotCount + 1);
        state.bag.push(null);
        save(); renderAll();
    });
    document.getElementById('slotMinus').addEventListener('click', () => {
        if (state.bagSlotCount <= 1) return;
        state.bag.pop();
        state.bagSlotCount = Math.max(1, state.bagSlotCount - 1);
        save(); renderAll();
    });

    document.getElementById('varietySlider').addEventListener('input', (e) => {
        state.varietyWeight = Number(e.target.value) / 100;
        save(); renderGrid();
    });

    document.getElementById('markPlayedBtn').addEventListener('click', () => {
        const ids = state.bag.filter(Boolean);
        if (ids.length === 0) { alert('Bag is empty — add some decks first.'); return; }
        const today = todayStr();
        ids.forEach(id => { const d = deckById(id); if (d) d.lastPlayed = today; });
        save(); renderAll();
    });

    document.getElementById('sortPills').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-sort]');
        if (!btn) return;
        state.sortMode = btn.dataset.sort;
        save(); renderAll();
    });

    // ---------- EXPORT / IMPORT ----------
    document.getElementById('exportBtn').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'commander-bag-backup-' + todayStr() + '.json';
        a.click();
        URL.revokeObjectURL(url);
    });
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result);
                if (!parsed.decks) throw new Error('Missing decks array');
                if (confirm('Import will replace your current decks and bag. Continue?')) {
                    state = parsed;
                    if (!state.filters) state.filters = {};
                    state.decks.forEach(d => { if (d.colors === undefined) d.colors = []; });
                    if (!state.bag) state.bag = new Array(state.bagSlotCount || 4).fill(null);
                    save(); renderAll();
                }
            } catch (err) {
                alert('That file doesn\'t look like a valid Commander Bag export.');
            }
            e.target.value = '';
        };
        reader.readAsText(file);
    });

    // ---------- DECK MODAL ----------
    let editingId = null;
    let modalTags = [];
    let modalColors = [];
    let modalColors2 = [];
    let modalBracket = null;
    let modalCommanderImage = null;
    let modalCommanderImage2 = null;
    let modalPrints = [];
    let modalPrints2 = [];

    function openDeckModal(deckId) {
        editingId = deckId || null;
        const deck = deckId ? deckById(deckId) : null;
        modalTags = deck ? [...(deck.tags || [])] : [];
        modalColors = deck ? [...(deck.colors1 || deck.colors || [])] : [];
        modalColors2 = deck ? [...(deck.colors2 || [])] : [];
        modalBracket = deck ? deck.bracket : null;
        modalCommanderImage = deck ? deck.commanderImage : null;
        modalCommanderImage2 = deck ? deck.commanderImage2 : null;
        modalPrints = [];
        modalPrints2 = [];

        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.innerHTML = `
      <div class="modal">
        <h2>${deck ? 'Edit deck' : 'Add deck'}</h2>
        <div class="field">
          <label>Deck name</label>
          <input type="text" id="f_name" value="${escapeHtml(deck ? deck.name : '')}" placeholder="e.g. Counters Go Brrr">
        </div>
        <div class="field">
          <label>Commander</label>
          <input type="text" id="f_commander" autocomplete="off" value="${escapeHtml(deck ? deck.commander : '')}" placeholder="Start typing a card name…">
          <div class="suggest-list" id="f_commander_list" style="display:none;"></div>
        </div>
        <div class="field" id="f_commander_preview_wrap" style="${modalCommanderImage ? '' : 'display:none;'}">
          <div class="commander-preview">
            <img id="f_commander_img" src="${modalCommanderImage || ''}">
            <span>Pick a printing below if you'd like a different art</span>
          </div>
          <div class="print-thumbs" id="f_print_thumbs"></div>
        </div>
        <div id="f_partner_wrap" class="${deck && deck.commander2 ? 'visible' : ''}">
          <div class="field">
            <label>Partner Commander</label>
            <input type="text" id="f_commander2" autocomplete="off" value="${escapeHtml(deck ? deck.commander2 : '')}" placeholder="Start typing second card name…">
            <div class="suggest-list" id="f_commander2_list" style="display:none;"></div>
          </div>
          <div class="field" id="f_commander2_preview_wrap" style="${modalCommanderImage2 ? '' : 'display:none;'}">
            <div class="commander-preview">
              <img id="f_commander2_img" src="${modalCommanderImage2 || ''}">
              <span>Pick a printing below if you'd like a different art</span>
            </div>
            <div class="print-thumbs" id="f_print2_thumbs"></div>
          </div>
        </div>
        <div class="field">
          <label>Bracket <span class="hint">optional — leave blank if undecided</span></label>
          <div class="bracket-row" id="f_bracket">
            ${BRACKETS.map(b => `<button type="button" data-b="${b}" class="${deck && deck.bracket === b ? 'active' : ''}">${b}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Tags</label>
          <div class="tag-input-row" id="f_tag_row">
            <input type="text" id="f_tag_input" placeholder="Add a tag, press Enter" autocomplete="off">
          </div>
          <div class="suggest-list" id="f_tag_suggest" style="display:none;"></div>
        </div>
        <div class="field">
          <label>Moxfield link (optional)</label>
          <input type="text" id="f_moxfield" value="${escapeHtml(deck ? (deck.moxfieldUrl || '') : '')}" placeholder="https://moxfield.com/decks/...">
        </div>
        <div class="field">
          <label>Last played</label>
          <input type="date" id="f_lastplayed" value="${deck && deck.lastPlayed ? deck.lastPlayed : ''}">
        </div>
        <div class="modal-actions">
          <div>${deck ? '<button class="btn ghost" id="f_delete">Delete deck</button>' : ''}</div>
          <div style="display:flex; gap:8px;">
            <button class="btn" id="f_cancel">Cancel</button>
            <button class="btn primary" id="f_save">Save</button>
          </div>
        </div>
      </div>`;
        document.body.appendChild(backdrop);

        renderTagPills();
        if (deck && deck.commander) fetchScryfallPrints(deck.commander, false);
        if (deck && deck.commander2) fetchScryfallPrints2(deck.commander2, false);

        function togglePartnerUI(show) {
            const wrap = document.getElementById('f_partner_wrap');
            if (!wrap) return;
            if (show) {
                wrap.classList.add('visible');
            } else {
                wrap.classList.remove('visible');
                document.getElementById('f_commander2').value = '';
                document.getElementById('f_commander2_preview_wrap').style.display = 'none';
                document.getElementById('f_commander2_img').src = '';
                document.getElementById('f_print2_thumbs').innerHTML = '';
                modalCommanderImage2 = null;
                modalColors2 = [];
                modalPrints2 = [];
            }
        }
        backdrop._togglePartnerUI = togglePartnerUI;

        // bracket select (click active again to clear — it's optional)
        backdrop.querySelector('#f_bracket').addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-b]');
            if (!btn) return;
            const b = Number(btn.dataset.b);
            if (modalBracket === b) {
                modalBracket = null;
            } else {
                modalBracket = b;
            }
            backdrop.querySelectorAll('#f_bracket button').forEach(x => x.classList.toggle('active', Number(x.dataset.b) === modalBracket));
        });

        // commander autocomplete
        const cInput = backdrop.querySelector('#f_commander');
        const cList = backdrop.querySelector('#f_commander_list');
        let debounceTimer;
        cInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            const q = cInput.value.trim();
            if (q.length < 2) { cList.style.display = 'none'; return; }
            debounceTimer = setTimeout(() => fetchScryfallAutocomplete(q, cList), 250);
        });
        cInput.addEventListener('blur', () => setTimeout(() => cList.style.display = 'none', 150));

        // commander 2 autocomplete
        const cInput2 = backdrop.querySelector('#f_commander2');
        const cList2 = backdrop.querySelector('#f_commander2_list');
        let debounceTimer2;
        cInput2.addEventListener('input', () => {
            clearTimeout(debounceTimer2);
            const q = cInput2.value.trim();
            if (q.length < 2) { cList2.style.display = 'none'; return; }
            debounceTimer2 = setTimeout(() => fetchScryfallAutocomplete(q, cList2, true), 250);
        });
        cInput2.addEventListener('blur', () => setTimeout(() => cList2.style.display = 'none', 150));

        // tag input with suggestions (not forced autocomplete — free text still works)
        const tInput = backdrop.querySelector('#f_tag_input');
        const tSuggest = backdrop.querySelector('#f_tag_suggest');
        tInput.addEventListener('input', () => {
            const q = tInput.value.trim().toLowerCase();
            if (!q) { tSuggest.style.display = 'none'; return; }
            const matches = allCustomTags().filter(t => t.toLowerCase().includes(q) && !modalTags.includes(t)).slice(0, 6);
            if (matches.length === 0) { tSuggest.style.display = 'none'; return; }
            tSuggest.innerHTML = '';
            matches.forEach(m => {
                const item = document.createElement('div');
                item.textContent = m;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    if (!modalTags.includes(m)) modalTags.push(m);
                    tInput.value = '';
                    tSuggest.style.display = 'none';
                    renderTagPills();
                });
                tSuggest.appendChild(item);
            });
            tSuggest.style.display = 'block';
        });
        tInput.addEventListener('blur', () => setTimeout(() => tSuggest.style.display = 'none', 150));
        tInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = tInput.value.trim();
                if (val && !modalTags.includes(val)) {
                    modalTags.push(val);
                    renderTagPills();
                }
                tInput.value = '';
                tSuggest.style.display = 'none';
            }
        });

        backdrop.querySelector('#f_cancel').addEventListener('click', () => backdrop.remove());
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

        if (deck) {
            backdrop.querySelector('#f_delete').addEventListener('click', () => {
                if (confirm('Delete "' + deck.name + '"? This can\'t be undone.')) {
                    state.decks = state.decks.filter(d => d.id !== deck.id);
                    state.bag = state.bag.map(id => id === deck.id ? null : id);
                    save(); renderAll();
                    backdrop.remove();
                }
            });
        }

        backdrop.querySelector('#f_save').addEventListener('click', () => {
            const name = backdrop.querySelector('#f_name').value.trim();
            const commander = backdrop.querySelector('#f_commander').value.trim();
            const commander2 = backdrop.querySelector('#f_commander2') ? backdrop.querySelector('#f_commander2').value.trim() : '';
            const moxfieldUrl = backdrop.querySelector('#f_moxfield').value.trim();
            const lastPlayed = backdrop.querySelector('#f_lastplayed').value || null;

            if (!name || !commander) {
                alert('Deck name and commander are required. Bracket can stay blank.');
                return;
            }

            const isPartnerVisible = document.getElementById('f_partner_wrap') && document.getElementById('f_partner_wrap').classList.contains('visible');
            const actualCommander2 = isPartnerVisible ? commander2 : '';
            const actualCommanderImage2 = isPartnerVisible ? modalCommanderImage2 : null;
            const actualColors2 = isPartnerVisible ? modalColors2 : [];

            function combineAndSortColors(c1, c2) {
                const s = new Set([...c1, ...c2]);
                if (s.has('C') && s.size > 1) s.delete('C');
                const order = { 'W': 1, 'U': 2, 'B': 3, 'R': 4, 'G': 5, 'C': 6 };
                return Array.from(s).sort((a, b) => order[a] - order[b]);
            }

            const combinedColors = combineAndSortColors(modalColors, actualColors2);

            if (editingId) {
                const d = deckById(editingId);
                Object.assign(d, {
                    name,
                    commander,
                    commanderImage: modalCommanderImage,
                    commander2: actualCommander2,
                    commanderImage2: actualCommanderImage2,
                    bracket: modalBracket,
                    colors: combinedColors,
                    colors1: modalColors,
                    colors2: actualColors2,
                    tags: modalTags,
                    moxfieldUrl,
                    lastPlayed
                });
            } else {
                state.decks.push({
                    id: uid(),
                    name,
                    commander,
                    commanderImage: modalCommanderImage,
                    commander2: actualCommander2,
                    commanderImage2: actualCommanderImage2,
                    bracket: modalBracket,
                    colors: combinedColors,
                    colors1: modalColors,
                    colors2: actualColors2,
                    tags: modalTags,
                    moxfieldUrl,
                    lastPlayed
                });
            }
            save(); renderAll();
            backdrop.remove();
        });

        function renderTagPills() {
            const row = backdrop.querySelector('#f_tag_row');
            row.querySelectorAll('.tag-pill').forEach(p => p.remove());
            modalTags.forEach(t => {
                const pill = document.createElement('span');
                pill.className = 'tag-pill';
                pill.innerHTML = `${escapeHtml(t)} <button type="button">✕</button>`;
                pill.querySelector('button').addEventListener('click', () => {
                    modalTags = modalTags.filter(x => x !== t);
                    renderTagPills();
                });
                row.insertBefore(pill, backdrop.querySelector('#f_tag_input'));
            });
        }

        async function fetchScryfallPrints(name, focusFirst) {
            try {
                const res = await fetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + name + '"') + '&unique=prints&order=released');
                if (!res.ok) return;
                const data = await res.json();
                modalPrints = (data.data || []).filter(c => c.image_uris || (c.card_faces && c.card_faces[0].image_uris));
                renderPrintThumbs();

                // Also check if card has partner keyword
                const hasPartner = data.data && data.data[0] && hasPartnerAbility(data.data[0]);
                togglePartnerUI(hasPartner);
            } catch (e) { console.error('Scryfall prints fetch failed', e); }
        }

        function renderPrintThumbs() {
            const thumbWrap = backdrop.querySelector('#f_print_thumbs');
            if (!thumbWrap) return;
            thumbWrap.innerHTML = '';
            modalPrints.forEach(card => {
                const uris = card.image_uris || card.card_faces[0].image_uris;
                const img = document.createElement('img');
                img.src = uris.small;
                img.title = card.set_name;
                if (uris.art_crop === modalCommanderImage) img.classList.add('selected');
                img.addEventListener('click', () => {
                    modalCommanderImage = uris.art_crop;
                    document.getElementById('f_commander_img').src = modalCommanderImage;
                    document.getElementById('f_commander_preview_wrap').style.display = 'block';
                    thumbWrap.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
                    img.classList.add('selected');
                });
                thumbWrap.appendChild(img);
            });
        }

        async function fetchScryfallPrints2(name, focusFirst) {
            try {
                const res = await fetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + name + '"') + '&unique=prints&order=released');
                if (!res.ok) return;
                const data = await res.json();
                modalPrints2 = (data.data || []).filter(c => c.image_uris || (c.card_faces && c.card_faces[0].image_uris));
                renderPrintThumbs2();
            } catch (e) { console.error('Scryfall prints fetch failed for commander 2', e); }
        }

        function renderPrintThumbs2() {
            const thumbWrap = backdrop.querySelector('#f_print2_thumbs');
            if (!thumbWrap) return;
            thumbWrap.innerHTML = '';
            modalPrints2.forEach(card => {
                const uris = card.image_uris || card.card_faces[0].image_uris;
                const img = document.createElement('img');
                img.src = uris.small;
                img.title = card.set_name;
                if (uris.art_crop === modalCommanderImage2) img.classList.add('selected');
                img.addEventListener('click', () => {
                    modalCommanderImage2 = uris.art_crop;
                    document.getElementById('f_commander2_img').src = modalCommanderImage2;
                    document.getElementById('f_commander2_preview_wrap').style.display = 'block';
                    thumbWrap.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
                    img.classList.add('selected');
                });
                thumbWrap.appendChild(img);
            });
        }

        // expose for autocomplete handler below
        backdrop._fetchPrints = fetchScryfallPrints;
        backdrop._fetchPrints2 = fetchScryfallPrints2;
    }

    function hasPartnerAbility(card) {
        if (!card || !card.keywords) return false;
        const kw = card.keywords.map(k => k.toLowerCase());
        return kw.includes('partner') ||
            kw.includes('partner with') ||
            kw.includes('friends forever') ||
            kw.includes('doctor\'s companion') ||
            kw.includes('choose a background');
    }

    async function fetchScryfallAutocomplete(q, listEl, isSecond) {
        try {
            const clean = q.trim().replace(/["\\]/g, '');
            const words = clean.split(/\s+/).filter(Boolean);
            if (words.length === 0) { listEl.style.display = 'none'; return; }
            const query = 'is:commander ' + (isSecond ? 'is:partner ' : '') + words.map(w => `name:"${w}"`).join(' ');
            const res = await fetch('https://api.scryfall.com/cards/search?q=' + encodeURIComponent(query));
            if (!res.ok) { listEl.style.display = 'none'; return; }
            const data = await res.json();
            const cards = data.data || [];
            if (cards.length === 0) { listEl.style.display = 'none'; return; }
            listEl.innerHTML = '';
            cards.slice(0, 8).forEach(c => {
                const n = c.name;
                const item = document.createElement('div');
                item.textContent = n;
                item.addEventListener('mousedown', async (e) => {
                    e.preventDefault();
                    const targetId = isSecond ? 'f_commander2' : 'f_commander';
                    document.getElementById(targetId).value = n;
                    listEl.style.display = 'none';
                    await fetchScryfallCardDefault(n, isSecond);
                });
                listEl.appendChild(item);
            });
            listEl.style.display = 'block';
        } catch (e) {
            console.error('Scryfall autocomplete failed', e);
        }
    }

    async function fetchScryfallCardDefault(name, isSecond) {
        try {
            const res = await fetch('https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(name));
            if (!res.ok) return;
            const card = await res.json();
            const img = card.image_uris ? card.image_uris.art_crop
                : (card.card_faces && card.card_faces[0].image_uris ? card.card_faces[0].image_uris.art_crop : null);

            const targetPrefix = isSecond ? 'f_commander2' : 'f_commander';
            const wrap = document.getElementById(`${targetPrefix}_preview_wrap`);
            const imgEl = document.getElementById(`${targetPrefix}_img`);
            if (wrap && imgEl && img) {
                imgEl.src = img;
                wrap.style.display = 'block';
            }
            document.getElementById(targetPrefix).value = card.name;

            if (isSecond) {
                modalCommanderImage2 = img;
                modalColors2 = (card.color_identity && card.color_identity.length) ? [...card.color_identity] : ['C'];
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop && backdrop._fetchPrints2) backdrop._fetchPrints2(card.name, true);
            } else {
                modalCommanderImage = img;
                modalColors = (card.color_identity && card.color_identity.length) ? [...card.color_identity] : ['C'];

                const hasPartner = hasPartnerAbility(card);
                const backdrop = document.querySelector('.modal-backdrop');
                if (backdrop && backdrop._togglePartnerUI) backdrop._togglePartnerUI(hasPartner);
                if (backdrop && backdrop._fetchPrints) backdrop._fetchPrints(card.name, true);
            }
        } catch (e) {
            console.error('Scryfall card fetch failed', e);
        }
    }

    document.getElementById('addDeckBtn').addEventListener('click', () => openDeckModal(null));
    document.getElementById('emptyAddBtn').addEventListener('click', () => openDeckModal(null));

    renderAll();
})();