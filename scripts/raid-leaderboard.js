let raidLeaderboardWorker = null;
let raidLeaderboardReject = null;
let raidLeaderboardRequest = 0;
let raidLeaderboardCache = new Map();
let raidLeaderboardMatrix = null;
let raidLeaderboardResult = null;
let raidLeaderboardTiers = new Map();
let raidLeaderboardTierFrame = 0;
let raidLeaderboardTierObserver = null;
let raidLeaderboardState = {};
let raidLeaderboardIncludeMegas = false;
let raidLeaderboardSuperMaxOnly = true;
// Earlier sessions also saved the old automatic off default. Start the new default once.
const RAID_SUPER_MAX_STORAGE_KEY = 'dialgadex-raid-super-max-v2';
try { raidLeaderboardIncludeMegas = sessionStorage.getItem('dialgadex-raid-megas') === 'true'; } catch (_) {}
try { raidLeaderboardSuperMaxOnly = sessionStorage.getItem(RAID_SUPER_MAX_STORAGE_KEY) !== 'false'; } catch (_) {}

function GetRaidLeaderboardIncludeMegas() { return raidLeaderboardIncludeMegas; }

function SetRaidLeaderboardIncludeMegas(include) {
    raidLeaderboardIncludeMegas = !!include;
    try { sessionStorage.setItem('dialgadex-raid-megas', String(raidLeaderboardIncludeMegas)); } catch (_) {}
}

function GetRaidLeaderboardSuperMaxOnly() { return raidLeaderboardSuperMaxOnly; }

function SetRaidLeaderboardSuperMaxOnly(include) {
    raidLeaderboardSuperMaxOnly = !!include;
    try { sessionStorage.setItem(RAID_SUPER_MAX_STORAGE_KEY, String(raidLeaderboardSuperMaxOnly)); } catch (_) {}
}

function RaidLeaderboardText(key, params = {}) {
    return FormatTranslation('raid-leaderboard.' + key, params);
}

function CancelRaidLeaderboardLoad() {
    raidLeaderboardRequest++;
    raidLeaderboardWorker?.terminate();
    raidLeaderboardWorker = null;
    if (raidLeaderboardReject) raidLeaderboardReject(new DOMException('Navigation changed', 'AbortError'));
    raidLeaderboardReject = null;
}

function GetRaidLeaderboardSnapshot() {
    const includeUnreleased = GetIncludeUnreleased();
    const pokemon = structuredClone(GetCalculationPokemon(includeUnreleased));
    if (typeof IsCatchXLProjection === 'function')
        for (const entry of pokemon) entry._catchXLProjected=IsCatchXLProjection(entry);
    // Include definitions attached to this calculation scope, including detached forecasts.
    const charged = new Map(jb_cm.filter(move => !move._plus_projection).map(move => [move.name, move]));
    for (const entry of pokemon) for (const name of entry.temp_cm || []) {
        const move = FindChargedMove(name);
        if (move) charged.set(name, move);
    }
    return {pokemon, fastMoves: structuredClone(jb_fm), chargedMoves: structuredClone([...charged.values()]),
        catchProfiles:typeof GetCatchXLManifest === 'function' ? structuredClone(GetCatchXLManifest()) : {}, settings: {
        levels: [...settings_default_level], xlBudget: settings_xl_budget,
        team: settings_team_size_normal, megaTeam: settings_team_size_mega,
        includeMegas: GetRaidLeaderboardIncludeMegas(), relobby: settings_relobbytime, party: settings_party_size,
        newDps: settings_newdps, pveTurns: settings_pve_turns, megaLevel: settings_supermega_level,
        estimatedY: estimated_y_numerator,
        includeUnreleased, preview: includeUnreleased && settings_speculative,
    }};
}

