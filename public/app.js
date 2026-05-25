// ==========================================================================
// Application State
// ==========================================================================
const state = {
    news: [],
    prices: {},
    summary: {},
    bookmarks: JSON.parse(localStorage.getItem('pulse_bookmarks') || '[]'),
    alerts: JSON.parse(localStorage.getItem('pulse_alerts') || '[]'),
    alertHistory: JSON.parse(localStorage.getItem('pulse_alert_history') || '[]'),
    watchlists: JSON.parse(localStorage.getItem('pulse_watchlists') || '{"Default Watchlist": ["BTC", "ETH"]}'),
    activeWatchlistName: localStorage.getItem('pulse_active_watchlist') || 'Default Watchlist',
    theme: localStorage.getItem('pulse_theme') || 'dark',
    chartDays: '1',
    filters: {
        coin: 'All',
        source: 'All',
        sentiment: 'All',
        search: '',
        showBookmarks: false,
        showWatchlist: false,
        maxAgeDays: parseInt(localStorage.getItem('pulse_max_age') || '31')
    }
};

function formatCoinPrice(price, symbol) {
    const val = parseFloat(price);
    if (isNaN(val)) return '0.00';
    const isLowPriced = val < 10 || symbol === 'ADA' || symbol === 'XRP' || symbol === 'cardano' || symbol === 'ripple';
    const decimals = isLowPriced ? 4 : 2;
    return val.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

const coinIdMapping = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'XRP': 'ripple',
    'ADA': 'cardano'
};

const coinNameMapping = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'XRP': 'Ripple',
    'ADA': 'Cardano'
};


// ==========================================================================
// Initialization & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Run Lucide Icons
    lucide.createIcons();
    
    // Initial fetch
    initApp();
    
    // Auto-refresh every 60 seconds
    setInterval(refreshData, 60000);
    
    // Event listeners
    setupEventListeners();
});

function initApp() {
    applyTheme(state.theme);
    updateBookmarkBadge();
    requestNotificationPermission();
    fetchData();
    initLiveWebSocket();
}

function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('pulse_theme', theme);
    if (theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
    const desktopIcon = document.getElementById('theme-icon-desktop');
    if (desktopIcon) {
        desktopIcon.className = theme === 'light' ? 'lucide lucide-moon' : 'lucide lucide-sun';
        desktopIcon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun');
    }
    
    // Update settings buttons active classes
    const themeBtnDark = document.getElementById('theme-btn-dark');
    const themeBtnLight = document.getElementById('theme-btn-light');
    if (themeBtnDark && themeBtnLight) {
        if (theme === 'light') {
            themeBtnLight.classList.add('active');
            themeBtnDark.classList.remove('active');
        } else {
            themeBtnDark.classList.add('active');
            themeBtnLight.classList.remove('active');
        }
    }
    
    lucide.createIcons();
}

async function fetchData() {
    showLoadingState();
    try {
        const [newsRes, pricesRes, summaryRes] = await Promise.all([
            fetch('/api/news').then(r => r.json()),
            fetch('/api/prices').then(r => r.json()),
            fetch('/api/summary').then(r => r.json())
        ]);
        
        state.news = newsRes;
        state.prices = pricesRes;
        state.summary = summaryRes;
        
        checkPriceAlerts();
        renderAll();
    } catch (error) {
        console.error("Error loading application data:", error);
        renderErrorState();
    }
}

async function refreshData() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('spinning');
    
    const layout = document.querySelector('.dashboard-layout');
    if (layout) layout.classList.add('refreshing');
    
    try {
        const [newsRes, pricesRes, summaryRes] = await Promise.all([
            fetch('/api/news').then(r => r.json()),
            fetch('/api/prices').then(r => r.json()),
            fetch('/api/summary').then(r => r.json())
        ]);
        
        state.news = newsRes;
        state.prices = pricesRes;
        state.summary = summaryRes;
        
        checkPriceAlerts();
        renderAll();
    } catch (error) {
        console.error("Error refreshing feed:", error);
    } finally {
        if (refreshBtn) {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        }
        if (layout) {
            setTimeout(() => layout.classList.remove('refreshing'), 500);
        }
    }
}

