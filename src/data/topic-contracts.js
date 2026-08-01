const ALL_PALACES = [
  '命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮',
  '遷移宮', '僕役宮', '官祿宮', '田宅宮', '福德宮', '父母宮',
];

const EVIDENCE_TYPES = ['ziwei_palace', 'ziwei_transformation', 'bazi_profile', 'bazi_timing'];

const CATEGORY_DEFINITIONS = [
  {
    key: 'love', label: '愛情', icon: '愛', palace: '夫妻宮', bazi: ['shishen', 'zhu'],
    excludedTargets: ['工作能力', '財務金額', '原生家庭', '健康診斷', '房產', '子女'],
    questions: [
      ['partner-pattern', '我常遇到什麼類型的對象？', '容易靠近的對象類型', ['對象特質', '互動起點', '辨識線索', '相處代價']],
      ['attraction', '什麼特質最容易讓我心動？', '心動條件', ['吸引特質', '內在需求', '具體情境', '判斷方式']],
      ['relationship-style', '什麼樣的相處方式最適合我？', '適合的相處方式', ['相處節奏', '溝通方式', '安全感條件', '過度使用的代價']],
      ['repair', '關係發生衝突後，我適合怎麼修復？', '關係衝突的修復方式', ['衝突反應', '修復時機', '具體動作', '有效檢查']],
      ['blind-spot', '我在感情裡最容易忽略什麼？', '感情中的盲點', ['容易忽略的需求', '觸發情境', '外在表現', '調整方式']],
      ['boundary', '我要怎麼建立不委屈自己的關係界線？', '不委屈的關係界線', ['界線位置', '說明時機', '具體說法', '有效檢查']],
    ],
  },
  {
    key: 'career', label: '事業', icon: '業', palace: '官祿宮', bazi: ['yongshen', 'xiji'],
    excludedTargets: ['戀愛對象', '婚姻互動', '原生家庭', '健康診斷', '房產', '子女'],
    questions: [
      ['work-content', '我適合負責哪些工作內容？', '適合負責的工作內容', ['擅長解決的問題', '適合的工作角色', '具體工作情境', '容易消耗的條件']],
      ['strength', '我在工作或團體中最拿手的是什麼？', '工作中最拿手的能力', ['核心工作優勢', '發揮情境', '別人看到的貢獻', '過度使用的代價']],
      ['environment', '什麼樣的環境比較能讓我長期發揮？', '能長期發揮的工作環境', ['適合的工作環境', '必要的自主空間', '合作條件', '容易消耗的環境']],
      ['role', '我在合作或帶領別人時適合扮演什麼角色？', '合作與帶領角色', ['適合的團隊角色', '帶領方式', '分工情境', '責任邊界']],
      ['block', '我的職涯最容易卡在哪裡？', '職涯卡點', ['容易卡住的問題', '觸發條件', '外在表現', '解卡動作']],
      ['direction', '我要怎麼建立長期職涯方向？', '長期職涯方向', ['優先累積的能力', '階段行動', '不必急著處理的問題', '成效檢查']],
    ],
  },
  {
    key: 'money', label: '財運', icon: '財', palace: '財帛宮', bazi: ['xiji', 'yongshen'],
    excludedTargets: ['戀愛對象', '婚姻互動', '原生家庭', '健康診斷', '具體金額', '子女'],
    questions: [
      ['income', '我比較適合怎麼累積收入與資源？', '收入與資源累積', ['適合的收入方式', '資源累積節奏', '可執行做法', '風險條件']],
      ['spending', '我的金錢使用習慣有什麼特色？', '金錢使用習慣', ['花錢模式', '觸發情境', '優勢', '過度使用的代價']],
      ['decision', '做財務決定時最需要留意什麼？', '財務決定的風險', ['決策慣性', '高風險情境', '停損條件', '檢查方式']],
      ['cooperation', '我適合獨立賺錢，還是和別人合作？', '獨立或合作的收入模式', ['適合的收入模式', '合作條件', '核心主導權', '退出機制']],
      ['management', '我在金錢管理上最有優勢的是什麼？', '金錢管理優勢', ['管理優勢', '適用情境', '可重複的方法', '盲點']],
      ['rhythm', '我要怎麼建立更穩定的財務節奏？', '穩定財務節奏', ['現在優先處理', '接下來累積', '暫不處理', '成效檢查']],
    ],
  },
  {
    key: 'parents', label: '父母', icon: '親', palace: '父母宮', bazi: ['shishen', 'zhu'],
    excludedTargets: ['戀愛對象', '工作能力', '財務金額', '健康診斷', '房產', '子女'],
    questions: [
      ['interaction', '我和父母或長輩常見的互動模式是什麼？', '與長輩的互動模式', ['互動模式', '觸發情境', '外在表現', '關係代價']],
      ['support', '我容易從長輩身上得到哪種支持？', '長輩支持的方式', ['支持類型', '出現條件', '如何開口', '限制']],
      ['authority-boundary', '面對權威或家人期待時，界線要放在哪裡？', '權威與家人期待的界線', ['界線位置', '高壓情境', '具體說法', '檢查方式']],
      ['expectation', '家人的期待容易怎麼影響我的選擇？', '家人期待對選擇的影響', ['影響模式', '內在拉扯', '外在選擇', '調整方式']],
      ['communication', '我適合怎麼和父母或長輩溝通？', '與長輩的溝通方式', ['溝通時機', '說明順序', '具體說法', '無效模式']],
      ['distance', '成年後，我要怎麼調整和原生家庭的距離？', '成年後的家庭距離', ['聯絡節奏', '資訊界線', '一致做法', '關係檢查']],
    ],
  },
  {
    key: 'children', label: '子女', icon: '育', palace: '子女宮', bazi: ['shishen', 'zhu'],
    excludedTargets: ['戀愛對象', '工作能力', '財務金額', '原生家庭', '健康診斷', '房產'],
    questions: [
      ['interaction', '我和子女、晚輩或學生的互動方式是什麼？', '與晚輩的互動方式', ['互動角色', '觸發情境', '對方感受', '過度使用的代價']],
      ['mentoring', '我適合用什麼方式陪伴與培育他人？', '陪伴與培育方式', ['陪伴方式', '教學步驟', '給予空間', '成效檢查']],
      ['creation', '這個宮位也反映哪些創作與產出能力？', '創作與產出能力', ['創作方式', '適合產出', '卡住情境', '完成方法']],
      ['expectation', '我容易對晚輩抱持什麼期待？', '對晚輩的期待', ['期待內容', '表達方式', '對方感受', '調整方式']],
      ['communication', '意見不合時，我適合怎麼和晚輩溝通？', '與晚輩的衝突溝通', ['衝突反應', '說明方式', '可調整行為', '修復檢查']],
      ['boundary', '照顧與培育他人時，我需要守住什麼界線？', '照顧與培育的界線', ['責任界線', '幫忙條件', '保留時間', '關係檢查']],
    ],
  },
  {
    key: 'luck', label: '幸運', icon: '運', palace: '福德宮', bazi: ['yongshen', 'xiji'],
    excludedTargets: ['戀愛對象', '婚姻互動', '財務金額', '原生家庭', '健康診斷', '必然事件'],
    questions: [
      ['state', '我在什麼狀態下比較容易遇到機會？', '容易看見機會的狀態', ['有利狀態', '機會入口', '生活情境', '錯過條件']],
      ['support', '哪些人或環境比較能為我帶來助力？', '帶來助力的人與環境', ['助力類型', '有利環境', '辨識線索', '互動方式']],
      ['action', '我可以主動做什麼，讓有利條件更容易發生？', '主動增加有利條件', ['主動行動', '執行頻率', '小步驟', '成效檢查']],
      ['missed', '我最容易忽略哪一種機會？', '容易忽略的機會', ['機會形式', '忽略原因', '早期線索', '辨識方式']],
      ['timing', '什麼習慣容易讓我錯過好時機？', '容易錯過時機的習慣', ['拖延模式', '觸發情境', '最小行動', '停止條件']],
      ['retain', '遇到順風期時，我要怎麼把機會留下來？', '把機會轉成長期累積', ['保留成果', '篩選優先順序', '建立資產', '後續檢查']],
    ],
  },
  {
    key: 'home', label: '住宅', icon: '宅', palace: '田宅宮', bazi: ['xiji', 'zhu'],
    excludedTargets: ['戀愛對象', '婚姻互動', '工作職務', '健康診斷', '子女', '必然置產時點'],
    questions: [
      ['environment', '什麼樣的居住環境比較適合我？', '適合的居住環境', ['空間條件', '日常節奏', '安定線索', '消耗條件']],
      ['security', '家與空間會怎麼影響我的安全感？', '空間對安全感的影響', ['安全感來源', '觸發情境', '外在表現', '恢復方式']],
      ['move', '面對搬遷、置產或家庭資源時要留意什麼？', '搬遷與家庭資源決策', ['決策條件', '責任界線', '風險檢查', '退出方式']],
      ['cohabit', '我適合和家人同住，還是保有自己的空間？', '同住與個人空間', ['私人空間需求', '同住條件', '公共責任', '不適合條件']],
      ['resources', '我比較適合怎麼累積家庭與居住資源？', '家庭與居住資源累積', ['累積節奏', '資金條件', '權責說明', '階段檢查']],
      ['workspace', '我要怎麼安排住家與工作空間才不容易疲累？', '住家與工作空間安排', ['空間分界', '收尾動作', '減少干擾', '疲勞檢查']],
    ],
  },
  {
    key: 'health', label: '健康', icon: '健', palace: '疾厄宮', bazi: ['zhu', 'xiji'],
    excludedTargets: ['戀愛對象', '婚姻互動', '財務金額', '原生家庭', '疾病診斷', '治療效果'],
    questions: [
      ['stress', '壓力累積時，我比較容易出現什麼反應？', '壓力累積的反應', ['壓力反應', '早期警訊', '生活情境', '過度使用的代價']],
      ['recovery', '哪些生活習慣最能幫助我恢復？', '有效的恢復習慣', ['恢復動作', '執行時機', '執行頻率', '成效檢查']],
      ['neglect', '我在身心照顧上最容易忽略什麼？', '身心照顧的盲點', ['忽略警訊', '高風險情境', '停止條件', '尋求協助時機']],
      ['pace', '我適合怎麼安排忙碌與休息的節奏？', '忙碌與休息節奏', ['工作休息比', '固定休息點', '停工時機', '狀態檢查']],
      ['drain', '哪些日常情境最容易消耗我的精神？', '日常精神消耗情境', ['消耗情境', '早期反應', '減載動作', '界線']],
      ['warning', '我要怎麼提早發現自己快要透支？', '透支的早期警訊', ['觀察指標', '檢查頻率', '減載門檻', '尋求協助時機']],
    ],
  },
  {
    key: 'social', label: '人際', icon: '友', palace: '僕役宮', bazi: ['shishen', 'zhu'],
    excludedTargets: ['戀愛對象', '婚姻互動', '財務金額', '原生家庭', '健康診斷', '房產'],
    questions: [
      ['partner-pattern', '我容易吸引什麼類型的朋友或合作對象？', '容易吸引的朋友與合作對象', ['對象特質', '互動起點', '分工線索', '關係風險']],
      ['role', '我在人際關係裡通常扮演什麼角色？', '人際中的常見角色', ['常見角色', '他人感受', '發揮情境', '過度使用的代價']],
      ['boundary', '合作與交朋友時，最需要設下什麼界線？', '合作與交友界線', ['責任界線', '金錢與期限', '雙向回應', '調整距離']],
      ['impression', '別人對我的第一印象通常是什麼？', '他人的第一印象', ['外在印象', '形成情境', '熟悉後的反差', '誤解風險']],
      ['repair', '人際衝突後，我適合怎麼修復關係？', '人際衝突的修復', ['衝突分類', '修復順序', '具體動作', '關係檢查']],
      ['circle', '什麼樣的朋友圈最適合我長期相處？', '適合長期相處的朋友圈', ['圈子特質', '互動條件', '長期維持', '不適合警訊']],
    ],
  },
  {
    key: 'migration', label: '遷移', icon: '行', palace: '遷移宮', bazi: ['dayun', 'zhu'],
    excludedTargets: ['戀愛對象', '婚姻互動', '財務金額', '原生家庭', '健康診斷', '必然事件'],
    questions: [
      ['outside', '離開熟悉環境後，我通常會有什麼表現？', '離開熟悉環境的表現', ['初期反應', '適應節奏', '發揮條件', '壓力代價']],
      ['development', '我適合往外發展、旅行或轉換環境嗎？', '往外發展的適合條件', ['直接答案', '適合的移動目的', '必要準備', '不適合條件']],
      ['adapt', '面對新地方與陌生人時，怎麼做比較容易站穩？', '新環境的站穩方法', ['優先安定項目', '社交起點', '扩大節奏', '檢查方式']],
      ['city', '什麼樣的城市或環境比較適合我發展？', '適合發展的城市與環境', ['環境特質', '生活機能', '發展資源', '長期消耗條件']],
      ['adaptation-risk', '轉換環境時，我最容易遇到什麼適應問題？', '轉換環境的適應問題', ['適應問題', '早期反應', '基礎安排', '求助時機']],
      ['retain', '我要怎麼把外地經驗轉成長期機會？', '把外地經驗轉成長期機會', ['保留成果', '人脈後續', '可重複方法', '定期檢查']],
    ],
  },
];

