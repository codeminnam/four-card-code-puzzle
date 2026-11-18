const colorNames = { yellow: '노랑', green: '초록', blue: '하늘', purple: '보라', white: '흰색' };
const colors = Object.keys(colorNames);
const shapes = ['diamond', 'square', 'triangle', 'circle', 'star'];
const colorDistribution = [8, 6, 5, 4, 3];
const shapeDistribution = [8, 6, 5, 4, 3];
const shapeSvg = {
  diamond: '<polygon points="12,1 23,12 12,23 1,12"/>',
  square: '<rect x="2" y="2" width="20" height="20" rx="1"/>',
  triangle: '<polygon points="12,1 23,22 1,22"/>',
  circle: '<circle cx="12" cy="12" r="10.5"/>',
  star: '<polygon points="12,1 14.8,8.5 23,9 16.7,14.2 18.8,22 12,17.6 5.2,22 7.3,14.2 1,9 9.2,8.5"/>'
};

const selected = new Set();
const grid = document.querySelector('#card-grid');
const slots = document.querySelector('#code-slots');
const count = document.querySelector('#pick-count');
const entryMessage = document.querySelector('#entry-message');
const entryNote = document.querySelector('.entry-note');
const submitButton = document.querySelector('#submit-button');
const resetButton = document.querySelector('#reset-button');
const newPuzzleButton = document.querySelector('#new-puzzle-button');
const clueList = document.querySelector('#clue-list');
const clueCount = document.querySelector('#clue-count');
const puzzleNumberDisplay = document.querySelector('#puzzle-number');
const toast = document.querySelector('#result-toast');
const multiplayerButton = document.querySelector('#multiplayer-button');
const multiplayerBanner = document.querySelector('#multiplayer-banner');
const multiplayerStatus = document.querySelector('#multiplayer-status');
const copyRoomLinkButton = document.querySelector('#copy-room-link');
const leaveRoomButton = document.querySelector('#leave-room');
let toastTimer;
let cards = [];
let clues = [];
let puzzleNumber = 1;
let multiplayerMode = false;
let gameOver = false;
let remoteSubmitHandler = null;

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function randomInteger(minimum, maximum) {
  return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function createDeck() {
  const shuffledColorDistribution = shuffle(colorDistribution);
  const colorBag = colors.flatMap((color, index) => Array(shuffledColorDistribution[index]).fill(color));
  const shapeBag = shapes.flatMap((shape, index) => Array(shapeDistribution[index]).fill(shape));
  const shuffledColors = shuffle(colorBag);
  const shuffledShapes = shuffle(shapeBag);
  return Array.from({ length: 26 }, (_, index) => ({
    letter: String.fromCharCode(65 + index),
    number: index + 1,
    color: shuffledColors[index],
    shape: shuffledShapes[index]
  }));
}

function frequencies(items, property) {
  return items.reduce((counts, item) => {
    counts[item[property]] = (counts[item[property]] || 0) + 1;
    return counts;
  }, {});
}

function createCluePool(deck, answer) {
  const values = answer.map((card) => card.number);
  const total = values.reduce((sum, value) => sum + value, 0);
  const colorFrequency = frequencies(deck, 'color');
  const shapeFrequency = frequencies(deck, 'shape');
  const rarestColor = Object.keys(colorFrequency).sort((a, b) => colorFrequency[a] - colorFrequency[b])[0];
  const mostCommonColor = Object.keys(colorFrequency).sort((a, b) => colorFrequency[b] - colorFrequency[a])[0];
  const rarestShapes = Object.keys(shapeFrequency).sort((a, b) => shapeFrequency[a] - shapeFrequency[b]).slice(0, 2);
  const outerSum = values[0] + values[3];
  const middleSum = values[1] + values[2];
  const middleGap = values[2] - values[1];
  const spread = values[3] - values[0];
  const middleProduct = values[1] * values[2];
  const outerProduct = values[0] * values[3];
  const middleProductMinimum = Math.max(2, middleProduct - randomInteger(1, Math.max(1, Math.floor(middleProduct * 0.25))));
  const outerProductMaximum = outerProduct + randomInteger(1, Math.max(2, Math.floor(outerProduct * 0.2)));
  const sumMaximum = Math.min(100, total + randomInteger(0, 8));
  const outerMaximum = Math.min(52, outerSum + randomInteger(0, 6));
  const extremesMinimum = Math.max(2, outerSum - randomInteger(0, 6));
  const middleMinimum = Math.max(3, middleSum - randomInteger(0, 8));
  const middleGapMaximum = Math.min(26, middleGap + randomInteger(0, 5));
  const spreadMinimum = Math.max(1, spread - randomInteger(0, 5));
  const clue = (id, text, test) => ({ id, text, test });

  const sumExact = clue('sum-exact', `네 장에 적힌 숫자의 합은 <b>${total}</b>입니다`,
    (chosen) => chosen.reduce((sum, card) => sum + card.number, 0) === total);
  const middleSumExact = clue('middle-sum-exact', `두 번째 카드와 세 번째 카드 숫자의 합은 <b>${middleSum}</b>`,
    (chosen) => chosen[1].number + chosen[2].number === middleSum);
  const middleProductExact = clue('middle-product-exact', `두 번째 카드와 세 번째 카드 숫자의 곱은 <b>${middleProduct}</b>`,
    (chosen) => chosen[1].number * chosen[2].number === middleProduct);
  const spreadExact = clue('spread-exact', `가장 큰 숫자와 가장 작은 숫자의 차는 <b>${spread}</b>`,
    (chosen) => chosen[3].number - chosen[0].number === spread);
  const sumAtMost = clue('sum-max', `네 장에 적힌 숫자의 합은 <b>${sumMaximum} 이하</b>`,
    (chosen) => chosen.reduce((sum, card) => sum + card.number, 0) <= sumMaximum);
  const colorCount = clue('colors', `사용된 카드의 색깔은 총 <b>${new Set(answer.map((card) => card.color)).size}종류</b>`,
    (chosen) => new Set(chosen.map((card) => card.color)).size === new Set(answer.map((card) => card.color)).size);
  const shapeCount = clue('shapes', `사용된 카드의 도형은 총 <b>${new Set(answer.map((card) => card.shape)).size}종류</b>`,
    (chosen) => new Set(chosen.map((card) => card.shape)).size === new Set(answer.map((card) => card.shape)).size);
  const outerMaximumClue = clue('outer-max', `첫 번째 카드와 네 번째 카드 숫자의 합은 <b>${outerMaximum} 이하</b>`,
    (chosen) => chosen[0].number + chosen[3].number <= outerMaximum);
  const extremesMinimumClue = clue('extremes-min', `가장 큰 숫자와 가장 작은 숫자의 합은 <b>${extremesMinimum} 이상</b>`,
    (chosen) => chosen[0].number + chosen[3].number >= extremesMinimum);

  const arithmeticClues = [
    clue('middle-sum-min', `두 번째 카드와 세 번째 카드 숫자의 합은 <b>${middleMinimum} 이상</b>`,
      (chosen) => chosen[1].number + chosen[2].number >= middleMinimum),
    clue('middle-gap-max', `두 번째 카드와 세 번째 카드 숫자의 차는 <b>${middleGapMaximum} 이하</b>`,
      (chosen) => chosen[2].number - chosen[1].number <= middleGapMaximum),
    clue('spread-min', `가장 큰 숫자와 가장 작은 숫자의 차는 <b>${spreadMinimum} 이상</b>`,
      (chosen) => chosen[3].number - chosen[0].number >= spreadMinimum),
    clue('middle-product-min', `두 번째 카드와 세 번째 카드 숫자의 곱은 <b>${middleProductMinimum} 이상</b>`,
      (chosen) => chosen[1].number * chosen[2].number >= middleProductMinimum),
    clue('outer-product-max', `첫 번째 카드와 네 번째 카드 숫자의 곱은 <b>${outerProductMaximum} 이하</b>`,
      (chosen) => chosen[0].number * chosen[3].number <= outerProductMaximum)
  ];

  const frequencyClues = [];
  const rareColorRanks = answer.flatMap((card, index) => card.color === rarestColor ? [index + 1] : []);
  if (rareColorRanks.length) {
    const rank = rareColorRanks[randomInteger(0, rareColorRanks.length - 1)];
    frequencyClues.push(clue('rare-color', `${rank}번째로 작은 숫자 카드의 색깔은 A–Z 중 <b>가장 적게 등장하는 색깔</b>`,
      (chosen) => chosen[rank - 1].color === rarestColor));
  }

  const commonColorRanks = answer.flatMap((card, index) => card.color === mostCommonColor ? [index + 1] : []);
  if (commonColorRanks.length) {
    const rank = commonColorRanks[randomInteger(0, commonColorRanks.length - 1)];
    frequencyClues.push(clue('common-color', `${rank}번째로 작은 숫자 카드의 색깔은 A–Z 중 <b>가장 많이 등장하는 색깔</b>`,
      (chosen) => chosen[rank - 1].color === mostCommonColor));
  }

  const rareShapeRanks = answer.flatMap((card, index) => rarestShapes.includes(card.shape) ? [index + 1] : []);
  if (rareShapeRanks.length) {
    const rank = rareShapeRanks[randomInteger(0, rareShapeRanks.length - 1)];
    frequencyClues.push(clue('rare-shape', `${rank}번째로 작은 숫자 카드의 도형은 A–Z 중 <b>가장 적게 등장하는 두 종류의 도형</b> 중 하나`,
      (chosen) => rarestShapes.includes(chosen[rank - 1].shape)));
  }

  return {
    sumExact,
    sumAtMost,
    middleSumExact,
    middleProductExact,
    spreadExact,
    colorCount,
    shapeCount,
    outerMaximumClue,
    extremesMinimumClue,
    arithmeticClues,
    frequencyClues
  };
}

function findSolutions(deck, puzzleClues, limit = 2) {
  const solutions = [];
  for (let first = 0; first < 23; first += 1) {
    for (let second = first + 1; second < 24; second += 1) {
      for (let third = second + 1; third < 25; third += 1) {
        for (let fourth = third + 1; fourth < 26; fourth += 1) {
          const chosen = [deck[first], deck[second], deck[third], deck[fourth]];
          if (puzzleClues.every((item) => item.test(chosen))) {
            solutions.push(chosen);
            if (solutions.length >= limit) return solutions;
          }
        }
      }
    }
  }
  return solutions;
}

function generatePuzzle() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const deck = createDeck();
    const answer = shuffle(deck).slice(0, 4).sort((a, b) => a.number - b.number);
    const pool = createCluePool(deck, answer);
    const templateRoll = Math.random();
    const template = templateRoll < 0.3 ? 1 : templateRoll < 0.9 ? 2 : 3;
    let preFrequencyClues;
    let frequencyClue;

    if (template === 1) {
      const arithmetic = Math.random() < 0.55 ? pool.middleProductExact : pool.middleSumExact;
      preFrequencyClues = [
        pool.sumAtMost,
        pool.colorCount,
        pool.shapeCount,
        arithmetic,
        pool.spreadExact
      ];
    } else if (template === 2) {
      frequencyClue = pool.frequencyClues.find((item) => item.id === 'rare-shape');
      if (!frequencyClue) continue;
      const useMultiplication = Math.random() < 0.65;
      const arithmetic = useMultiplication
        ? shuffle(pool.arithmeticClues.filter((item) => item.id.includes('product')))[0]
        : shuffle(pool.arithmeticClues.filter((item) => !item.id.includes('product')))[0];
      preFrequencyClues = [pool.sumExact, pool.colorCount, pool.shapeCount, arithmetic];
    } else {
      frequencyClue = pool.frequencyClues.find((item) => item.id === 'rare-color');
      if (!frequencyClue) continue;
      preFrequencyClues = [
        pool.sumExact,
        pool.colorCount,
        pool.shapeCount,
        pool.outerMaximumClue,
        pool.extremesMinimumClue
      ];
    }

    const candidates = findSolutions(deck, preFrequencyClues, 61);
    if (candidates.length < 8 || candidates.length > 60) continue;
    if (template === 1) {
      frequencyClue = shuffle(pool.frequencyClues).find((candidate) =>
        findSolutions(deck, [...preFrequencyClues, candidate]).length === 1
      );
      if (!frequencyClue) continue;
    }
    const puzzleClues = [...shuffle(preFrequencyClues), frequencyClue];
    const solutions = findSolutions(deck, puzzleClues);
    if (solutions.length === 1) return { cards: deck, clues: puzzleClues, template };
  }
  throw new Error('유일한 해답을 가진 퍼즐을 만들지 못했습니다.');
}

