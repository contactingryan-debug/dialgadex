/* The same eligible boss forms used by raid rankings, split by current availability. GPL-3.0. */
const BOSS_LIST_CATEGORIES = [
    {key: 'super-mega', hp: 25000},
    {key: 'legendary-mega', hp: 22500},
    {key: 'legendary', hp: 15000},
    {key: 'sub-legendary', hp: 15000},
    {key: 'mythical', hp: 15000},
    {key: 'paradox', hp: 15000},
    {key: 'other', hp: 15000},
    {key: 'mega', hp: 9000},
];

// Boss List display categories follow the user's species list; forms inherit the base species.
// Ultra Beasts stay under Sub-Legendary here. These categories do not change raid eligibility or weights.
const BOSS_LIST_SPECIES_GROUPS = [
    {key: 'legendary', ids: new Set([
        150,249,250,382,383,384,483,484,487,643,644,646,716,717,718,
        789,790,791,792,800,888,889,890,898,1007,1008,1024,
    ])},
    {key: 'sub-legendary', ids: new Set([
        144,145,146,243,244,245,377,378,379,380,381,480,481,482,485,486,488,
        638,639,640,641,642,645,772,773,785,786,787,788,
        793,794,795,796,797,798,799,803,804,805,806,
        891,892,894,895,896,897,905,1001,1002,1003,1004,1014,1015,1016,1017,
    ])},
    {key: 'mythical', ids: new Set([
        151,251,385,386,489,490,491,492,493,494,647,648,649,719,720,721,
        801,802,807,808,809,893,1025,
    ])},
    // The raid pool also contains Paradox species omitted from the supplied lists.
    // Koraidon and Miraidon follow the explicit Legendary classification above.
    {key: 'paradox', ids: new Set([
        984,985,986,987,988,989,990,991,992,993,994,995,1005,1006,1009,1010,1020,1021,1022,1023,
    ])},
];

function GetBossListSpeciesGroup(pokemon) {
    return BOSS_LIST_SPECIES_GROUPS.find(group => group.ids.has(pokemon.id))?.key || 'other';
}

function GetBossListCategory(pokemon) {
    const hp = GetRaidStats(pokemon).hp;
    return hp === 15000 ? GetBossListSpeciesGroup(pokemon)
        : BOSS_LIST_CATEGORIES.find(category => category.hp === hp)?.key;
}

function BossListText(key, params = {}) {
    return FormatTranslation('boss-list.' + key, params);
}

function BossListPokemonName(pokemon) {
    // Source shadow flags describe attacker availability, not a Shadow raid form.
    const name = RaidLeaderboardName({...pokemon, shadow:false}, true).addClass('boss-name');
    const defaultForm = (pokemon.id === 487 && pokemon.form === 'Altered')
        || (pokemon.id === 649 && pokemon.form === 'Normal')
        || ([888,889].includes(pokemon.id) && pokemon.form === 'Hero')
        || ([386,493,773].includes(pokemon.id) && pokemon.form === 'Normal')
        || pokemon.form === 'Incarnate';
    if (defaultForm) {
        const species = name.children('.raid-species');
        return name.empty().append(species);
    }
    let shortForm;
    if ([493,773].includes(pokemon.id) && POKEMON_TYPES.has(pokemon.form))
        shortForm = TranslatedTypeName(pokemon.form);
    else if (pokemon.id === 649 && ['Shock','Burn','Chill','Douse'].includes(pokemon.form))
        shortForm = BossListText('form-' + pokemon.form.toLowerCase());
    else if (pokemon.id === 386 && pokemon.form === 'Defense')
        shortForm = BossListText('form-defense');
    if (shortForm) {
        let form = name.children('.raid-form');
        if (!form.length) {
            form = $('<span class="raid-form"></span>');
            name.append(' ', form);
        }
        form.text('(' + shortForm + ')');
    }
    return name;
}