// ==========================================================================
// Setup Event Listeners
// ==========================================================================
function setupEventListeners() {
    setupMobileTabs();
    

    // Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const newTheme = state.theme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
    }
    
    // Drawer Hamburger Toggle
    const filterDrawerToggle = document.getElementById('filter-drawer-toggle');
    if (filterDrawerToggle) {
        filterDrawerToggle.addEventListener('click', () => {
            // Ensure filters view is showing inside the drawer on mobile
            const filtersView = document.getElementById('sidebar-filters-view');
            const settingsView = document.getElementById('sidebar-settings-view');
            if (filtersView && settingsView) {
                filtersView.style.display = 'block';
                settingsView.style.display = 'none';
            }
            const sidebarTabBtns = document.querySelectorAll('.sidebar-tab-btn');
            sidebarTabBtns.forEach(btn => {
                if (btn.dataset.sidebarTab === 'tab-filters') {
                    btn.classList.add('active');
                    btn.style.color = 'var(--text-primary)';
                } else {
                    btn.classList.remove('active');
                    btn.style.color = 'var(--text-muted)';
                }
            });
            document.body.classList.toggle('drawer-open');
        });
    }
    
    // Close Drawer Buttons
    const drawerCloseBtn = document.getElementById('drawer-close-btn');
    if (drawerCloseBtn) {
        drawerCloseBtn.addEventListener('click', () => {
            document.body.classList.remove('drawer-open');
        });
    }
    
    // Drawer Overlay Backdrop
    const drawerOverlay = document.getElementById('drawer-overlay');
    if (drawerOverlay) {
        drawerOverlay.addEventListener('click', () => {
            document.body.classList.remove('drawer-open');
        });
    }
    
    // Coin Details Overlay Backdrop
    const coinDetailsOverlay = document.getElementById('coin-details-overlay');
    if (coinDetailsOverlay) {
        coinDetailsOverlay.addEventListener('click', () => {
            document.body.classList.remove('coin-details-open');
        });
    }
    
    // Search filter input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.search = e.target.value.toLowerCase().trim();
            renderNewsFeed();
        });
    }
    
    // News Age Range Slider
    const newsAgeSlider = document.getElementById('news-age-slider');
    const newsAgeVal = document.getElementById('news-age-val');
    if (newsAgeSlider && newsAgeVal) {
        newsAgeSlider.value = state.filters.maxAgeDays;
        newsAgeVal.innerText = state.filters.maxAgeDays === 31 ? 'All News' : `Last ${state.filters.maxAgeDays} Days`;
        
        newsAgeSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            state.filters.maxAgeDays = val;
            localStorage.setItem('pulse_max_age', val);
            newsAgeVal.innerText = val === 31 ? 'All News' : `Last ${val} Days`;
            renderNewsFeed();
        });
    }
    
    // Exit Watchlist Filter Button
    const exitWatchlistBtn = document.getElementById('exit-watchlist-btn');
    if (exitWatchlistBtn) {
        exitWatchlistBtn.addEventListener('click', () => {
            state.filters.showWatchlist = false;
            renderAll();
        });
    }
    
    // Refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshData);
    }
    
    // Coin volume list clicks
    const coinVolumeList = document.getElementById('coin-volume-list');
    if (coinVolumeList) {
        coinVolumeList.addEventListener('click', (e) => {
            const item = e.target.closest('.volume-item');
            if (!item) return;
            
            const sym = item.dataset.coin;
            selectFocusCoin(sym);
        });
    }
    
    // Source filter buttons
    const sourceFilters = document.getElementById('source-filters');
    if (sourceFilters) {
        sourceFilters.addEventListener('click', (e) => {
            const btn = e.target.closest('.source-btn');
            if (!btn) return;
            
            sourceFilters.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.filters.source = btn.dataset.source;
            state.filters.showBookmarks = false;
            document.getElementById('bookmark-toggle-btn').classList.remove('active');
            
            renderNewsFeed();
        });
    }
    
    // Sentiment filter buttons
    const sentimentFilters = document.getElementById('sentiment-filters');
    if (sentimentFilters) {
        sentimentFilters.addEventListener('click', (e) => {
            const btn = e.target.closest('.sentiment-filter-btn');
            if (!btn) return;
            
            sentimentFilters.querySelectorAll('.sentiment-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.filters.sentiment = btn.dataset.sent;
            state.filters.showBookmarks = false;
            document.getElementById('bookmark-toggle-btn').classList.remove('active');
            
            renderNewsFeed();
        });
    }
    
    // Bookmark Toggle button
    const bookmarkToggleBtn = document.getElementById('bookmark-toggle-btn');
    if (bookmarkToggleBtn) {
        bookmarkToggleBtn.addEventListener('click', () => {
            state.filters.showBookmarks = !state.filters.showBookmarks;
            bookmarkToggleBtn.classList.toggle('active', state.filters.showBookmarks);
            
            if (state.filters.showBookmarks) {
                document.querySelectorAll('.source-btn, .sentiment-filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                document.querySelector('[data-source="All"]').classList.add('active');
                document.querySelector('[data-sent="All"]').classList.add('active');
                state.filters.source = 'All';
                state.filters.sentiment = 'All';
            }
            
            renderNewsFeed();
        });
    }
    
    // Modal closing events
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalOverlay = document.getElementById('details-modal');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }
    
    // ESC key to close modal/drawers
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.body.classList.remove('drawer-open', 'coin-details-open');
        }
    });

    // Sidebar Tabs Switcher (Desktop)
    const sidebarTabBtns = document.querySelectorAll('.sidebar-tab-btn');
    sidebarTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.sidebarTab;
            sidebarTabBtns.forEach(b => {
                b.classList.remove('active');
            });
            btn.classList.add('active');
            
            const filtersView = document.getElementById('sidebar-filters-view');
            const settingsView = document.getElementById('sidebar-settings-view');
            if (filtersView && settingsView) {
                if (tab === 'tab-filters') {
                    filtersView.style.display = 'block';
                    settingsView.style.display = 'none';
                } else {
                    filtersView.style.display = 'none';
                    settingsView.style.display = 'block';
                }
            }
        });
    });

    // Theme buttons in settings panel
    const themeBtnDark = document.getElementById('theme-btn-dark');
    const themeBtnLight = document.getElementById('theme-btn-light');
    if (themeBtnDark) {
        themeBtnDark.addEventListener('click', () => applyTheme('dark'));
    }
    if (themeBtnLight) {
        themeBtnLight.addEventListener('click', () => applyTheme('light'));
    }

    // Swipe Gestures for Drawer
    let touchStartX = 0;
    let touchStartY = 0;
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].clientX;
        touchStartY = e.changedTouches[0].clientY;
    }, { passive: true });
    
    document.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        // Ensure vertical displacement is minimal compared to horizontal
        if (Math.abs(diffX) > Math.abs(diffY) * 2) {
            const isDrawerOpen = document.body.classList.contains('drawer-open');
            if (!isDrawerOpen && touchStartX < 50 && diffX > 70) {
                document.body.classList.add('drawer-open');
            } else if (isDrawerOpen && diffX < -50) {
                document.body.classList.remove('drawer-open');
            }
        }
    }, { passive: true });

    // Coin Search Facility
    const coinSearchInput = document.getElementById('coin-search-input');
    const coinSearchResults = document.getElementById('coin-search-results');
    
    if (coinSearchInput && coinSearchResults) {
        coinSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                coinSearchResults.style.display = 'none';
                coinSearchResults.innerHTML = '';
                return;
            }
            
            const matches = [];
            Object.entries(coinNameMapping).forEach(([symbol, name]) => {
                if (symbol.toLowerCase().includes(query) || name.toLowerCase().includes(query)) {
                    matches.push({ symbol, name });
                }
            });
            
            if (matches.length > 0) {
                coinSearchResults.innerHTML = matches.map(m => {
                    const inActiveWatchlist = (state.watchlists[state.activeWatchlistName] || []).includes(m.symbol);
                    const inAnyWatchlist = Object.values(state.watchlists).some(list => list.includes(m.symbol));
                    let starIconHtml = '';
                    if (inActiveWatchlist) {
                        starIconHtml = `<i data-lucide="star" style="width: 11px; height: 11px; fill: #eab308; stroke: #eab308; margin-left: 4px; display: inline-block; vertical-align: middle;"></i>`;
                    } else if (inAnyWatchlist) {
                        starIconHtml = `<i data-lucide="star" style="width: 11px; height: 11px; stroke: #eab308; margin-left: 4px; display: inline-block; vertical-align: middle;"></i>`;
                    }
                    return `
                        <div class="coin-search-item" data-coin="${m.symbol}">
                            <span class="coin-search-symbol">${m.symbol} ${starIconHtml}</span>
                            <span class="coin-search-name">${m.name}</span>
                        </div>
                    `;
                }).join('');
                coinSearchResults.style.display = 'block';
                lucide.createIcons();
            } else {
                coinSearchResults.innerHTML = `<div style="padding: 10px 14px; font-size: 0.85rem; color: var(--text-muted);">No matches found</div>`;
                coinSearchResults.style.display = 'block';
            }
        });
        
        coinSearchResults.addEventListener('click', (e) => {
            const item = e.target.closest('.coin-search-item');
            if (item) {
                const symbol = item.dataset.coin;
                selectFocusCoin(symbol);
                coinSearchInput.value = '';
                coinSearchResults.style.display = 'none';
                
                // Switch mobile view to Market tab (tab-focus) if on mobile
                if (window.innerWidth <= 900) {
                    const marketBtn = document.querySelector('.mobile-nav-btn[data-tab="tab-focus"]');
                    if (marketBtn) marketBtn.click();
                }
                
                // Center in carousel if mobile or desktop stats
                const statCard = document.querySelector(`.stat-card[data-coin-card="${symbol}"]`);
                if (statCard) {
                    statCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!coinSearchInput.contains(e.target) && !coinSearchResults.contains(e.target)) {
                coinSearchResults.style.display = 'none';
            }
        });
    }

    // Watchlist dropdown selection change
    const watchlistSelect = document.getElementById('watchlist-select');
    if (watchlistSelect) {
        watchlistSelect.addEventListener('change', (e) => {
            state.activeWatchlistName = e.target.value;
            localStorage.setItem('pulse_active_watchlist', e.target.value);
            state.filters.showWatchlist = true;
            renderAll();
        });
    }

    // Create watchlist button
    const createWatchlistBtn = document.getElementById('create-watchlist-btn');
    if (createWatchlistBtn) {
        createWatchlistBtn.addEventListener('click', () => {
            const names = Object.keys(state.watchlists);
            if (names.length >= 5) {
                showToastAlert("Watchlist Limit", "You can have up to 5 watchlists.");
                return;
            }
            
            const name = prompt("Enter new watchlist name:");
            if (!name || !name.trim()) return;
            const cleanName = name.trim();
            if (state.watchlists[cleanName]) {
                showToastAlert("Error", "A watchlist with that name already exists.");
                return;
            }
            
            state.watchlists[cleanName] = [];
            state.activeWatchlistName = cleanName;
            localStorage.setItem('pulse_watchlists', JSON.stringify(state.watchlists));
            localStorage.setItem('pulse_active_watchlist', cleanName);
            
            renderWatchlistManager();
            renderAll();
        });
    }

    // Rename watchlist button
    const renameWatchlistBtn = document.getElementById('rename-watchlist-btn');
    if (renameWatchlistBtn) {
        renameWatchlistBtn.addEventListener('click', () => {
            const currentName = state.activeWatchlistName;
            const name = prompt("Enter new name for this watchlist:", currentName);
            if (!name || !name.trim() || name.trim() === currentName) return;
            const cleanName = name.trim();
            if (state.watchlists[cleanName]) {
                showToastAlert("Error", "A watchlist with that name already exists.");
                return;
            }
            
            state.watchlists[cleanName] = state.watchlists[currentName];
            delete state.watchlists[currentName];
            state.activeWatchlistName = cleanName;
            
            localStorage.setItem('pulse_watchlists', JSON.stringify(state.watchlists));
            localStorage.setItem('pulse_active_watchlist', cleanName);
            
            renderWatchlistManager();
            renderAll();
        });
    }

    // Delete watchlist button
    const deleteWatchlistBtn = document.getElementById('delete-watchlist-btn');
    if (deleteWatchlistBtn) {
        deleteWatchlistBtn.addEventListener('click', () => {
            const currentName = state.activeWatchlistName;
            if (!confirm(`Are you sure you want to delete the watchlist "${currentName}"?`)) return;
            
            delete state.watchlists[currentName];
            
            const remainingNames = Object.keys(state.watchlists);
            if (remainingNames.length === 0) {
                state.watchlists["Default Watchlist"] = [];
                state.activeWatchlistName = "Default Watchlist";
            } else {
                state.activeWatchlistName = remainingNames[0];
            }
            
            localStorage.setItem('pulse_watchlists', JSON.stringify(state.watchlists));
            localStorage.setItem('pulse_active_watchlist', state.activeWatchlistName);
            
            renderWatchlistManager();
            renderAll();
        });
    }

    // Clear alert history button
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', clearAlertHistory);
    }
}

// ==========================================================================
// Rendering Engine
// ==========================================================================
function renderAll() {
    // Restore standard filters view visibility in Crypto Mode
    const filtersView = document.getElementById('sidebar-filters-view');
    if (filtersView) {
        const sidebarFiltersTab = document.querySelector('.sidebar-tab-btn[data-sidebar-tab="tab-filters"]');
        if (!sidebarFiltersTab || sidebarFiltersTab.classList.contains('active')) {
            filtersView.style.display = 'block';
        } else {
            filtersView.style.display = 'none';
        }
    }
    
    // Render Crypto elements
    renderTicker();
    renderStatsCards();
    renderNewsFeed();
    renderSentimentGauge();
    renderDailyBriefing();
    renderTrendingCoins();
    renderInsightsAccordion();
    renderVolumeList();
    renderActiveAlertsSidebar();
    renderAlertHistory();
    renderWatchlistManager();
    
    // Update the Coin Focus Panel (default to BTC if "All" is active)
    const activeCoin = state.filters.coin === 'All' ? 'BTC' : state.filters.coin;
    triggerCoinFocusUpdate(activeCoin);
    
    lucide.createIcons();
}

function showLoadingState() {
    // Put skeletons in the feed and cards
    document.getElementById('news-feed').innerHTML = `
        <div class="news-card skeleton" style="height: 140px;"></div>
        <div class="news-card skeleton" style="height: 140px;"></div>
        <div class="news-card skeleton" style="height: 140px;"></div>
    `;
    
    document.getElementById('daily-brief-content').innerHTML = `
        <div class="skeleton-text"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text"></div>
    `;
}

function renderErrorState() {
    document.getElementById('news-feed').innerHTML = `
        <div class="empty-state">
            <i data-lucide="alert-triangle" style="color: var(--bearish);"></i>
            <h3>Connection Error</h3>
            <p>We are unable to reach the local PulseCrypto server. Please ensure the Python backend is running on port 8000.</p>
            <button class="tag-btn active" style="margin-top: 10px;" onclick="fetchData()">Retry Connection</button>
        </div>
    `;
    lucide.createIcons();
}

/* 1. Price Ticker */
function renderTicker() {
    const tickerContainer = document.getElementById('price-ticker');
    if (!tickerContainer) return;
    
    const coinMapping = {
        'bitcoin': 'BTC',
        'ethereum': 'ETH',
        'solana': 'SOL',
        'ripple': 'XRP',
        'cardano': 'ADA'
    };
    
    let html = '<div class="ticker-track">';
    
    // Add two sets for continuous looping effect
    const renderItems = () => {
        let itemsHtml = '';
        for (const [key, details] of Object.entries(state.prices)) {
            const sym = coinMapping[key] || key.toUpperCase();
            const price = formatCoinPrice(details.usd, sym);
            const change = parseFloat(details.usd_24h_change || 0);
            const isPos = change >= 0;
            const changeIcon = isPos ? '▲' : '▼';
            const changeClass = isPos ? 'pos' : 'neg';
            
            itemsHtml += `
                <div class="ticker-item" data-ticker-item="${sym}" onclick="filterByCoin('${sym}')">
                    <span class="ticker-symbol">${sym}/USD</span>
                    <span class="ticker-price">$${price}</span>
                    <span class="ticker-change ${changeClass}">${changeIcon} ${Math.abs(change).toFixed(2)}%</span>
                </div>
            `;
        }
        return itemsHtml;
    };
    
    const trackContent = renderItems();
    html += trackContent + trackContent + '</div>'; // duplicate list for smooth scroll wrap
    tickerContainer.innerHTML = html;
}