function renderCards() {
  grid.innerHTML = cards.map(({ letter, number, color, shape }) => `
    <button class="playing-card" type="button" data-letter="${letter}" data-color="${color}" aria-label="${letter} 카드, 숫자 ${number}, ${colorName(color)}, ${shapeName(shape)}" aria-pressed="false">
      <span class="card-corner"><span class="card-letter">${letter}</span><span class="card-value">${number}</span></span>
      <span class="card-center" aria-hidden="true"><svg viewBox="0 0 24 24">${shapeSvg[shape]}</svg></span>
      <span class="card-symbol" aria-hidden="true"><svg viewBox="0 0 24 24">${shapeSvg[shape]}</svg></span>
    </button>`).join('');
}

function colorName(color) {
  return colorNames[color];
}

function shapeName(shape) {
  return { diamond: '마름모', square: '네모', triangle: '세모', circle: '원', star: '별' }[shape];
}

function renderSelection() {
  const letters = [...selected].sort();
  const full = letters.length === 4;
  count.innerHTML = `<strong>${letters.length}</strong><span> / 4 선택</span>`;
  slots.innerHTML = Array.from({ length: 4 }, (_, index) => {
    const letter = letters[index] || '';
    return `<span class="code-slot${letter ? ' filled' : ''}" aria-label="${index + 1}번째 자리 ${letter || '비어 있음'}">${letter}</span>`;
  }).join('');
  entryMessage.textContent = full ? '코드를 확인할 준비가 됐어요' : '카드를 네 장 고르세요';
  entryNote.classList.toggle('complete', full);

  grid.querySelectorAll('.playing-card').forEach((button) => {
    const isSelected = selected.has(button.dataset.letter);
    button.classList.toggle('selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
    button.disabled = gameOver || (!isSelected && selected.size === 4);
  });
}

function evaluateCode() {
  const chosen = [...selected].sort().map((letter) => cards[letter.charCodeAt(0) - 65]);
  return evaluateCards(chosen);
}

function evaluateLetters(letters) {
  if (!Array.isArray(letters) || letters.length !== 4 || new Set(letters).size !== 4) return null;
  const chosen = [...letters].sort().map((letter) => cards[letter.charCodeAt(0) - 65]);
  if (chosen.some((card) => !card)) return null;
  return evaluateCards(chosen);
}

function evaluateCards(chosen) {
  if (clues.some((item) => typeof item.test !== 'function')) return null;
  return Object.fromEntries(clues.map((item) => [item.id, item.test(chosen)]));
}

function renderResults(results) {
  clueList.querySelectorAll('li').forEach((item) => {
    const passes = results[item.dataset.clue];
    item.classList.toggle('pass', passes);
    item.classList.toggle('fail', !passes);
  });
}

function renderClues() {
  clueCount.textContent = String(clues.length).padStart(2, '0');
  clueList.innerHTML = clues.map((item, index) => `
    <li data-clue="${item.id}">
      <span class="clue-number">${String(index + 1).padStart(2, '0')}</span>
      <span class="clue-text">${item.text}</span>
      <span class="clue-status" aria-hidden="true"></span>
    </li>`).join('');
}

function clearClueResults() {
  clueList.querySelectorAll('li').forEach((item) => item.classList.remove('pass', 'fail'));
}

function clearToast() {
  window.clearTimeout(toastTimer);
  toast.hidden = true;
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3800);
}

