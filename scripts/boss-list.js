/* The same eligible boss forms used by raid rankings, split by current availability. GPL-3.0. */
const BOSS_LIST_CATEGORIES = [
    {key: 'super-mega', hp: 25000},
    {key: 'legendary-mega', hp: 22500},
    {key: 'legendary', hp: 15000},
    {key: 'mega', hp: 9000},
];

function BossListText(key, params = {}) {
    return FormatTranslation('boss-list.' + key, params);
}

function GetBossListGroups() {
    const released = GetRaidBosses(null, null, false);
    const releasedKeys = new Set(released.map(PokemonDataKey));
    const unreleased = GetRaidBosses(null, null, true).filter(pokemon => !releasedKeys.has(PokemonDataKey(pokemon)));
    const groups = BOSS_LIST_CATEGORIES.map(category => ({...category, released: [], unreleased: []}));
    const byHP = new Map(groups.map(group => [group.hp, group]));
    for (const [availability, bosses] of [['released', released], ['unreleased', unreleased]]) {
        for (const pokemon of bosses) {
            const group = byHP.get(GetRaidStats(pokemon).hp);
            if (group) group[availability].push(pokemon);
        }
    }
    for (const group of groups) for (const availability of ['released', 'unreleased']) {
        group[availability].sort((a, b) => a.id - b.id
            || GetPokemonForms(a.id).indexOf(a.form) - GetPokemonForms(b.id).indexOf(b.form));
    }
    return groups;
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
        const section = $('<tbody class="boss-tier-group"></tbody>').attr('data-hp', group.hp);
        const headingID = 'boss-tier-' + group.key;
        const heading = $('<th colspan="2" scope="rowgroup"></th>').attr('id', headingID)
            .append($('<span class="boss-category"></span>').text(BossListText(group.key)),
                ' ', $('<span class="boss-hp"></span>').text(BossListText('hp', {
                    hp: group.hp.toLocaleString(currentLocale),
                })));
        section.append($('<tr class="boss-tier-heading"></tr>').append(heading));
        const row = $('<tr class="boss-tier-rosters"></tr>');
        for (const availability of ['released', 'unreleased']) {
            const cell = $('<td class="boss-cell"></td>').attr({
                'data-availability': availability,
                headers: headingID + ' boss-column-' + availability,
            });
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
                    // On source records, shadow means attacker availability, not a Shadow raid profile.
                    link.append(sprite, RaidLeaderboardName({...pokemon, shadow:false}).addClass('boss-name'));
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
