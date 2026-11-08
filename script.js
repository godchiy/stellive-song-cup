let allSongs = [];
let currentRoundSongs = [];
let nextRoundSongs = [];
let spareSongs = []; // [신규] 선택되지 않은 나머지 전곡 (예비 대기 풀)
let matchIndex = 0;
let totalMatchesInRound = 0;
let isHighlightOnly = false;
let currentWinnerSong = null;

// 재생 실패가 확인된 노래 ID 기록 (중복 선택 방지)
let brokenSongIds = new Set();

let playerLeft = null;
let playerRight = null;
let isApiReady = false;

// 1. 유튜브 IFrame API 동적 로드
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onYouTubeIframeAPIReady = function() {
  playerLeft = new YT.Player('player-left', {
    height: '100%',
    width: '100%',
    playerVars: { 'autoplay': 0, 'enablejsapi': 1, 'origin': window.location.origin },
    events: {
      'onError': (e) => handleVideoError(0, e)
    }
  });

  playerRight = new YT.Player('player-right', {
    height: '100%',
    width: '100%',
    playerVars: { 'autoplay': 0, 'enablejsapi': 1, 'origin': window.location.origin },
    events: {
      'onError': (e) => handleVideoError(1, e)
    }
  });

  isApiReady = true;
};

// 2. 스타트 버튼 상태 제어
function updateStartButtons(ready, message = "") {
  const roundBtns = document.querySelectorAll('.btn-round');
  const startDesc = document.getElementById('start-desc');
  
  if (ready) {
    roundBtns.forEach(btn => {
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });
    if (startDesc) startDesc.innerText = "원하는 라운드 수를 선택하고 월드컵을 시작하세요.";
  } else {
    roundBtns.forEach(btn => {
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
    });
    if (startDesc && message) startDesc.innerHTML = message;
  }
}

// 3. JSON 데이터 로드
fetch('./songs.json')
  .then(res => {
    if (!res.ok) throw new Error("songs.json 로드 실패");
    return res.json();
  })
  .then(data => {
    if (!Array.isArray(data) || data.length === 0) throw new Error("데이터 없음");
    allSongs = data;
    updateStartButtons(true);
    initHoverEvents();
  })
  .catch(err => {
    updateStartButtons(false, `<span style="color: #dc2626;"> songs.json 로드 실패 (http://localhost:8000 접속 상태 확인)</span>`);
  });

// 하이라이트 토글
document.getElementById('highlight-toggle').addEventListener('change', (e) => {
  isHighlightOnly = e.target.checked;
  if (!document.getElementById('game-view').classList.contains('hidden')) {
    loadMatch();
  }
});

// 마우스 호버 재생
function initHoverEvents() {
  const cardLeft = document.getElementById('card-left');
  const cardRight = document.getElementById('card-right');
  if (!cardLeft || !cardRight) return;

  cardLeft.addEventListener('mouseenter', () => {
    if (playerLeft && playerLeft.playVideo) playerLeft.playVideo();
    if (playerRight && playerRight.pauseVideo) playerRight.pauseVideo();
  });
  cardLeft.addEventListener('mouseleave', () => {
    if (playerLeft && playerLeft.pauseVideo) playerLeft.pauseVideo();
  });

  cardRight.addEventListener('mouseenter', () => {
    if (playerRight && playerRight.playVideo) playerRight.playVideo();
    if (playerLeft && playerLeft.pauseVideo) playerLeft.pauseVideo();
  });
  cardRight.addEventListener('mouseleave', () => {
    if (playerRight && playerRight.pauseVideo) playerRight.pauseVideo();
  });
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

// 4. 라운드 선택 (선택한 수만큼 경기 배치 + 나머지 곡은 예비 벤치 spareSongs에 보관)
window.selectRound = function(roundNum) {
  if (!allSongs || allSongs.length < 2) return;

  let shuffled = shuffleArray([...allSongs]);
  
  if (roundNum > 0 && shuffled.length >= roundNum) {
    currentRoundSongs = shuffled.slice(0, roundNum);
    spareSongs = shuffled.slice(roundNum); // 선택되지 않은 나머지 전곡을 예비 대기 풀에 배치
  } else {
    currentRoundSongs = shuffled;
    spareSongs = [];
  }

  // 짝수 보정
  if (currentRoundSongs.length % 2 !== 0) {
    const popped = currentRoundSongs.pop();
    if (popped) spareSongs.push(popped);
  }

  document.getElementById('start-view').classList.add('hidden');
  document.getElementById('game-header').classList.remove('hidden');
  document.getElementById('game-view').classList.remove('hidden');

  startWorldCup(currentRoundSongs);
};

window.selectCustomRound = function() {
  const inputEl = document.getElementById('custom-round-input');
  if (!inputEl) return;

  let num = parseInt(inputEl.value, 10);
  if (isNaN(num) || num < 2) {
    alert("2 이상의 숫자를 입력해 주세요.");
    return;
  }

  if (num % 2 !== 0) num--;
  if (num > allSongs.length) num = allSongs.length;
  if (num % 2 !== 0) num--;

  selectRound(num);
};

document.addEventListener('DOMContentLoaded', () => {
  const customInput = document.getElementById('custom-round-input');
  if (customInput) {
    customInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') selectCustomRound();
    });
  }
});