/* 2. Top Stats Cards */
function renderStatsCards() {
    const container = document.getElementById('stats-container');
    if (!container) return;
    
    let coins = [
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
        { id: 'solana', name: 'Solana', symbol: 'SOL' },
        { id: 'ripple', name: 'Ripple', symbol: 'XRP' },
        { id: 'cardano', name: 'Cardano', symbol: 'ADA' }
    ];
    
    if (state.filters.showWatchlist) {
        const activeWatchlist = state.watchlists[state.activeWatchlistName] || [];
        coins = coins.filter(coin => activeWatchlist.includes(coin.symbol));
    }
    
    if (coins.length === 0) {
        container.innerHTML = `
            <div class="empty-watchlist-msg" style="grid-column: 1 / -1; text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.85rem; border: 1px dashed var(--border-color); border-radius: var(--radius-md); width: 100%;">
                <i data-lucide="star" style="width: 16px; height: 16px; margin-bottom: 4px; vertical-align: middle;"></i> Watchlist is empty. Star coins to add them.
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    let html = '';
    
    coins.forEach(coin => {
        const details = state.prices[coin.id] || { usd: 0, usd_24h_change: 0 };
        const price = formatCoinPrice(details.usd, coin.symbol);
        const change = parseFloat(details.usd_24h_change || 0);
        const isPos = change >= 0;
        const changeClass = isPos ? 'pos' : 'neg';
        const changeText = (isPos ? '+' : '') + change.toFixed(2) + '%';
        
        const sparklinePath = generateSparkline(isPos);
        const strokeColor = isPos ? '#10b981' : '#f43f5e';
        const fillGradId = `spark-grad-${coin.symbol}`;
        
        const inActiveWatchlist = (state.watchlists[state.activeWatchlistName] || []).includes(coin.symbol);
        const inAnyWatchlist = Object.values(state.watchlists).some(list => list.includes(coin.symbol));
        
        let starIconHtml = '';
        if (inActiveWatchlist) {
            starIconHtml = `<span class="watchlist-star-badge" title="In Active Watchlist"><i data-lucide="star" style="width: 12px; height: 12px; fill: #eab308; stroke: #eab308;"></i></span>`;
        } else if (inAnyWatchlist) {
            starIconHtml = `<span class="watchlist-star-badge" title="In Other Watchlist"><i data-lucide="star" style="width: 12px; height: 12px; stroke: #eab308;"></i></span>`;
        }
        
        let sentimentBadgeHtml = '';
        if (state.summary.coinInsights && state.summary.coinInsights[coin.symbol]) {
            const sent = state.summary.coinInsights[coin.symbol].sentiment;
            const sentClass = sent.toLowerCase();
            sentimentBadgeHtml = `<span class="mini-sentiment-badge ${sentClass}" style="font-size: 0.55rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; margin-left: 6px; background: rgba(255, 255, 255, 0.05); color: ${sent === 'Bullish' ? 'var(--bullish)' : sent === 'Bearish' ? 'var(--bearish)' : 'var(--neutral)'}">${sent}</span>`;
        }
        
        html += `
            <div class="stat-card ${state.filters.coin === coin.symbol ? 'active' : ''}" data-coin-card="${coin.symbol}" onclick="filterByCoin('${coin.symbol}')">
                <div class="stat-header">
                    <div>
                        <div class="stat-coin-name" style="display: flex; align-items: center; gap: 4px;">
                            ${coin.name} ${starIconHtml}
                        </div>
                        <div class="stat-coin-symbol" style="display: flex; align-items: center;">
                            ${coin.symbol} ${sentimentBadgeHtml}
                        </div>
                    </div>
                    <svg class="stat-sparkline" viewBox="0 0 100 30">
                        <defs>
                            <linearGradient id="${fillGradId}" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
                            </linearGradient>
                        </defs>
                        <path d="${sparklinePath} L 100 30 L 0 30 Z" fill="url(#${fillGradId})"></path>
                        <path d="${sparklinePath}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round"></path>
                    </svg>
                </div>
                <div class="stat-body">
                    <div class="stat-price">$${price}</div>
                    <div class="stat-change ${changeClass}">${changeText}</div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function generateSparkline(isBullish) {
    // Generate SVG path for a high-quality stylized sparkline
    if (isBullish) {
        // Upward trending points (X from 0 to 100, Y from 30 down to 5 (lower values are higher up in SVG coordinates))
        return "M 0 25 C 20 28, 30 15, 50 18 C 70 20, 80 8, 100 5";
    } else {
        // Downward trending points
        return "M 0 8 C 20 5, 30 18, 50 15 C 70 12, 80 25, 100 25";
    }
}

function filterByCoin(symbol) {
    selectFocusCoin(symbol);
}

function selectFocusCoin(sym) {
    state.filters.coin = sym;
    state.filters.showBookmarks = false;
    
    const bookmarkBtn = document.getElementById('bookmark-toggle-btn');
    if (bookmarkBtn) bookmarkBtn.classList.remove('active');
    
    document.querySelectorAll('#coin-volume-list .volume-item').forEach(el => {
        el.classList.toggle('active', el.dataset.coin === sym);
    });
    
    document.querySelectorAll('.stat-card').forEach(el => {
        el.classList.toggle('active', el.dataset.coinCard === sym);
    });
    
    renderNewsFeed();
    triggerCoinFocusUpdate(sym);
}

/* 3. News Feed Stream */
function renderNewsFeed() {
    const feedContainer = document.getElementById('news-feed');
    const feedCountDisplay = document.getElementById('feed-count-display');
    const feedTitle = document.getElementById('feed-title');
    
    if (!feedContainer) return;
    
    let filtered = [...state.news];
    
    if (state.filters.showBookmarks) {
        feedTitle.innerText = "Saved Articles";
        filtered = filtered.filter(a => state.bookmarks.some(b => b.link === a.link));
    } else {
        feedTitle.innerText = "Latest Market News";
        
        // Watchlist filter focus
        if (state.filters.showWatchlist) {
            const activeWatchlist = state.watchlists[state.activeWatchlistName] || [];
            filtered = filtered.filter(a => a.tags.some(tag => activeWatchlist.includes(tag)));
        }
        
        // News Age Limit Filter
        if (state.filters.maxAgeDays !== 31) {
            const maxAgeSec = state.filters.maxAgeDays * 24 * 60 * 60;
            const nowSec = Date.now() / 1000;
            filtered = filtered.filter(a => (nowSec - a.timestamp) <= maxAgeSec);
        }
        
        // Tag Filter
        if (state.filters.coin !== 'All') {
            filtered = filtered.filter(a => a.tags.includes(state.filters.coin));
        }
        
        // Source Filter
        if (state.filters.source !== 'All') {
            filtered = filtered.filter(a => a.source.toLowerCase() === state.filters.source.toLowerCase());
        }
        
        // Sentiment Filter
        if (state.filters.sentiment !== 'All') {
            filtered = filtered.filter(a => a.sentiment === state.filters.sentiment);
        }
        
        // Search Filter
        if (state.filters.search) {
            filtered = filtered.filter(a => 
                a.title.toLowerCase().includes(state.filters.search) || 
                a.description.toLowerCase().includes(state.filters.search)
            );
        }
    }
    
    feedCountDisplay.innerText = `Showing ${filtered.length} articles`;
    
    if (filtered.length === 0) {
        feedContainer.innerHTML = `
            <div class="empty-state">
                <i data-lucide="newspaper"></i>
                <h3>No articles found</h3>
                <p>Try refining your search queries or clearing active filters.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    let html = '';
    filtered.forEach((article, index) => {
        const isSaved = state.bookmarks.some(b => b.link === article.link);
        const bookmarkClass = isSaved ? 'saved' : '';
        const bookmarkIcon = isSaved ? 'bookmark-check' : 'bookmark';
        
        // Format time elapsed
        const timeText = formatTimeElapsed(article.timestamp);
        
        // Tags list HTML
        const tagsHtml = article.tags.map(t => `<span class="tag-pill tag-${t.toLowerCase()}">${t}</span>`).join('');
        
        // Placeholder fallback image
        const imgUrl = article.imageUrl || `https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3`;
        
        // Sentiment Badge
        const sentCap = article.sentiment.charAt(0).toUpperCase() + article.sentiment.slice(1);
        
        html += `
            <div class="news-card" onclick="openArticleDetails(${index}, '${state.filters.showBookmarks ? 'bookmarks' : 'news'}')">
                <div class="news-img-container">
                    <img src="${imgUrl}" class="news-img" alt="News Thumbnail" onerror="this.src='https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3'">
                </div>
                <div class="news-content">
                    <div>
                        <div class="news-meta">
                            <span class="news-source">${article.source}</span>
                            <span class="news-time">• ${timeText}</span>
                        </div>
                        <h3 class="news-title">${escapeHTML(article.title)}</h3>
                        <p class="news-desc">${escapeHTML(article.description)}</p>
                    </div>
                    <div class="news-footer">
                        <div class="news-tags">
                            ${tagsHtml}
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="news-sentiment ${article.sentiment}">
                                <i data-lucide="${getSentimentIcon(article.sentiment)}" style="width: 12px; height: 12px;"></i>
                                ${sentCap}
                            </span>
                            <button class="bookmark-btn ${bookmarkClass}" onclick="toggleBookmark(event, ${index}, '${state.filters.showBookmarks ? 'bookmarks' : 'news'}')" title="Save Article">
                                <i data-lucide="${bookmarkIcon}"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    });
    
    feedContainer.innerHTML = html;
    lucide.createIcons();
}

/* 4. Sentiment Gauge */
function renderSentimentGauge() {
    const valueEl = document.getElementById('sentiment-value');
    const labelEl = document.getElementById('sentiment-label');
    const fillPath = document.getElementById('gauge-fill');
    const needle = document.getElementById('gauge-needle');
    
    if (!valueEl || !state.summary.overallSentiment) return;
    
    const index = state.summary.overallSentiment;
    const label = state.summary.overallLabel;
    
    valueEl.innerText = index;
    labelEl.innerText = label;
    
    // Colors based on sentiment score
    let accentColor = 'var(--neutral)';
    if (index > 55) {
        accentColor = 'var(--bullish)';
    } else if (index < 45) {
        accentColor = 'var(--bearish)';
    }
    valueEl.style.color = accentColor;
    labelEl.style.color = accentColor;
    
    // Animate Gauge Arc Fill
    // Max length is 125.6 (Pi * radius of 40)
    const strokeDashoffset = 125.6 * (1 - index / 100);
    fillPath.style.strokeDashoffset = strokeDashoffset;
    fillPath.style.stroke = accentColor;
    
    // Animate Needle Rotation
    // Range: -90deg to +90deg
    const angle = -90 + (index / 100) * 180;
    needle.style.transform = `translate(-50%, 0) rotate(${angle}deg)`;
}

/* 5. Daily Briefing */
function renderDailyBriefing() {
    const briefContainer = document.getElementById('daily-brief-content');
    if (!briefContainer || !state.summary.dailyBrief) return;
    
    const parsedBrief = formatBriefMarkdown(state.summary.dailyBrief);
    briefContainer.innerHTML = parsedBrief;
}

function formatBriefMarkdown(text) {
    if (!text) return "";
    
    // Parse markdown bold **text** to HTML <strong>text</strong>
    let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Parse lines starting with "• " to list items, grouped by a <ul>
    const lines = html.split('\n');
    let insideList = false;
    let listHtml = '';
    let finalHtml = '';
    
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
            if (!insideList) {
                insideList = true;
                listHtml = '<ul>';
            }
            // Strip indicator
            const content = trimmed.substring(1).trim();
            listHtml += `<li>${content}</li>`;
        } else {
            if (insideList) {
                insideList = false;
                listHtml += '</ul>';
                finalHtml += listHtml;
            }
            if (trimmed) {
                // If it is a section header (e.g. "Top Market Narratives:")
                if (trimmed.endsWith(':')) {
                    finalHtml += `<h4 style="margin: 16px 0 8px 0; color: var(--accent-cyan); font-weight:600;">${trimmed}</h4>`;
                } else {
                    finalHtml += `<p style="margin-bottom: 8px;">${trimmed}</p>`;
                }
            }
        }
    });
    
    if (insideList) {
        listHtml += '</ul>';
        finalHtml += listHtml;
    }
    
    return finalHtml;
}