function BindRaidLeaderboard() {
    const iconSheet = new Image();
    iconSheet.src = ICONS_URL;
    $(window).off('.raidTierLabels').on('scroll.raidTierLabels resize.raidTierLabels', QueueRaidLeaderboardTierLabels);
    raidLeaderboardTierObserver?.disconnect();
    raidLeaderboardTierObserver = new ResizeObserver(QueueRaidLeaderboardTierLabels);
    raidLeaderboardTierObserver.observe(document.getElementById('raid-list'));
    // Match Type Rankings on hover while retaining touch and keyboard controls.
    const hoverFilters = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
    $('#raid-filter-drawer').on('mouseenter', function() {
        if (hoverFilters()) this.open = true;
    }).on('mouseleave', function() {
        if (hoverFilters()) this.open = false;
    }).on('click', function(event) {
        event.stopPropagation();
        if (hoverFilters() && event.originalEvent?.detail && $(event.target).closest('#raid-filter-trigger').length) {
            event.preventDefault();
            this.open = true;
        }
        $('.drawer-popup').not('#raid-filters').css('display', '');
        $('.drawer-icon-focused').removeClass('drawer-icon-focused');
    }).on('keydown', function(event) {
        if (event.key === 'Escape') {
            this.open = false;
            $('#raid-filter-trigger').trigger('focus');
            event.preventDefault();
        }
    });
    $(document).off('click.raidSpeciesFilters').on('click.raidSpeciesFilters', function(event) {
        if (!$(event.target).closest('#raid-filter-drawer').length)
            $('#raid-filter-drawer').prop('open', false);
    });
    $('#raid-unreleased').on('change', function() {
        SetIncludeUnreleased(this.checked);
        raidLeaderboardState.unreleased = this.checked;
        UpdateRaidLeaderboardURL();
        LoadRaidLeaderboard();
    });
    $('#raid-megas').on('change', function() {
        SetRaidLeaderboardIncludeMegas(this.checked);
        raidLeaderboardState.includeMegas = this.checked;
        raidLeaderboardState.superMaxOnly = GetRaidLeaderboardSuperMaxOnly();
        raidLeaderboardState.sort = 'score';
        UpdateRaidLeaderboardURL();
        LoadRaidLeaderboard();
    });
    $('#raid-progress').attr('aria-label', RaidLeaderboardText('progress-label'));
    $('#raid-shadows, #raid-legendaries').on('change', function() {
        raidLeaderboardState.shadows = $('#raid-shadows').is(':checked');
        raidLeaderboardState.legendaries = $('#raid-legendaries').is(':checked');
        UpdateRaidLeaderboardURL();
        RenderRaidLeaderboard();
    });
    $('#raid-retry').on('click', () => LoadRaidLeaderboard());
    $('#raid-super-max').on('change', function() {
        SetRaidLeaderboardSuperMaxOnly(this.checked);
        raidLeaderboardState.superMaxOnly = this.checked;
        UpdateRaidLeaderboardURL();
        RefreshRaidLeaderboardScores();
    });
    $('#raid-rankings-back').on('click', function(event) {
        event.preventDefault();
        LoadStrongestAndUpdateURL('Any');
    });
    $('#raid-boss-list').on('click', function(event) {
        event.preventDefault();
        LoadBossListAndUpdateURL();
    });
}

function UpdateRaidLeaderboardURL() {
    const params = new URLSearchParams();
    params.set('leaderboard', '');
    if (raidLeaderboardState.unreleased) params.set('unreleased', '');
    if (raidLeaderboardState.includeMegas) params.set('megas', '');
    if (raidLeaderboardState.includeMegas)
        params.set(raidLeaderboardState.superMaxOnly ? 'super-max' : 'no-super-max', '');
    if (!raidLeaderboardState.shadows) params.set('no-shadows', '');
    if (!raidLeaderboardState.legendaries) params.set('no-legendaries', '');
    UpdateURL('?' + params.toString());
}

function LoadRaidLeaderboardAndUpdateURL() {
    UpdateURL('?leaderboard' + (GetIncludeUnreleased() ? '&unreleased' : '')
        + (GetRaidLeaderboardIncludeMegas() ? '&megas' + (GetRaidLeaderboardSuperMaxOnly() ? '&super-max' : '&no-super-max') : ''));
    return LoadRaidLeaderboard();
}

