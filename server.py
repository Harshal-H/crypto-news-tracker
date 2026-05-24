import http.server
import socketserver
import urllib.request
import json
import re
import os
import time
import email.utils
import random
import xml.etree.ElementTree as ET
from urllib.error import URLError

PORT = int(os.environ.get('PORT', 8000))
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), 'public')

# In-memory caches
NEWS_CACHE = {
    'data': [],
    'last_updated': 0,
    'expiry': 300 # 5 minutes
}

PRICE_CACHE = {
    'data': {},
    'last_updated': 0,
    'expiry': 60 # 60 seconds
}

HIST_CACHE = {} # Cache for historical charts


# RSS feeds to aggregate
FEEDS = {
    'Cointelegraph': 'https://cointelegraph.com/rss',
    'CoinDesk': 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    'Decrypt': 'https://decrypt.co/feed',
    'CryptoNews': 'https://cryptonews.com/news/feed/'
}

# Positive and negative word list for algorithmic sentiment classification
POS_WORDS = {
    'bullish', 'rise', 'gain', 'soar', 'jump', 'surge', 'rally', 'grow', 'support', 'upgrade', 
    'buy', 'accumulate', 'positive', 'approved', 'partnership', 'breakout', 'institutional', 
    'adopt', 'win', 'outperform', 'highest', 'record', 'green', 'skyrocket', 'momentum', 
    'inflow', 'inflows', 'optimistic', 'optimism', 'pump', 'break'
}

NEG_WORDS = {
    'bearish', 'drop', 'fall', 'crash', 'plunge', 'dump', 'sell', 'ban', 'lawsuit', 'fine', 
    'hack', 'scam', 'theft', 'exploit', 'liquidation', 'negative', 'fear', 'panic', 'fud', 
    'investigate', 'sec', 'regulatory', 'slump', 'decline', 'loss', 'outflow', 'outflows', 
    'crackdown', 'probe', 'reject', 'rejected', 'suspension', 'suspend'
}

# Coin mappings for tagging and filtering
COIN_TAGS = {
    'BTC': ['bitcoin', 'btc'],
    'ETH': ['ethereum', 'eth', 'ether'],
    'SOL': ['solana', 'sol'],
    'XRP': ['ripple', 'xrp'],
    'ADA': ['cardano', 'ada']
}

def clean_html(raw_html):
    """Clean HTML tags and double spaces from RSS summaries."""
    if not raw_html:
        return ""
    cleanr = re.compile('<.*?>')
    cleantext = re.sub(cleanr, '', raw_html)
    cleantext = cleantext.replace('&nbsp;', ' ')
    cleantext = cleantext.replace('&amp;', '&')
    cleantext = cleantext.replace('&quot;', '"')
    cleantext = cleantext.replace('&apos;', "'")
    cleantext = re.sub(r'\s+', ' ', cleantext)
    return cleantext.strip()

def parse_rss_fallback(xml_str, source_name):
    """Regex fallback parser in case ElementTree XML parsing fails due to CDATA or special entities."""
    articles = []
    items = re.findall(r'<item>(.*?)</item>', xml_str, re.DOTALL)
    for item in items:
        try:
            title_match = re.search(r'<title>(.*?)</title>', item, re.DOTALL)
            link_match = re.search(r'<link>(.*?)</link>', item, re.DOTALL)
            pub_date_match = re.search(r'<pubDate>(.*?)</pubDate>', item, re.DOTALL)
            desc_match = re.search(r'<description>(.*?)</description>', item, re.DOTALL)
            
            title = title_match.group(1).strip() if title_match else ""
            link = link_match.group(1).strip() if link_match else ""
            pub_date = pub_date_match.group(1).strip() if pub_date_match else ""
            desc = desc_match.group(1).strip() if desc_match else ""
            
            # Clean CDATA markers
            if title.startswith('<![CDATA['):
                title = title[9:-3]
            if link.startswith('<![CDATA['):
                link = link[9:-3]
            if desc.startswith('<![CDATA['):
                desc = desc[9:-3]
                
            desc_clean = clean_html(desc)
            
            # Extract creator / author
            creator_match = re.search(r'<dc:creator>(.*?)</dc:creator>', item, re.DOTALL)
            author = creator_match.group(1).strip() if creator_match else ""
            if author.startswith('<![CDATA['):
                author = author[9:-3]
            
            # Try to grab thumbnail or enclosure image URL
            image_url = ""
            img_match = re.search(r'url=["\'](https?://[^"\']+\.(?:png|jpg|jpeg|webp|gif|svg))["\']', item, re.IGNORECASE)
            if img_match:
                image_url = img_match.group(1)
            else:
                # Fallback to scanning description content
                img_src_match = re.search(r'src=["\'](https?://[^"\']+)["\']', desc, re.IGNORECASE)
                if img_src_match:
                    image_url = img_src_match.group(1)
            
            articles.append({
                'title': title,
                'link': link,
                'pubDate': pub_date,
                'description': desc_clean[:280] + '...' if len(desc_clean) > 280 else desc_clean,
                'author': author,
                'imageUrl': image_url,
                'source': source_name
            })
        except Exception as e:
            print(f"Fallback parse failed for an item in {source_name}: {e}")
            continue
    return articles

