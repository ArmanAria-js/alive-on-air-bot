const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const { EMA, IchimokuCloud } = require("technicalindicators");
const { restClient } = require("@polygon.io/client-js");
const rest = restClient("TZ3fL57XrVMijHa0k8ZaxaMUNLnjkZcv");

const bot = new TelegramBot("8063871104:AAEjiCPViaiPJds8-BZb6CCwlXCwgGFHXYc", { polling: true });

console.info("Bot is running...");

const ADMIN_CHAT_ID = "6482403246";
const logCommandUsage = async (msg, command) => {
    try {
        const user = msg.from;
        const username = user.username ? `@${user.username}` : "No username";
        const name = user.first_name ? (user.last_name ? `${user.first_name} ${user.last_name}` : user.first_name) : "No name";
        const logMessage = `
🤖 *Command Used*
━━━━━━━━━━━━━━━
Command: \`${command}\`
User: ${username}
Name: ${name}
ID: \`${user.id}\`
Time: ${new Date().toISOString()}
        `;
        await bot.sendMessage(ADMIN_CHAT_ID, logMessage);
    } catch (error) {
        console.error("Error logging command:", error);
    }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Rate limit tracking
const rateLimits = {
    binance: { weight: 0, lastReset: Date.now(), resetInterval: 60000, maxWeight: 6000 },
    polygon: { requests: 0, lastReset: Date.now(), resetInterval: 60000, maxRequests: 5 },
    telegram: { requests: 0, lastReset: Date.now(), resetInterval: 1000, maxRequests: 30 },
};

const handleTelegramRateLimit = async (retryAfter) => {
    const waitTime = (retryAfter + 1) * 1000;
    console.log(`Hitting Telegram rate limit, waiting for ${waitTime}ms`);
    await delay(waitTime);
};

const checkRateLimit = async (api) => {
    const now = Date.now();
    const limit = rateLimits[api];

    // Reset counters if interval has passed
    if (now - limit.lastReset >= limit.resetInterval) {
        limit.requests = 0;
        limit.weight = 0;
        limit.lastReset = now;
    }

    // Check if we're at the limit
    if (api === "binance" && limit.weight >= limit.maxWeight) {
        const waitTime = limit.resetInterval - (now - limit.lastReset);
        await delay(waitTime);
        limit.weight = 0;
        limit.lastReset = Date.now();
    } else if (api === "polygon" && limit.requests >= limit.maxRequests) {
        const waitTime = limit.resetInterval - (now - limit.lastReset);
        await delay(waitTime);
        limit.requests = 0;
        limit.lastReset = Date.now();
    }
};

const CRYPTO_WATCH_LIST = [
    // Top Market Cap (Very Liquid)
    "BTCUSDT", // Bitcoin
    "ETHUSDT", // Ethereum
    "BNBUSDT", // Binance Coin
    "SOLUSDT", // Solana
    "XRPUSDT", // Ripple
    "ADAUSDT", // Cardano
    "DOGEUSDT", // Dogecoin
    "MATICUSDT", // Polygon
    "DOTUSDT", // Polkadot
    "LINKUSDT", // Chainlink

    // Mid Market Cap
    "AVAXUSDT", // Avalanche
    "TRXUSDT", // TRON
    "ATOMUSDT", // Cosmos
    "NEARUSDT", // NEAR Protocol
    "ICPUSDT", // Internet Computer
    "FTMUSDT", // Fantom
    "ALGOUSDT", // Algorand
    "CAKEUSDT", // PancakeSwap
    "FLOWUSDT", // Flow
    "MANAUSDT", // Decentraland

    // Others
    "SHIBUSDT", // Shiba Inu
    "CHZUSDT", // Chiliz
    "TONUSDT", // Toncoin
    "SUIUSDT", // Sui
    "MINAUSDT", // Mina
    "UNIUSDT", // Uniswap
    "SANDUSDT", // The Sandbox
];
const FOREX_WATCH_LIST = [
    "XAUUSD",
    "EURUSD",
    "USDJPY",
    "GBPUSD",
    "USDCHF",
    "AUDUSD",
    "USDCAD",
    "EURGBP",
    "EURAUD",
    "GBPJPY",
    "NZDUSD",
    "EURJPY",
    "EURCHF",
    "EURCAD",
    "CADJPY",
    "GBPAUD",
    "GBPCAD",
    "GBPCHF",
    "AUDCHF",
    "EURNZD",
    "GBPNZD",
    "AUDCAD",
    "AUDJPY",
    "DXY",
];

const formatForexSymbol = (symbol) => `C:${symbol}`;

// Commands for both markets
const commands = [
    // Crypto Commands
    { command: "cr_price", description: "Get crypto price (e.g., /cr_price BTCUSDT)" },
    { command: "cr_list", description: "Get prices for watched crypto pairs" },
    { command: "cr_check", description: "Technical analysis for crypto pairs" },

    // Forex Commands
    { command: "fx_price", description: "Get forex rate (e.g., /fx_price EURUSD)" },
    { command: "fx_list", description: "Get rates for major forex pairs" },
    { command: "fx_check", description: "Technical analysis for forex pairs" },

    // General Commands
    { command: "help", description: "Show all available commands" },
    { command: "markets", description: "Show market status" },
];

bot.setMyCommands(commands)
    .then(() => console.log("Bot commands have been set successfully"))
    .catch((error) => console.error("Error setting bot commands:", error));

// Timeframes in milliseconds
const TIMEFRAMES = {
    "1d": { interval: "1d", limit: 200, label: "1 Day" },
    "4h": { interval: "4h", limit: 200, label: "4 Hours" },
    "1h": { interval: "1h", limit: 200, label: "1 Hour" },
};

async function getKlines(symbol, interval, limit) {
    try {
        const response = await axios.get(`https://api.binance.com/api/v3/klines`, {
            params: {
                symbol,
                interval,
                limit,
            },
        });
        return response.data.map((candle) => ({
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
        }));
    } catch (error) {
        console.error(`Error fetching klines for ${symbol}:`, error.message);
        throw error;
    }
}

async function analyzePricePosition(symbol, timeframe) {
    try {
        const klines = await getKlines(symbol, timeframe.interval, timeframe.limit);
        const closes = klines.map((k) => k.close);
        const highs = klines.map((k) => k.high);
        const lows = klines.map((k) => k.low);

        console.log(`Analyzing ${symbol} ${timeframe.interval} - Got ${closes.length} candles`);

        // Calculate EMA (155 period)
        const ema = EMA.calculate({
            period: 155,
            values: closes,
        });

        // Calculate Ichimoku Cloud's Kijun-sen (55 period)
        const ichimoku = IchimokuCloud.calculate({
            high: highs,
            low: lows,
            conversionPeriod: 9,
            basePeriod: 55,
            spanPeriod: 52,
            displacement: 26,
        });

        // Make sure we have valid data
        if (ema.length === 0 || ichimoku.length === 0) {
            throw new Error("Insufficient data for indicators");
        }

        const currentPrice = closes[closes.length - 1];
        const currentEMA = ema[ema.length - 1];
        const currentKijun = ichimoku[ichimoku.length - 1].base;

        // Format prices to remove trailing zeros
        const formattedPrice = Number(currentPrice).toString();
        const formattedEMA = Number(currentEMA).toString();
        const formattedKijun = Number(currentKijun).toString();

        let position;
        if (currentPrice > currentEMA && currentPrice > currentKijun) {
            position = "📈 ABOVE";
        } else if (currentPrice < currentEMA && currentPrice < currentKijun) {
            position = "📉 BELOW";
        } else {
            position = "↔️ MIXED";
        }

        return {
            position,
            price: formattedPrice,
            ema: formattedEMA,
            kijun: formattedKijun,
        };
    } catch (error) {
        console.error(`Error in analyzePricePosition for ${symbol} ${timeframe.interval}:`, error);
        throw error;
    }
}

//? Handle the /price command
bot.onText(/\/cr_price/, async (msg) => {
    await logCommandUsage(msg, "/cr_price");
    const chatId = msg.chat.id;
    const symbol = msg.text.split(" ")[1];

    if (!symbol) return bot.sendMessage(chatId, "Please provide a symbol. Usage: /cr_price BTCUSDT");

    try {
        const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
        const price = response.data.price;

        bot.sendMessage(chatId, `The current price of ${symbol} is ${price}`);
    } catch (error) {
        console.error("Error:", error.message);
        bot.sendMessage(chatId, "An error occurred while fetching the price.");
    }
});

//? Handle the price-list
bot.onText(/\/cr_list/, async (msg) => {
    await logCommandUsage(msg, "/cr_list");
    const chatId = msg.chat.id;

    try {
        await checkRateLimit("binance");

        // Format symbols array correctly for Binance API
        const symbolsArray = JSON.stringify(CRYPTO_WATCH_LIST);

        // Get all prices in one batch request (weight: 2)
        const response = await axios.get("https://api.binance.com/api/v3/ticker/price", {
            params: {
                symbols: symbolsArray,
            },
        });
        rateLimits.binance.weight += 2;

        const prices = response.data.reduce((acc, item) => {
            acc[item.symbol] = item.price;
            return acc;
        }, {});

        const message = "📊 Current Crypto Prices:\n\n" + CRYPTO_WATCH_LIST.map((symbol) => `${symbol}: $${Number(prices[symbol]).toString()}`).join("\n");

        bot.sendMessage(chatId, message);
    } catch (error) {
        console.error("Binance API Error:", error.response?.data || error.message);
        handleApiError(error, chatId, "binance");
    }
});

// Add this new function to format group messages
const formatGroupMessage = (results, groupNumber, totalGroups) => {
    return (
        `🎯 Technical Analysis Report (${groupNumber}/${totalGroups})\n` +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        Object.entries(results)
            .map(([sym, timeframes]) => {
                const timeframeText = Object.entries(timeframes)
                    .map(
                        ([tf, result]) =>
                            `  ${TIMEFRAMES[tf].label}\n` +
                            `  ${result.position}\n` +
                            `  • Current: $${result.price}\n` +
                            `  • EMA(155): $${result.ema}\n` +
                            `  • Kijun(55): $${result.kijun}\n` +
                            `  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`
                    )
                    .join("\n");
                return `🔸 ${sym}\n${timeframeText}`;
            })
            .join("\n\n")
    );
};

// Update the cr_check command to handle message size limits
bot.onText(/\/cr_check/, async (msg) => {
    await logCommandUsage(msg, "/cr_check");
    const chatId = msg.chat.id;

    try {
        console.log("Starting /cr_check command...");
        let results = {};
        CRYPTO_WATCH_LIST.forEach((symbol) => {
            results[symbol] = {};
            Object.keys(TIMEFRAMES).forEach((tf) => {
                results[symbol][tf] = { position: "⏳ Analyzing...", price: "---", ema: "---", kijun: "---" };
            });
        });

        // Send initial messages for each group
        const SYMBOLS_PER_MESSAGE = 5;
        const messageGroups = {};
        const sentMessages = {};

        for (let i = 0; i < CRYPTO_WATCH_LIST.length; i += SYMBOLS_PER_MESSAGE) {
            const groupIndex = Math.floor(i / SYMBOLS_PER_MESSAGE);
            messageGroups[groupIndex] = CRYPTO_WATCH_LIST.slice(i, i + SYMBOLS_PER_MESSAGE);

            try {
                const groupResults = {};
                messageGroups[groupIndex].forEach((symbol) => {
                    groupResults[symbol] = results[symbol];
                });

                sentMessages[groupIndex] = await bot.sendMessage(chatId, formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length));
                await delay(100); // Small delay between sending messages
            } catch (error) {
                if (error.response && error.response.statusCode === 429) {
                    await handleTelegramRateLimit(error.response.body.parameters.retry_after);
                    // Retry sending the message
                    sentMessages[groupIndex] = await bot.sendMessage(
                        chatId,
                        formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length)
                    );
                }
            }
        }

        // Process in smaller batches
        const BATCH_SIZE = 3; // Reduced batch size
        const BATCH_DELAY = 3000; // Increased delay between batches

        for (let i = 0; i < CRYPTO_WATCH_LIST.length; i += BATCH_SIZE) {
            const batch = CRYPTO_WATCH_LIST.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async (symbol) => {
                    for (const [key, timeframe] of Object.entries(TIMEFRAMES)) {
                        try {
                            await checkRateLimit("binance");
                            const analysis = await analyzePricePosition(symbol, timeframe);
                            results[symbol][key] = analysis;

                            const groupIndex = Math.floor(CRYPTO_WATCH_LIST.indexOf(symbol) / SYMBOLS_PER_MESSAGE);
                            const groupSymbols = messageGroups[groupIndex];
                            const groupResults = {};
                            groupSymbols.forEach((sym) => {
                                groupResults[sym] = results[sym];
                            });

                            try {
                                await bot.editMessageText(formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length), {
                                    chat_id: chatId,
                                    message_id: sentMessages[groupIndex].message_id,
                                });
                                await delay(500); // Add delay between message edits
                            } catch (error) {
                                if (error.response && error.response.statusCode === 429) {
                                    await handleTelegramRateLimit(error.response.body.parameters.retry_after);
                                    // Retry the edit
                                    await bot.editMessageText(formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length), {
                                        chat_id: chatId,
                                        message_id: sentMessages[groupIndex].message_id,
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Error analyzing ${symbol} ${timeframe.label}:`, error);
                            results[symbol][key] = {
                                position: "❌ ERROR",
                                price: "---",
                                ema: "---",
                                kijun: "---",
                            };
                        }
                    }
                })
            );

            await delay(BATCH_DELAY);
        }
    } catch (error) {
        console.error("Error in /cr_check command:", error);
        bot.sendMessage(chatId, "❌ An error occurred while analyzing indicators.");
    }
});

//! FOREX
// Forex specific functions
const isForexMarketOpen = () => {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();

    if (day === 0 || (day === 6 && hour > 21) || (day === 5 && hour > 21)) return false;
    return true;
};

bot.onText(/\/fx_price/, async (msg) => {
    await logCommandUsage(msg, "/fx_price");
    const chatId = msg.chat.id;
    let symbol = msg.text.split(" ")[1];

    if (!symbol) return bot.sendMessage(chatId, "Please provide a symbol. Usage: /fx_price EURUSD");

    if (!isForexMarketOpen()) await bot.sendMessage(chatId, "⚠️ Note: Forex market is currently closed.");

    try {
        const formattedSymbol = formatForexSymbol(symbol);
        const quote = await rest.forex.lastQuote(formattedSymbol);

        if (quote.last) {
            const price = quote.last.p;
            const bid = quote.last.b;
            const ask = quote.last.a;
            const message = `
💱 *${symbol}*
━━━━━━━━━━━━━━━
Price: ${price}
Bid: ${bid}
Ask: ${ask}
Spread: ${(ask - bid).toFixed(5)}
            `;

            bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        } else {
            bot.sendMessage(chatId, "No data available for this symbol.");
        }
    } catch (error) {
        console.error("Error:", error.message);
        bot.sendMessage(chatId, "❌ An error occurred while fetching the rate.");
    }
});

// Handle forex list command
bot.onText(/\/fx_list/, async (msg) => {
    await logCommandUsage(msg, "/fx_list");
    const chatId = msg.chat.id;

    if (!isForexMarketOpen()) {
        await bot.sendMessage(chatId, "⚠️ Note: Forex market is currently closed.");
    }

    try {
        const initialMessage = "📊 Current Forex Rates:\n\n" + FOREX_WATCH_LIST.map((symbol) => `${symbol}: analyzing...`).join("\n");

        const sentMessage = await bot.sendMessage(chatId, initialMessage);
        let updatedPrices = [...FOREX_WATCH_LIST.map((symbol) => `${symbol}: analyzing...`)];

        // Process in smaller batches to respect rate limits
        const BATCH_SIZE = 3; // Process 3 pairs at a time
        for (let i = 0; i < FOREX_WATCH_LIST.length; i += BATCH_SIZE) {
            await checkRateLimit("polygon");

            const batch = FOREX_WATCH_LIST.slice(i, i + BATCH_SIZE);
            const promises = batch.map(async (symbol, batchIndex) => {
                try {
                    const formattedSymbol = formatForexSymbol(symbol);
                    const quote = await rest.forex.lastQuote(formattedSymbol);
                    rateLimits.polygon.requests++;

                    if (quote.last) {
                        const price = quote.last.p;
                        const previousClose = quote.last.h;
                        const change = (((price - previousClose) / previousClose) * 100).toFixed(2);
                        const direction = change >= 0 ? "📈" : "📉";

                        updatedPrices[i + batchIndex] = `${symbol}: ${direction} ${price.toFixed(5)} (${change}%)`;
                    } else {
                        updatedPrices[i + batchIndex] = `${symbol}: ❌ No data`;
                    }
                } catch (error) {
                    updatedPrices[i + batchIndex] = `${symbol}: ❌ error`;
                }
            });

            await Promise.all(promises);
            await bot.editMessageText("📊 Current Forex Rates:\n\n" + updatedPrices.join("\n"), {
                chat_id: chatId,
                message_id: sentMessage.message_id,
            });

            // Add delay between batches
            if (i + BATCH_SIZE < FOREX_WATCH_LIST.length) {
                await delay(12000); // Wait 12 seconds between batches
            }
        }
    } catch (error) {
        handleApiError(error, chatId, "polygon");
    }
});

// Add market status command
bot.onText(/\/markets/, async (msg) => {
    await logCommandUsage(msg, "/markets");
    const cryptoStatus = "🟢 Open (24/7)";
    const forexStatus = isForexMarketOpen() ? "🟢 Open" : "🔴 Closed";

    const message = `
🏛 *Market Status*
━━━━━━━━━━━━━━━━━━━━━

*Crypto Market:* ${cryptoStatus}

*Forex Market:* ${forexStatus}
${!isForexMarketOpen() ? "\nNext Open: Monday 21:00 UTC" : ""}

*Forex Market Hours (UTC)*
• Sydney: 22:00 - 07:00
• Tokyo: 00:00 - 09:00
• London: 08:00 - 17:00
• New York: 13:00 - 22:00
    `;

    bot.sendMessage(msg.chat.id, message, { parse_mode: "Markdown" });
});

// Update help command to include both markets
bot.onText(/\/help/, async (msg) => {
    await logCommandUsage(msg, "/help");
    const helpText = `
🤖 *Available Commands*
━━━━━━━━━━━━━━━━━━━━━

*Crypto Commands:*
/cr_price SYMBOL - Get crypto price
/cr_list - Show all watched crypto pairs
/cr_check - Technical analysis for crypto

*Forex Commands:*
/fx_price SYMBOL - Get forex rate
/fx_list - Show major forex pairs
/fx_check - Technical analysis for forex

*General Commands:*
/markets - Show market status
/help - Show this help message

*Examples:*
• Crypto: \`/cr_price BTCUSDT\`
• Forex: \`/fx_price EURUSD\`

*Watched Pairs:*
Crypto: ${CRYPTO_WATCH_LIST.join(", ")}
Forex: ${FOREX_WATCH_LIST.map((s) => s.replace("=X", "")).join(", ")}
    `;

    bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown", disable_web_page_preview: true });
});

bot.onText(/\/start/, async (msg) => {
    await logCommandUsage(msg, "/start");
    const welcomeText = `
👋 *Welcome to Market Analysis Bot!*
━━━━━━━━━━━━━━━━━━━━━

I can help you monitor crypto and forex markets.

*Crypto Commands:*
/cr_price SYMBOL - Get crypto price
/cr_list - Show watched pairs
/cr_check - Technical analysis

*Forex Commands:*
/fx_price SYMBOL - Get forex rate
/fx_list - Show major pairs
/fx_check - Technical analysis

Try /help for more details!
    `;

    bot.sendMessage(msg.chat.id, welcomeText, {
        parse_mode: "Markdown",
        reply_markup: {
            keyboard: [
                ["/cr_check", "/fx_check"],
                ["/cr_list", "/fx_list"],
                ["/help", "/markets"],
            ],
            resize_keyboard: true,
        },
    });
});

const formatMessage = (results) => {
    return (
        "🎯 Technical Analysis Report\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n\n" +
        Object.entries(results)
            .map(([sym, timeframes]) => {
                const timeframeText = Object.entries(timeframes)
                    .map(
                        ([tf, result]) =>
                            `  ${TIMEFRAMES[tf].label}\n` +
                            `  ${result.position}\n` +
                            `  • Current: $${result.price}\n` +
                            `  • EMA(155): $${result.ema}\n` +
                            `  • Kijun(55): $${result.kijun}\n` +
                            `  ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`
                    )
                    .join("\n");
                return `🔸 ${sym}\n${timeframeText}`;
            })
            .join("\n\n")
    );
};

bot.onText(/\/fx_check/, async (msg) => {
    await logCommandUsage(msg, "/fx_check");
    const chatId = msg.chat.id;

    if (!isForexMarketOpen()) {
        await bot.sendMessage(chatId, "⚠️ Note: Forex market is currently closed.");
    }

    try {
        console.log("Starting /fx_check command...");
        let results = {};
        FOREX_WATCH_LIST.forEach((symbol) => {
            results[symbol] = {};
            Object.keys(TIMEFRAMES).forEach((tf) => {
                results[symbol][tf] = { position: "⏳ Analyzing...", price: "---", ema: "---", kijun: "---" };
            });
        });

        // Send initial messages for each group
        const SYMBOLS_PER_MESSAGE = 5;
        const messageGroups = {};
        const sentMessages = {};

        for (let i = 0; i < FOREX_WATCH_LIST.length; i += SYMBOLS_PER_MESSAGE) {
            const groupIndex = Math.floor(i / SYMBOLS_PER_MESSAGE);
            messageGroups[groupIndex] = FOREX_WATCH_LIST.slice(i, i + SYMBOLS_PER_MESSAGE);

            try {
                const groupResults = {};
                messageGroups[groupIndex].forEach((symbol) => {
                    groupResults[symbol] = results[symbol];
                });

                sentMessages[groupIndex] = await bot.sendMessage(chatId, formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length));
                await delay(100);
            } catch (error) {
                if (error.response && error.response.statusCode === 429) {
                    await handleTelegramRateLimit(error.response.body.parameters.retry_after);
                    sentMessages[groupIndex] = await bot.sendMessage(
                        chatId,
                        formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length)
                    );
                }
            }
        }

        // Process in smaller batches
        const BATCH_SIZE = 3;
        const BATCH_DELAY = 3000;

        for (let i = 0; i < FOREX_WATCH_LIST.length; i += BATCH_SIZE) {
            const batch = FOREX_WATCH_LIST.slice(i, i + BATCH_SIZE);

            await Promise.all(
                batch.map(async (symbol) => {
                    for (const [key, timeframe] of Object.entries(TIMEFRAMES)) {
                        try {
                            await checkRateLimit("polygon");
                            // Get forex data from Polygon
                            const formattedSymbol = formatForexSymbol(symbol);
                            const bars = await rest.forex.aggregates(formattedSymbol, timeframe.interval, timeframe.limit);

                            // Process the data similar to crypto analysis
                            // ... (analysis logic remains the same)

                            const groupIndex = Math.floor(FOREX_WATCH_LIST.indexOf(symbol) / SYMBOLS_PER_MESSAGE);
                            const groupSymbols = messageGroups[groupIndex];
                            const groupResults = {};
                            groupSymbols.forEach((sym) => {
                                groupResults[sym] = results[sym];
                            });

                            try {
                                await bot.editMessageText(formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length), {
                                    chat_id: chatId,
                                    message_id: sentMessages[groupIndex].message_id,
                                });
                                await delay(500);
                            } catch (error) {
                                if (error.response && error.response.statusCode === 429) {
                                    await handleTelegramRateLimit(error.response.body.parameters.retry_after);
                                    await bot.editMessageText(formatGroupMessage(groupResults, parseInt(groupIndex) + 1, Object.keys(messageGroups).length), {
                                        chat_id: chatId,
                                        message_id: sentMessages[groupIndex].message_id,
                                    });
                                }
                            }
                        } catch (error) {
                            console.error(`Error analyzing ${symbol} ${timeframe.label}:`, error);
                            results[symbol][key] = {
                                position: "❌ ERROR",
                                price: "---",
                                ema: "---",
                                kijun: "---",
                            };
                        }
                    }
                })
            );

            await delay(BATCH_DELAY);
        }
    } catch (error) {
        console.error("Error in /fx_check command:", error);
        bot.sendMessage(chatId, "❌ An error occurred while analyzing indicators.");
    }
});

const handleApiError = (error, chatId, api) => {
    console.error(`${api} API Error:`, error);

    if (error.response?.status === 429 || error.response?.status === 418) bot.sendMessage(chatId, `⚠️ Rate limit reached for ${api}. Please try again later.`);
    else bot.sendMessage(chatId, `❌ An error occurred while fetching data from ${api}.`);
};
