let raidLeaderboardWorker = null;
let raidLeaderboardReject = null;
let raidLeaderboardRequest = 0;
let raidLeaderboardCache = null;
let raidLeaderboardMatrix = null;
let raidLeaderboardResult = null;
let raidLeaderboardVisible = 25;
let raidLeaderboardState = {};

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
    return {pokemon, fastMoves: structuredClone(jb_fm), chargedMoves: structuredClone(jb_cm), settings: {
        levels: [...settings_default_level], xlBudget: settings_xl_budget,
        team: settings_team_size_normal, relobby: settings_relobbytime, party: settings_party_size,
        newDps: settings_newdps, pveTurns: settings_pve_turns, megaLevel: settings_supermega_level,
        estimatedY: estimated_y_numerator,
        includeUnreleased, preview: includeUnreleased && settings_speculative,
    }};
}

function BindRaidLeaderboard() {
    $('#raid-audit-link').on('click', event => { event.preventDefault(); LoadDataAuditAndUpdateURL(); });
    $('#raid-unreleased').on('change', function() {
        SetIncludeUnreleased(this.checked);
        raidLeaderboardState.unreleased = this.checked;
        UpdateRaidLeaderboardURL();
        LoadRaidLeaderboard();
    });
    $('#raid-progress').attr('aria-label', RaidLeaderboardText('progress-label'));
    $('#raid-search').on('input', function() {
        raidLeaderboardState.query = this.value;
        raidLeaderboardVisible = 25;
        RenderRaidLeaderboard();
    });
    $('#raid-floor, #raid-weighting').on('change', function() {
        raidLeaderboardState.floor = Number($('#raid-floor').val());
        raidLeaderboardState.weighting = $('#raid-weighting').val();
        UpdateRaidLeaderboardURL();
        RefreshRaidLeaderboardScores();
    });
    $('#raid-shadows, #raid-legendaries').on('change', function() {
        raidLeaderboardState.shadows = $('#raid-shadows').is(':checked');
        raidLeaderboardState.legendaries = $('#raid-legendaries').is(':checked');
        UpdateRaidLeaderboardURL();
        raidLeaderboardVisible = 25;
        RenderRaidLeaderboard();
    });
    $('#raid-more').on('click', function() { raidLeaderboardVisible += 25; RenderRaidLeaderboard(); });
    $('#raid-retry').on('click', () => LoadRaidLeaderboard());
    $('#raid-column-headings button').on('click', function() {
        raidLeaderboardState.sort = this.dataset.sort;
        raidLeaderboardVisible = 25;
        RenderRaidLeaderboard();
    });
    $('#raid-rankings-back').on('click', function(event) {
        event.preventDefault();
        LoadStrongestAndUpdateURL('Any');
    });
}

function UpdateRaidLeaderboardURL() {
    const params = new URLSearchParams();
    params.set('leaderboard', '');
    if (raidLeaderboardState.unreleased) params.set('unreleased', '');
    if (raidLeaderboardState.floor !== 80) params.set('floor', raidLeaderboardState.floor);
    if (['forms', 'species'].includes(raidLeaderboardState.weighting)) params.set('weight', raidLeaderboardState.weighting);
    if (!raidLeaderboardState.shadows) params.set('no-shadows', '');
    if (!raidLeaderboardState.legendaries) params.set('no-legendaries', '');
    UpdateURL('?' + params.toString());
}

function LoadRaidLeaderboardAndUpdateURL() {
    UpdateURL(GetIncludeUnreleased() ? '?leaderboard&unreleased' : '?leaderboard');
    return LoadRaidLeaderboard();
}

