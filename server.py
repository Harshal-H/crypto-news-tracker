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
from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Coin mappings for news tagging and filtering (covers all likely top-20 + extras)
COIN_TAGS = {
    'BTC':  ['bitcoin', 'btc'],
    'ETH':  ['ethereum', 'eth', 'ether'],
    'USDT': ['tether', 'usdt'],
    'BNB':  ['bnb', 'binance coin', 'binance smart chain', 'bsc'],
    'SOL':  ['solana', 'sol'],
    'XRP':  ['ripple', 'xrp'],
    'USDC': ['usd coin', 'usdc'],
    'DOGE': ['dogecoin', 'doge'],
    'ADA':  ['cardano', 'ada'],
    'TRX':  ['tron', 'trx'],
    'AVAX': ['avalanche', 'avax'],
    'SHIB': ['shiba', 'shib', 'shiba inu'],
    'TON':  ['toncoin', 'ton', 'the open network'],
    'LINK': ['chainlink', 'link'],
    'DOT':  ['polkadot', 'dot'],
    'BCH':  ['bitcoin cash', 'bch'],
    'NEAR': ['near protocol', 'near'],
    'SUI':  ['sui network', 'sui'],
    'MATIC':['polygon', 'matic', 'pol'],
    'LTC':  ['litecoin', 'ltc'],
    'UNI':  ['uniswap', 'uni'],
    'ATOM': ['cosmos', 'atom'],
    'ARB':  ['arbitrum', 'arb'],
    'OP':   ['optimism', 'op'],
    'APT':  ['aptos', 'apt'],
    'XLM':  ['stellar', 'xlm'],
    'ICP':  ['internet computer', 'icp'],
    'FIL':  ['filecoin', 'fil'],
    'HBAR': ['hedera', 'hbar'],
    'IMX':  ['immutable', 'imx'],
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
    """Fetch from all RSS feeds concurrently and compile a unified sorted news list."""
    current_time = time.time()
    if NEWS_CACHE['data'] and (current_time - NEWS_CACHE['last_updated'] < NEWS_CACHE['expiry']):
        return NEWS_CACHE['data']
        
    aggregated = []
    headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
    def fetch_single_feed(source, url):
        req = urllib.request.Request(url, headers=headers)
        try:
            print(f"Fetching RSS feed concurrently from {source}...")
            with urllib.request.urlopen(req, timeout=4) as response:
                xml_data = response.read()
                feed_articles = parse_rss(xml_data, source)
                print(f"Parsed {len(feed_articles)} articles from {source}")
                return feed_articles
        except Exception as e:
            print(f"Error fetching from {source}: {e}")
            return []

    # Fetch concurrently to improve aggregation speed
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as executor:
        futures = {executor.submit(fetch_single_feed, src, url): src for src, url in FEEDS.items()}
        for future in as_completed(futures):
            feed_articles = future.result()
            aggregated.extend(feed_articles)
            
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
                'score': 50,
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
            
        # Calculate numeric sentiment score for the specific coin (0-100 scale)
        total_c = len(coin_list)
        c_score = 50
        if total_c > 0:
            c_score = int(50 + ((pos - neg) / total_c) * 50)
            c_score = max(10, min(95, c_score))
            
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
            'score': c_score,
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
    """Fetch top 20 coins by market cap from CoinGecko with enriched data (name, symbol, image)."""
    current_time = time.time()
    if PRICE_CACHE['data'] and (current_time - PRICE_CACHE['last_updated'] < PRICE_CACHE['expiry']):
        return PRICE_CACHE['data']

    url = (
        "https://api.coingecko.com/api/v3/coins/markets"
        "?vs_currency=usd&order=market_cap_desc&per_page=20&page=1"
        "&sparkline=false&price_change_percentage=24h"
    )
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)

    try:
        print("Fetching top 20 coins by market cap from CoinGecko...")
        with urllib.request.urlopen(req, timeout=8) as response:
            coins_list = json.loads(response.read().decode('utf-8'))
            data = {}
            for coin in coins_list:
                coin_id = coin.get('id', '')
                data[coin_id] = {
                    'usd':             coin.get('current_price', 0),
                    'usd_24h_change':  coin.get('price_change_percentage_24h', 0),
                    'usd_24h_vol':     coin.get('total_volume', 0),
                    'name':            coin.get('name', ''),
                    'symbol':          coin.get('symbol', '').upper(),
                    'image':           coin.get('image', ''),
                    'market_cap_rank': coin.get('market_cap_rank', 0),
                }
            PRICE_CACHE['data'] = data
            PRICE_CACHE['last_updated'] = current_time
            return data
    except Exception as e:
        print(f"Error fetching prices from CoinGecko: {e}")
        if PRICE_CACHE['data']:
            print("Using stale price cache.")
            return PRICE_CACHE['data']

        # Hardcoded mock fallback — approximate top 20
        print("Returning fallback mock prices.")
        mock = [
            ('bitcoin',          'Bitcoin',          'BTC',  72000,    2.7,  35000000000, 1),
            ('ethereum',         'Ethereum',         'ETH',  2000,     3.8,  18000000000, 2),
            ('tether',           'Tether',           'USDT', 1.0,      0.01, 90000000000, 3),
            ('binancecoin',      'BNB',              'BNB',  600,      1.2,  2000000000,  4),
            ('solana',           'Solana',           'SOL',  165,      3.6,  4000000000,  5),
            ('ripple',           'XRP',              'XRP',  0.52,     2.0,  2100000000,  6),
            ('usd-coin',         'USDC',             'USDC', 1.0,      0.01, 8000000000,  7),
            ('dogecoin',         'Dogecoin',         'DOGE', 0.12,    -1.2,  900000000,   8),
            ('cardano',          'Cardano',          'ADA',  0.44,     1.5,  430000000,   9),
            ('tron',             'TRON',             'TRX',  0.12,     0.9,  560000000,  10),
            ('avalanche-2',      'Avalanche',        'AVAX', 35.0,     2.1,  460000000,  11),
            ('shiba-inu',        'Shiba Inu',        'SHIB', 0.000022,-2.3,  430000000,  12),
            ('the-open-network', 'Toncoin',          'TON',  5.5,      4.1,  450000000,  13),
            ('chainlink',        'Chainlink',        'LINK', 15.0,     1.5,  345000000,  14),
            ('polkadot',         'Polkadot',         'DOT',  7.5,     -0.8,  235000000,  15),
            ('bitcoin-cash',     'Bitcoin Cash',     'BCH',  350,      1.0,  400000000,  16),
            ('near',             'NEAR Protocol',    'NEAR', 7.0,      3.2,  235000000,  17),
            ('sui',              'Sui',              'SUI',  1.2,      5.3,  680000000,  18),
            ('matic-network',    'Polygon',          'MATIC',0.55,     0.9,  188000000,  19),
            ('litecoin',         'Litecoin',         'LTC',  85.0,     0.5,  568000000,  20),
        ]
        return {
            cid: {
                'usd': p, 'usd_24h_change': ch, 'usd_24h_vol': vol,
                'name': n, 'symbol': sym, 'image': '', 'market_cap_rank': rank
            }
            for cid, n, sym, p, ch, vol, rank in mock
        }


