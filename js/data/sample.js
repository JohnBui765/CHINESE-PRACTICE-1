// A sample list for the first run: one HSK 1 lesson in the lesson format that Hanzi Grid saves.
import { readText } from '../core/extract.js';
import { withIds } from '../core/lists.js';
import { uid } from '../core/util.js';
import * as store from './store.js';

export const SAMPLE_TEXT = `# Bài 7 (sample)
号 | hào | number
= 我是五号。 | Wǒ shì wǔ hào. | I'm number 5.
明天 | míngtiān | tomorrow
= 明天我去超市。 | Míngtiān wǒ qù chāoshì. | Tomorrow I'm going to the supermarket.
> 明 | míng | bright; next
> 天 | tiān | day; sky
去 | qù | to go
= 你去哪儿？ | Nǐ qù nǎr? | Where are you going?
哪儿 | nǎr | where
= 你在哪儿？ | Nǐ zài nǎr? | Where are you?
> 哪 | nǎ | which
想 | xiǎng | to want
= 我想喝水。 | Wó xiǎng hē shuǐ. | I want to drink water.
超市 | chāoshì | supermarket
= 超市在哪儿？ | Chāoshì zài nǎr? | Where is the supermarket?
> 超 | chāo | to surpass; super
> 市 | shì | city; market
买 | mǎi | to buy
= 你买什么？ | Nǐ mǎi shénme? | What are you buying?
东西 | dōngxi | thing; stuff
= 我去买东西。 | Wǒ qù mǎi dōngxi. | I'm going shopping.
> 东 | dōng | east
> 西 | xī → xi | west
些 | xiē | some; a few
= 这些是什么？ | Zhèxiē shì shénme? | What are these?
牛奶 | niúnǎi | milk
= 我喝牛奶。 | Wǒ hē niúnǎi. | I drink milk.
> 牛 | niú | cow; ox
> 奶 | nǎi | milk
`;

export async function createSampleList() {
  const result = readText(SAMPLE_TEXT, 'Sample');
  return store.saveList({ id: uid(), name: result.name, rawText: SAMPLE_TEXT, entries: withIds(result.entries) });
}