function startWorldCup(songs) {
  currentRoundSongs = songs;
  nextRoundSongs = [];
  matchIndex = 0;
  totalMatchesInRound = Math.floor(currentRoundSongs.length / 2);
  loadMatch();
}

function loadMatch() {
  const currentRoundName = currentRoundSongs.length === 2 ? "결승전" : `${currentRoundSongs.length}강`;
  document.getElementById('round-title').innerText = `${currentRoundName} (${matchIndex + 1}/${totalMatchesInRound})`;
  document.getElementById('progress-bar').style.width = `${(matchIndex / totalMatchesInRound) * 100}%`;

  const songA = currentRoundSongs[matchIndex * 2];
  const songB = currentRoundSongs[matchIndex * 2 + 1];

  if (!songA || !songB) return;

  document.getElementById('title-left').innerText = songA.title;
  document.getElementById('singer-left').innerText = songA.singer;
  
  document.getElementById('title-right').innerText = songB.title;
  document.getElementById('singer-right').innerText = songB.singer;

  const startA = (isHighlightOnly && songA.startTime) ? songA.startTime : 0;
  const startB = (isHighlightOnly && songB.startTime) ? songB.startTime : 0;

  if (isApiReady && playerLeft && playerRight) {
    playerLeft.cueVideoById({ videoId: songA.youtubeId, startSeconds: startA });
    playerRight.cueVideoById({ videoId: songB.youtubeId, startSeconds: startB });
  }
}

// 5. [핵심] 재생 오류 발생 시 예비 벤치(spareSongs)에서 정상 곡을 즉시 수급
function handleVideoError(failedIndex, event) {
  const failedSongIdx = matchIndex * 2 + failedIndex;
  const brokenSong = currentRoundSongs[failedSongIdx];

  if (brokenSong && brokenSong.id) {
    brokenSongIds.add(brokenSong.id);
  }

  // 1순위: 예비 벤치(spareSongs)에서 깨지지 않은 노래 찾기
  let replacementSongIdx = -1;
  for (let i = 0; i < spareSongs.length; i++) {
    if (!brokenSongIds.has(spareSongs[i].id)) {
      replacementSongIdx = i;
      break;
    }
  }

  if (replacementSongIdx !== -1) {
    // 예비 벤치에서 1곡을 꺼내 에러 난 카드로 대치
    const newSong = spareSongs.splice(replacementSongIdx, 1)[0];
    currentRoundSongs[failedSongIdx] = newSong;
    loadMatch();
    return;
  }

  // 2순위: 예비 벤치가 비었으면 뒤쪽 대진 곡 중 검증된 곡과 교체
  let swapIdx = -1;
  for (let i = (matchIndex + 1) * 2; i < currentRoundSongs.length; i++) {
    const candidate = currentRoundSongs[i];
    if (candidate && !brokenSongIds.has(candidate.id)) {
      swapIdx = i;
      break;
    }
  }

  if (swapIdx !== -1) {
    const replacementSong = currentRoundSongs[swapIdx];
    currentRoundSongs[failedSongIdx] = replacementSong;
    currentRoundSongs[swapIdx] = brokenSong;
    loadMatch();
    return;
  }

  // 3순위: 완전히 대체 가능한 곡이 없는 경우 부전승 처리
  const winnerSide = failedIndex === 0 ? 1 : 0;
  selectWinner(winnerSide);
}