grid.addEventListener('click', (event) => {
  const button = event.target.closest('.playing-card');
  if (!button || button.disabled) return;
  const { letter } = button.dataset;
  if (selected.has(letter)) selected.delete(letter);
  else if (selected.size < 4) selected.add(letter);
  clearClueResults();
  clearToast();
  renderSelection();
});

submitButton.addEventListener('click', () => {
  if (selected.size !== 4) {
    showToast('카드를 네 장 선택한 다음 확인해 주세요.', true);
    return;
  }
  const code = [...selected].sort().join('');
  if (remoteSubmitHandler) {
    remoteSubmitHandler(code);
    return;
  }
  const results = evaluateCode();
  renderResults(results);
  const passed = Object.values(results).every(Boolean);
  showToast(passed ? `${code} — 모든 단서를 풀었습니다. 암호가 열렸어요.` : `${code} — 아직 맞지 않는 단서가 있어요. 표시된 조건을 다시 살펴보세요.`, !passed);
  if (passed && multiplayerMode) window.FourCardMultiplayer?.hostSolved(code);
});

resetButton.addEventListener('click', () => {
  selected.clear();
  clearClueResults();
  clearToast();
  renderSelection();
});

newPuzzleButton.addEventListener('click', () => {
  if (multiplayerMode) return;
  puzzleNumber += 1;
  const puzzle = generatePuzzle();
  cards = puzzle.cards;
  clues = puzzle.clues;
  selected.clear();
  clearToast();
  puzzleNumberDisplay.textContent = String(puzzleNumber).padStart(2, '0');
  document.querySelector('.chapter-stamp').setAttribute('aria-label', `퍼즐 번호 ${puzzleNumberDisplay.textContent}`);
  renderClues();
  renderCards();
  renderSelection();
});