async function LoadRaidLeaderboard() {
    CancelRaidLeaderboardLoad();
    const request = raidLeaderboardRequest;
    if (!await LoadPage('raid-leaderboard') || request !== raidLeaderboardRequest) return;
    const params = new URLSearchParams(location.search);
    if (!params.has('leaderboard')) return;
    const includeMegas = params.has('megas') || params.has('xl');
    raidLeaderboardState = {
        unreleased: params.has('unreleased'),
        includeMegas,
        superMaxOnly: includeMegas ? params.has('super-max')
            || (!params.has('no-super-max') && GetRaidLeaderboardSuperMaxOnly()) : GetRaidLeaderboardSuperMaxOnly(),
        floor: 80, weighting: 'groups',
        shadows: !params.has('no-shadows'), legendaries: !params.has('no-legendaries'),
        sort: 'score',
    };
    SetIncludeUnreleased(raidLeaderboardState.unreleased);
    SetRaidLeaderboardIncludeMegas(raidLeaderboardState.includeMegas);
    if (includeMegas) SetRaidLeaderboardSuperMaxOnly(raidLeaderboardState.superMaxOnly);
    $('#raid-megas').prop('checked', raidLeaderboardState.includeMegas);
    $('#raid-megas').attr('aria-label', RaidLeaderboardText('mode-label'));
    $('#raid-mode-label').attr('title', RaidLeaderboardText('mode-help'));
    $('#raid-mode-label .option-1').attr('aria-hidden', String(raidLeaderboardState.includeMegas));
    $('#raid-mode-label .option-2').attr('aria-hidden', String(!raidLeaderboardState.includeMegas));
    $('#raid-title').attr('aria-label', RaidLeaderboardText(raidLeaderboardState.includeMegas ? 'mega-title' : 'title'));
    $('.raid-mega-control').prop('hidden', !raidLeaderboardState.includeMegas);
    $('#raid-super-max').prop('checked', raidLeaderboardState.superMaxOnly);
    $('#raid-shadows-control, #raid-shadows-label').prop('hidden', raidLeaderboardState.includeMegas);
    $('#raid-filter-trigger').attr('aria-label', GetTranslation('filters.species.title', 'Species Filters'));
    $('#raid-shadows').prop('checked', raidLeaderboardState.shadows);
    $('#raid-legendaries').prop('checked', raidLeaderboardState.legendaries);
    $('#raid-score-heading').attr('title', RaidLeaderboardText('score-tooltip'));
    $('#raid-plus-note, #raid-level-note').prop('hidden', true);
    document.title = RaidLeaderboardText(raidLeaderboardState.includeMegas ? 'mega-meta-title' : 'meta-title');
    $('meta[name=description]').attr('content', RaidLeaderboardText(raidLeaderboardState.includeMegas ? 'mega-meta-description' : 'meta-description'));
    $('#raid-results, #raid-retry').prop('hidden', true);
    $('#raid-loading').prop('hidden', false);
    $('#raid-progress').prop('hidden', false).val(0);
    $('#raid-status').attr('role', 'status').text(RaidLeaderboardText('preparing'));
    $('#raid-leaderboard').attr('aria-busy', 'true');
    raidLeaderboardMatrix = null;
    raidLeaderboardResult = null;
    try {
        const snapshot = GetRaidLeaderboardSnapshot();
        const key = JSON.stringify(snapshot);
        let matrix;
        if (!(raidLeaderboardCache instanceof Map)) raidLeaderboardCache = new Map();
        if (raidLeaderboardCache.has(key)) matrix = raidLeaderboardCache.get(key);
        else {
            matrix = await new Promise((resolve, reject) => {
                const worker = new Worker('scripts/raid-leaderboard-worker.js?v=0e978cf343af');
                raidLeaderboardWorker = worker;
                raidLeaderboardReject = reject;
                worker.onmessage = event => {
                    if (request !== raidLeaderboardRequest) return;
                    const data = event.data;
                    if (data.type === 'progress') {
                        $('#raid-progress').attr('max', data.total).val(data.completed);
                        $('#raid-status').text(RaidLeaderboardText('progress', data));
                    } else if (data.type === 'complete') resolve(data.matrix);
                    else if (data.type === 'error') reject(new Error(data.message));
                };
                worker.onerror = event => reject(new Error(event.message));
                worker.postMessage(snapshot);
            });
            if (request !== raidLeaderboardRequest) return;
            raidLeaderboardWorker?.terminate();
            raidLeaderboardWorker = null;
            raidLeaderboardReject = null;
            if (raidLeaderboardCache.size >= 4) raidLeaderboardCache.delete(raidLeaderboardCache.keys().next().value);
            raidLeaderboardCache.set(key, matrix);
        }
        if (request !== raidLeaderboardRequest) return;
        raidLeaderboardMatrix = matrix;
        const settings = matrix.settings;
        $('#raid-plus-note').prop('hidden', !(settings.includeMegas && settings.includeUnreleased));
        $('#raid-level-note').prop('hidden', !(settings.includeMegas && settings.includeUnreleased && settings.megaLevel === 4));
        RefreshRaidLeaderboardScores();
        $('#raid-progress').prop('hidden', true);
        $('#raid-results').prop('hidden', false);
        $('#raid-loading').prop('hidden', true);
        $('#raid-leaderboard').attr('aria-busy', 'false');
    } catch (error) {
        if (request !== raidLeaderboardRequest || error.name === 'AbortError') return;
        raidLeaderboardWorker?.terminate();
        raidLeaderboardWorker = null;
        raidLeaderboardReject = null;
        $('#raid-status').attr('role', 'alert').text(RaidLeaderboardText('error'));
        $('#raid-progress').prop('hidden', true);
        $('#raid-retry').prop('hidden', false);
        $('#raid-leaderboard').attr('aria-busy', 'false');
        console.error('Raid leaderboard:', error);
    }
}