/* 6. Trending Coins list */
function renderTrendingCoins() {
    const container = document.getElementById('trending-list-container');
    if (!container || !state.summary.trendingCoins) return;
    
    const trending = state.summary.trendingCoins;
    if (trending.length === 0) {
        container.innerHTML = '<span style="font-size:0.8rem; color:var(--text-muted);">None tag-active</span>';
        return;
    }
    
    let html = '';
    trending.forEach(item => {
        html += `
            <div class="trending-chip" onclick="filterByCoin('${item.coin}')">
                <span class="trending-coin-name">${item.coin}</span>
                <span class="trending-count">${item.mentions}</span>
            </div>
        `;
    });
    container.innerHTML = html;
}

/* 7. Coin-specific insights accordion */
function renderInsightsAccordion() {
    const container = document.getElementById('insights-accordion');
    if (!container || !state.summary.coinInsights) return;
    
    const insights = state.summary.coinInsights;
    const names = {
        'BTC': 'Bitcoin (BTC)',
        'ETH': 'Ethereum (ETH)',
        'SOL': 'Solana (SOL)',
        'XRP': 'Ripple (XRP)',
        'ADA': 'Cardano (ADA)'
    };
    
    let html = '<div class="insights-list">';
    
    for (const [symbol, details] of Object.entries(insights)) {
        const title = names[symbol] || symbol;
        const sentimentClass = details.sentiment.toLowerCase();
        
        html += `
            <div class="accordion-item" id="accordion-${symbol}">
                <div class="accordion-header" onclick="toggleAccordion('${symbol}')">
                    <div class="accordion-title">
                        <strong>${symbol}</strong>
                        <span class="accordion-sentiment-badge ${sentimentClass}">${details.sentiment}</span>
                    </div>
                    <i data-lucide="chevron-down" class="accordion-arrow"></i>
                </div>
                <div class="accordion-content">
                    <p style="margin-bottom: 8px;"><strong>Mentions:</strong> ${details.mentions} articles</p>
                    <p>${details.summary}</p>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

function toggleAccordion(symbol) {
    const item = document.getElementById(`accordion-${symbol}`);
    if (!item) return;
    
    const isActive = item.classList.contains('active');
    
    // Close other accordions
    document.querySelectorAll('.accordion-item').forEach(el => el.classList.remove('active'));
    
    // Toggle current
    if (!isActive) {
        item.classList.add('active');
    }
}

// ==========================================================================
// Details Modal Management
// ==========================================================================
function openArticleDetails(index, listType) {
    const modal = document.getElementById('details-modal');
    const modalBody = document.getElementById('modal-body-content');
    if (!modal || !modalBody) return;
    
    const list = listType === 'bookmarks' ? state.bookmarks : state.news;
    const article = list[index];
    if (!article) return;
    
    const isSaved = state.bookmarks.some(b => b.link === article.link);
    const saveClass = isSaved ? 'saved' : '';
    const saveText = isSaved ? '<i data-lucide="bookmark-check"></i> Bookmarked' : '<i data-lucide="bookmark"></i> Save Article';
    
    const timeText = formatTimeElapsed(article.timestamp);
    const dateFormatted = new Date(article.timestamp * 1000).toLocaleString('en-US', {
        dateStyle: 'long',
        timeStyle: 'short'
    });
    
    // Image layout
    const imgHtml = article.imageUrl ? `
        <img src="${article.imageUrl}" class="modal-header-img" alt="Article Banner" onerror="this.style.display='none'">
    ` : '';
    
    modalBody.innerHTML = `
        ${imgHtml}
        <div class="modal-meta">
            <span class="modal-source">${article.source}</span>
            <span>•</span>
            <span>${timeText}</span>
            <span>•</span>
            <span class="modal-sentiment ${article.sentiment}">${article.sentiment.toUpperCase()} Sentiment</span>
        </div>
        <h2 class="modal-title">${escapeHTML(article.title)}</h2>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom: 20px;">
            Published: ${dateFormatted} ${article.author ? `by ${article.author}` : ''}
        </div>
        <div class="modal-desc">
            <p>${escapeHTML(article.description)}</p>
            <p style="margin-top: 15px; font-style: italic; color:var(--text-muted);">
                Sentiment Engine classification index: ${article.sentimentScore > 0 ? '+' : ''}${article.sentimentScore} 
                (Matches: ${article.sentimentScore > 0 ? 'Bullish signals' : article.sentimentScore < 0 ? 'Bearish signals' : 'Balanced keyword signals'}).
            </p>
        </div>
        <div class="modal-actions">
            <a href="${article.link}" target="_blank" class="modal-link-btn">
                Read Original Source <i data-lucide="external-link" style="width:16px; height:16px;"></i>
            </a>
            <button class="modal-save-btn ${saveClass}" onclick="toggleBookmarkModal(event, '${article.link}')">
                ${saveText}
            </button>
        </div>
    `;
    
    modal.classList.add('active');
    lucide.createIcons();
}

function closeModal() {
    const modal = document.getElementById('details-modal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ==========================================================================
// Bookmark Operations (LocalStorage)
// ==========================================================================
function toggleBookmark(event, index, listType) {
    // Prevent opening modal when clicking bookmark button
    event.stopPropagation();
    
    const list = listType === 'bookmarks' ? state.bookmarks : state.news;
    const article = list[index];
    if (!article) return;
    
    const existingIndex = state.bookmarks.findIndex(b => b.link === article.link);
    if (existingIndex > -1) {
        state.bookmarks.splice(existingIndex, 1);
    } else {
        state.bookmarks.push(article);
    }
    
    // Save to LocalStorage
    localStorage.setItem('pulse_bookmarks', JSON.stringify(state.bookmarks));
    
    updateBookmarkBadge();
    renderNewsFeed();
}

function toggleBookmarkModal(event, link) {
    // Finds article in master feed and toggles it
    const articleIndex = state.news.findIndex(a => a.link === link);
    const bookmarkIndex = state.bookmarks.findIndex(b => b.link === link);
    
    let article = null;
    if (articleIndex > -1) {
        article = state.news[articleIndex];
    } else if (bookmarkIndex > -1) {
        article = state.bookmarks[bookmarkIndex];
    }
    
    if (!article) return;
    
    if (bookmarkIndex > -1) {
        state.bookmarks.splice(bookmarkIndex, 1);
    } else {
        state.bookmarks.push(article);
    }
    
    localStorage.setItem('pulse_bookmarks', JSON.stringify(state.bookmarks));
    updateBookmarkBadge();
    
    // Redraw news feed & toggle button state inside modal
    renderNewsFeed();
    
    // Update modal button state
    const modalBtn = document.querySelector('.modal-save-btn');
    if (modalBtn) {
        const isSaved = state.bookmarks.some(b => b.link === link);
        modalBtn.className = `modal-save-btn ${isSaved ? 'saved' : ''}`;
        modalBtn.innerHTML = isSaved 
            ? '<i data-lucide="bookmark-check"></i> Bookmarked' 
            : '<i data-lucide="bookmark"></i> Save Article';
        lucide.createIcons();
    }
}

function updateBookmarkBadge() {
    const badge = document.getElementById('bookmark-count');
    if (badge) {
        badge.innerText = state.bookmarks.length;
        badge.style.display = state.bookmarks.length > 0 ? 'inline-block' : 'none';
    }
}

// ==========================================================================
// Helper Utilities
// ==========================================================================
function formatTimeElapsed(timestamp) {
    const diff = Math.floor(Date.now() / 1000) - timestamp;
    if (diff < 60) return 'Just now';
    
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function getSentimentIcon(sentiment) {
    if (sentiment === 'positive') return 'trending-up';
    if (sentiment === 'negative') return 'trending-down';
    return 'minus';
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// ==========================================================================
// Coin Focus & Options Analysis Logic
// ==========================================================================
let lastFetchedFocusSymbol = '';
async function triggerCoinFocusUpdate(symbol) {
    if (symbol === 'General') {
        document.getElementById('coin-focus-container').style.display = 'none';
        return;
    }
    
    const container = document.getElementById('coin-focus-container');
    if (!container) return;
    container.style.display = 'flex';
    
    // Show loading skeleton if the coin selection or timeframe changes
    const cacheKey = symbol + '_' + state.chartDays;
    if (lastFetchedFocusSymbol !== cacheKey) {
        let nameText = coinNameMapping[symbol] || symbol;
        container.innerHTML = `
            <div class="focus-loading">
                <div class="pulse-dot"></div>
                Fetching historical prices and financials for ${nameText}...
            </div>
        `;
        lastFetchedFocusSymbol = cacheKey;
    }
    
    try {
        const coinId = coinIdMapping[symbol];
        if (!coinId) return;
        
        const response = await fetch(`/api/historical?coin=${coinId}&days=${state.chartDays}`);
        const prices = await response.json();
        
        if (response.ok && prices && prices.length > 0) {
            renderFocusCardContent(symbol, prices);
        } else {
            container.innerHTML = `
                <div class="focus-loading" style="color: var(--bearish);">
                    <i data-lucide="alert-triangle"></i> Failed to load market chart.
                </div>
            `;
            lucide.createIcons();
        }
    } catch (e) {
        console.error("Historical chart fetch error:", e);
    }
}

function renderFocusCardContent(symbol, pricesData) {
    const container = document.getElementById('coin-focus-container');
    if (!container) return;
    
    const coinId = coinIdMapping[symbol];
    const coinName = coinNameMapping[symbol];
    const coinPriceInfo = state.prices[coinId] || { usd: 0, usd_24h_change: 0 };
    const priceText = formatCoinPrice(coinPriceInfo.usd, symbol);
    
    const change = parseFloat(coinPriceInfo.usd_24h_change || 0);
    const isPos = change >= 0;
    const changeClass = isPos ? 'pos' : 'neg';
    const changeText = (isPos ? '+' : '') + change.toFixed(2) + '%';
    
    const svgHtml = drawInteractiveChart(pricesData, isPos, symbol);
    
    let coinSentimentVal = 0;
    if (state.summary.coinInsights && state.summary.coinInsights[symbol]) {
        const sent = state.summary.coinInsights[symbol].sentiment;
        if (sent === 'Bullish') coinSentimentVal = 70;
        else if (sent === 'Bearish') coinSentimentVal = -70;
    }
    
    let score = (0.6 * change * 15) + (0.4 * coinSentimentVal);
    score = Math.max(-100, Math.min(100, score));
    
    let label = 'Neutral (Hold)';
    let badgeClass = 'neutral';
    let confidence = Math.round(50 + Math.abs(score) / 2);
    let analysisMsg = '';
    
    if (score >= 60) {
        label = 'Strong Buy (Call)';
        badgeClass = 'strong-buy';
        analysisMsg = `Highly positive sentiment indicators. Strong price action (<strong>${changeText}</strong>) combined with bullish news flows supports an <strong>aggressive Call Option</strong> posture. Recommendation: Buy Call strikes 5% above spot. Stop loss: -3% from entry.`;
    } else if (score >= 15) {
        label = 'Buy (Call)';
        badgeClass = 'buy';
        analysisMsg = `Favorable price momentum (<strong>${changeText}</strong>) and supportive news sentiment indicate an upward bias. Standard <strong>Call Option (Long Call)</strong> or Bull Call Spread strategies are recommended.`;
    } else if (score <= -60) {
        label = 'Strong Sell (Put)';
        badgeClass = 'strong-sell';
        analysisMsg = `Heavy negative news flows and downward price pressure (<strong>${changeText}</strong>) indicate severe weakness. Outlook supports buying <strong>Put Options (Long Put)</strong> or executing Bear Put Spreads. Keep stops tight at recent resistance.`;
    } else if (score <= -15) {
        label = 'Sell (Put)';
        badgeClass = 'sell';
        analysisMsg = `Price shows short-term distribution pattern (<strong>${changeText}</strong>). Momentum is bearish. Target <strong>Put Option</strong> positions or sell Call option premium (Bear Call Spreads) to capitalize on decay.`;
    } else {
        label = 'Neutral (Hold)';
        badgeClass = 'neutral';
        analysisMsg = `Price action is consolidative (<strong>${changeText}</strong>) with balanced news flow. Volatility is contracting. Recommended options strategy: Range-bound premium selling (e.g., <strong>Iron Condors</strong> or <strong>Short Strangles</strong>).`;
    }
    
    const sliderPercentage = 50 + score / 2;
    
    const activeWatchlist = state.watchlists[state.activeWatchlistName] || [];
    const isStarred = activeWatchlist.includes(symbol);
    const starClass = isStarred ? 'active' : '';
    
    const containingWatchlists = Object.keys(state.watchlists).filter(name => state.watchlists[name].includes(symbol));
    const watchlistTagsHtml = containingWatchlists.map(name => `
        <span class="watchlist-tag" style="font-size: 0.6rem; padding: 2px 6px; background: rgba(0, 242, 254, 0.08); color: var(--accent-cyan); border: 1px solid rgba(0, 242, 254, 0.15); border-radius: 10px; font-family: var(--font-body); font-weight: 600;">
            ${name}
        </span>
    `).join('');
    
    container.innerHTML = `
        <div class="focus-header">
            <div class="focus-coin-info">
                <h3 style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <select id="focus-coin-select" class="focus-coin-select" style="font-size: 1.05rem; font-family: var(--font-heading); font-weight: 700; padding: 4px 10px;">
                        <option value="BTC" ${symbol === 'BTC' ? 'selected' : ''}>Bitcoin (BTC)</option>
                        <option value="ETH" ${symbol === 'ETH' ? 'selected' : ''}>Ethereum (ETH)</option>
                        <option value="SOL" ${symbol === 'SOL' ? 'selected' : ''}>Solana (SOL)</option>
                        <option value="XRP" ${symbol === 'XRP' ? 'selected' : ''}>Ripple (XRP)</option>
                        <option value="ADA" ${symbol === 'ADA' ? 'selected' : ''}>Cardano (ADA)</option>
                    </select>
                    <button class="bell-btn" id="bell-alert-btn" title="Set Price Alert" style="padding: 0; display: inline-flex; justify-content: center; align-items: center;">
                        <i data-lucide="bell" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="star-btn ${starClass}" id="watchlist-star-btn" title="Toggle Active Watchlist" style="padding: 0; display: inline-flex; justify-content: center; align-items: center;">
                        <i data-lucide="star" style="width: 14px; height: 14px; ${isStarred ? 'fill:#eab308;' : ''}"></i>
                    </button>
                    <select id="add-to-watchlist-select" class="focus-coin-select" style="font-size: 0.72rem; padding: 2px 6px; height: 28px; border-radius: var(--radius-sm); font-family: var(--font-heading); font-weight: 600; cursor: pointer; border-color: var(--border-color);">
                        <option value="" disabled selected>+ Watchlist</option>
                        ${Object.keys(state.watchlists).map(name => {
                            const hasCoin = state.watchlists[name].includes(symbol);
                            return `<option value="${name}">${hasCoin ? '✓' : '+'} ${name}</option>`;
                        }).join('')}
                    </select>
                    ${watchlistTagsHtml}
                </h3>
                <div class="focus-price-container" style="margin-top: 4px;">
                    <span class="focus-price focus-price-val">$${priceText}</span>
                    <span class="focus-change focus-change-val ${changeClass}">${changeText}</span>
                </div>
            </div>
            <div style="display: flex; align-items: center;">
                <span class="ai-badge"><i data-lucide="sparkles"></i> Options Advisor</span>
            </div>
        </div>

        <!-- Toggleable Alert Creation Panel -->
        <div class="focus-alert-panel" id="focus-alert-form" style="display: none;">
            <h4>Create Alert for ${symbol}</h4>
            <div class="alert-form-row">
                <select id="alert-direction">
                    <option value="above">Crosses Above (▲)</option>
                    <option value="below">Crosses Below (▼)</option>
                </select>
                <input type="number" id="alert-target-price" value="${coinPriceInfo.usd}" step="any">
            </div>
            <div class="alert-form-row channels-row" style="margin: 4px 0 8px 0; display: flex; gap: 16px;">
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: var(--text-secondary);">
                    <input type="checkbox" id="alert-channel-browser" checked style="width: auto; margin: 0;">
                    Browser Alert (Toast/Sound)
                </label>
                <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer; color: var(--text-secondary);">
                    <input type="checkbox" id="alert-channel-email" style="width: auto; margin: 0;">
                    Email Alert
                </label>
            </div>
            <div class="alert-form-row" id="email-input-row" style="display: none; width: 100%;">
                <input type="email" id="alert-email" placeholder="Enter recipient email address" style="width: 100%;">
            </div>
            <div class="alert-form-actions">
                <button class="tag-btn active" id="save-alert-btn">Create Alert</button>
                <button class="tag-btn" id="cancel-alert-btn">Cancel</button>
            </div>
        </div>
        
        <!-- Timeframe Selector -->
        <div class="timeframe-selector">
            <button class="timeframe-btn ${state.chartDays === '1' ? 'active' : ''}" data-days="1">24h</button>
            <button class="timeframe-btn ${state.chartDays === '7' ? 'active' : ''}" data-days="7">7d</button>
            <button class="timeframe-btn ${state.chartDays === '30' ? 'active' : ''}" data-days="30">30d</button>
            <span class="chart-legend">
                <span style="display:inline-flex; align-items:center; gap:4px; margin-right:8px;">
                    <span style="display:inline-block; width:12px; height:2px; background: ${isPos ? 'var(--bullish)' : 'var(--bearish)'};"></span> Price
                </span>
                <span style="display:inline-flex; align-items:center; gap:4px;">
                    <span style="display:inline-block; width:12px; height:2px; border-bottom: 2px dotted var(--accent-purple);"></span> SMA-7
                </span>
            </span>
        </div>
        
        <!-- Interactive Chart Wrapper -->
        <div class="chart-wrapper" id="focus-chart-wrapper">
            ${svgHtml}
            <div class="chart-tooltip" id="focus-chart-tooltip"></div>
        </div>
        
        <!-- Coin Specific Sentiment Gauge widget -->
        ${(() => {
            if (state.summary.coinInsights && state.summary.coinInsights[symbol]) {
                const insight = state.summary.coinInsights[symbol];
                const cScore = insight.score || 50;
                const cSent = insight.sentiment || 'Neutral';
                const cSentClass = cSent.toLowerCase();
                return `
                    <div class="coin-sentiment-widget">
                        <div class="coin-sentiment-header">
                            <span>Sentiment: <strong class="${cSentClass === 'bullish' ? 'pos' : cSentClass === 'bearish' ? 'neg' : ''}">${cSent}</strong></span>
                            <span>Score: <strong>${cScore}/100</strong></span>
                        </div>
                        <div class="coin-sentiment-bar-track">
                            <div class="coin-sentiment-bar-needle" style="left: ${cScore}%;"></div>
                        </div>
                    </div>
                `;
            }
            return '';
        })()}
        
        <!-- Option Trading Trend Section -->
        <div class="options-section">
            <div class="options-title-bar">
                <h4><i data-lucide="trending-up" style="width:16px; height:16px; color:var(--accent-cyan)"></i> Option Recommendation</h4>
                <span class="options-badge ${badgeClass}">${label}</span>
            </div>
            
            <div class="trend-slider-container">
                <div class="trend-slider-track">
                    <div class="trend-slider-marker" style="left: ${sliderPercentage}%;"></div>
                </div>
                <div class="trend-slider-labels" style="font-size: 0.62rem;">
                    <span>Put Option</span>
                    <span>Hold</span>
                    <span>Call Option</span>
                </div>
            </div>
            
            <div class="options-analysis-card">
                <p>${analysisMsg}</p>
                <p style="margin-top: 6px; font-size: 0.65rem; color:var(--text-muted);">
                    Confidence: <strong>${confidence}%</strong> | Weighted Momentum & Sentiment.
                </p>
            </div>
        </div>
    `;
    
    lucide.createIcons();
    
    // Focus Coin Selector Dropdown Change
    const coinSelect = document.getElementById('focus-coin-select');
    if (coinSelect) {
        coinSelect.addEventListener('change', (e) => {
            selectFocusCoin(e.target.value);
        });
    }
    
    // Watchlist Toggle
    const starBtn = document.getElementById('watchlist-star-btn');
    if (starBtn) {
        starBtn.addEventListener('click', () => {
            let activeList = state.watchlists[state.activeWatchlistName] || [];
            const isStarred = activeList.includes(symbol);
            if (isStarred) {
                activeList = activeList.filter(s => s !== symbol);
            } else {
                activeList.push(symbol);
            }
            state.watchlists[state.activeWatchlistName] = activeList;
            localStorage.setItem('pulse_watchlists', JSON.stringify(state.watchlists));
            
            // Re-render watchlist manager to update counts
            renderWatchlistManager();
            
            starBtn.classList.toggle('active', !isStarred);
            const icon = starBtn.querySelector('i');
            if (icon) {
                icon.style.fill = !isStarred ? '#eab308' : '';
            }
            
            renderStatsCards();
            if (state.filters.showWatchlist) {
                renderNewsFeed();
            }
        });
    }
    
    // Add to specific watchlist selector
    const addToWatchlistSelect = document.getElementById('add-to-watchlist-select');
    if (addToWatchlistSelect) {
        addToWatchlistSelect.addEventListener('change', (e) => {
            const watchlistName = e.target.value;
            if (!watchlistName) return;
            
            let list = state.watchlists[watchlistName] || [];
            const hasCoin = list.includes(symbol);
            if (hasCoin) {
                list = list.filter(s => s !== symbol);
                showToastAlert("Watchlist Update", `${symbol} removed from ${watchlistName}`);
            } else {
                list.push(symbol);
                showToastAlert("Watchlist Update", `${symbol} added to ${watchlistName}`);
            }
            state.watchlists[watchlistName] = list;
            localStorage.setItem('pulse_watchlists', JSON.stringify(state.watchlists));
            
            // Reset select dropdown element to default choice
            addToWatchlistSelect.value = "";
            
            // Re-render
            renderWatchlistManager();
            renderStatsCards();
            renderFocusCard(symbol);
            if (state.filters.showWatchlist) {
                renderNewsFeed();
            }
        });
    }
    
    // Timeframe selector trigger
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const days = e.target.dataset.days;
            state.chartDays = days;
            triggerCoinFocusUpdate(symbol);
        });
    });
    
    // Alert button trigger
    const bellBtn = document.getElementById('bell-alert-btn');
    const alertForm = document.getElementById('focus-alert-form');
    const cancelBtn = document.getElementById('cancel-alert-btn');
    const saveBtn = document.getElementById('save-alert-btn');
    const emailCheckbox = document.getElementById('alert-channel-email');
    const emailRow = document.getElementById('email-input-row');
    
    if (bellBtn && alertForm) {
        bellBtn.addEventListener('click', () => {
            const isVisible = alertForm.style.display === 'flex';
            alertForm.style.display = isVisible ? 'none' : 'flex';
            bellBtn.classList.toggle('active', !isVisible);
        });
    }
    
    if (emailCheckbox && emailRow) {
        emailCheckbox.addEventListener('change', () => {
            emailRow.style.display = emailCheckbox.checked ? 'block' : 'none';
        });
    }
    
    if (cancelBtn && alertForm && bellBtn) {
        cancelBtn.addEventListener('click', () => {
            alertForm.style.display = 'none';
            bellBtn.classList.remove('active');
        });
    }
    
    if (saveBtn && alertForm && bellBtn) {
        saveBtn.addEventListener('click', () => {
            const dir = document.getElementById('alert-direction').value;
            const price = parseFloat(document.getElementById('alert-target-price').value);
            const useBrowser = document.getElementById('alert-channel-browser').checked;
            const useEmail = document.getElementById('alert-channel-email').checked;
            const email = document.getElementById('alert-email').value.trim();
            
            if (isNaN(price) || price <= 0) {
                alert("Please enter a valid target price.");
                return;
            }
            
            if (!useBrowser && !useEmail) {
                alert("Please select at least one notification channel.");
                return;
            }
            
            if (useEmail && !email) {
                alert("Please enter a valid email address.");
                return;
            }
            
            // Add alert to state
            const newAlert = {
                id: 'alert-' + Date.now(),
                symbol: symbol,
                direction: dir,
                price: price,
                channels: {
                    browser: useBrowser,
                    email: useEmail
                },
                email: useEmail ? email : '',
                triggered: false
            };
            
            state.alerts.push(newAlert);
            localStorage.setItem('pulse_alerts', JSON.stringify(state.alerts));
            
            // Render active alerts sidebar
            renderActiveAlertsSidebar();
            
            // Success indicator
            showToastAlert("Price Alert Created", `Target: ${symbol} goes ${dir} $${price.toLocaleString()}`);
            
            // Hide form
            alertForm.style.display = 'none';
            bellBtn.classList.remove('active');
        });
    }
    
    setupChartHoverHandlers(pricesData);
}

function drawInteractiveChart(pricesData, isBullish, symbol) {
    const W = 500;
    const H = 150;
    const P_x = 40;
    const P_y = 15;
    
    const prices = pricesData.map(p => p[1]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    const getX = (index) => P_x + (index / (prices.length - 1)) * (W - P_x - 10);
    const getY = (price) => {
        if (priceRange === 0) return H / 2;
        return H - P_y - ((price - minPrice) / priceRange) * (H - 2 * P_y);
    };
    
    let lineD = `M ${getX(0)} ${getY(prices[0])}`;
    for (let i = 1; i < prices.length; i++) {
        lineD += ` L ${getX(i)} ${getY(prices[i])}`;
    }
    
    const smaValues = calculateSMA(prices, 7);
    let smaD = `M ${getX(0)} ${getY(smaValues[0])}`;
    for (let i = 1; i < smaValues.length; i++) {
        smaD += ` L ${getX(i)} ${getY(smaValues[i])}`;
    }
    
    const bottomY = H - P_y;
    const areaD = `${lineD} L ${getX(prices.length - 1)} ${bottomY} L ${getX(0)} ${bottomY} Z`;
    
    const strokeColor = isBullish ? 'var(--bullish)' : 'var(--bearish)';
    const gradId = 'chart-focus-grad';
    
    const midPrice = minPrice + priceRange / 2;
    const gridHtml = `
        <line class="chart-gridline" x1="${P_x}" y1="${getY(minPrice)}" x2="${W - 10}" y2="${getY(minPrice)}"></line>
        <line class="chart-gridline" x1="${P_x}" y1="${getY(midPrice)}" x2="${W - 10}" y2="${getY(midPrice)}"></line>
        <line class="chart-gridline" x1="${P_x}" y1="${getY(maxPrice)}" x2="${W - 10}" y2="${getY(maxPrice)}"></line>
        <line class="chart-axis" x1="${P_x}" y1="${P_y}" x2="${P_x}" y2="${H - P_y}"></line>
        <line class="chart-axis" x1="${P_x}" y1="${H - P_y}" x2="${W - 10}" y2="${H - P_y}"></line>
    `;
    
    const formatYVal = (val) => {
        return '$' + formatCoinPrice(val, symbol);
    };
    
    const axisLabelsY = `
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(minPrice) + 3}" text-anchor="end">${formatYVal(minPrice)}</text>
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(midPrice) + 3}" text-anchor="end">${formatYVal(midPrice)}</text>
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(maxPrice) + 3}" text-anchor="end">${formatYVal(maxPrice)}</text>
    `;
    
    let labelLeft = '24h ago';
    let labelMid = '12h ago';
    if (state.chartDays === '7') {
        labelLeft = '7d ago';
        labelMid = '3d ago';
    } else if (state.chartDays === '30') {
        labelLeft = '30d ago';
        labelMid = '15d ago';
    }
    
    const axisLabelsX = `
        <text class="chart-labels-x" x="${P_x}" y="${H - 2}">${labelLeft}</text>
        <text class="chart-labels-x" x="${P_x + (W - P_x - 10)/2}" y="${H - 2}">${labelMid}</text>
        <text class="chart-labels-x" x="${W - 20}" y="${H - 2}">Now</text>
    `;
    
    return `
        <svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="100%">
            <defs>
                <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.3"/>
                    <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${gridHtml}
            ${axisLabelsY}
            ${axisLabelsX}
            <path d="${areaD}" fill="url(#${gradId})" style="pointer-events:none;"></path>
            <path d="${smaD}" fill="none" stroke="var(--accent-purple)" stroke-width="1.5" stroke-dasharray="2,3" style="pointer-events:none;"></path>
            <path d="${lineD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none;"></path>
            <line class="chart-hover-line" id="focus-hover-line" x1="0" y1="${P_y}" x2="0" y2="${H - P_y}"></line>
            <circle class="chart-hover-dot" id="focus-hover-dot" cx="0" cy="0"></circle>
        </svg>
    `;
}

function setupChartHoverHandlers(pricesData, symbol) {
    const chartWrapper = document.getElementById('focus-chart-wrapper');
    const hoverLine = document.getElementById('focus-hover-line');
    const hoverDot = document.getElementById('focus-hover-dot');
    const tooltip = document.getElementById('focus-chart-tooltip');
    
    if (!chartWrapper || !hoverLine || !hoverDot || !tooltip) return;
    
    const svg = chartWrapper.querySelector('.chart-svg');
    const W = 500;
    const H = 150;
    const P_x = 40;
    const P_y = 15;
    
    const prices = pricesData.map(p => p[1]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    const getX = (index) => P_x + (index / (prices.length - 1)) * (W - P_x - 10);
    const getY = (price) => {
        if (priceRange === 0) return H / 2;
        return H - P_y - ((price - minPrice) / priceRange) * (H - 2 * P_y);
    };
    
    const handleMove = (e) => {
        const rect = svg.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / rect.width * W;
        
        if (mouseX < P_x || mouseX > W - 10) {
            hideHoverElements();
            return;
        }
        
        const indexWidthRatio = (prices.length - 1) / (W - P_x - 10);
        let index = Math.round((mouseX - P_x) * indexWidthRatio);
        index = Math.max(0, Math.min(prices.length - 1, index));
        index = Math.max(0, Math.min(prices.length - 1, index));
        
        const [timestamp, price] = pricesData[index];
        
        const ptX = getX(index);
        const ptY = getY(price);
        
        hoverLine.setAttribute('x1', ptX);
        hoverLine.setAttribute('x2', ptX);
        hoverLine.style.opacity = '1';
        
        hoverDot.setAttribute('cx', ptX);
        hoverDot.setAttribute('cy', ptY);
        hoverDot.style.opacity = '1';
        
        const timeFormatted = new Date(timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const formattedPrice = '$' + formatCoinPrice(price, symbol);
        
        tooltip.innerHTML = `<strong>${formattedPrice}</strong><br><span style="color:var(--text-secondary)">${timeFormatted}</span>`;
        tooltip.style.opacity = '1';
        
        const wrapperRect = chartWrapper.getBoundingClientRect();
        const localX = e.clientX - wrapperRect.left;
        const localY = e.clientY - wrapperRect.top;
        
        tooltip.style.left = `${localX + 15}px`;
        tooltip.style.top = `${localY - 45}px`;
    };
    
    const hideHoverElements = () => {
        hoverLine.style.opacity = '0';
        hoverDot.style.opacity = '0';
        tooltip.style.opacity = '0';
    };
    
    chartWrapper.addEventListener('mousemove', handleMove);
    chartWrapper.addEventListener('mouseleave', hideHoverElements);
}


function renderVolumeList() {
    const container = document.getElementById('coin-volume-list');
    if (!container || !state.prices) return;
    
    const coins = [
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
        { id: 'solana', name: 'Solana', symbol: 'SOL' },
        { id: 'ripple', name: 'Ripple', symbol: 'XRP' },
        { id: 'cardano', name: 'Cardano', symbol: 'ADA' }
    ];
    
    // Find max volume to calculate width percentages
    let maxVolume = 0;
    coins.forEach(coin => {
        const details = state.prices[coin.id] || { usd_24h_vol: 0 };
        const vol = parseFloat(details.usd_24h_vol || 0);
        if (vol > maxVolume) maxVolume = vol;
    });
    
    // Render All Coins row first
    const isAllActive = state.filters.coin === 'All';
    const allActiveClass = isAllActive ? 'active' : '';
    let html = `
        <div class="volume-item ${allActiveClass}" data-coin="All">
            <div class="volume-info-row">
                <div>
                    <span class="volume-coin-symbol">ALL</span>
                    <span class="volume-coin-name">All Coins</span>
                </div>
                <span class="volume-value">Market Feed</span>
            </div>
            <div class="volume-bar-container">
                <div class="volume-bar-fill" style="width: 100%;"></div>
            </div>
        </div>
    `;
    
    coins.forEach(coin => {
        const details = state.prices[coin.id] || { usd_24h_vol: 0 };
        const vol = parseFloat(details.usd_24h_vol || 0);
        const formattedVol = vol > 0 ? '$' + Math.round(vol).toLocaleString() : 'N/A';
        
        const isActive = state.filters.coin === coin.symbol;
        const activeClass = isActive ? 'active' : '';
        
        // Calculate width percentage relative to max volume
        const ratio = maxVolume > 0 ? (vol / maxVolume) * 100 : 0;
        const barWidth = Math.max(5, ratio); // at least 5% bar
        
        // Watchlist marks
        const inActiveWatchlist = (state.watchlists[state.activeWatchlistName] || []).includes(coin.symbol);
        const inAnyWatchlist = Object.values(state.watchlists).some(list => list.includes(coin.symbol));
        let starIconHtml = '';
        if (inActiveWatchlist) {
            starIconHtml = `<i data-lucide="star" style="width: 11px; height: 11px; fill: #eab308; stroke: #eab308; margin-left: 4px; display: inline-block; vertical-align: middle;"></i>`;
        } else if (inAnyWatchlist) {
            starIconHtml = `<i data-lucide="star" style="width: 11px; height: 11px; stroke: #eab308; margin-left: 4px; display: inline-block; vertical-align: middle;"></i>`;
        }
        
        html += `
            <div class="volume-item ${activeClass}" data-coin="${coin.symbol}">
                <div class="volume-info-row">
                    <div>
                        <span class="volume-coin-symbol">${coin.symbol} ${starIconHtml}</span>
                        <span class="volume-coin-name">${coin.name}</span>
                    </div>
                    <span class="volume-value">${formattedVol}</span>
                </div>
                <div class="volume-bar-container">
                    <div class="volume-bar-fill" style="width: ${barWidth}%;"></div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ==========================================================================