multiplayerButton.addEventListener('click', () => window.FourCardMultiplayer?.startOrJoin());
copyRoomLinkButton.addEventListener('click', () => window.FourCardMultiplayer?.copyInvite());
leaveRoomButton.addEventListener('click', () => window.FourCardMultiplayer?.leave());

const firstPuzzle = generatePuzzle();
cards = firstPuzzle.cards;
clues = firstPuzzle.clues;
renderClues();
renderCards();
renderSelection();

window.FourCardPuzzle = {
  getPuzzle() {
    return {
      cards: cards.map((card) => ({ ...card })),
      clues: clues.map(({ id, text }) => ({ id, text }))
    };
  },
  applyRemotePuzzle(puzzle) {
    if (!Array.isArray(puzzle?.cards) || puzzle.cards.length !== 26 || !Array.isArray(puzzle?.clues) || ![5, 6].includes(puzzle.clues.length)) return false;
    cards = puzzle.cards;
    clues = puzzle.clues.map(({ id, text }) => ({ id, text, test: null }));
    selected.clear();
    gameOver = false;
    clearClueResults();
    clearToast();
    renderClues();
    renderCards();
    renderSelection();
    return true;
  },
  evaluateLetters,
  showResults: renderResults,
  showToast,
  setRemoteSubmitHandler(handler) {
    remoteSubmitHandler = handler;
  },
  setMultiplayerMode(active) {
    multiplayerMode = active;
    gameOver = false;
    multiplayerButton.disabled = active;
    multiplayerButton.querySelector('span').textContent = active ? '대결 중' : '2인 대결';
    newPuzzleButton.disabled = active;
    renderSelection();
  },
  setStatus(message, { canCopy = false } = {}) {
    multiplayerStatus.textContent = message;
    multiplayerBanner.hidden = false;
    copyRoomLinkButton.hidden = !canCopy;
    leaveRoomButton.hidden = false;
  },
  setGameOver() {
    gameOver = true;
    renderSelection();
  },
  endMultiplayer() {
    multiplayerMode = false;
    gameOver = false;
    remoteSubmitHandler = null;
    multiplayerBanner.hidden = true;
    copyRoomLinkButton.hidden = true;
    leaveRoomButton.hidden = true;
    multiplayerButton.disabled = false;
    multiplayerButton.querySelector('span').textContent = '2인 대결';
    newPuzzleButton.disabled = false;
    selected.clear();
    clearClueResults();
    clearToast();
    const puzzle = generatePuzzle();
    cards = puzzle.cards;
    clues = puzzle.clues;
    puzzleNumber += 1;
    puzzleNumberDisplay.textContent = String(puzzleNumber).padStart(2, '0');
    document.querySelector('.chapter-stamp').setAttribute('aria-label', `퍼즐 번호 ${puzzleNumberDisplay.textContent}`);
    renderClues();
    renderCards();
    renderSelection();
  }
};