// 승자 선택
window.selectWinner = function(selectedIndex) {
  if (playerLeft && playerLeft.pauseVideo) playerLeft.pauseVideo();
  if (playerRight && playerRight.pauseVideo) playerRight.pauseVideo();

  const winner = currentRoundSongs[matchIndex * 2 + selectedIndex];
  if (winner) nextRoundSongs.push(winner);
  
  matchIndex++;

  if (matchIndex >= totalMatchesInRound) {
    if (nextRoundSongs.length === 1) {
      showWinner(nextRoundSongs[0]);
    } else {
      if (nextRoundSongs.length % 2 !== 0 && nextRoundSongs.length > 1) {
        nextRoundSongs.pop();
      }
      startWorldCup(nextRoundSongs);
    }
  } else {
    loadMatch();
  }
};

// 우승 결과
function showWinner(winnerSong) {
  currentWinnerSong = winnerSong;
  saveWinRecord(winnerSong.id);

  document.getElementById('game-header').classList.add('hidden');
  document.getElementById('game-view').classList.add('hidden');
  
  const resultView = document.getElementById('result-view');
  resultView.classList.remove('hidden');

  document.getElementById('title-winner').innerText = winnerSong.title;
  document.getElementById('singer-winner').innerText = winnerSong.singer;
  
  const winnerPlayerContainer = document.getElementById('player-winner');
  winnerPlayerContainer.src = `https://www.youtube.com/embed/${winnerSong.youtubeId}?autoplay=1`;

  renderRankingList();
}

function saveWinRecord(songId) {
  let stats = JSON.parse(localStorage.getItem('stellive_cup_stats') || '{}');
  stats[songId] = (stats[songId] || 0) + 1;
  localStorage.setItem('stellive_cup_stats', JSON.stringify(stats));
}

function renderRankingList() {
  const stats = JSON.parse(localStorage.getItem('stellive_cup_stats') || '{}');
  const totalPlays = Object.values(stats).reduce((a, b) => a + b, 0) || 1;

  let rankedSongs = allSongs.map(song => ({
    ...song,
    wins: stats[song.id] || 0,
    percent: Math.round(((stats[song.id] || 0) / totalPlays) * 100)
  }));

  rankedSongs.sort((a, b) => b.wins - a.wins);

  const top5 = rankedSongs.slice(0, 5);
  const rankingListEl = document.getElementById('ranking-list');
  if (!rankingListEl) return;
  rankingListEl.innerHTML = '';

  top5.forEach((song, idx) => {
    const isUserWinner = currentWinnerSong && currentWinnerSong.id === song.id;
    const itemHtml = `
      <div class="rank-item" style="${isUserWinner ? 'border-color: var(--accent-10-cta); background: rgba(255,84,0,0.08);' : ''}">
        <div class="rank-num">${idx + 1}</div>
        <div class="rank-info">
          <div class="rank-title">${song.title} ${isUserWinner ? '' : ''}</div>
          <div class="rank-singer">${song.singer}</div>
        </div>
        <div class="rank-bar-bg">
          <div class="rank-bar-fill" style="width: ${Math.max(song.percent, 8)}%;"></div>
        </div>
        <div class="rank-percent">${song.percent}%</div>
      </div>
    `;
    rankingListEl.insertAdjacentHTML('beforeend', itemHtml);
  });
}

// 공유 기능
window.shareX = function() {
  if (!currentWinnerSong) return;
  const text = encodeURIComponent(`나의 스텔라이브 최애 곡은 [ ${currentWinnerSong.title} ]! \n당신의 최애곡은 무엇인가요? 지금 도전해 보세요!`);
  const url = encodeURIComponent(window.location.href);
  window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
};

window.copyResultLink = function() {
  navigator.clipboard.writeText(window.location.href);
};

// 무알람 다크 모드
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle');
  const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector('.theme-icon') : null;
  const themeText = themeToggleBtn ? themeToggleBtn.querySelector('.theme-text') : null;

  const savedTheme = localStorage.getItem('stellive_cup_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeText) themeText.innerText = '라이트 모드';
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      
      if (themeText) themeText.innerText = isDark ? '라이트 모드' : '다크 모드';
      
      localStorage.setItem('stellive_cup_theme', isDark ? 'dark' : 'light');
    });
  }
});