def generate_mock_historical(coin, days='1'):
    """Generate a sequence of [timestamp, price] over a timeframe as a fallback."""
    now_ms = int(time.time() * 1000)
    prices = []
    base_price = {
        'bitcoin': 72000.0,
        'ethereum': 2000.0,
        'tether': 1.0,
        'binancecoin': 600.0,
        'solana': 165.0,
        'ripple': 0.52,
        'usd-coin': 1.0,
        'dogecoin': 0.12,
        'cardano': 0.44,
        'tron': 0.12,
        'avalanche-2': 35.0,
        'shiba-inu': 0.000022,
        'the-open-network': 5.5,
        'chainlink': 15.0,
        'polkadot': 7.5,
        'bitcoin-cash': 350.0,
        'near': 7.0,
        'sui': 1.2,
        'matic-network': 0.55,
        'litecoin': 85.0,
    }.get(coin, 1.0)
    
    try:
        days_int = int(days)
    except ValueError:
        days_int = 1
        
    if days_int == 1:
        steps = 24
        step_ms = 3600000 # 1h
    elif days_int == 7:
        steps = 84 # every 2h for 7 days
        step_ms = 7200000
    else: # 30d
        steps = 30
        step_ms = 86400000 # 24h
        
    current_val = base_price
    for i in range(steps):
        ts = now_ms - (steps - 1 - i) * step_ms
        change = random.uniform(-0.015, 0.018)
        current_val = current_val * (1 + change)
        prices.append([ts, round(current_val, 4)])
    return prices

