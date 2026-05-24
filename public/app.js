// ==========================================================================
// Application State
// ==========================================================================
const state = {
    news: [],
    prices: {},
    summary: {},
    bookmarks: JSON.parse(localStorage.getItem('pulse_bookmarks') || '[]'),
    filters: {
        coin: 'All',
        source: 'All',
        sentiment: 'All',
        search: '',
        showBookmarks: false
    }
};

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
    updateBookmarkBadge();
    fetchData();
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
        
        renderAll();
    } catch (error) {
        console.error("Error loading application data:", error);
        renderErrorState();
    }
}

async function refreshData() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.classList.add('spinning');
    
    try {
        const [newsRes, pricesRes, summaryRes] = await Promise.all([
            fetch('/api/news').then(r => r.json()),
            fetch('/api/prices').then(r => r.json()),
            fetch('/api/summary').then(r => r.json())
        ]);
        
        state.news = newsRes;
        state.prices = pricesRes;
        state.summary = summaryRes;
        
        renderAll();
    } catch (error) {
        console.error("Error refreshing feed:", error);
    } finally {
        if (refreshBtn) {
            setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
        }
    }
}

// ==========================================================================
// Setup Event Listeners
// ==========================================================================
function setupEventListeners() {
    // Search filter input
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.search = e.target.value.toLowerCase().trim();
            renderNewsFeed();
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
            
            // If showing bookmarks, deactivate tag filters visually
            if (state.filters.showBookmarks) {
                document.querySelectorAll('.tag-btn, .source-btn, .sentiment-filter-btn').forEach(b => {
                    b.classList.remove('active');
                });
                document.querySelector('[data-coin="All"]').classList.add('active');
                document.querySelector('[data-source="All"]').classList.add('active');
                document.querySelector('[data-sent="All"]').classList.add('active');
                state.filters.coin = 'All';
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
    
    // ESC key to close modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// ==========================================================================
// Rendering Engine
// ==========================================================================
function renderAll() {
    renderTicker();
    renderStatsCards();
    renderNewsFeed();
    renderSentimentGauge();
    renderDailyBriefing();
    renderTrendingCoins();
    renderInsightsAccordion();
    renderVolumeList();
    
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
            const price = parseFloat(details.usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const change = parseFloat(details.usd_24h_change || 0);
            const isPos = change >= 0;
            const changeIcon = isPos ? '▲' : '▼';
            const changeClass = isPos ? 'pos' : 'neg';
            
            itemsHtml += `
                <div class="ticker-item" onclick="filterByCoin('${sym}')">
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
    
    const coins = [
        { id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC' },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH' },
        { id: 'solana', name: 'Solana', symbol: 'SOL' },
        { id: 'ripple', name: 'Ripple', symbol: 'XRP' },
        { id: 'cardano', name: 'Cardano', symbol: 'ADA' }
    ];
    
    let html = '';
    
    coins.forEach(coin => {
        const details = state.prices[coin.id] || { usd: 0, usd_24h_change: 0 };
        const price = parseFloat(details.usd).toLocaleString('en-US', { 
            minimumFractionDigits: coin.id === 'cardano' ? 4 : 2, 
            maximumFractionDigits: coin.id === 'cardano' ? 4 : 2 
        });
        const change = parseFloat(details.usd_24h_change || 0);
        const isPos = change >= 0;
        const changeClass = isPos ? 'pos' : 'neg';
        const changeText = (isPos ? '+' : '') + change.toFixed(2) + '%';
        
        // Generate a beautiful aesthetic SVG sparkline based on 24h performance
        const sparklinePath = generateSparkline(isPos);
        const strokeColor = isPos ? '#10b981' : '#f43f5e';
        const fillGradId = `spark-grad-${coin.symbol}`;
        
        html += `
            <div class="stat-card" onclick="filterByCoin('${coin.symbol}')">
                <div class="stat-header">
                    <div>
                        <div class="stat-coin-name">${coin.name}</div>
                        <div class="stat-coin-symbol">${coin.symbol}</div>
                    </div>
                    <svg class="stat-sparkline" viewBox="0 0 100 30">
                        <defs>
                            <linearGradient id="${fillGradId}" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="${strokeColor}" stop-opacity="0.25"/>
                                <stop offset="100%" stop-color="${strokeColor}" stop-opacity="0"/>
                            </linearGradient>
                        </defs>
                        <!-- Sparkline shaded area -->
                        <path d="${sparklinePath} L 100 30 L 0 30 Z" fill="url(#${fillGradId})"></path>
                        <!-- Sparkline stroke path -->
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
    
    // Deactivate bookmark button style
    const bookmarkBtn = document.getElementById('bookmark-toggle-btn');
    if (bookmarkBtn) bookmarkBtn.classList.remove('active');
    
    // Update volume list active state
    document.querySelectorAll('#coin-volume-list .volume-item').forEach(el => {
        el.classList.toggle('active', el.dataset.coin === sym);
    });
    
    // Render news feed based on the filtered coin
    renderNewsFeed();
    
    // Trigger historical chart and advisor updates
    triggerCoinFocusUpdate(sym);
}

/* 3. News Feed Stream */
function renderNewsFeed() {
    const feedContainer = document.getElementById('news-feed');
    const feedCountDisplay = document.getElementById('feed-count-display');
    const feedTitle = document.getElementById('feed-title');
    
    if (!feedContainer) return;
    
    // Filter news
    let filtered = [...state.news];
    
    if (state.filters.showBookmarks) {
        feedTitle.innerText = "Saved Articles";
        filtered = filtered.filter(a => state.bookmarks.some(b => b.link === a.link));
    } else {
        feedTitle.innerText = "Latest Market News";
        
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
    
    // Update count display
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
    
    const coinId = coinIdMapping[symbol];
    if (!coinId) return;
    
    // Show loading skeleton if the coin selection changes
    if (lastFetchedFocusSymbol !== symbol) {
        container.innerHTML = `
            <div class="focus-loading">
                <div class="pulse-dot"></div>
                Fetching historical price and options trends for ${coinNameMapping[symbol]}...
            </div>
        `;
        lastFetchedFocusSymbol = symbol;
    }
    
    try {
        const response = await fetch(`/api/historical?coin=${coinId}`);
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
    const priceText = parseFloat(coinPriceInfo.usd).toLocaleString('en-US', { 
        minimumFractionDigits: symbol === 'ADA' ? 4 : 2, 
        maximumFractionDigits: symbol === 'ADA' ? 4 : 2 
    });
    
    const change = parseFloat(coinPriceInfo.usd_24h_change || 0);
    const isPos = change >= 0;
    const changeClass = isPos ? 'pos' : 'neg';
    const changeText = (isPos ? '+' : '') + change.toFixed(2) + '%';
    
    // Render SVG Line Chart
    const svgHtml = drawInteractiveChart(pricesData, isPos);
    
    // Calculate options rating score (-100 to +100)
    let coinSentimentVal = 0;
    if (state.summary.coinInsights && state.summary.coinInsights[symbol]) {
        const sent = state.summary.coinInsights[symbol].sentiment;
        if (sent === 'Bullish') coinSentimentVal = 70;
        else if (sent === 'Bearish') coinSentimentVal = -70;
    }
    
    // Combine 24h change (momentum) and news sentiment
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
    
    container.innerHTML = `
        <div class="focus-header">
            <div class="focus-coin-info">
                <h3>${coinName} <span>(${symbol})</span></h3>
                <div class="focus-price-container">
                    <span class="focus-price">$${priceText}</span>
                    <span class="focus-change ${changeClass}">${changeText}</span>
                </div>
            </div>
            <span class="ai-badge"><i data-lucide="sparkles"></i> Options Advisor</span>
        </div>
        
        <!-- Interactive Chart Wrapper -->
        <div class="chart-wrapper" id="focus-chart-wrapper">
            ${svgHtml}
            <div class="chart-tooltip" id="focus-chart-tooltip"></div>
        </div>
        
        <!-- Option Trading Trend Section -->
        <div class="options-section">
            <div class="options-title-bar">
                <h4><i data-lucide="trending-up" style="width:16px; height:16px; color:var(--accent-cyan)"></i> Option Trading Recommendation</h4>
                <span class="options-badge ${badgeClass}">${label}</span>
            </div>
            
            <!-- Custom slider -->
            <div class="trend-slider-container">
                <div class="trend-slider-track">
                    <div class="trend-slider-marker" style="left: ${sliderPercentage}%;"></div>
                </div>
                <div class="trend-slider-labels">
                    <span>Strong Put</span>
                    <span>Put</span>
                    <span>Hold</span>
                    <span>Call</span>
                    <span>Strong Call</span>
                </div>
            </div>
            
            <div class="options-analysis-card">
                <p><strong>Outlook:</strong> ${analysisMsg}</p>
                <p style="margin-top: 6px; font-size: 0.7rem; color:var(--text-muted);">
                    Indicators Summary: Technical Momentum weight (60%) + Aggregated Sentiment weight (40%). Analysis Confidence: <strong>${confidence}%</strong>.
                </p>
            </div>
        </div>
    `;
    
    lucide.createIcons();
    setupChartHoverHandlers(pricesData);
}

function drawInteractiveChart(pricesData, isBullish) {
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
        if (val >= 1000) return '$' + Math.round(val).toLocaleString();
        if (val < 1) return '$' + val.toFixed(4);
        return '$' + val.toFixed(2);
    };
    
    const axisLabelsY = `
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(minPrice) + 3}" text-anchor="end">${formatYVal(minPrice)}</text>
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(midPrice) + 3}" text-anchor="end">${formatYVal(midPrice)}</text>
        <text class="chart-labels-y" x="${P_x - 8}" y="${getY(maxPrice) + 3}" text-anchor="end">${formatYVal(maxPrice)}</text>
    `;
    
    const axisLabelsX = `
        <text class="chart-labels-x" x="${P_x}" y="${H - 2}">24h ago</text>
        <text class="chart-labels-x" x="${P_x + (W - P_x - 10)/2}" y="${H - 2}">12h ago</text>
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
            <!-- Shaded Area -->
            <path d="${areaD}" fill="url(#${gradId})" style="pointer-events:none;"></path>
            <!-- Line Path -->
            <path d="${lineD}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none;"></path>
            
            <!-- Hover Elements -->
            <line class="chart-hover-line" id="focus-hover-line" x1="0" y1="${P_y}" x2="0" y2="${H - P_y}"></line>
            <circle class="chart-hover-dot" id="focus-hover-dot" cx="0" cy="0"></circle>
        </svg>
    `;
}

function setupChartHoverHandlers(pricesData) {
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
        const formattedPrice = price.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: price < 1 ? 4 : 2
        });
        
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
        
        html += `
            <div class="volume-item ${activeClass}" data-coin="${coin.symbol}">
                <div class="volume-info-row">
                    <div>
                        <span class="volume-coin-symbol">${coin.symbol}</span>
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