def parse_rss(xml_data, source_name):
    """Parse RSS feed XML into articles."""
    # Ensure XML is string
    if isinstance(xml_data, bytes):
        try:
            xml_str = xml_data.decode('utf-8', errors='ignore')
        except Exception:
            xml_str = str(xml_data)
    else:
        xml_str = xml_data

    # Use fallback parsing if there are XML formatting issues
    articles = []
    try:
        # Standard ElementTree parser
        # Pre-clean string to avoid common parsing blockers
        cleaned_xml = re.sub(r'xmlns:content=["\'][^"\']+["\']', '', xml_str) # strip content namespace
        root = ET.fromstring(cleaned_xml)
        channel = root.find('channel')
        if channel is None:
            return parse_rss_fallback(xml_str, source_name)
            
        for item in channel.findall('item'):
            title_node = item.find('title')
            title = title_node.text if title_node is not None else ""
            
            link_node = item.find('link')
            link = link_node.text if link_node is not None else ""
            
            pub_date_node = item.find('pubDate')
            pub_date = pub_date_node.text if pub_date_node is not None else ""
            
            desc_node = item.find('description')
            desc = desc_node.text if desc_node is not None else ""
            desc_clean = clean_html(desc)
            
            # Author
            author = ""
            creator = item.find('{http://purl.org/dc/elements/1.1/}creator')
            if creator is not None and creator.text:
                author = creator.text
                
            # Image URL
            image_url = ""
            enclosure = item.find('enclosure')
            if enclosure is not None:
                image_url = enclosure.attrib.get('url', '')
            if not image_url:
                media_content = item.find('{http://search.yahoo.com/mrss/}content')
                if media_content is not None:
                    image_url = media_content.attrib.get('url', '')
            if not image_url:
                # Search description html for images
                img_src_match = re.search(r'src=["\'](https?://[^"\']+)["\']', desc, re.IGNORECASE)
                if img_src_match:
                    image_url = img_src_match.group(1)

            articles.append({
                'title': title,
                'link': link,
                'pubDate': pub_date,
                'description': desc_clean[:280] + '...' if len(desc_clean) > 280 else desc_clean,
                'author': author,
                'imageUrl': image_url,
                'source': source_name
            })
    except Exception as e:
        print(f"Standard parser failed for {source_name}, using fallback parser. Error: {e}")
        articles = parse_rss_fallback(xml_str, source_name)
        
    return articles

def calculate_article_sentiment(article):
    """Calculate sentiment score (-3 to +3) and assign category to article."""
    title_desc = f"{article['title']} {article['description']}".lower()
    
    # Split text into clean word tokens
    words = re.findall(r'\b\w+\b', title_desc)
    
    pos_count = sum(1 for w in words if w in POS_WORDS)
    neg_count = sum(1 for w in words if w in NEG_WORDS)
    
    score = pos_count - neg_count
    
    if score > 0:
        return 'positive', min(score, 3)
    elif score < 0:
        return 'negative', max(score, -3)
    else:
        return 'neutral', 0