// Alerts Engine & Notifications
// ==========================================================================

function requestNotificationPermission() {
    if ('Notification' in window) {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }
    }
}

function renderActiveAlertsSidebar() {
    const container = document.getElementById('active-alerts-list');
    if (!container) return;
    
    if (state.alerts.length === 0) {
        container.innerHTML = '<span class="no-alerts-label">No active price alerts</span>';
        return;
    }
    
    let html = '';
    state.alerts.forEach(alert => {
        let channelsBadge = '';
        if (alert.channels) {
            if (alert.channels.browser) {
                channelsBadge += `<span class="alert-badge-icon" title="Browser Alert" style="margin-right: 4px; display: inline-flex; align-items: center;"><i data-lucide="bell" style="width:10px; height:10px; color:var(--accent-cyan);"></i></span>`;
            }
            if (alert.channels.email) {
                channelsBadge += `<span class="alert-badge-icon" title="Email Alert" style="display: inline-flex; align-items: center;"><i data-lucide="mail" style="width:10px; height:10px; color:var(--accent-purple);"></i></span>`;
            }
        } else {
            // backward compatibility
            channelsBadge += `<span class="alert-badge-icon" title="Browser Alert" style="margin-right: 4px; display: inline-flex; align-items: center;"><i data-lucide="bell" style="width:10px; height:10px; color:var(--accent-cyan);"></i></span>`;
            if (alert.email) {
                channelsBadge += `<span class="alert-badge-icon" title="Email Alert" style="display: inline-flex; align-items: center;"><i data-lucide="mail" style="width:10px; height:10px; color:var(--accent-purple);"></i></span>`;
            }
        }
        
        const directionSymbol = alert.direction === 'above' ? '▲' : '▼';
        const directionClass = alert.direction;
        
        html += `
            <div class="alert-sidebar-item" id="${alert.id}">
                <div class="alert-sidebar-info">
                    <div>
                        <span class="alert-coin-badge">${alert.symbol}</span>
                        <span class="alert-condition ${directionClass}">${directionSymbol} $${alert.price.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center; margin-top: 4px;">
                        ${channelsBadge}
                        ${alert.email ? `<span style="font-size:0.6rem; color:var(--text-muted); margin-left: 4px;">(${escapeHTML(alert.email)})</span>` : ''}
                    </div>
                </div>
                <button class="alert-delete-btn" onclick="removeAlert('${alert.id}')" title="Delete Alert">
                    <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    lucide.createIcons();
}

function removeAlert(id) {
    state.alerts = state.alerts.filter(alert => alert.id !== id);
    localStorage.setItem('pulse_alerts', JSON.stringify(state.alerts));
    renderActiveAlertsSidebar();
}

async function checkPriceAlerts() {
    if (state.alerts.length === 0 || !state.prices) return;
    
    const activeAlerts = [];
    const triggeredAlerts = [];
    
    for (const alert of state.alerts) {
        const coinId = coinIdMapping[alert.symbol];
        if (!coinId || !state.prices[coinId]) {
            activeAlerts.push(alert);
            continue;
        }
        
        const currentPrice = state.prices[coinId].usd;
        let isTriggered = false;
        
        if (alert.direction === 'above' && currentPrice >= alert.price) {
            isTriggered = true;
        } else if (alert.direction === 'below' && currentPrice <= alert.price) {
            isTriggered = true;
        }
        
        if (isTriggered) {
            triggeredAlerts.push({ alert, currentPrice });
        } else {
            activeAlerts.push(alert);
        }
    }
    
    if (triggeredAlerts.length > 0) {
        // Update local state and storage
        state.alerts = activeAlerts;
        localStorage.setItem('pulse_alerts', JSON.stringify(state.alerts));
        renderActiveAlertsSidebar();
        
        // Handle triggers
        for (const item of triggeredAlerts) {
            const { alert, currentPrice } = item;
            const message = `${alert.symbol} crossed ${alert.direction} $${alert.price.toLocaleString()} (Current: $${currentPrice.toLocaleString()})`;
            
            // Log to alert history
            const historyItem = {
                id: 'hist-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                symbol: alert.symbol,
                direction: alert.direction,
                price: alert.price,
                triggeredPrice: currentPrice,
                timestamp: new Date().toISOString()
            };
            state.alertHistory.unshift(historyItem);
            
            const isBrowser = alert.channels ? alert.channels.browser : true;
            const isEmail = alert.channels ? alert.channels.email : !!alert.email;
            
            if (isBrowser) {
                // 1. Play Sound
                playAlertSound();
                
                // 2. Web Toast
                showToastAlert("Price Alert Triggered!", message);
                
                // 3. System Notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification("PulseCrypto Alert", {
                        body: message,
                        icon: '/favicon.ico'
                    });
                }
            }
            
            if (isEmail && alert.email) {
                // 4. Send Email Alert (Backend request)
                try {
                    const encodedEmail = encodeURIComponent(alert.email);
                    const url = `/api/alerts/trigger?coin=${alert.symbol}&direction=${alert.direction}&target=${alert.price}&current=${currentPrice}&email=${encodedEmail}`;
                    fetch(url)
                        .then(r => r.json())
                        .then(data => {
                            if (data.success) {
                                console.log(`Email alert sent successfully to ${alert.email}`);
                            } else {
                                console.warn(`Email alert failed or SMTP not configured:`, data.error);
                            }
                        })
                        .catch(err => console.error("Error triggering email alert:", err));
                } catch (e) {
                    console.error("Failed to make email alert request:", e);
                }
            }
        }
        
        // Save alert history (max 100 items)
        if (state.alertHistory.length > 100) {
            state.alertHistory = state.alertHistory.slice(0, 100);
        }
        localStorage.setItem('pulse_alert_history', JSON.stringify(state.alertHistory));
        renderAlertHistory();
    }
}

function showToastAlert(title, message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-alert';
    
    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="bell-ring"></i>
        </div>
        <div class="toast-body">
            <strong>${escapeHTML(title)}</strong>
            <span>${escapeHTML(message)}</span>
        </div>
        <button class="toast-close" title="Close">
            <i data-lucide="x"></i>
        </button>
    `;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    // Add close event
    const closeBtn = toast.querySelector('.toast-close');
    const dismiss = () => {
        toast.classList.add('leaving');
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
            if (container.children.length === 0 && container.parentNode) {
                document.body.removeChild(container);
            }
        }, 300);
    };
    
    closeBtn.addEventListener('click', dismiss);
    
    // Auto dismiss after 8s
    setTimeout(() => {
        if (toast.parentNode === container) {
            dismiss();
        }
    }, 8000);
}

