/* Inspect the source flags and the effective ranking data without editing them. GPL-3.0. */
let dataAuditState = {};
let dataAuditContext = null;

function AuditText(key, params = {}) {
    return FormatTranslation('data-audit.' + key, params);
}

function AuditYesNo(value) {
    return AuditText(value === true ? 'yes' : value === false ? 'no' : 'unknown');
}

function AuditStatText(stats) {
    return stats ? ['baseAttack', 'baseDefense', 'baseStamina'].map(key => stats[key] ?? '?').join(' / ') : AuditText('unknown');
}

function GetRaidGroupLabel(pokemon, weighting = 'groups') {
    if (GetRaidGroupKey(pokemon, weighting).startsWith('species:'))
        return TranslatedSpeciesName(pokemon.id) + ' · ' + AuditText('all-forms');
    const form = GetFormText(pokemon.id, pokemon.form);
    return TranslatedSpeciesName(pokemon.id, pokemon.name) + (form ? ' · ' + form : '');
}

function BuildPokemonAuditContext() {
    const manifest = jb_audit_manifest || {};
    const source = typeof jb_source_pkm !== 'undefined' && jb_source_pkm ? jb_source_pkm : GetCalculationPokemon(false);
    const current = ApplyPokemonAuditOverrides(structuredClone(source), manifest);
    const currentMap = new Map(current.map(pokemon => [PokemonDataKey(pokemon), pokemon]));
    const previewMap = new Map(current.map(pokemon => [PokemonDataKey(pokemon), structuredClone(pokemon)]));
    for (const patch of jb_spec || []) {
        const key = PokemonDataKey(patch);
        const pokemon = {...previewMap.get(key), ...structuredClone(patch)};
        previewMap.set(key, MarkPokemonMovePlaceholder(pokemon, !currentMap.has(key)));
    }
    ApplyPokemonAuditOverrides([...previewMap.values()], manifest);
    const includeUnreleased = GetIncludeUnreleased();
    const includeMegas = typeof GetRaidLeaderboardIncludeMegas === 'function' && GetRaidLeaderboardIncludeMegas();
    const preview = includeUnreleased && settings_speculative;
    const bosses = GetRaidBosses(null, null, includeUnreleased);
    const {weights, groupCount} = GetRaidBossWeights(bosses);
    return {manifest, currentMap, previewMap, includeUnreleased, includeMegas, preview, groupCount,
        catchRoster:[...GetCalculationPokemon(includeUnreleased),...previewMap.values()],
        sourceMap: new Map(source.map(pokemon => [PokemonDataKey(pokemon), pokemon])),
        selectedMap: new Map(GetCalculationPokemon(includeUnreleased).map(pokemon => [PokemonDataKey(pokemon), pokemon])),
        weightMap: new Map(bosses.map((pokemon, index) => [PokemonDataKey(pokemon), weights[index]]))};
}