def fetch_and_aggregate_news():
    """Fetch from all RSS feeds and compile a unified sorted news list."""
    current_time = time.time()
    if NEWS_CACHE['data'] and (current_time - NEWS_CACHE['last_updated'] < NEWS_CACHE['expiry']):
        return NEWS_CACHE['data']
        
    aggregated = []
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
    for source, url in FEEDS.items():
        req = urllib.request.Request(url, headers=headers)
        try:
            print(f"Fetching RSS feed from {source}...")
            with urllib.request.urlopen(req, timeout=8) as response:
                xml_data = response.read()
                feed_articles = parse_rss(xml_data, source)
                print(f"Parsed {len(feed_articles)} articles from {source}")
                aggregated.extend(feed_articles)
        except Exception as e:
            print(f"Error fetching from {source}: {e}")
            
    # Process sentiment and tag coins
    processed_articles = []
    for article in aggregated:
        # Sentiment
        sentiment, score = calculate_article_sentiment(article)
        article['sentiment'] = sentiment
        article['sentimentScore'] = score
        
        # Tags
        tags = []
        full_text = f"{article['title']} {article['description']}".lower()
        for symbol, keywords in COIN_TAGS.items():
            if any(k in full_text for k in keywords):
                tags.append(symbol)
        
        # Default tag if none matches
        if not tags:
            tags.append("General")
            
        article['tags'] = tags
        
        # Parse pubDate into timestamp for sorting
        ts = 0
        try:
            dt = email.utils.parsedate_to_datetime(article['pubDate'])
            ts = int(dt.timestamp())
        except Exception:
            # Fallback timestamp (current time but spaced out slightly to preserve RSS order if fallback is used)
            ts = int(current_time) - len(processed_articles)
            
        article['timestamp'] = ts
        processed_articles.append(article)
        
    # Sort by timestamp descending
    processed_articles.sort(key=lambda x: x['timestamp'], reverse=True)
    
    # Cache and return
    NEWS_CACHE['data'] = processed_articles
    NEWS_CACHE['last_updated'] = current_time
    return processed_articles