const makeContract = (category, question, index) => {
  const [slug, text, focus, targets] = question;
  const allowedPalaces = [category.palace];
  return Object.freeze({
    id: `${category.key}.${slug}`,
    category: category.key,
    categoryLabel: category.label,
    icon: category.icon,
    question: text,
    intent: `只回答「${focus}」，不延伸到其他人生領域。`,
    questionFocus: focus,
    answerTargets: targets,
    requiredTargets: targets.slice(0, 2),
    optionalTargets: targets.slice(2),
    excludedTargets: category.excludedTargets,
    allowedPalaces,
    excludedPalaces: ALL_PALACES.filter((palace) => !allowedPalaces.includes(palace)),
    allowedEvidenceTypes: EVIDENCE_TYPES,
    excludedEvidenceTypes: ['raw_reason', 'knowledge_fragment', 'debug', 'unrelated_palace'],
    baziKeys: category.bazi,
    answerSchema: {
      topicAnalysis: ['directConclusion', 'manifestations', 'scenario', 'strength', 'cost', 'evidence'],
      directAnswer: ['answer', 'reasons', 'scenario', 'actions'],
      longTermAdvice: ['problem', 'trigger', 'action', 'method', 'check'],
    },
    evidenceLimit: 3,
    wordBudget: { topicAnalysis: 550, directAnswer: 450, longTermAdvice: 420 },
    questionIndex: index,
  });
};

export const TOPIC_CONTRACTS = Object.freeze(CATEGORY_DEFINITIONS.flatMap((category) =>
  category.questions.map((question, index) => makeContract(category, question, index))));

export const TOPIC_CATEGORIES = Object.freeze(CATEGORY_DEFINITIONS.map((category) => ({
  key: category.key,
  label: category.label,
  icon: category.icon,
  contracts: TOPIC_CONTRACTS.filter((contract) => contract.category === category.key),
})));

export function getTopicContract(topicId) {
  return TOPIC_CONTRACTS.find((contract) => contract.id === topicId) ?? null;
}

export function createCustomTopicContract({ category, question, questionFocus = question }) {
  const base = CATEGORY_DEFINITIONS.find((item) => item.key === category);
  if (!base || !String(question ?? '').trim()) return null;
  return Object.freeze({
    ...makeContract(base, ['custom', String(question).trim(), String(questionFocus).trim(),
      ['直接答案', '主要原因', '具體情境', '可執行做法']], 0),
    id: `${category}.custom`,
  });
}