function GetPokemonAuditInfo(id, form, context) {
    const key = PokemonDataKey({id, form});
    const source = context.sourceMap.get(key);
    const current = context.currentMap.get(key);
    const preview = context.previewMap.get(key);
    const selected = context.selectedMap.get(key);
    const display = jb_pkm.find(pokemon => pokemon.id === id && pokemon.form === form) || preview || source;
    if (!display) return null;
    const supported = GetPokemonForms(id).includes(form);
    const quality = GetPokemonDataQuality(selected || display);
    const reasons = [];
    if (!supported) reasons.push('unsupported');
    if (!selected && supported) reasons.push('preview-only');
    else if (!context.includeUnreleased && !current?.released) reasons.push('unreleased');
    if ((selected || display)._raidRestriction) reasons.push((selected || display)._raidRestrictionCode || 'raid-restricted');
    if (!quality.usable) reasons.push(quality.code);
    const tier = (selected || preview || current || display).raid_tier;
    const bossReasons = [...reasons];
    if (!tier) bossReasons.push('no-raid-tag');
    else if (tier < 4) bossReasons.push('below-cutoff');
    const corrections = (context.manifest.corrections || []).filter(rule => PokemonAuditRuleMatches(rule, display));
    const restrictions = (context.manifest.restrictions || []).filter(rule => PokemonAuditRuleMatches(rule, display));
    const statReview = (context.manifest.statReviews || []).find(rule => PokemonAuditRuleMatches(rule, display));
    const releaseReview = (context.manifest.releaseReviews || []).find(rule => PokemonAuditRuleMatches(rule, display));
    const applied = (selected || display)._auditCorrections || current?._auditCorrections || [];
    const evidence = !tier ? 'no-raid-tag' : corrections.some(rule => Object.hasOwn(rule.values, 'raid_tier'))
        ? 'verified' : releaseReview?.raidStatus === 'announced' ? 'announced'
        : !current?.released ? 'projected' : 'source-tag';
    const projectedStats = statReview?.kind === 'projection' || !source;
    const statsChanged = statReview && ['baseAttack', 'baseDefense', 'baseStamina']
        .some(stat => display.stats?.[stat] !== statReview.expected[stat]);
    const mega = IsMegaPrimalUltraForm(display);
    const levelPokemon = selected || display;
    const attackerLevels = [...new Set(settings_default_level.map(level =>
        GetAttackerLevel(levelPokemon, level, context.includeUnreleased)))];
    const projectedLevel = UsesProjectedAttackerLevel(levelPokemon, context.includeUnreleased);
    const plusMove = typeof GetPlusMoveProjectionInfo === 'function'
        ? GetPlusMoveProjectionInfo(selected || display, context.includeUnreleased && !!selected) : null;
    const encounter = typeof GetRaidCatchEncounter === 'function' && (tier || mega)
        ? GetRaidCatchEncounter(selected || display,context.catchRoster) : null;
    const xlProfile = typeof GetCatchXLBoostProfile === 'function' ? GetCatchXLBoostProfile(selected || display) : null;
    return {id, form, key, source, current, currentReleased: current?.released ?? (preview ? false : undefined),
        preview, selected, display, supported, quality, reasons, bossReasons,
        tier, corrections, restrictions, statReview, releaseReview, applied, evidence, projectedStats, statsChanged,
        weight: context.weightMap.get(key) || 0, group: GetRaidGroupKey(display),
        attackerIncluded: !reasons.length, leaderboardIncluded: !reasons.length && (!mega || !!context.includeMegas),
        bossIncluded: !bossReasons.length, mega, attackerLevels, projectedLevel, plusMove, encounter, xlProfile};
}

function AuditRankingReason(reasons) {
    return reasons.length ? [...new Set(reasons)].map(reason => AuditText(reason)).join(' · ') : AuditText('included');
}

function AuditLeaderboardReason(info, context) {
    return !info.reasons.length && info.mega && !context.includeMegas
        ? AuditText('mega-attacker') : AuditRankingReason(info.reasons);
}

function AuditRaidProfile(info) {
    if (!info.tier || !info.display.stats) return AuditText('no-raid-tag');
    const stats = GetRaidStats(info.selected || info.display, info.tier);
    return AuditText('raid-profile', {tier: info.tier, hp: stats.hp ?? '?',
        format: AuditText(info.tier >= 8 ? 'super-mega' : info.tier === 6 ? 'mega-legendary' : 'standard-raid')});
}

function AuditStatSource(info) {
    if (info.statReview?.kind === 'projection' || !info.source) return AuditText('projected-stats');
    if (info.statReview?.kind === 'game-data-placeholder') return AuditText('game-data-placeholder');
    return AuditText('upstream-stats');
}