def generate_summary():
    """Analyze current news data and calculate overall sentiment summary and highlights."""
    articles = fetch_and_aggregate_news()
    if not articles:
        return {
            'overallSentiment': 50,
            'overallLabel': 'Neutral',
            'trendingCoins': [],
            'dailyBrief': 'No cryptocurrency news articles are currently available to summarize.',
            'coinInsights': {}
        }
        
    total = len(articles)
    positive = sum(1 for a in articles if a['sentiment'] == 'positive')
    negative = sum(1 for a in articles if a['sentiment'] == 'negative')
    neutral = sum(1 for a in articles if a['sentiment'] == 'neutral')
    
    # Calculate Fear & Greed index proxy (0-100)
    sentiment_index = 50
    if total > 0:
        sentiment_index = int(50 + ((positive - negative) / total) * 50)
        # Cap range
        sentiment_index = max(10, min(95, sentiment_index))
        
    sentiment_label = "Neutral"
    if sentiment_index > 70:
        sentiment_label = "Strongly Bullish"
    elif sentiment_index > 55:
        sentiment_label = "Moderately Bullish"
    elif sentiment_index < 30:
        sentiment_label = "Strongly Bearish"
    elif sentiment_index < 45:
        sentiment_label = "Moderately Bearish"
        
    # Track trending coins and coin-specific summaries
    coin_mentions = {symbol: 0 for symbol in COIN_TAGS.keys()}
    coin_articles = {symbol: [] for symbol in COIN_TAGS.keys()}
    
    for a in articles:
        for symbol in COIN_TAGS.keys():
            if symbol in a['tags']:
                coin_mentions[symbol] += 1
                coin_articles[symbol].append(a)
                
    # Sort trending coins
    trending = sorted(
        [{'coin': coin, 'mentions': count} for coin, count in coin_mentions.items() if count > 0],
        key=lambda x: x['mentions'],
        reverse=True
    )
    
    # Generate insights for each coin
    coin_insights = {}
    for symbol, coin_list in coin_articles.items():
        if not coin_list:
            coin_insights[symbol] = {
                'sentiment': 'Neutral',
                'mentions': 0,
                'summary': "No recent news matching this coin."
            }
            continue
            
        pos = sum(1 for a in coin_list if a['sentiment'] == 'positive')
        neg = sum(1 for a in coin_list if a['sentiment'] == 'negative')
        
        c_sentiment = 'Neutral'
        if pos > neg + 1:
            c_sentiment = 'Bullish'
        elif neg > pos + 1:
            c_sentiment = 'Bearish'
            
        # Synthesize brief based on headlines
        headlines = [a['title'] for a in coin_list[:2]]
        headlines_bullets = " and ".join(f"'{h}'" for h in headlines)
        
        if c_sentiment == 'Bullish':
            summary_text = f"Experiencing positive upward news momentum. Interest is driven by updates like {headlines_bullets}."
        elif c_sentiment == 'Bearish':
            summary_text = f"Facing downward sentiment and negative market pressure. Headlines highlight concerns: {headlines_bullets}."
        else:
            summary_text = f"Consolidating with balanced sentiment and steady news. Focus points include {headlines_bullets}."
            
        coin_insights[symbol] = {
            'sentiment': c_sentiment,
            'mentions': len(coin_list),
            'summary': summary_text
        }
        
    # Generate overall daily brief
    top_headlines = [a['title'] for a in articles[:3]]
    brief_intro = f"The crypto market sentiment stands at **{sentiment_index}/100** ({sentiment_label}). "
    if trending:
        top_coin = trending[0]['coin']
        brief_intro += f"**{top_coin}** is today's most discussed asset with {coin_mentions[top_coin]} headlines. "
        
    brief_bullets = "\n".join(f"• {h}" for h in top_headlines)
    daily_brief = f"{brief_intro}\n\n**Top Market Narratives:**\n{brief_bullets}"
    
    return {
        'overallSentiment': sentiment_index,
        'overallLabel': sentiment_label,
        'trendingCoins': trending,
        'dailyBrief': daily_brief,
        'coinInsights': coin_insights
    }

def fetch_live_prices():
    """Proxy CoinGecko simple price fetch with local caching."""
    current_time = time.time()
    if PRICE_CACHE['data'] and (current_time - PRICE_CACHE['last_updated'] < PRICE_CACHE['expiry']):
        return PRICE_CACHE['data']
        
    url = "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,ripple,cardano&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true"
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        print("Proxying CoinGecko price data with volume...")
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            PRICE_CACHE['data'] = data
            PRICE_CACHE['last_updated'] = current_time
            return data
    except Exception as e:
        print(f"Error fetching prices from CoinGecko: {e}")
        # Fallback to previous cache if available, else mock data
        if PRICE_CACHE['data']:
            print("Using stale price cache.")
            return PRICE_CACHE['data']
            
        # Hardcoded mock values as safety net
        print("Returning fallback mock prices.")
        return {
            "bitcoin": {"usd": 76906.50, "usd_24h_change": 2.70, "usd_24h_vol": 35466481039},
            "ethereum": {"usd": 2116.97, "usd_24h_change": 3.82, "usd_24h_vol": 18240500120},
            "solana": {"usd": 86.15, "usd_24h_change": 3.67, "usd_24h_vol": 31206500800},
            "ripple": {"usd": 1.36, "usd_24h_change": 1.96, "usd_24h_vol": 2145900500},
            "cardano": {"usd": 0.244, "usd_24h_change": 1.56, "usd_24h_vol": 435010900}
        }


def generate_mock_historical(coin):
    """Generate a sequence of [timestamp, price] over the last 24h as a fallback."""
    now_ms = int(time.time() * 1000)
    prices = []
    base_price = {
        'bitcoin': 76800.0,
        'ethereum': 2110.0,
        'solana': 86.1,
        'ripple': 1.36,
        'cardano': 0.244
    }.get(coin, 100.0)
    
    current_val = base_price
    for i in range(24):
        ts = now_ms - (23 - i) * 3600000
        change = random.uniform(-0.015, 0.018)
        current_val = current_val * (1 + change)
        prices.append([ts, round(current_val, 4)])
    return prices