def fetch_historical_prices(coin, days='1'):
    """Proxy CoinGecko historical price data with caching and automatic mocks."""
    current_time = time.time()
    cache_key = f"{coin}_{days}"
    if cache_key in HIST_CACHE and (current_time - HIST_CACHE[cache_key]['last_updated'] < 300):
        return HIST_CACHE[cache_key]['data']
        
    url = f"https://api.coingecko.com/api/v3/coins/{coin}/market_chart?vs_currency=usd&days={days}"
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        print(f"Proxying CoinGecko historical data for {coin} (days={days})...")
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode('utf-8'))
            prices = data.get('prices', [])
            if not prices:
                raise ValueError("Empty prices from CoinGecko")
            HIST_CACHE[cache_key] = {
                'data': prices,
                'last_updated': current_time
            }
            return prices
    except Exception as e:
        print(f"Error fetching historical prices for {coin} (days={days}): {e}")
        if cache_key in HIST_CACHE:
            print("Using stale historical cache.")
            return HIST_CACHE[cache_key]['data']
            
        print(f"Returning mock historical data for {coin} (days={days}).")
        mock_data = generate_mock_historical(coin, days)
        # Don't cache mock data permanently, just a short grace period
        HIST_CACHE[cache_key] = {
            'data': mock_data,
            'last_updated': current_time - 240 # expires in 60s
        }
        return mock_data

def send_email_alert(coin, direction, target, current, recipient):
    """Send an email notification using standard smtplib and environment variables."""
    import smtplib
    from email.mime.text import MIMEText
    
    smtp_user = os.environ.get('SMTP_USER')
    smtp_pass = os.environ.get('SMTP_PASS')
    smtp_host = os.environ.get('SMTP_HOST', 'smtp.gmail.com')
    try:
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
    except Exception:
        smtp_port = 587
        
    if not smtp_user or not smtp_pass:
        print("SMTP_USER and SMTP_PASS environment variables are not configured. Skipping email alert.")
        return False
        
    subject = f"🚨 PulseCrypto Price Alert: {coin} Crossed {direction} {target}"
    body = (
        f"PulseCrypto Price Alert Triggered!\n\n"
        f"Asset: {coin}\n"
        f"Condition: Price crossed {direction} ${target}\n"
        f"Current Market Price: ${current}\n"
        f"Trigger Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC')}\n\n"
        f"Open PulseCrypto Dashboard to manage your alerts.\n"
    )
    
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = smtp_user
    msg['To'] = recipient
    
    try:
        print(f"Attempting to send email alert to {recipient} via {smtp_host}:{smtp_port}...")
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port)
        else:
            server = smtplib.SMTP(smtp_host, smtp_port)
            server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, [recipient], msg.as_string())
        server.close()
        print("Email alert sent successfully!")
        return True
    except Exception as e:
        print(f"Failed to send email alert: {e}")
        return False

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
                days = params.get('days', '1')
                historical = fetch_historical_prices(coin, days)
                self.wfile.write(json.dumps(historical).encode('utf-8'))
            except Exception as e:
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
            return

        elif route == '/api/alerts/trigger':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            try:
                coin = params.get('coin', 'BTC')
                direction = params.get('direction', 'above')
                target = params.get('target', '0')
                current = params.get('current', '0')
                email = params.get('email', '')
                
                import urllib.parse
                email = urllib.parse.unquote(email)
                
                success = False
                if email:
                    success = send_email_alert(coin, direction, target, current, email)
                
                self.wfile.write(json.dumps({"success": success}).encode('utf-8'))
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
    with http.server.ThreadingHTTPServer(server_address, ApiRequestHandler) as httpd:
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