function BuildPokemonAuditDetails(info, context) {
    const container = $('<div class="audit-details"></div>');
    const fields = $('<dl class="audit-fields"></dl>');
    const add = (key, value) => fields.append($('<dt></dt>').text(AuditText(key)), $('<dd></dd>').text(value));
    add('released', AuditYesNo(info.currentReleased));
    add('source-released', AuditYesNo(info.source?.released));
    add('shadow-available', AuditYesNo(info.current?.shadow ?? info.preview?.shadow));
    if (info.selected && info.current && info.selected.shadow !== info.current.shadow)
        add('shadow-calculation', AuditYesNo(info.selected.shadow));
    add('preview-available', AuditYesNo(info.preview?.released));
    add('raid-tag', info.tier ? AuditText('tier', {tier: info.tier}) : AuditText('no-raid-tag'));
    add('source-raid-tag', info.source?.raid_tier ? AuditText('tier', {tier: info.source.raid_tier}) : AuditText('no-raid-tag'));
    add('raid-evidence', AuditText(info.evidence));
    add('profile', AuditRaidProfile(info));
    if (info.tier >= 8) add('mega-support', AuditText('mega-support-note'));
    add('support', AuditYesNo(info.supported));
    add('move-data', AuditText(info.quality.code));
    add('attacker-pool', AuditRankingReason(info.reasons));
    add('leaderboard-pool', AuditLeaderboardReason(info, context));
    add('boss-pool', AuditRankingReason(info.bossReasons));
    add('group', GetRaidGroupLabel(info.display));
    add('weight', info.weight ? info.weight.toLocaleString(currentLocale, {maximumFractionDigits: 6}) : '0');
    add('stats', AuditStatText(info.display.stats));
    add('ranking-stats', AuditStatText(info.selected?.stats));
    add('attacker-levels', info.attackerLevels.map(level => 'L' + level).join(' / '));
    if (info.projectedLevel) add('level-rule', AuditText('projected-level-note'));
    if (info.plusMove) {
        const plus = info.plusMove;
        add('plus-move', plus.rule.move || AuditText('plus-unassigned'));
        add('plus-status', AuditText('plus-' + plus.status));
        if (plus.move) {
            add('plus-power', FormatTranslation('plus-moves.power-detail', {power: plus.move.power,
                kind: GetTranslation('plus-moves.power-' + plus.powerKind), level: settings_supermega_level,
                effective: Number(ProcessPower(plus.move).toFixed(4))}));
            if (plus.move._plus_projection) add('plus-assumptions', PlusMoveProjectionSummary(plus.move));
        }
        if (plus.status !== 'source') add('plus-assignment', plus.rule.assignmentEvidence);
    }
    if (info.encounter || info.xlProfile?.types.length) {
        const addXL = (key,value)=>fields.append($('<dt></dt>').text(XLText(key)),$('<dd></dd>').text(value));
        if (info.encounter) {
            addXL('encounter',RaidCatchEncounterText(info.encounter));
            addXL('encounter-status',XLText('status-'+info.encounter.status));
        }
        if (info.xlProfile?.types.length) {
            addXL('boost-types',CatchXLTypeText(info.xlProfile.types));
            addXL('profile-status',XLText('status-'+info.xlProfile.status));
            addXL('minimum-level',info.xlProfile.minLevel == null ? XLText('level-unknown') : '≥'+info.xlProfile.minLevel);
        }
    }
    add('stat-source', AuditStatSource(info));
    if (info.statReview && context.manifest.checkedGameMaster)
        add('snapshot', context.manifest.checkedGameMaster.date.slice(0, 10) + ' · ' + context.manifest.checkedGameMaster.sha.slice(0, 8));
    if (info.statReview?.forecast) add('forecast', AuditStatText(info.statReview.forecast));
    add('scope', AuditText(context.preview ? 'scope-preview' : context.includeUnreleased ? 'scope-future' : 'scope-current'));
    container.append(fields);
    if (info.statsChanged) container.append($('<p class="audit-warning"></p>').text(AuditText('stats-changed')));
    const notes = [...info.corrections, ...info.restrictions, info.statReview, info.releaseReview].filter(Boolean);
    if (info.encounter?.note) notes.push(info.encounter);
    if (info.xlProfile?.note) notes.push(info.xlProfile);
    for (const note of notes) container.append($('<p class="audit-note"></p>').text(note.reason || note.note));
    if (info.applied.length) container.append($('<p class="audit-note"></p>').text(AuditText('corrected', {
        fields: [...new Set(info.applied.flatMap(correction => correction.fields))].join(', ')})));
    const sources = $('<div class="audit-sources"></div>');
    sources.append($('<span></span>').text(AuditText('sources') + ': '));
    const urls = new Set(notes.flatMap(note => note.sources || []));
    for (const url of info.plusMove?.rule.sources || []) urls.add(url);
    urls.add('https://github.com/mgrann03/pokemon-resources/blob/main/'
        + (info.source ? 'pogo_pkm.json' : 'pogo_pkm_manual_announced.json'));
    for (const url of urls) {
        const label = url.includes('PokeMiners/') ? 'game-master-link' : url.includes('smogon/') ? 'main-series-link'
            : url.includes('mgrann03/') ? 'upstream-link' : new URL(url).hostname === 'pokemongo.com' ? 'official-link' : 'release-link';
        sources.append($('<a target="_blank" rel="noopener noreferrer"></a>').attr('href', url).text(AuditText(label)));
    }
    container.append(sources);
    const actions = $('<div class="audit-actions"></div>');
    if (info.supported) actions.append($('<a></a>').attr('href', `?p=${info.id}&f=${encodeURIComponent(info.form)}`)
        .text(AuditText('open-pokemon')).on('click', event => {
            event.preventDefault();
            LoadPokedexAndUpdateURL(GetPokeDexMon(info.id, info.form));
        }));
    const copy = $('<button type="button" class="audit-copy"></button>').text(AuditText('copy'));
    const status = $('<span class="audit-copy-status" role="status" aria-live="polite"></span>');
    copy.on('click', () => CopyPokemonAuditDetails(info, context, copy, status, container));
    actions.append(copy, status);
    return container.append(actions);
}