def fetch_historical_prices(coin):
    """Proxy CoinGecko 24h historical price data with caching and automatic mocks."""
    current_time = time.time()
    if coin in HIST_CACHE and (current_time - HIST_CACHE[coin]['last_updated'] < 300):
        return HIST_CACHE[coin]['data']
        
    url = f"https://api.coingecko.com/api/v3/coins/{coin}/market_chart?vs_currency=usd&days=1"
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        print(f"Proxying CoinGecko historical data for {coin}...")
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            prices = data.get('prices', [])
            if not prices:
                raise ValueError("Empty prices from CoinGecko")
            HIST_CACHE[coin] = {
                'data': prices,
                'last_updated': current_time
            }
            return prices
    except Exception as e:
        print(f"Error fetching historical prices for {coin}: {e}")
        if coin in HIST_CACHE:
            print("Using stale historical cache.")
            return HIST_CACHE[coin]['data']
            
        print(f"Returning mock historical data for {coin}.")
        mock_data = generate_mock_historical(coin)
        # Don't cache mock data permanently, just a short grace period
        HIST_CACHE[coin] = {
            'data': mock_data,
            'last_updated': current_time - 240 # expires in 60s
        }
        return mock_data


class ApiRequestHandler(http.server.BaseHTTPRequestHandler):
    def end_headers(self):
        # CORS Headers
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Parse query parameters from path
        parsed_path = self.path.split('?')
        route = parsed_path[0]
        params = {}
        if len(parsed_path) > 1:
            for param in parsed_path[1].split('&'):
                if '=' in param:
                    k, v = param.split('=', 1)
                    params[k] = v

        # API Route Handling
        if route == '/api/news':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                news = fetch_and_aggregate_news()
                self.wfile.write(json.dumps(news).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return
            
        elif route == '/api/summary':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                summary = generate_summary()
                self.wfile.write(json.dumps(summary).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return
            
        elif route == '/api/prices':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                prices = fetch_live_prices()
                self.wfile.write(json.dumps(prices).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        elif route == '/api/historical':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                coin = params.get('coin', 'bitcoin')
                historical = fetch_historical_prices(coin)
                self.wfile.write(json.dumps(historical).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        # Static Files Routing
        # Default file: index.html
        path_to_serve = route
        if path_to_serve == '/' or path_to_serve == '/index.html':
            filepath = os.path.join(PUBLIC_DIR, 'index.html')
            content_type = 'text/html'
        else:
            # Prevent directory traversal attacks
            safe_path = os.path.normpath(path_to_serve).lstrip('/')
            filepath = os.path.join(PUBLIC_DIR, safe_path)
            
            # Resolve content types
            if filepath.endswith('.css'):
                content_type = 'text/css'
            elif filepath.endswith('.js'):
                content_type = 'application/javascript'
            elif filepath.endswith('.json'):
                content_type = 'application/json'
            elif filepath.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
                content_type = 'image/' + filepath.split('.')[-1]
            elif filepath.endswith('.svg'):
                content_type = 'image/svg+xml'
            else:
                content_type = 'text/plain'

        # Check if file exists and serve
        if os.path.exists(filepath) and os.path.isfile(filepath):
            self.send_response(200)
            self.send_header('Content-type', content_type)
            self.end_headers()
            with open(filepath, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            self.wfile.write(b"<h1>404 Not Found</h1><p>The requested static file was not found.</p>")


def run():
    # Make sure public directory exists
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    
    server_address = ('', PORT)
    with socketserver.TCPServer(server_address, ApiRequestHandler) as httpd:
        print(f"==========================================================")
        print(f" Crypto News Tracker Local Server running on port {PORT} ")
        print(f" Open http://localhost:{PORT} in your web browser       ")
        print(f"==========================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")

if __name__ == '__main__':
    run()