function GetBossListGroups() {
    const released = GetRaidBosses(null, null, false);
    const releasedKeys = new Set(released.map(PokemonDataKey));
    const unreleased = GetRaidBosses(null, null, true).filter(pokemon => !releasedKeys.has(PokemonDataKey(pokemon)));
    const groups = BOSS_LIST_CATEGORIES.map(category => ({...category, released: [], unreleased: []}));
    const byCategory = new Map(groups.map(group => [group.key, group]));
    for (const [availability, bosses] of [['released', released], ['unreleased', unreleased]]) {
        for (const pokemon of bosses) {
            const group = byCategory.get(GetBossListCategory(pokemon));
            if (group) group[availability].push(pokemon);
        }
    }
    for (const group of groups) for (const availability of ['released', 'unreleased']) {
        group[availability].sort((a, b) => a.id - b.id
            || GetPokemonForms(a.id).indexOf(a.form) - GetPokemonForms(b.id).indexOf(b.form));
    }
    return groups.filter(group => !['paradox', 'other'].includes(group.key)
        || group.released.length || group.unreleased.length);
}

function BindBossList() {
    $('#boss-leaderboard-back').on('click', event => {
        event.preventDefault();
        LoadRaidLeaderboardAndUpdateURL();
    });
    $('#boss-list-groups').on('click', '.boss-entry', function(event) {
        // Keep normal link behavior for opening another tab or window.
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        LoadPokedexAndUpdateURL(GetPokeDexMon(Number(this.dataset.id), this.dataset.form));
    });
}

function LoadBossListAndUpdateURL() {
    UpdateURL('?bosses');
    return LoadBossList();
}

async function LoadBossList() {
    if (!await LoadPage('boss-list')) return;
    document.title = BossListText('meta-title');
    $('meta[name=description]').attr('content', BossListText('description'));
    RenderBossList();
}

function RenderBossList() {
    const table = $('#boss-list-groups');
    table.children('tbody').remove();
    for (const group of GetBossListGroups()) {
        const section = $('<tbody class="boss-tier-group"></tbody>').attr({'data-hp': group.hp, 'data-category': group.key});
        const headingID = 'boss-tier-' + group.key;
        const heading = $('<th colspan="2" scope="rowgroup"></th>').attr('id', headingID)
            .append($('<div class="boss-tier-title"></div>').append(
                $('<span class="boss-tier-label"></span>').append(
                    $('<span class="boss-category"></span>').text(BossListText(group.key)),
                    ' ', $('<span class="boss-hp"></span>').text(BossListText('hp', {
                        hp: group.hp.toLocaleString(currentLocale),
                    }))),
                $('<span class="boss-total-count"></span>').text(BossListText('total-count', {
                    count: (group.released.length + group.unreleased.length).toLocaleString(currentLocale),
                }))));
        section.append($('<tr class="boss-tier-heading"></tr>').append(heading));
        const row = $('<tr class="boss-tier-rosters"></tr>');
        for (const availability of ['released', 'unreleased']) {
            const cell = $('<td class="boss-cell"></td>').attr({
                'data-availability': availability,
                headers: headingID + ' boss-column-' + availability,
            });
            cell.append($('<div class="boss-column-count"></div>').append(
                $('<span></span>').text(BossListText(availability)),
                $('<span></span>').text(group[availability].length.toLocaleString(currentLocale))));
            if (!group[availability].length) cell.append($('<p class="boss-empty"></p>').text(BossListText('empty')));
            else {
                const roster = $('<ul class="boss-roster"></ul>');
                for (const pokemon of group[availability]) {
                    const link = $('<a class="boss-entry"></a>').attr({
                        href: '?' + new URLSearchParams({p: pokemon.id, f: pokemon.form}),
                        'data-key': PokemonDataKey(pokemon), 'data-id': pokemon.id, 'data-form': pokemon.form,
                    });
                    const coords = GetPokemonIconCoords(pokemon.id, pokemon.form);
                    const sprite = $('<span class="pokemon-icon boss-sprite" aria-hidden="true"></span>')
                        .css({'background-image': 'url(' + ICONS_URL + ')',
                            'background-position': coords.x + 'px ' + coords.y + 'px'});
                    link.append(sprite, BossListPokemonName(pokemon));
                    roster.append($('<li></li>').append(link));
                }
                cell.append(roster);
            }
            row.append(cell);
        }
        section.append(row);
        table.append(section);
    }
}
