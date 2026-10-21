import assert from 'node:assert/strict'
import { resolveCommonKinshipLabel, type KinshipRuleStep } from '../src/kinship'

const step = (
  relation: string,
  ageComparison?: KinshipRuleStep['ageComparison'],
): KinshipRuleStep => ({ relation, ageComparison })

const cases: Array<{ name: string; steps: KinshipRuleStep[]; expected: string }> = [
  {
    name: '外曾外祖母的儿子是舅祖父',
    steps: ['妈妈', '妈妈', '妈妈', '儿子'].map(relation => step(relation)),
    expected: '舅祖父',
  },
  {
    name: '舅祖父的妻子是舅祖母',
    steps: ['妈妈', '妈妈', '妈妈', '儿子', '妻子'].map(relation => step(relation)),
    expected: '舅祖母',
  },
  {
    name: '妈妈的表姐妹是表姨母',
    steps: ['妈妈', '妈妈', '妈妈', '儿子', '女儿'].map(relation => step(relation)),
    expected: '表姨母',
  },
  {
    name: '表姨母的丈夫是表姨父',
    steps: ['妈妈', '妈妈', '妈妈', '儿子', '女儿', '丈夫'].map(relation => step(relation)),
    expected: '表姨父',
  },
  {
    name: '妈妈的表兄弟是表舅父',
    steps: ['妈妈', '妈妈', '妈妈', '女儿', '儿子'].map(relation => step(relation)),
    expected: '表舅父',
  },
  {
    name: '表舅父的妻子是表舅母',
    steps: ['妈妈', '妈妈', '妈妈', '女儿', '儿子', '妻子'].map(relation => step(relation)),
    expected: '表舅母',
  },
  {
    name: '同辈且年幼的男性表亲是表弟',
    steps: [
      step('妈妈'), step('妈妈'), step('妈妈'), step('儿子'), step('女儿'),
      step('儿子', 'younger'),
    ],
    expected: '表弟',
  },
  {
    name: '同辈且年幼的女性表亲是表妹',
    steps: [
      step('妈妈'), step('妈妈'), step('妈妈'), step('女儿'), step('女儿'),
      step('女儿', 'younger'),
    ],
    expected: '表妹',
  },
  {
    name: '年幼的亲姐妹是妹妹',
    steps: [step('爸爸'), step('女儿', 'younger')],
    expected: '妹妹',
  },
  {
    name: '年长的亲姐妹是姐姐',
    steps: [step('妈妈'), step('女儿', 'older')],
    expected: '姐姐',
  },
  {
    name: '年长的亲兄弟是哥哥',
    steps: [step('爸爸'), step('儿子', 'older')],
    expected: '哥哥',
  },
  {
    name: '年幼的亲兄弟是弟弟',
    steps: [step('妈妈'), step('儿子', 'younger')],
    expected: '弟弟',
  },
  {
    name: '妈妈的兄弟是舅父',
    steps: [step('妈妈'), step('爸爸'), step('儿子')],
    expected: '舅父',
  },
  {
    name: '舅父的年幼儿子是表弟',
    steps: [step('妈妈'), step('爸爸'), step('儿子'), step('儿子', 'younger')],
    expected: '表弟',
  },
  {
    name: '配偶后继续延伸统一回退亲友',
    steps: [step('妈妈'), step('妻子'), step('女儿')],
    expected: '亲友',
  },
  {
    name: '未知性别统一回退亲友',
    steps: [step('妈妈'), step('子女')],
    expected: '亲友',
  },
  {
    name: '缺少同辈长幼信息统一回退亲友',
    steps: [step('爸爸'), step('儿子', 'unknown')],
    expected: '亲友',
  },
  {
    name: '儿子的儿子是孙子',
    steps: [step('儿子'), step('儿子')],
    expected: '孙子',
  },
  {
    name: '女儿的儿子是外孙',
    steps: [step('女儿'), step('儿子')],
    expected: '外孙',
  },
  {
    name: '儿子的妻子是儿媳',
    steps: [step('儿子'), step('妻子')],
    expected: '儿媳',
  },
  {
    name: '女儿的丈夫是女婿',
    steps: [step('女儿'), step('丈夫')],
    expected: '女婿',
  },
  {
    name: '爸爸的妻子是妈妈',
    steps: [step('爸爸'), step('妻子')],
    expected: '妈妈',
  },
  {
    name: '妈妈的丈夫是爸爸',
    steps: [step('妈妈'), step('丈夫')],
    expected: '爸爸',
  },
  {
    name: '曾祖父的妻子是曾祖母',
    steps: [step('爸爸'), step('爸爸'), step('爸爸'), step('妻子')],
    expected: '曾祖母',
  },
  {
    name: '孙女的丈夫是孙女婿',
    steps: [step('儿子'), step('女儿'), step('丈夫')],
    expected: '孙女婿',
  },
  {
    name: '外孙的妻子是外孙媳妇',
    steps: [step('女儿'), step('儿子'), step('妻子')],
    expected: '外孙媳妇',
  },
  {
    name: '姐姐的丈夫是姐夫',
    steps: [step('爸爸'), step('女儿', 'older'), step('丈夫')],
    expected: '姐夫',
  },
  {
    name: '弟弟的妻子是弟媳',
    steps: [step('爸爸'), step('儿子', 'younger'), step('妻子')],
    expected: '弟媳',
  },
  {
    name: '表姐的丈夫是表姐夫',
    steps: [step('妈妈'), step('妈妈'), step('儿子'), step('女儿', 'older'), step('丈夫')],
    expected: '表姐夫',
  },
  {
    name: '表弟的妻子是表弟媳',
    steps: [step('妈妈'), step('妈妈'), step('女儿'), step('儿子', 'younger'), step('妻子')],
    expected: '表弟媳',
  },
  {
    name: '兄弟的孙子是侄孙',
    steps: [step('爸爸'), step('儿子'), step('儿子'), step('儿子')],
    expected: '侄孙',
  },
  {
    name: '姐妹的孙女是外甥孙女',
    steps: [step('妈妈'), step('女儿'), step('女儿'), step('女儿')],
    expected: '外甥孙女',
  },
  {
    name: '儿子的儿子的女儿是曾孙女',
    steps: [step('儿子'), step('儿子'), step('女儿')],
    expected: '曾孙女',
  },
  {
    name: '女儿的儿子的儿子是外曾孙',
    steps: [step('女儿'), step('儿子'), step('儿子')],
    expected: '外曾孙',
  },
  {
    name: '妻子的父亲是岳父',
    steps: [step('妻子'), step('爸爸')],
    expected: '岳父',
  },
  {
    name: '妻子的母亲是岳母',
    steps: [step('妻子'), step('妈妈')],
    expected: '岳母',
  },
  {
    name: '配偶的非共同子女不猜测称呼',
    steps: [step('妻子'), step('儿子')],
    expected: '亲友',
  },
  {
    name: '丈夫的父亲是公公',
    steps: [step('丈夫'), step('爸爸')],
    expected: '公公',
  },
  {
    name: '丈夫的母亲是婆婆',
    steps: [step('丈夫'), step('妈妈')],
    expected: '婆婆',
  },
  {
    name: '妻子的哥哥是内兄',
    steps: [step('妻子'), step('妈妈'), step('儿子', 'older')],
    expected: '内兄',
  },
  {
    name: '妻子的妹妹是姨妹',
    steps: [step('妻子'), step('爸爸'), step('女儿', 'younger')],
    expected: '姨妹',
  },
  {
    name: '丈夫的哥哥是大伯子',
    steps: [step('丈夫'), step('爸爸'), step('儿子', 'older')],
    expected: '大伯子',
  },
  {
    name: '丈夫的妹妹是小姑子',
    steps: [step('丈夫'), step('妈妈'), step('女儿', 'younger')],
    expected: '小姑子',
  },
]

cases.forEach(testCase => {
  assert.equal(resolveCommonKinshipLabel(testCase.steps), testCase.expected, testCase.name)
  console.log(`✓ ${testCase.name}`)
})
