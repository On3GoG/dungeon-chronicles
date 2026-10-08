// Обучающая кампания «Логово гоблинов».
import type { CampaignDef, Entity } from '../types.ts';
import { CREATURES } from './rules_data.ts';

function creature(id: string, template: string, extra: Partial<Entity> = {}): Entity {
  const t = CREATURES[template];
  return { id, name: t.name, kind: 'creature', template, hp: t.hp, maxHp: t.hp, ac: t.ac,
    hostile: true, aware: true, alive: true, attitude: -60, conditions: [], ...extra };
}
function npc(id: string, name: string, description: string, attitude: number): Entity {
  return { id, name, kind: 'npc', description, hostile: false, aware: true, alive: true, attitude, conditions: [] };
}
function object(id: string, name: string, description: string): Entity {
  return { id, name, kind: 'object', description, hostile: false, aware: false, alive: true, attitude: 0, conditions: [] };
}

export const CAMPAIGN_GOBLINS: CampaignDef = {
  id: 'goblin_lair',
  title: 'Логово гоблинов',
  premise:
    'Деревня Вересковка на краю Чернолесья. Гоблины племени Кривого Клыка уже месяц таскают скот, ' +
    'а три ночи назад похитили троих детей. Староста Ольгерд нанял героя: найти логово и вернуть детей. ' +
    'Вождь Кривой Клык держит детей в загоне за подземным водопадом под охраной своего волка и хочет выменять их на зерно. ' +
    'Тон — тёмная сказка с юмором: гоблины трусливы поодиночке и опасны толпой.',
  brief: 'Гоблины Кривого Клыка похитили троих детей из деревни Вересковка; герой должен найти логово и вернуть детей.',
  skeleton:
    'Акт 1: деревня — слухи, следы, снаряжение. Акт 2: лес и вход в пещеру — засада волков, дозор гоблинов. ' +
    'Акт 3: пещеры — кладовая с уликами, зал вождя, загон за водопадом. Развязки: освободить детей силой, хитростью ' +
    'или договорившись с вождём; вернуться в Вересковку.',
  intro:
    'Вересковка встречает тебя запахом дыма и мокрой соломы. На площади пусто, ставни закрыты, только у колодца ' +
    'староста Ольгерд мнёт в руках шапку. «Три ночи назад они пришли снова, — говорит он, не глядя в глаза. — ' +
    'Забрали Мирошку, Ясю и меньшого Тихона. Гоблины Кривого Клыка. Следы ведут в Чернолесье, а дальше никто не ходил». ' +
    'Он протягивает тебе тощий кошель: «Это всё, что собрали. Верни детей — получишь втрое». За его спиной скрипит дверь ' +
    'таверны «Старый вереск», а на опушке за околицей каркает ворона.',
  introChoices: ['Расспросить старосту о гоблинах', 'Зайти в таверну за слухами', 'Сразу отправиться к опушке'],
  start: 'village_square',
  flags: [
    { id: 'chest_opened', description: 'сундук в кладовой открыт' },
    { id: 'trap_found', description: 'ловушка-колокол в коридоре обнаружена' },
    { id: 'alarm_raised', description: 'гоблины подняли тревогу' },
    { id: 'chief_negotiating', description: 'вождь согласился на переговоры' },
    { id: 'pen_unlocked', description: 'загон с детьми открыт' },
    { id: 'children_freed', description: 'дети освобождены и идут с героем' },
  ],
  victoryFlag: 'children_returned',
  locations: [
    {
      id: 'village_square', name: 'Площадь Вересковки', safe: true, tags: ['village', 'day'],
      description: 'Утоптанная площадь с колодцем. Покосившиеся избы, закрытые ставни. Отсюда видна таверна и тропа к лесу.',
      exits: [{ to: 'tavern', description: 'дверь таверны «Старый вереск»' },
        { to: 'forest_edge', description: 'тропа за околицу к опушке Чернолесья' }],
      entities: [npc('olgerd', 'Староста Ольгерд', 'усталый старик, потерял сон после похищения детей', 40)],
      items: [], gold: 0,
    },
    {
      id: 'tavern', name: 'Таверна «Старый вереск»', tags: ['town', 'tavern', 'social'],
      description: 'Низкий зал, чад от очага, пахнет луком и кислым элем. Пара угрюмых крестьян за столом.',
      exits: [{ to: 'village_square', description: 'выход на площадь' }],
      entities: [npc('miron', 'Трактирщик Мирон', 'болтливый толстяк, знает все слухи; торгует зельями по 50 золотых', 20),
        npc('yaropolk', 'Охотник Ярополк', 'молчаливый охотник, видел гоблинов у старой каменоломни в лесу', 0)],
      items: [], gold: 0,
    },
    {
      id: 'forest_edge', name: 'Опушка Чернолесья', tags: ['forest', 'outdoor'],
      description: 'Сырые ели, папоротник по пояс. На мокрой земле — маленькие следы босых ног и волокуша от мешка.',
      exits: [{ to: 'village_square', description: 'обратно в деревню' },
        { to: 'forest_path', description: 'по следам вглубь леса' }],
      entities: [], items: [], gold: 0,
    },
    {
      id: 'forest_path', name: 'Звериная тропа', tags: ['forest', 'danger'],
      description: 'Тропа сужается между валунами. Тихо — слишком тихо. Из кустов поблёскивают глаза.',
      exits: [{ to: 'forest_edge', description: 'назад к опушке' },
        { to: 'cave_entrance', description: 'к старой каменоломне' }],
      entities: [creature('wolf_1', 'wolf', { name: 'Серый волк' }), creature('wolf_2', 'wolf', { name: 'Хромой волк' })],
      items: [], gold: 0,
    },
    {
      id: 'cave_entrance', name: 'Вход в логово', tags: ['cave_entrance', 'danger'],
      description: 'Чёрный зев пещеры в стене каменоломни. У входа костёр, две бочки с лампадным маслом и трое гоблинов, ' +
        'спорящих над костью. Тебя они пока не видят.',
      exits: [{ to: 'forest_path', description: 'назад по тропе' }, { to: 'cave_hall', description: 'вглубь пещеры' }],
      entities: [creature('goblin_1', 'goblin', { name: 'Гоблин с ножом', aware: false }),
        creature('goblin_2', 'goblin', { name: 'Толстый гоблин', aware: false }),
        creature('goblin_3', 'goblin', { name: 'Гоблин-дозорный', aware: false }),
        object('oil_barrels', 'Бочки с маслом', 'две бочки лампадного масла у самого костра — если поджечь, рванёт')],
      items: [], gold: 0,
    },
    {
      id: 'cave_hall', name: 'Большой грот', tags: ['dungeon', 'cave'],
      description: 'Высокий грот, капает вода. На уступе в десяти шагах сидит гоблин-лучник. Узкий коридор с соломой на полу ведёт ' +
        'к деревянной двери, широкий проход — к отсветам большого костра, а из-за поворота доносится шум водопада.',
      exits: [{ to: 'cave_entrance', description: 'к выходу' }, { to: 'storeroom', description: 'коридор с соломой к деревянной двери' },
        { to: 'chief_hall', description: 'широкий проход к большому костру' },
        { to: 'waterfall_pen', description: 'за поворот, к шуму водопада' }],
      entities: [creature('goblin_archer', 'goblin_archer', { name: 'Гоблин-лучник на уступе' }),
        object('bell_trap', 'Ловушка-колокол', 'под соломой в коридоре — нажимная доска, связанная с колоколом')],
      items: [], gold: 0,
    },
    {
      id: 'storeroom', name: 'Кладовая вождя', tags: ['dungeon', 'loot'],
      description: 'Тесная каморка, лампа на бочке. Окованный сундук с простым замком. За стеной храпит гоблин.',
      exits: [{ to: 'cave_hall', description: 'назад в грот' }],
      entities: [object('chest', 'Окованный сундук', 'простой навесной замок; внутри — то, что гоблины считают ценным'),
        creature('goblin_sleeper', 'goblin', { name: 'Спящий гоблин', aware: false, conditions: ['unconscious'] })],
      items: [{ item: 'silver_pouch', qty: 1 }, { item: 'wooden_horse', qty: 1 }, { item: 'cave_map', qty: 1 },
        { item: 'healing_potion', qty: 1 }],
      gold: 10,
    },
    {
      id: 'chief_hall', name: 'Зал вождя', tags: ['dungeon', 'boss'],
      description: 'Зал с костром посередине и троном из ящиков. Кривой Клык грызёт баранью ногу, рядом шаман бормочет над черепом.',
      exits: [{ to: 'cave_hall', description: 'назад в грот' }],
      entities: [creature('chief', 'goblin_chief', { attitude: -40 }),
        creature('shaman', 'goblin_shaman')],
      items: [], gold: 0,
    },
    {
      id: 'waterfall_pen', name: 'Загон за водопадом', tags: ['dungeon', 'water'],
      description: 'За завесой водопада — загон из жердей. Трое перепуганных детей жмутся друг к другу. Перед загоном лежит огромный волк ' +
        'и не сводит с тебя глаз. Загон заперт на замок.',
      exits: [{ to: 'cave_hall', description: 'назад в грот' }],
      entities: [creature('chief_wolf', 'chief_wolf'),
        npc('children', 'Похищенные дети', 'Мирошка, Яся и маленький Тихон; заперты в загоне, ключ у вождя', 50)],
      items: [], gold: 0,
    },
  ],
};

export const CAMPAIGNS: Record<string, CampaignDef> = { [CAMPAIGN_GOBLINS.id]: CAMPAIGN_GOBLINS };