async function LoadRaidLeaderboard() {
    CancelRaidLeaderboardLoad();
    const request = raidLeaderboardRequest;
    if (!await LoadPage('raid-leaderboard') || request !== raidLeaderboardRequest) return;
    const params = new URLSearchParams(location.search);
    if (!params.has('leaderboard')) return;
    raidLeaderboardState = {
        unreleased: params.has('unreleased'),
        floor: [70, 80, 90].includes(Number(params.get('floor'))) ? Number(params.get('floor')) : 80,
        weighting: ['forms', 'species'].includes(params.get('weight')) ? params.get('weight') : 'groups',
        shadows: !params.has('no-shadows'), legendaries: !params.has('no-legendaries'),
        query: '', sort: 'score',
    };
    SetIncludeUnreleased(raidLeaderboardState.unreleased);
    $('#raid-floor').val(raidLeaderboardState.floor);
    $('#raid-weighting').val(raidLeaderboardState.weighting);
    $('#raid-shadows').prop('checked', raidLeaderboardState.shadows);
    $('#raid-legendaries').prop('checked', raidLeaderboardState.legendaries);
    $('#raid-search').val('');
    $('#raid-data-scope').text(RaidLeaderboardText(raidLeaderboardState.unreleased
        ? (settings_speculative ? 'scope-preview' : 'scope-unreleased') : 'scope-released'));
    document.title = RaidLeaderboardText('meta-title');
    $('meta[name=description]').attr('content', RaidLeaderboardText('meta-description'));
    $('#raid-results, #raid-retry').prop('hidden', true);
    $('#raid-progress').prop('hidden', false).val(0);
    $('#raid-status').attr('role', 'status').text(RaidLeaderboardText('preparing'));
    $('#raid-leaderboard').attr('aria-busy', 'true');
    raidLeaderboardMatrix = null;
    raidLeaderboardResult = null;
    try {
        const snapshot = GetRaidLeaderboardSnapshot();
        const key = JSON.stringify(snapshot);
        let matrix;
        if (raidLeaderboardCache?.key === key) matrix = raidLeaderboardCache.matrix;
        else {
            matrix = await new Promise((resolve, reject) => {
                const worker = new Worker('scripts/raid-leaderboard-worker.js?v=eaaa647e064e');
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
            raidLeaderboardCache = {key, matrix};
        }
        if (request !== raidLeaderboardRequest) return;
        raidLeaderboardMatrix = matrix;
        const settings = matrix.settings;
        $('#raid-settings-summary').text(RaidLeaderboardText('settings-summary', {
            level: settings.xlBudget ? '40 / 50' : settings.levels.join(' / '),
            team: settings.team, relobby: settings.relobby,
            party: settings.party === 1 ? RaidLeaderboardText('off') : settings.party,
        }));
        $('#raid-data-scope').text(RaidLeaderboardText(settings.includeUnreleased
            ? (settings.preview ? 'scope-preview' : 'scope-unreleased') : 'scope-released'));
        RefreshRaidLeaderboardScores();
        $('#raid-progress').prop('hidden', true);
        $('#raid-results').prop('hidden', false);
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
    raidLeaderboardResult = ScoreRaidMatrix(raidLeaderboardMatrix, raidLeaderboardState);
    raidLeaderboardVisible = 25;
    $('#raid-status').text(RaidLeaderboardText('pool', {
        forms: raidLeaderboardResult.bossCount, groups: raidLeaderboardResult.groupCount,
    }));
    $('#raid-method-summary').text(RaidLeaderboardText('method-summary', {floor: raidLeaderboardState.floor}));
    $('#raid-weight-summary').text(RaidLeaderboardText('weight-' + raidLeaderboardState.weighting + '-note'));
    RenderRaidLeaderboard();
}

function RaidLeaderboardName(pokemon) {
    const name = $('<span class="raid-name"></span>').html(TranslatedSpeciesName(pokemon.id, pokemon.name, pokemon.shadow));
    const form = GetFormText(pokemon.id, pokemon.form);
    if (form) name.append($('<small class="raid-form"></small>').text(form));
    return name;
}

function RaidLeaderboardNumber(number, digits = 1) {
    return number.toLocaleString(currentLocale, {minimumFractionDigits: digits, maximumFractionDigits: digits});
}

function RenderRaidLeaderboard() {
    if (!raidLeaderboardResult) return;
    const tokens = raidLeaderboardState.query.trim().split(/\s+/).filter(Boolean).map(CleanPokeName);
    const rows = raidLeaderboardResult.rows.filter(row => {
        if (!raidLeaderboardState.shadows && row.shadow) return false;
        if (!raidLeaderboardState.legendaries && row.legendary) return false;
        const localized = RaidLeaderboardName(row).text();
        const haystack = CleanPokeName([localized, row.name, row.form, row.shadow ? 'Shadow' : '', row.id].join(' '));
        return tokens.every(token => haystack.includes(token));
    });
    const sort = raidLeaderboardState.sort;
    rows.sort((a, b) => b[sort] - a[sort] || b.points - a.points || a.key.localeCompare(b.key));
    $('#raid-column-headings button').each(function() {
        this.setAttribute('aria-pressed', String(this.dataset.sort === sort));
    });
    $('#raid-list').empty();
    for (const [index, row] of rows.slice(0, raidLeaderboardVisible).entries()) {
        const entry = $('<details class="raid-entry"></details>').attr('data-key', row.key);
        const summary = $('<summary class="raid-grid"></summary>');
        summary.append($('<span class="raid-rank"></span>').text(index + 1));
        const name = RaidLeaderboardName(row);
        if (row.hiddenPowerType) name.append($('<small class="raid-fixed-type"></small>').text(
            RaidLeaderboardText('fixed-hp', {type: TranslatedTypeName(row.hiddenPowerType)})));
        summary.append(name);
        const score = $('<span class="raid-score"></span>').attr('title', RaidLeaderboardText('points-title', {
            points: RaidLeaderboardNumber(row.points, 2),
        }));
        score.append($('<span class="raid-score-fill"></span>').css('width', row.score + '%'));
        score.append($('<strong></strong>').text(RaidLeaderboardNumber(row.score)));
        summary.append(score, $('<span></span>').text(row.first), $('<span></span>').text(row.near));
        entry.append(summary);
        entry.on('toggle', function() {
            if (this.open && !this.querySelector('.raid-breakdown')) entry.append(BuildRaidLeaderboardBreakdown(row));
        });
        $('#raid-list').append(entry);
    }
    $('#raid-empty').prop('hidden', rows.length > 0);
    $('#raid-more').prop('hidden', rows.length <= raidLeaderboardVisible);
    $('#raid-result-count').text(RaidLeaderboardText('result-count', {
        shown: Math.min(rows.length, raidLeaderboardVisible), total: rows.length,
    }));
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
    container.append($('<p></p>').text(RaidLeaderboardText('entry-summary', {
        points: RaidLeaderboardNumber(row.points, 2), lead: RaidLeaderboardNumber(row.lead),
    })));
    container.append($('<p class="raid-muted"></p>').text(RaidLeaderboardText('moves-note')));
    if (row.hiddenPowerType) {
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
        item.append($('<span class="raid-matchup-rating"></span>').text(
            `${RaidLeaderboardNumber(100 * matchup.ratio)}% · eDPS ${RaidLeaderboardNumber(matchup.edps, 2)}`));
        item.append($('<span class="raid-matchup-rating"></span>').text(RaidLeaderboardText('boss-weight', {
            weight: RaidLeaderboardNumber(raidLeaderboardResult.weights[matchup.bossIndex], 3),
            group: GetRaidGroupLabel(boss, raidLeaderboardState.weighting)})));
        const moves = $('<span class="raid-matchup-moves"></span>');
        for (const kind of ['fm', 'cm']) {
            const move = jb_fm.concat(jb_cm).find(move => move.name === matchup[kind]);
            moves.append($('<span class="type-text"></span>').addClass('bg-' + matchup[kind + 'Type'])
                .text(TranslatedMoveName(move?.id, matchup[kind + 'Type'], matchup[kind]) + (matchup[kind + 'Elite'] ? '*' : '')));
        }
        item.append(moves);
        list.append(item);
    }
    container.append(list);
    return container;
}
