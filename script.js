/**
 * Daily Motivation Widget - 성능 및 보안이 최적화된 JavaScript
 * 
 * = 최적화 포인트 =
 * 1. 보안: XSS 방지를 위해 DOM 주입 시 textContent만 활용 (innerHTML 배제).
 * 2. 코드 가독성 & 메모리: IIFE(즉시 실행 함수) 패턴을 사용해 전역 스코프 오염 방지 및 은닉화.
 * 3. 성능: 선언부에서 DOM 요소를 한 번만 캐싱(DOM Query 최소화). CSS 하드웨어 가속 트랜지션 처리 위임.
 */

(function () {
    'use strict';

    // ======================================
    // 1. 상태 및 데이터 선언 (Data Store)
    // ======================================
    const QUOTES_DATA = [
        { text: "시작하는 방법은 그만 말하고 이제 행동하는 것이다.", author: "월트 디즈니", category: "success" },
        { text: "실패는 잊어라. 그러나 그것이 준 교훈은 절대 잊지 마라.", author: "허버트 개서", category: "wisdom" },
        { text: "성공의 비결은 단 한 가지, 잘할 수 있는 일에 광적으로 집중하는 것이다.", author: "톰 모나건", category: "success" },
        { text: "우리가 이룰 수 있는 한계는 오직 우리가 스스로 설정한 한계뿐이다.", author: "랄프 왈도 에머슨", category: "challenge" },
        { text: "1년 후면 당신은 오늘 시작하지 않은 것을 후회하게 될 것이다.", author: "카렌 램", category: "challenge" },
        { text: "고난의 시기에 동요하지 않는 것, 이것은 진정 칭찬받을 만한 뛰어난 인물의 증거다.", author: "베토벤", category: "inspiration" },
        { text: "피할 수 없으면 즐겨라.", author: "로버트 엘리엇", category: "wisdom" },
        { text: "어제를 후회하지 마라. 인생은 오늘의 내 안에 있고 내일은 스스로 만드는 것이다.", author: "L.론허바드", category: "inspiration" },
        { text: "인생에 뜻을 세우는데 있어 늦은 때란 없다.", author: "볼드윈", category: "wisdom" },
        { text: "꿈을 계속 간직하고 있으면 반드시 실현할 때가 온다.", author: "괴테", category: "inspiration" },
        { text: "행동이 모든 성공의 기본 열쇠이다.", author: "파블로 피카소", category: "success" },
        { text: "가장 큰 위험은 아무런 위험도 감수하지 않는 것이다.", author: "마크 주커버그", category: "challenge" }
    ];

    const CATEGORY_MAP = {
        'success': '성공',
        'challenge': '도전',
        'inspiration': '영감',
        'wisdom': '지혜'
    };

    let filteredQuotes = [...QUOTES_DATA];
    let currentQuote = null;
    let isAnimating = false; // 중복 클릭 방지 (이벤트 최적화)

    // 로컬 스토리지 키 관리
    const STORAGE_KEYS = {
        THEME: 'dm_theme',
        VIEWS: 'dm_views',
        BOOKMARKS: 'dm_bookmarks',
        LAST_DATE: 'dm_last_date',
        DAILY_IDX: 'dm_daily_idx'
    };

    // ======================================
    // 2. DOM 요소 캐싱 (DOM 탐색 최소화)
    // ======================================
    const DOM = {
        body: document.body,
        themeToggle: document.getElementById('theme-toggle'),
        categoryFilter: document.getElementById('category-filter'),
        viewCount: document.getElementById('view-count'),
        bookmarkCount: document.getElementById('bookmark-count'),
        skeletonBox: document.getElementById('quote-box'),
        contentBox: document.getElementById('quote-content-box'),
        quoteText: document.getElementById('quote-text'),
        quoteAuthor: document.getElementById('quote-author'),
        quoteBadge: document.getElementById('quote-category-badge'),
        nextBtn: document.getElementById('next-btn'),
        bookmarkBtn: document.getElementById('bookmark-btn'),
        copyBtn: document.getElementById('copy-btn'),
        shareBtn: document.getElementById('share-btn'),
        toastContainer: document.getElementById('toast-container')
    };

    // ======================================
    // 3. 로컬 스토리지 및 통계 관리 유틸
    // ======================================
    const Store = {
        get: (key, defaultValue) => {
            try {
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                console.warn('LocalStorage 접근 제한됨', e);
                return defaultValue;
            }
        },
        set: (key, value) => {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn('LocalStorage 저장 실패', e);
            }
        }
    };

    let viewCount = Store.get(STORAGE_KEYS.VIEWS, 0);
    let bookmarks = Store.get(STORAGE_KEYS.BOOKMARKS, []);

    function updateStatsUI() {
        // XSS 방어: innerHTML 대신 textContent 적용
        DOM.viewCount.textContent = viewCount;
        DOM.bookmarkCount.textContent = bookmarks.length;
    }

    function incrementView() {
        viewCount++;
        Store.set(STORAGE_KEYS.VIEWS, viewCount);
        updateStatsUI();
    }

    // ======================================
    // 4. 핵심 로직 및 유틸리티 
    // ======================================

    // 토스트 알림 표시 (성능 최적화를 위해 CSS Transition 활용)
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        DOM.toastContainer.appendChild(toast);

        // 브라우저 렌더링 사이클 이후에 클래스 추가하여 애니메이션 트리거
        requestAnimationFrame(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                // 애니메이션 종료 직후 DOM 제거 (메모리 릭 방지)
                toast.addEventListener('transitionend', () => toast.remove());
            }, 2500);
        });
    }

    // 날짜 기반 "오늘의 명언" 인덱스 추출 로직
    function getDailyQuoteIndex(arrLength) {
        if (arrLength === 0) return 0;
        const today = new Date().toDateString();
        const lastDate = Store.get(STORAGE_KEYS.LAST_DATE, '');

        if (lastDate === today) {
            return Store.get(STORAGE_KEYS.DAILY_IDX, 0) % arrLength;
        } else {
            // 하루에 한 번 랜덤 시드 갱신
            const dailyIdx = Math.floor(Math.random() * arrLength);
            Store.set(STORAGE_KEYS.LAST_DATE, today);
            Store.set(STORAGE_KEYS.DAILY_IDX, dailyIdx);
            return dailyIdx;
        }
    }

    // 다음 명언 데이터 반영 알고리즘 (동일 명언 연속 출력 방지)
    function setNextQuote(forceDaily = false) {
        if (filteredQuotes.length === 0) return;

        let targetIndex = 0;

        if (forceDaily) {
            targetIndex = getDailyQuoteIndex(filteredQuotes.length);
        } else {
            // 이전과 다른 명언 고르기 (배열이 2개 이상일 때)
            if (filteredQuotes.length > 1) {
                do {
                    targetIndex = Math.floor(Math.random() * filteredQuotes.length);
                } while (currentQuote && currentQuote.text === filteredQuotes[targetIndex].text);
            }
        }

        currentQuote = filteredQuotes[targetIndex];
        incrementView();
        renderQuote();
    }

    // 화면 렌더링 (보안 및 상태 업데이트)
    function renderQuote() {
        if (!currentQuote) return;

        // XSS 방어 보장
        DOM.quoteText.textContent = currentQuote.text;
        DOM.quoteAuthor.textContent = `- ${currentQuote.author}`;
        DOM.quoteBadge.textContent = CATEGORY_MAP[currentQuote.category] || '일반';

        // 북마크 버튼 활성화 상태 병합
        const isBookmarked = bookmarks.some(b => b.text === currentQuote.text);
        if (isBookmarked) {
            DOM.bookmarkBtn.classList.add('active');
            DOM.bookmarkBtn.textContent = '🌟';
        } else {
            DOM.bookmarkBtn.classList.remove('active');
            DOM.bookmarkBtn.textContent = '⭐';
        }
    }

    // 페이드 아웃/인 애니메이션 제어 (CSS Transition 위임으로 60fps 보장 및 JS 부하 감소)
    function animateTransition(callback) {
        if (isAnimating) return;
        isAnimating = true;
        DOM.nextBtn.disabled = true;

        DOM.contentBox.classList.remove('show'); // 페이드 아웃 시작

        // CSS transition 타이밍(0.4s)에 맞추어 콘텐츠 교체
        setTimeout(() => {
            callback();
            DOM.contentBox.classList.add('show'); // 페이드 인 시작

            setTimeout(() => {
                isAnimating = false;
                DOM.nextBtn.disabled = false;
            }, 400);
        }, 400);
    }

    // ======================================
    // 5. 사용자와 상호작용 이벤트 핸들러
    // ======================================

    // 다크/라이트 테마 토글
    function toggleTheme() {
        const isDark = DOM.body.classList.toggle('dark-theme');
        DOM.themeToggle.textContent = isDark ? '☀️' : '🌙';
        Store.set(STORAGE_KEYS.THEME, isDark ? 'dark' : 'light');
    }

    // 북마크 상태 토글 (추가/삭제)
    function toggleBookmark() {
        if (!currentQuote) return;
        const existsIndex = bookmarks.findIndex(b => b.text === currentQuote.text);

        if (existsIndex > -1) {
            bookmarks.splice(existsIndex, 1);
            DOM.bookmarkBtn.classList.remove('active');
            DOM.bookmarkBtn.textContent = '⭐';
            showToast('북마크가 해제되었습니다.');
        } else {
            bookmarks.push(currentQuote);
            DOM.bookmarkBtn.classList.add('active');
            DOM.bookmarkBtn.textContent = '🌟';
            showToast('명언이 북마크에 저장되었습니다.');
        }
        Store.set(STORAGE_KEYS.BOOKMARKS, bookmarks);
        updateStatsUI();
    }

    // 클립보드 복사 API 활용
    async function copyToClipboard() {
        if (!currentQuote) return;
        const textToCopy = `"${currentQuote.text}" - ${currentQuote.author}\n[Daily Motivation App]`;
        try {
            await navigator.clipboard.writeText(textToCopy);
            showToast('명언이 클립보드에 복사되었습니다. 🎉');
        } catch (err) {
            console.error('Copy failed', err);
            showToast('복사에 실패했습니다. 브라우저 설정을 확인해주세요.');
        }
    }

    // Web Share API (모바일 최적화 공유)
    async function shareQuote() {
        if (!currentQuote) return;
        if (!navigator.share) {
            showToast('현재 브라우저에서는 네이티브 공유 기능을 지원하지 않습니다.');
            return;
        }
        try {
            await navigator.share({
                title: 'Daily Motivation',
                text: `"${currentQuote.text}" - ${currentQuote.author}`,
                url: window.location.href
            });
            // 사용자가 공유 창을 닫아도 성공/취소 캐치가 명확하지 않을 수 있으나 에러가 아니면 성공 간주.
        } catch (err) {
            if (err.name !== 'AbortError') showToast('공유 중 오류가 발생했습니다.');
        }
    }

    // 필터링 적용 처리
    function applyCategoryFilter(e) {
        const category = e.target.value;
        if (category === 'all') {
            filteredQuotes = [...QUOTES_DATA];
        } else {
            filteredQuotes = QUOTES_DATA.filter(q => q.category === category);
        }

        if (filteredQuotes.length > 0) {
            currentQuote = null;
            animateTransition(() => setNextQuote(false));
        } else {
            // 데이터가 비었을 때의 방어 레이어
            DOM.quoteText.textContent = "해당 카테고리의 명언이 없습니다.";
            DOM.quoteAuthor.textContent = "";
            DOM.quoteBadge.textContent = "알림";
            currentQuote = null;
        }
    }

    // ======================================
    // 6. 초기화 로직 (Init)
    // ======================================
    function initApp() {
        // 1. 테마 초기 설정
        const savedTheme = Store.get(STORAGE_KEYS.THEME, 'light');
        if (savedTheme === 'dark') {
            DOM.body.classList.add('dark-theme');
            DOM.themeToggle.textContent = '☀️';
        }

        // 2. 통계 UI 구성
        updateStatsUI();

        // 3. 이벤트 바인딩 (초깃값 한 번 선언 캐싱)
        DOM.nextBtn.addEventListener('click', () => {
            animateTransition(() => setNextQuote(false));
        });
        DOM.themeToggle.addEventListener('click', toggleTheme);
        DOM.bookmarkBtn.addEventListener('click', toggleBookmark);
        DOM.copyBtn.addEventListener('click', copyToClipboard);
        DOM.shareBtn.addEventListener('click', shareQuote);
        DOM.categoryFilter.addEventListener('change', applyCategoryFilter);

        // 4. 스켈레톤 UI 노출 연출 (체감 레이아웃 로딩 경험, 0.7초 지연)
        setTimeout(() => {
            DOM.skeletonBox.classList.add('hidden');
            DOM.contentBox.classList.remove('hidden');

            setNextQuote(true); // 데일리 명언 세팅

            // Paint Cycle 렌더 큐 이후에 AddClass 처리
            requestAnimationFrame(() => {
                DOM.contentBox.classList.add('show');
            });
        }, 700);
    }

    // HTML DOM 트리가 완성된 직후 시작 (기다릴 이미지 등이 없으므로 Load보다 빠름)
    document.addEventListener('DOMContentLoaded', initApp);

})();