function PokemonAuditCopyText(info, context) {
    const url = new URL(location.href);
    url.search = new URLSearchParams({p: info.id, f: info.form}).toString();
    url.hash = '';
    return [
        'DialgaDex data review', `Pokémon: #${info.id} ${info.display.name} (${info.form})`, `URL: ${url}`,
        `Loaded at: ${new Date().toISOString()}; local review: ${context.manifest.reviewed || 'unknown'}`,
        `Released: ${AuditYesNo(info.currentReleased)}; upstream: ${AuditYesNo(info.source?.released)}`,
        `Shadow available: ${AuditYesNo(info.current?.shadow ?? info.preview?.shadow)}`,
        `Shadow flag in selected calculations: ${AuditYesNo(info.selected?.shadow)}`,
        `Preview availability: ${AuditYesNo(info.preview?.released)}`,
        `Raid tag: ${info.tier || 'none'}; upstream tag: ${info.source?.raid_tier || 'none'}; evidence: ${info.evidence}`,
        `Raid profile: ${AuditRaidProfile(info)}`,
        `Moves: ${AuditText(info.quality.code)}; fast: ${(info.display.fm || []).join(', ')}; charged: ${(info.display.cm || []).join(', ')}`,
        `Attacker pool: ${AuditRankingReason(info.reasons)}`,
        `Raid leaderboard: ${AuditLeaderboardReason(info, context)}; Mega/Primal/Ultra option: ${!!context.includeMegas}`,
        `Boss pool: ${AuditRankingReason(info.bossReasons)}`,
        `Default group: ${info.group}; weight in selected pool: ${info.weight}`,
        `Stats (Attack/Defense/Stamina): ${AuditStatText(info.display.stats)}; ${AuditStatSource(info)}`,
        `Ranking stats (Attack/Defense/Stamina): ${AuditStatText(info.selected?.stats)}`,
        `Default attacker levels: ${info.attackerLevels.map(level => 'L' + level).join(', ')}${info.projectedLevel ? '; projected +2 levels' : ''}`,
        ...(info.encounter ? ['Raid catch mapping: '+JSON.stringify(info.encounter)] : []),
        ...(info.xlProfile?.types.length ? ['Catch XL boost profile: '+JSON.stringify(info.xlProfile)] : []),
        ...(info.plusMove ? [
            `+move: ${info.plusMove.rule.move || 'unassigned'}; ${AuditText('plus-' + info.plusMove.status)}`,
            ...(info.plusMove.move ? [`+move base power: ${info.plusMove.move.power} (${info.plusMove.powerKind}); energy: ${info.plusMove.move.energy_delta}; duration: ${info.plusMove.move.duration} ms; effective power at Mega level ${settings_supermega_level}: ${ProcessPower(info.plusMove.move)}`] : []),
            ...(info.plusMove.move?._plus_projection ? [PlusMoveProjectionSummary(info.plusMove.move)] : []),
            `Saved assignment evidence: ${info.plusMove.rule.assignmentEvidence}`,
            ...(info.plusMove.rule.sources || [])] : []),
        ...(['fm_add','cm_add','fm_rem','cm_rem'].some(key => info.selected?.[key]?.length)
            ? ['Custom move edits: ' + JSON.stringify(Object.fromEntries(['fm_add','cm_add','fm_rem','cm_rem']
                .filter(key => info.selected[key]).map(key => [key, info.selected[key]])))] : []),
        ...(info.statReview ? [`Checked Game Master snapshot: ${JSON.stringify(context.manifest.checkedGameMaster)}`] : []),
        ...(info.statReview?.forecast ? [`Separate hypothetical forecast: ${AuditStatText(info.statReview.forecast)}`] : []),
        `Scope: ${AuditText(context.preview ? 'scope-preview' : context.includeUnreleased ? 'scope-future' : 'scope-current')}`,
        ...[...info.corrections, ...info.restrictions, info.statReview, info.releaseReview].filter(Boolean)
            .flatMap(note => [note.reason || note.note, ...(note.sources || [])]),
        'Source dataset: https://github.com/mgrann03/pokemon-resources',
        'Correction to review: '
    ].join('\n');
}