function RefreshRaidLeaderboardScores() {
    if (!raidLeaderboardMatrix) return;
    raidLeaderboardResult = ScoreRaidMatrix(raidLeaderboardMatrix, {...raidLeaderboardState,
        scoring:raidLeaderboardState.includeMegas ? 'mega-xl' : 'elite'});
    raidLeaderboardTiers = GetRaidLeaderboardTiers(raidLeaderboardResult.rows.filter(row =>
        !!row.transformed === !!raidLeaderboardState.includeMegas));
    $('#raid-status').text(RaidLeaderboardText('pool', {
        forms: raidLeaderboardResult.bossCount, groups: raidLeaderboardResult.groupCount,
    }));
    $('#raid-method-summary').text(RaidLeaderboardText(raidLeaderboardState.includeMegas ? 'method-summary' : 'attacker-method-summary', {floor: raidLeaderboardState.floor,
        reference: RaidLeaderboardText('reference-non-mega')}));
    $('#raid-weight-summary').text(RaidLeaderboardText('weight-' + raidLeaderboardState.weighting + '-note'));
    RenderRaidLeaderboard();
}

function RaidLeaderboardName(pokemon, compactMega = false) {
    let species = pokemon.name;
    let form = GetFormText(pokemon.id, pokemon.form);
    if (IsMegaPrimalUltraForm(pokemon)) {
        species = species.replace(/^(?:Mega |Primal )/, '').replace(/ [XYZ]$/, '');
        if (pokemon.form === 'Primal' || pokemon.name.startsWith('Primal ')) form = GetTranslation('terms.primal', 'Primal');
        else if (/^Mega/.test(pokemon.form)) {
            const suffix = pokemon.name.match(/ [XYZ]$/)?.[0] || ({MegaY:' Y',MegaZ:' Z'}[pokemon.form] || '');
            form = compactMega ? suffix.trim() : GetTranslation('terms.mega', 'Mega') + suffix;
        } else if (pokemon.form === 'Ultra') form = 'Ultra';
    }
    const speciesText = TranslatedSpeciesName(pokemon.id, species);
    const escapedSpecies = speciesText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    form = form.replace(/\bForme?\b/gi, '')
        .replace(new RegExp('(^|\\s)' + escapedSpecies + '(?=\\s|$)', 'gi'), '$1')
        .replace(/\s+/g, ' ').trim();
    const hiddenPowerType = GetRaidLeaderboardHiddenPowerType(pokemon);
    if (hiddenPowerType) form = [form, TranslatedTypeName(hiddenPowerType)].filter(Boolean).join(', ');
    const name = $('<span class="raid-name"></span>').append($('<span class="raid-species"></span>')
        .html(TranslatedSpeciesName(pokemon.id, species, pokemon.shadow)));
    if (form) name.append(' ', $('<span class="raid-form"></span>').text('(' + form + ')'));
    return name;
}

function GetRaidLeaderboardHiddenPowerType(row) {
    return row.hiddenPowerType && row.matchups?.some(matchup =>
        matchup.points > 1e-10 && /^Hidden Power(?: |$)/.test(matchup.fm)) ? row.hiddenPowerType : null;
}

function QueueRaidLeaderboardTierLabels() {
    if (raidLeaderboardTierFrame) return;
    raidLeaderboardTierFrame = requestAnimationFrame(() => {
        raidLeaderboardTierFrame = 0;
        if (!document.getElementById('raid-list')?.checkVisibility()) return;
        const top = Math.max(0, document.querySelector('header').getBoundingClientRect().bottom);
        const labels = [...document.querySelectorAll('#raid-list .raid-tier-band')].map(band => {
            const rect = band.getBoundingClientRect();
            const start = Math.max(rect.top, top), end = Math.min(rect.bottom, innerHeight);
            const label = band.firstElementChild, half = label.offsetHeight / 2;
            const center = end > start ? (start + end) / 2 - rect.top : rect.height / 2;
            return {label, offset:Math.max(half, Math.min(rect.height - half, center))};
        });
        for (const {label, offset} of labels) label.style.top = offset + 'px';
    });
}

