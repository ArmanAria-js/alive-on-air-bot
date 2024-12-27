# Market Analysis Bot 📊

A Telegram bot that provides technical analysis for cryptocurrency and forex markets. The bot monitors multiple timeframes (1D, 4H, 1H) and sends alerts when strong trend signals are detected.

## Features 🚀

### Cryptocurrency Analysis

-   Monitor 25+ major cryptocurrencies on Binance
-   Real-time technical analysis using EMA(155) and Kijun(55)
-   Batch processing to respect API rate limits
-   Current price listings with percentage changes

### Forex Analysis

-   Track major forex pairs through Polygon.io
-   Market hours awareness
-   Technical analysis across multiple timeframes
-   Real-time rate monitoring

### Signal System

-   Automated trend detection
-   Multi-timeframe confirmation (1D, 4H, 1H)
-   Real-time alerts for strong trends
-   Admin controls for signal monitoring

## Commands 📝

### Crypto Commands

-   `/cr_list` - Display all watched cryptocurrency pairs
-   `/cr_check` - Run technical analysis on crypto pairs

### Forex Commands

-   `/fx_list` - Show major forex pairs
-   `/fx_check` - Run technical analysis on forex pairs

### Signal Commands

-   `/signals_start` - Start automated signal checking
-   `/signals_stop` - Stop signal checking
-   `/signals_status` - Check signal checker status

### General Commands

-   `/markets` - Show market status
-   `/help` - Display available commands

## Technical Indicators 📈

The bot uses two main technical indicators:

1. EMA (Exponential Moving Average) - 155 period
2. Kijun-sen (Base Line) - 55 period

A strong signal is generated when price is above/below both indicators across all timeframes (1D, 4H, 1H).

## Rate Limits ⚠️

### Binance API

-   Weight limit: 6000/minute
-   Batch processing implemented
-   Automatic rate limit handling

### Polygon.io

-   Request limit: 5/minute (Free tier)
-   Built-in rate limit protection
-   Automatic retry system

### Telegram API

-   Message limit: 30/second
-   Automatic rate limit handling
-   Message batching for large updates

## Environment Variables 🔑

TELEGRAM_BOT_TOKEN=your_bot_token
ADMIN_CHAT_ID=your_chat_id
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
POLYGON_API_KEY=your_polygon_api_key

## Installation 🛠️

1. Clone the repository
2. Install dependencies
3. Set up environment variables
4. Run the bot

## Dependencies 📦

-   node-telegram-bot-api
-   axios
-   technicalindicators
-   dotenv

## Error Handling 🔧

The bot includes:

-   API rate limit handling
-   Market hours awareness
-   Error logging
-   Admin notifications for critical errors
-   Automatic retry mechanisms

## Maintenance 🔄

Regular checks recommended for:

-   API rate limit usage
-   Signal accuracy
-   Market hours alignment
-   Error logs

## Support 💬

For issues or questions, contact the administrator through Telegram.

## License 📄

[MIT] - See LICENSE file for details