async function CopyPokemonAuditDetails(info, context, button, status, container) {
    const text = PokemonAuditCopyText(info, context);
    container.find('.audit-copy-fallback').remove();
    button.prop('disabled', true);
    try {
        let copied = false;
        if (navigator.clipboard?.writeText) {
            try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { /* Use selection fallback. */ }
        }
        if (!copied) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('aria-label', AuditText('copy'));
            container.append(textarea);
            textarea.select();
            try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
            if (copied) textarea.remove();
            else { textarea.className = 'audit-copy-fallback'; textarea.readOnly = true; }
        }
        status.text(AuditText(copied ? 'copied' : 'copy-manually'));
    } finally { button.prop('disabled', false); }
}

function RenderPokemonDataDetails(id, form) {
    const target = $('#pokemon-data-details').empty();
    const context = BuildPokemonAuditContext();
    const info = GetPokemonAuditInfo(id, form, context);
    if (!info) { target.prop('hidden', true); return; }
    target.prop('hidden', false);
    const details = $('<details class="audit-pokemon-details"></details>');
    details.append($('<summary></summary>').text(AuditText('details')
        + (info.reasons.includes('max-battle-only') ? ' · ' + AuditText('max-battle-only')
            : !info.quality.usable ? ' · ' + AuditText(info.quality.code)
            : info.projectedStats || info.projectedLevel || info.plusMove?.move?._plus_projection ? ' · ' + AuditText('projected') : '')));
    details.append(BuildPokemonAuditDetails(info, context));
    const audit = $('<a class="audit-all-link"></a>').attr('href', '?audit&q=' + id).text(AuditText('open-audit'));
    audit.on('click', event => { event.preventDefault(); LoadDataAuditAndUpdateURL(String(id)); });
    target.append(details, audit);
}

function BindDataAudit() {
    $('#audit-search').on('input', function() { dataAuditState.query = this.value; RefreshDataAudit(); });
    $('#audit-availability, #audit-raids, #audit-quality').on('change', function() {
        dataAuditState.availability = $('#audit-availability').val();
        dataAuditState.raids = $('#audit-raids').val();
        dataAuditState.quality = $('#audit-quality').val();
        RefreshDataAudit();
    });
    $('#audit-unreleased').on('change', function() {
        SetIncludeUnreleased(this.checked);
        dataAuditContext = BuildPokemonAuditContext();
        RefreshDataAudit();
    });
    $('#audit-more').on('click', () => { dataAuditState.visible += 50; RenderDataAudit(); });
    $('#audit-leaderboard').on('click', event => { event.preventDefault(); LoadRaidLeaderboardAndUpdateURL(); });
}

function UpdateDataAuditURL() {
    const params = new URLSearchParams({audit: ''});
    for (const [key, value] of [['q', dataAuditState.query], ['availability', dataAuditState.availability],
        ['raids', dataAuditState.raids], ['data', dataAuditState.quality]]) {
        if (value && value !== 'all') params.set(key, value);
    }
    if (GetIncludeUnreleased()) params.set('unreleased', '');
    UpdateURL('?' + params);
}

function LoadDataAuditAndUpdateURL(query = '') {
    const params = new URLSearchParams({audit: ''});
    if (query) params.set('q', query);
    if (GetIncludeUnreleased()) params.set('unreleased', '');
    UpdateURL('?' + params);
    return LoadDataAudit();
}

async function LoadDataAudit() {
    if (!await LoadPage('data-audit')) return;
    const params = new URLSearchParams(location.search);
    SetIncludeUnreleased(params.has('unreleased'));
    dataAuditState = {query: params.get('q') || '',
        availability: ['released', 'unreleased'].includes(params.get('availability')) ? params.get('availability') : 'all',
        raids: ['high', 'tagged', 'untagged'].includes(params.get('raids')) ? params.get('raids') : 'all',
        quality: ['incomplete', 'projected', 'plus', 'xl', 'catch-unknown', 'corrected', 'unsupported'].includes(params.get('data')) ? params.get('data') : 'all',
        visible: 50};
    $('#audit-search').val(dataAuditState.query);
    $('#audit-availability').val(dataAuditState.availability);
    $('#audit-raids').val(dataAuditState.raids);
    $('#audit-quality').val(dataAuditState.quality);
    $('#audit-unreleased').prop('checked', GetIncludeUnreleased());
    document.title = AuditText('meta-title');
    $('meta[name=description]').attr('content', AuditText('intro'));
    dataAuditContext = BuildPokemonAuditContext();
    RenderDataAudit();
}

