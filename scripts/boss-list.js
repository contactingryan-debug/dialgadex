/* The same eligible boss forms used by raid rankings, split by current availability. GPL-3.0. */
const OPTIONAL_BOSS_GROUPS = ['paradox', 'other'];
const BOSS_LIST_TIERS = [
    {key: 'super-mega', hp: 25000, egg: 'super-mega-egg.png'},
    {key: 'legendary-mega', hp: 22500, egg: 'dark-mega-egg.png'},
    {key: 'five-star', hp: 15000, egg: 'legendary-egg.png',
        categories: ['legendary', 'sub-legendary', 'mythical', ...OPTIONAL_BOSS_GROUPS]},
    {key: 'mega', hp: 9000, egg: 'mega-egg.png'},
];

// Raid Bosses categories follow the user's species list; forms inherit the base species.
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
        : BOSS_LIST_TIERS.find(tier => tier.hp === hp)?.key;
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
    if (pokemon.id === 670 && pokemon.form === 'Mega')
        shortForm = TranslatedFormName('Eternal_flower');
    else if ([493,773].includes(pokemon.id) && POKEMON_TYPES.has(pokemon.form))
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
    const groups = BOSS_LIST_TIERS.flatMap(({key, hp, categories = [key]}) =>
        categories.map(category => ({key: category, hp, released: [], unreleased: []})));
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
    return groups.filter(group => !OPTIONAL_BOSS_GROUPS.includes(group.key)
        || group.released.length || group.unreleased.length);
}

let bossListPopupTarget = null;
let bossListTouchTarget = null;

function HideBossListPopup() {
    bossListPopupTarget?.removeAttribute('aria-describedby');
    bossListTouchTarget?.classList.remove('boss-selected');
    bossListPopupTarget = bossListTouchTarget = null;
    $('#boss-name-popup').prop('hidden', true);
}

function PositionBossListPopup() {
    const popup = document.getElementById('boss-name-popup');
    if (!bossListPopupTarget || !popup) return;
    const target = bossListPopupTarget.getBoundingClientRect();
    if (!target.width || !target.height || target.bottom <= 0 || target.top >= innerHeight) {
        popup.hidden = true;
        bossListPopupTarget.removeAttribute('aria-describedby');
        return;
    }
    popup.hidden = false;
    bossListPopupTarget.setAttribute('aria-describedby', 'boss-name-popup');
    const size = popup.getBoundingClientRect();
    const left = Math.max(8, Math.min(target.left + (target.width - size.width) / 2, innerWidth - size.width - 8));
    const below = target.bottom + 4;
    const top = below + size.height <= innerHeight - 8 ? below : Math.max(8, target.top - size.height - 4);
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
}

function ShowBossListPopup(entry) {
    if (bossListPopupTarget !== entry) HideBossListPopup();
    const popup = $('#boss-name-popup');
    popup.empty().append($(entry).children('.boss-name').clone().removeAttr('aria-hidden'));
    bossListPopupTarget = entry;
    PositionBossListPopup();
}