/** Use the native Jenks implementation and tier palette without changing Type Rankings. */
function GetRaidLeaderboardTiers(rows) {
    const scored = rows.filter(row => Number.isFinite(row.score) && row.score >= 0)
        .map(row => ({key:row.key, score:Number(row.score.toFixed(9))})).sort((a,b) => b.score - a.score);
    if (!scored.length) return new Map();
    const labels = ['S','A','B','C','D','F'];
    const count = Math.min(labels.length, new Set(scored.map(row => row.score)).size);
    const breaks = jenks_wrapper(scored.map(row => row.score), count);
    return new Map(scored.map(row => {
        const index = breaks.findIndex(boundary => row.score > boundary);
        return [row.key, labels[index < 0 ? count - 1 : index]];
    }));
}

function RaidLeaderboardNumber(number, digits = 1) {
    return number.toLocaleString(currentLocale, {minimumFractionDigits: digits, maximumFractionDigits: digits});
}

function RaidLeaderboardWeight(number) {
    return number.toLocaleString(currentLocale, {maximumFractionDigits:3});
}

function RenderRaidLeaderboard() {
    if (!raidLeaderboardResult) return;
    $('#raid-results').toggleClass('raid-mega-view',!!raidLeaderboardState.includeMegas);
    const rows = raidLeaderboardResult.rows.filter(row => {
        // Both calculation pools retain ordinary attackers for the fixed benchmark.
        // Each visible leaderboard shows only its own category.
        if (!!row.transformed !== !!raidLeaderboardState.includeMegas) return false;
        if (!raidLeaderboardState.shadows && row.shadow) return false;
        if (!raidLeaderboardState.legendaries && row.legendary) return false;
        return true;
    });
    rows.sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
    $('#raid-list').empty();
    let group, previousTier;
    for (const [index, row] of rows.entries()) {
        const tier = raidLeaderboardTiers.get(row.key) || 'F';
        if (tier !== previousTier) {
            group = $('<div class="raid-tier-group" role="group"></div>')
                .attr({'data-tier':tier, 'aria-label':RaidLeaderboardText('tier') + ' ' + tier});
            group.append($('<div class="raid-tier-band tier-label" aria-hidden="true"></div>')
                .addClass('tier-' + tier).append($('<span class="raid-tier-letter"></span>').text(tier)));
            $('#raid-list').append(group);
            previousTier = tier;
        }
        const entry = $('<details class="raid-entry"></details>').attr('data-key', row.key)
            .toggleClass('raid-entry-even', index % 2 === 1);
        const summary = $('<summary class="raid-grid"></summary>');
        summary.append($('<span class="raid-tier" aria-hidden="true"></span>'));
        summary.append($('<span class="raid-rank"></span>').text(index + 1));
        const coords = GetPokemonIconCoords(row.id, row.form);
        summary.append($('<span class="raid-sprite-slot" aria-hidden="true"></span>').append(
            $('<span class="raid-sprite pokemon-icon"></span>').css({
                backgroundImage:'url("' + ICONS_URL + '")', backgroundPosition:coords.x + 'px ' + coords.y + 'px',
            })));
        const name = RaidLeaderboardName(row, raidLeaderboardState.includeMegas);
        summary.append(name);
        const score = $('<span class="raid-score"></span>').attr('title', RaidLeaderboardText('points-title', {
            points: RaidLeaderboardNumber(row.points, 2),
        }));
        score.append($('<span class="raid-score-fill"></span>').css('width', Math.min(100, row.score) + '%'));
        score.append($('<strong></strong>').text(RaidLeaderboardNumber(row.score)));
        summary.append(score);
        entry.append(summary);
        entry.on('toggle', function() {
            if (this.open && !this.querySelector('.raid-breakdown')) entry.append(BuildRaidLeaderboardBreakdown(row));
            QueueRaidLeaderboardTierLabels();
        });
        group.append(entry);
    }
    $('#raid-empty').prop('hidden', rows.length > 0);
    QueueRaidLeaderboardTierLabels();
}