function playAlertSound() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        // C5 followed by G5
        const now = ctx.currentTime;
        osc.frequency.setValueAtTime(523.25, now); // C5
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        
        osc.frequency.setValueAtTime(783.99, now + 0.4); // G5
        gain.gain.setValueAtTime(0.2, now + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        
        osc.start(now);
        osc.stop(now + 0.85);
    } catch (e) {
        console.error("Audio playback error:", e);
    }
}

function setupMobileTabs() {
    // Set default active tab class on body
    document.body.classList.add('show-tab-focus');
    
    const navBtns = document.querySelectorAll('.mobile-nav-btn');
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Toggle active button style
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Toggle body class and close drawer
            document.body.classList.remove('show-tab-focus', 'show-tab-alerts', 'show-tab-filters', 'show-tab-insights', 'show-tab-settings', 'drawer-open');
            
            if (targetTab === 'tab-focus') {
                document.body.classList.add('show-tab-focus');
            } else if (targetTab === 'tab-alerts') {
                document.body.classList.add('show-tab-alerts');
            } else if (targetTab === 'tab-filters') {
                document.body.classList.add('show-tab-filters');
            } else if (targetTab === 'tab-insights') {
                document.body.classList.add('show-tab-insights');
            } else if (targetTab === 'tab-settings') {
                document.body.classList.add('show-tab-settings');
            }
            
            // Scroll to top of window to make sure they see the tab content
            window.scrollTo({ top: 0, behavior: 'instant' });
        });
    });
}