function RefreshDataAudit() {
    dataAuditState.visible = 50;
    UpdateDataAuditURL();
    RenderDataAudit();
}

function RenderDataAudit() {
    if (!dataAuditContext) return;
    const context = dataAuditContext;
    const tokens = dataAuditState.query.trim().split(/\s+/).filter(Boolean).map(CleanPokeName);
    const rows = [...context.previewMap.values()].map(pokemon => GetPokemonAuditInfo(pokemon.id, pokemon.form, context))
        .filter(info => {
            if (dataAuditState.quality !== 'unsupported' && !info.supported) return false;
            if (dataAuditState.availability === 'released' && !info.current?.released) return false;
            if (dataAuditState.availability === 'unreleased' && info.current?.released) return false;
            if (dataAuditState.raids === 'high' && !(info.tier >= 4)) return false;
            if (dataAuditState.raids === 'tagged' && !info.tier) return false;
            if (dataAuditState.raids === 'untagged' && info.tier) return false;
            if (dataAuditState.quality === 'incomplete' && info.quality.usable) return false;
            if (dataAuditState.quality === 'projected' && !info.projectedStats) return false;
            if (dataAuditState.quality === 'plus' && !info.plusMove?.move?._plus_projection) return false;
            if (dataAuditState.quality === 'xl' && !info.xlProfile?.types.length) return false;
            if (dataAuditState.quality === 'catch-unknown' && !['unknown','projected'].includes(info.encounter?.status)) return false;
            if (dataAuditState.quality === 'corrected' && !info.applied.length) return false;
            if (dataAuditState.quality === 'unsupported' && info.supported) return false;
            const name = `${info.id} ${info.display.name} ${info.form} ${TranslatedSpeciesName(info.id, info.display.name)} ${GetFormText(info.id, info.form)}`;
            return tokens.every(token => CleanPokeName(name).includes(token));
        }).sort((a, b) => a.id - b.id || Number(b.form === GetPokemonForms(b.id)[0])
            - Number(a.form === GetPokemonForms(a.id)[0]) || a.form.localeCompare(b.form));
    $('#audit-count').text(AuditText('count', {shown: Math.min(rows.length, dataAuditState.visible), total: rows.length}));
    $('#audit-scope').text(AuditText(context.preview ? 'scope-preview' : context.includeUnreleased ? 'scope-future' : 'scope-current'));
    const list = $('#audit-list').empty();
    for (const info of rows.slice(0, dataAuditState.visible)) {
        const entry = $('<details class="audit-entry"></details>').attr('data-key', info.key);
        const summary = $('<summary></summary>');
        const name = $('<span class="audit-name"></span>').text(`#${info.id} ${TranslatedSpeciesName(info.id, info.display.name)}`);
        name.append($('<small></small>').text(GetFormText(info.id, info.form) || info.form));
        const badges = $('<span class="audit-badges"></span>');
        badges.append($('<span></span>').text(AuditText(info.current?.released ? 'released-short' : 'unreleased-short')));
        if (info.tier) badges.append($('<span></span>').text(AuditText('tier', {tier: info.tier})));
        if (info.reasons.includes('max-battle-only')) badges.append($('<span class="audit-warning"></span>').text(AuditText('max-battle-only')));
        if (!info.quality.usable) badges.append($('<span class="audit-warning"></span>').text(AuditText(info.quality.code)));
        if (info.projectedStats || info.projectedLevel) badges.append($('<span></span>').text(AuditText('projected')));
        if (info.plusMove?.move?._plus_projection) badges.append($('<span></span>').text(AuditText('plus-projected')));
        if (info.applied.length) badges.append($('<span></span>').text(AuditText('corrected-short')));
        summary.append(name, badges);
        entry.append(summary);
        entry.on('toggle', function() {
            if (this.open && !this.querySelector('.audit-details')) entry.append(BuildPokemonAuditDetails(info, context));
        });
        list.append(entry);
    }
    $('#audit-empty').prop('hidden', rows.length !== 0);
    $('#audit-more').prop('hidden', rows.length <= dataAuditState.visible);
}