function BuildRaidLeaderboardBreakdown(row) {
    const container = $('<div class="raid-breakdown"></div>');
    const pokemonLink = $('<a class="raid-pokemon-link"></a>').attr('href', `?p=${row.id}&f=${row.form}`)
        .text(RaidLeaderboardText('open-pokemon'));
    pokemonLink.on('click', event => {
        event.preventDefault();
        LoadPokedexAndUpdateURL(GetPokeDexMon(row.id, row.form, row.level));
    });
    container.append(pokemonLink);
    container.append($('<p class="raid-muted"></p>').text(RaidLeaderboardText('build-level', {level: row.level})));
    if (row.transformed) {
        container.append($('<p class="raid-xl-summary"></p>').text(RaidLeaderboardText('mega-coverage-detail',{
            strong:RaidLeaderboardWeight(row.near), positive:RaidLeaderboardWeight(row.positive)})));
        if (row.xlProjected) container.append($('<p class="raid-muted"></p>').text(XLText('projected-count',{count:row.xlProjected})));
    }
    if (row.projectedLevel) container.append($('<p class="raid-muted"></p>').text(AuditText('projected-level-note')));
    container.append($('<p></p>').text(RaidLeaderboardText('entry-summary', {
        points: RaidLeaderboardNumber(row.points, 2), lead: RaidLeaderboardNumber(row.lead),
    })));
    container.append($('<p class="raid-muted"></p>').text(RaidLeaderboardText('moves-note', {
        reference: RaidLeaderboardText('reference-non-mega')})));
    if (GetRaidLeaderboardHiddenPowerType(row)) {
        container.append($('<p class="raid-fixed-note"></p>').text(RaidLeaderboardText('hp-note', {
            type: TranslatedTypeName(row.hiddenPowerType),
        })));
        const variants = $('<details class="raid-variants"></details>');
        variants.append($('<summary></summary>').text(RaidLeaderboardText('other-hp')));
        const list = $('<ul></ul>');
        for (const variant of row.variants) list.append($('<li></li>').text(
            `${TranslatedTypeName(variant.hiddenPowerType)}: ${RaidLeaderboardNumber(variant.points, 2)} ${RaidLeaderboardText('points')}`));
        variants.append(list);
        container.append(variants);
    }
    const list = $('<div class="raid-matchups"></div>');
    const matchups = row.matchups.filter(matchup => matchup.points > 1e-10)
        .sort((a, b) => b.weightedPoints - a.weightedPoints || b.ratio - a.ratio || a.bossIndex - b.bossIndex);
    for (const matchup of matchups) {
        const boss = raidLeaderboardMatrix.bosses[matchup.bossIndex];
        const item = $('<div class="raid-matchup"></div>').attr('data-boss', `${boss.id}/${boss.form}`);
        const link = $('<a class="raid-boss-link"></a>').attr('href', `?p=${boss.id}&f=${boss.form}`)
            .append(RaidLeaderboardName(boss));
        link.on('click', event => {
            event.preventDefault();
            LoadPokedexAndUpdateURL(GetPokeDexMon(boss.id, boss.form));
        });
        const points = $('<strong class="raid-matchup-points"></strong>').text(
            RaidLeaderboardText('points-title', {points: RaidLeaderboardNumber(matchup.weightedPoints, 2)}));
        item.append(link, points);
        item.append($('<span class="raid-catch-label"></span>').text(XLText('catch-label',{pokemon:RaidCatchEncounterText(boss.catch)})));
        if (row.xlProfile?.types.length || row.xlProfile?.status === 'unknown')
            item.append($('<span class="raid-xl-status"></span>').text(CatchXLMatchText(matchup.xl))
                .toggleClass('xl-projected',!!matchup.xl?.projected));
        item.append($('<span class="raid-matchup-rating"></span>').text(
            `${RaidLeaderboardNumber(100 * matchup.ratio)}% · eDPS ${RaidLeaderboardNumber(matchup.edps, 2)}`));
        item.append($('<span class="raid-matchup-rating"></span>').text(RaidLeaderboardText('boss-weight', {
            weight: RaidLeaderboardNumber(raidLeaderboardResult.weights[matchup.bossIndex], 3),
            group: GetRaidGroupLabel(boss, raidLeaderboardState.weighting)})));
        const moves = $('<span class="raid-matchup-moves"></span>');
        for (const kind of ['fm', 'cm']) {
            moves.append(GetMoveLink(matchup[kind], matchup[kind + 'Type'], matchup[kind + 'Elite']));
        }
        item.append(moves);
        list.append(item);
    }
    container.append(list);
    return container;
}
