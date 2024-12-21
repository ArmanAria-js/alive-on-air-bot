const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const { EMA, IchimokuCloud } = require("technicalindicators");

const bot = new TelegramBot("8063871104:AAEjiCPViaiPJds8-BZb6CCwlXCwgGFHXYc", { polling: true });

console.info("Bot is running...");

const WATCH_LIST = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT", "DOGEUSDT", "DOTUSDT", "XLMUSDT", "LTCUSDT", "LINKUSDT"];

// Timeframes in milliseconds
const TIMEFRAMES = {
    "1d": { interval: "1d", limit: 200, label: "1 Day" },
    "4h": { interval: "4h", limit: 200, label: "4 Hours" },
    "1h": { interval: "1h", limit: 200, label: "1 Hour" },
};

async function getKlines(symbol, interval, limit) {
    try {
        const response = await axios.get(`https://api.binance.com/api/v3/klines`, { params: { symbol, interval, limit } });
        return response.data.map((candle) => ({ high: parseFloat(candle[2]), low: parseFloat(candle[3]), close: parseFloat(candle[4]) }));
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
bot.onText(/\/price/, async (msg) => {
    const chatId = msg.chat.id;
    const symbol = msg.text.split(" ")[1];

    if (!symbol) return bot.sendMessage(chatId, "Please provide a symbol. Usage: /price BTCUSDT");

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
bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        const initialMessage = "📊 Current Prices:\n\n" + WATCH_LIST.map((symbol) => `${symbol}: analyzing...`).join("\n");

        const sentMessage = await bot.sendMessage(chatId, initialMessage);

        let updatedPrices = [...WATCH_LIST.map((symbol) => `${symbol}: analyzing...`)];

        for (let i = 0; i < WATCH_LIST.length; i++) {
            const symbol = WATCH_LIST[i];
            try {
                const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
                const formattedPrice = Number(response.data.price).toString();
                updatedPrices[i] = `${symbol}: $${formattedPrice}`;

                await bot.editMessageText("📊 Current Prices:\n\n" + updatedPrices.join("\n"), { chat_id: chatId, message_id: sentMessage.message_id });
            } catch (error) {
                updatedPrices[i] = `${symbol}: ❌ error`;
            }
        }
    } catch (error) {
        console.error("Error:", error.message);
        bot.sendMessage(chatId, "❌ An error occurred while fetching prices.");
    }
});

bot.onText(/\/check/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        console.log("Starting /check command...");
        let results = {};
        // Update the placeholder format too
        WATCH_LIST.forEach((symbol) => {
            results[symbol] = {};
            Object.keys(TIMEFRAMES).forEach((tf) => {
                results[symbol][tf] = { position: "⏳ Analyzing...", price: "---", ema: "---", kijun: "---" };
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

        const sentMessage = await bot.sendMessage(chatId, formatMessage(results));

        for (const symbol of WATCH_LIST) {
            for (const [key, timeframe] of Object.entries(TIMEFRAMES)) {
                try {
                    console.log(`Analyzing ${symbol} for ${timeframe.label}...`);
                    results[symbol][key] = await analyzePricePosition(symbol, timeframe);

                    await bot.editMessageText(formatMessage(results), { chat_id: chatId, message_id: sentMessage.message_id });
                } catch (error) {
                    console.error(`Error processing ${symbol} ${timeframe.label}:`, error);
                    results[symbol][key] = { position: "❌ ERROR", price: "---", ema: "---", kijun: "---" };
                    await bot.editMessageText(formatMessage(results), { chat_id: chatId, message_id: sentMessage.message_id });
                }
            }
        }
    } catch (error) {
        console.error("Error in /check command:", error);
        bot.sendMessage(chatId, "❌ An error occurred while analyzing indicators.");
    }
});