function calculateSMA(prices, period = 7) {
    const sma = [];
    for (let i = 0; i < prices.length; i++) {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - period + 1); j <= i; j++) {
            sum += prices[j];
            count++;
        }
        sma.push(sum / count);
    }
    return sma;
}

let liveWs = null;
function initLiveWebSocket() {
    const streams = [
        'btcusdt@ticker',
        'ethusdt@ticker',
        'solusdt@ticker',
        'xrpusdt@ticker',
        'adausdt@ticker'
    ].join('/');
    
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    try {
        console.log("Opening Binance WebSocket stream...");
        liveWs = new WebSocket(wsUrl);
        
        liveWs.onmessage = (event) => {
            const payload = JSON.parse(event.data);
            if (!payload || !payload.data) return;
            
            const ticker = payload.data;
            const sym = ticker.s.replace('USDT', ''); // e.g. BTC
            const coinId = coinIdMapping[sym];
            if (!coinId) return;
            
            const price = parseFloat(ticker.c);
            const change = parseFloat(ticker.P);
            const volume = parseFloat(ticker.q); // quote asset volume is equivalent to USD volume!
            
            // Update state in memory
            if (!state.prices[coinId]) state.prices[coinId] = {};
            state.prices[coinId].usd = price;
            state.prices[coinId].usd_24h_change = change;
            state.prices[coinId].usd_24h_vol = volume;
            
            // Verify alerts instantly
            checkPriceAlerts();
            
            // Update UI nodes targeting this symbol
            updateLiveUI(sym, price, change, volume);
        };
        
        liveWs.onerror = (err) => {
            console.error("Binance WebSocket error:", err);
        };
        
        liveWs.onclose = () => {
            console.log("Binance WebSocket closed. Reconnecting in 5 seconds...");
            setTimeout(initLiveWebSocket, 5000);
        };
    } catch (e) {
        console.error("Failed to connect to Binance WebSocket:", e);
    }
}