function BindBossList() {
    $('#boss-leaderboard-back').on('click', event => {
        event.preventDefault();
        LoadRaidLeaderboardAndUpdateURL();
    });
    $('#boss-list-groups').off('.bossNames')
    .on('mouseenter.bossNames focusin.bossNames', '.boss-entry', function() {
        ShowBossListPopup(this);
    })
    .on('mouseleave.bossNames', '.boss-entry', function() {
        if (bossListPopupTarget === this && bossListTouchTarget !== this && !this.matches(':focus-visible'))
            HideBossListPopup();
    })
    .on('focusout.bossNames', '.boss-entry', function() {
        if (bossListPopupTarget === this) HideBossListPopup();
    })
    .on('click.bossNames', '.boss-entry', function(event) {
        // Keep normal link behavior for opening another tab or window.
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        if (HasTouchScreen() && event.originalEvent?.detail !== 0 && bossListTouchTarget !== this) {
            ShowBossListPopup(this);
            bossListTouchTarget = this;
            this.classList.add('boss-selected');
            return;
        }
        HideBossListPopup();
        LoadPokedexAndUpdateURL(GetPokeDexMon(Number(this.dataset.id), this.dataset.form));
    });
    $(document).off('.bossNames')
    .on('pointerdown.bossNames', event => {
        if (!$(event.target).closest('.boss-entry').length) HideBossListPopup();
    })
    .on('keydown.bossNames', event => {
        if (event.key === 'Escape') HideBossListPopup();
    });
    $(window).off('.bossNames').on('scroll.bossNames resize.bossNames', () => {
        if (bossListPopupTarget?.matches(':focus-visible, :hover') || bossListTouchTarget) PositionBossListPopup();
        else HideBossListPopup();
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
    HideBossListPopup();
    const container = $('#boss-list-groups').empty();
    const groups = GetBossListGroups();
    for (const tier of BOSS_LIST_TIERS) {
        const tierGroups = groups.filter(group => group.hp === tier.hp);
        const total = tierGroups.reduce((sum, group) => sum + group.released.length + group.unreleased.length, 0);
        const headingID = 'boss-tier-' + tier.key;
        const section = $('<section class="boss-tier-group"></section>').attr({
            'data-hp': tier.hp, 'data-category': tier.key, 'aria-labelledby': headingID,
        });
        section.append($('<div class="boss-tier-heading boss-tier-title"></div>').append(
            $('<h2 class="boss-tier-label"></h2>').attr('id', headingID).append(
                $('<img class="boss-egg" width="44" height="44" alt="">').attr('src', 'imgs/raids/' + tier.egg),
                $('<span class="boss-tier-text"></span>').append(
                    $('<span class="boss-tier-name"></span>').text(BossListText(tier.key)),
                    $('<span class="boss-hp"></span>').text(BossListText('hp', {
                        hp: tier.hp.toLocaleString(currentLocale),
                    })))),
            $('<span class="boss-total-count"></span>').text(BossListText('total-count', {
                count: total.toLocaleString(currentLocale),
            }))));
        for (const group of tierGroups) {
            const optional = OPTIONAL_BOSS_GROUPS.includes(group.key);
            if (tier.categories && !optional) {
                const count = group.released.length + group.unreleased.length;
                section.append($('<div class="boss-subsection-heading boss-tier-title"></div>').append(
                    $('<h3></h3>').text(BossListText(group.key)),
                    $('<span class="boss-total-count"></span>').text(BossListText('total-count', {
                        count: count.toLocaleString(currentLocale),
                    }))));
            }
            section.append(BuildBossRosters(group, optional));
        }
        container.append(section);
    }
}

function BuildBossRosters(group, optional) {
    const rosters = $('<div class="boss-tier-rosters"></div>').attr('data-category', group.key)
        .toggleClass('boss-extra-roster', optional);
    for (const availability of ['released', 'unreleased']) {
        const pokemonList = group[availability];
        if (!pokemonList.length) continue;

        const labelID = 'boss-' + group.key + '-' + availability;
        const label = BossListText(availability);
        const groupLabel = optional ? BossListText(group.key) + ' · ' + label : label;
        const section = $('<div class="boss-release-roster" role="group"></div>').attr({
            'data-availability': availability,
            'aria-labelledby': labelID,
        });
        const heading = $('<div class="boss-release-heading"></div>').append(
            $('<span class="boss-release-label"></span>').attr('id', labelID).text(groupLabel),
            $('<span></span>').text(pokemonList.length.toLocaleString(currentLocale)));
        const roster = $('<ul class="boss-roster"></ul>');
        for (const pokemon of pokemonList) {
            const name = BossListPokemonName(pokemon).attr('aria-hidden', 'true');
            const link = $('<a class="boss-entry"></a>').attr({
                href: '?' + new URLSearchParams({p: pokemon.id, f: pokemon.form}),
                'data-key': PokemonDataKey(pokemon), 'data-id': pokemon.id, 'data-form': pokemon.form,
                'aria-label': name.text(),
            });
            const coords = GetPokemonIconCoords(pokemon.id, pokemon.form);
            const sprite = $('<span class="pokemon-icon boss-sprite" aria-hidden="true"></span>')
                .css({'background-image': 'url(' + ICONS_URL + ')',
                    'background-position': coords.x + 'px ' + coords.y + 'px'});
            link.append(sprite, name);
            roster.append($('<li></li>').append(link));
        }
        rosters.append(section.append(heading, roster));
    }
    return rosters;
}