function updateLiveUI(symbol, price, change, volume) {
    // 1. Ticker Elements
    const tickerItems = document.querySelectorAll(`[data-ticker-item="${symbol}"]`);
    tickerItems.forEach(el => {
        const priceEl = el.querySelector('.ticker-price');
        const changeEl = el.querySelector('.ticker-change');
        if (priceEl) {
            priceEl.innerText = '$' + formatCoinPrice(price, symbol);
        }
        if (changeEl) {
            const isPos = change >= 0;
            changeEl.innerText = `${isPos ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}%`;
            changeEl.className = `ticker-change ${isPos ? 'pos' : 'neg'}`;
        }
    });
    
    // 2. Stats Cards
    const statCard = document.querySelector(`[data-coin-card="${symbol}"]`);
    if (statCard) {
        const priceEl = statCard.querySelector('.stat-price');
        const changeEl = statCard.querySelector('.stat-change');
        if (priceEl) {
            priceEl.innerText = '$' + formatCoinPrice(price, symbol);
        }
        if (changeEl) {
            const isPos = change >= 0;
            changeEl.innerText = `${isPos ? '+' : ''}${change.toFixed(2)}%`;
            changeEl.className = `stat-change ${isPos ? 'pos' : 'neg'}`;
        }
    }
    
    // 3. Sidebar Volume Item
    const volItem = document.querySelector(`.volume-item[data-coin="${symbol}"]`);
    if (volItem) {
        const valEl = volItem.querySelector('.volume-value');
        if (valEl) {
            valEl.innerText = '$' + Math.round(volume).toLocaleString();
        }
    }
    
    // 4. Focused Coin Card Price Display (if it matches the active focussed coin)
    const activeCoin = state.filters.coin === 'All' ? 'BTC' : state.filters.coin;
    if (activeCoin === symbol) {
        const focusPrice = document.querySelector('.focus-price-val');
        const focusChange = document.querySelector('.focus-change-val');
        if (focusPrice) {
            focusPrice.innerText = '$' + formatCoinPrice(price, symbol);
        }
        if (focusChange) {
            const isPos = change >= 0;
            focusChange.innerText = `${isPos ? '+' : ''}${change.toFixed(2)}%`;
            focusChange.className = `focus-change-val ${isPos ? 'pos' : 'neg'}`;
        }
    }
}

// ==========================================================================
// Alert History & Watchlist Manager Helpers
// ==========================================================================
function renderAlertHistory() {
    const container = document.getElementById('alert-history-list');
    const clearBtn = document.getElementById('clear-history-btn');
    if (!container) return;
    
    if (state.alertHistory.length === 0) {
        container.innerHTML = '<span class="no-alerts-label">No alert history</span>';
        if (clearBtn) clearBtn.style.display = 'none';
        return;
    }
    
    if (clearBtn) clearBtn.style.display = 'block';
    
    let html = '';
    state.alertHistory.forEach(item => {
        const directionSymbol = item.direction === 'above' ? '▲' : '▼';
        const directionClass = item.direction;
        const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        html += `
            <div class="alert-sidebar-item history-item" id="${item.id}">
                <div class="alert-sidebar-info">
                    <div>
                        <span class="alert-coin-badge">${item.symbol}</span>
                        <span class="alert-condition ${directionClass}">${directionSymbol} $${item.price.toLocaleString()}</span>
                    </div>
                    <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
                        <span>Exec: $${item.triggeredPrice.toLocaleString()}</span>
                        <span>${timeStr}</span>
                    </div>
                </div>
                <button class="alert-delete-btn" onclick="removeHistoryAlert('${item.id}')" title="Delete History Entry">
                    <i data-lucide="x" style="width:12px; height:12px;"></i>
                </button>
            </div>
        `;
    });
    
    container.innerHTML = html;
    lucide.createIcons();
}

function removeHistoryAlert(id) {
    state.alertHistory = state.alertHistory.filter(item => item.id !== id);
    localStorage.setItem('pulse_alert_history', JSON.stringify(state.alertHistory));
    renderAlertHistory();
}

function clearAlertHistory() {
    if (!confirm("Are you sure you want to clear all alert history?")) return;
    state.alertHistory = [];
    localStorage.setItem('pulse_alert_history', JSON.stringify(state.alertHistory));
    renderAlertHistory();
}

function renderWatchlistManager() {
    const select = document.getElementById('watchlist-select');
    if (!select) return;
    
    const names = Object.keys(state.watchlists);
    let html = `<option value="" disabled ${!state.filters.showWatchlist ? 'selected' : ''}>Select Watchlist...</option>`;
    html += names.map(name => `
        <option value="${name}" ${state.filters.showWatchlist && name === state.activeWatchlistName ? 'selected' : ''}>${name} (${state.watchlists[name].length})</option>
    `).join('');
    
    select.innerHTML = html;

    const exitWatchlistBtn = document.getElementById('exit-watchlist-btn');
    if (exitWatchlistBtn) {
        exitWatchlistBtn.style.display = state.filters.showWatchlist ? 'inline-flex' : 'none';
    }
}

