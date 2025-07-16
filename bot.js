const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const PORT = process.env.PORT || 3000;

const bot = new Telegraf(BOT_TOKEN);

// File paths
const plansFilePath = path.join(__dirname, 'plans.json');       // All diamond-related plans/packages
const ordersFilePath = path.join(__dirname, 'orders.json');
// Note: packages.json is not explicitly loaded here as per your request,
//       it's kept separate for future potential use.

// Load plans
let allProducts = {}; // To store all plans
try {
    allProducts = JSON.parse(fs.readFileSync(plansFilePath, 'utf8'));
} catch (error) {
    console.error('Error loading plans.json:', error);
    allProducts = {}; // Fallback to empty object if file is not found or invalid
}

// Ensure orders.json exists
if (!fs.existsSync(ordersFilePath)) {
    fs.writeFileSync(ordersFilePath, JSON.stringify([]), 'utf8');
}

// Temporary storage for user input (for multi-step processes)
const userSessions = {}; // { userId: { step: 'waiting_for_uid' | 'waiting_for_payment_details', productCode: 'FX1', uid: '...', transactionId: '...', screenshotId: '...' } }

// --- Helper Functions ---

function getPlansList() { // Renamed from getPackagesList for clarity
    let message = "আমাদের ডায়মন্ড প্ল্যানগুলো নিচে দেওয়া হলো:\n\n";
    for (const category in allProducts) { // Iterate through all plans
        message += `⭐ ${category} 📦\n`;
        allProducts[category].forEach(product => {
            message += `• ${product.code} - ${product.name} = ${product.price}৳\n`;
        });
        message += "\n";
    }
    message += "আপনার পছন্দের প্ল্যানের কোড টাইপ করে পাঠান।";
    return message;
}

function saveOrder(order) {
    const orders = JSON.parse(fs.readFileSync(ordersFilePath, 'utf8'));
    orders.push(order);
    fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), 'utf8');
}

// --- Bot Commands and Actions ---

bot.start(async (ctx) => {
    await ctx.reply(
        `স্বাগতম, ${ctx.from.first_name}!\n\n` +
        `আমরা আপনার Free Fire আইডি-তে ম্যানুয়ালি ডায়মন্ড টপ-আপ করে থাকি।\n\n` +
        `আমাদের সার্ভিস ব্যবহার করার নিয়মাবলী:\n` +
        `১. "Buy Now" বাটনে ক্লিক করে প্ল্যান লিস্ট দেখুন।\n` +
        `২. আপনার পছন্দের প্ল্যান কোড টাইপ করে পাঠান।\n` +
        `৩. আপনার Free Fire UID দিন।\n` +
        `৪. পেমেন্ট সম্পন্ন করে ট্রান্সেকশন আইডি এবং পেমেন্টের স্ক্রিনশট দিন।\n` +
        `৫. আপনার অর্ডারটি অ্যাডমিন দ্বারা নিশ্চিত হওয়ার পর ডায়মন্ড পাঠিয়ে দেওয়া হবে।\n\n` +
        `যেকোনো প্রশ্ন থাকলে \`/ask আপনার প্রশ্ন\` লিখে জিজ্ঞাসা করতে পারেন।`,
        Markup.inlineKeyboard([
            Markup.button.callback('Buy Now', 'buy_now')
        ])
    );
});

bot.action('buy_now', async (ctx) => {
    await ctx.editMessageText(getPlansList()); // Changed to getPlansList
});

// Handling plan code input
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // Handle /ask command
    if (text.startsWith('/ask ')) {
        const question = text.substring(5).trim();
        if (question) {
            try {
                const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                    model: "gpt-3.5-turbo",
                    messages: [{ role: "user", content: question }],
                    max_tokens: 150,
                    n: 1,
                    stop: null,
                    temperature: 0.7,
                }, {
                    headers: {
                        'Authorization': `Bearer ${OPENAI_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                const aiAnswer = response.data.choices[0].message.content.trim();
                await ctx.reply(`আপনার প্রশ্নের উত্তর:\n\n${aiAnswer}`);
            } catch (error) {
                console.error('Error with OpenAI API:', error.response ? error.response.data : error.message);
                await ctx.reply('দুঃখিত, আপনার প্রশ্নের উত্তর দিতে পারিনি।');
            }
        } else {
            await ctx.reply('অনুগ্রহ করে আপনার প্রশ্নটি `/ask` এর পর লিখুন।');
        }
        return; // Exit after handling /ask
    }

    // Check if user is in a multi-step process
    if (userSessions[userId]) {
        if (userSessions[userId].step === 'waiting_for_uid') {
            userSessions[userId].uid = text;
            userSessions[userId].step = 'waiting_for_payment_details';

            await ctx.reply(
                `আপনার Free Fire UID: ${text}\n\n` +
                `এবার পেমেন্ট করুন:\n\n` +
                `💰 bKash: 01965064030\n` +
                `💰 Nagad: 01937240300\n\n` +
                `পেমেন্ট করার পর ট্রানজেকশন আইডি (Transaction ID) এবং পেমেন্টের স্ক্রিনশট আমাকে পাঠান। প্রথমে ট্রানজেকশন আইডি দিন, তারপর স্ক্রিনশট পাঠান।`
            );
        } else if (userSessions[userId].step === 'waiting_for_payment_details') {
            userSessions[userId].transactionId = text;
            userSessions[userId].step = 'waiting_for_screenshot';
            await ctx.reply('ধন্যবাদ! এবার পেমেন্টের স্ক্রিনশটটি পাঠান।');
        }
        return; // Exit after handling session steps
    }

    // Check if the text is a valid product code (from plans)
    let selectedProduct = null;
    for (const category in allProducts) { // Search only in allProducts (loaded from plans.json)
        selectedProduct = allProducts[category].find(product => product.code.toUpperCase() === text.toUpperCase());
        if (selectedProduct) break;
    }

    if (selectedProduct) {
        userSessions[userId] = {
            step: 'waiting_for_uid',
            productCode: selectedProduct.code,
            productName: selectedProduct.name,
            productPrice: selectedProduct.price,
            timestamp: new Date().toISOString()
        };
        await ctx.reply(`আপনি "${selectedProduct.name}" (${selectedProduct.price}৳) সিলেক্ট করেছেন।\n\nএবার আপনার Free Fire Player ID (UID) দিন:`);
    } else {
        await ctx.reply('দুঃখিত, আপনি ভুল প্ল্যান কোড দিয়েছেন অথবা আপনার ইনপুটটি বোঝা যাচ্ছে না। অনুগ্রহ করে সঠিক কোড দিন অথবা `/start` টাইপ করে শুরু করুন।');
    }
});

// Handling screenshot
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    if (userSessions[userId] && userSessions[userId].step === 'waiting_for_screenshot') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userSessions[userId].screenshotId = fileId;

        const { productCode, productName, productPrice, uid, transactionId, screenshotId, timestamp } = userSessions[userId];

        const order = {
            orderId: Date.now().toString(), // Simple unique ID
            userId: userId,
            userName: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
            productCode,
            productName,
            productPrice,
            uid,
            transactionId,
            screenshotId,
            timestamp,
            status: 'Pending'
        };

        saveOrder(order);

        // Forward to admin
        const adminMessage = `
**নতুন অর্ডার!**
---
**অর্ডার আইডি:** ${order.orderId}
**ইউজার আইডি:** ${order.userId}
**ইউজার নাম:** ${order.userName}
**প্ল্যান:** ${order.productName} (${order.productCode})
**মূল্য:** ${order.productPrice}৳
**UID:** ${order.uid}
**ট্রানজেকশন আইডি:** ${order.transactionId}
**সময়:** ${new Date(order.timestamp).toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' })}
---
`;
        await bot.telegram.sendPhoto(ADMIN_ID, screenshotId, {
            caption: adminMessage,
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Approve', `approve_${order.orderId}`)],
                [Markup.button.callback('❌ Reject', `reject_${order.orderId}`)]
            ])
        });

        await ctx.reply('আপনার অর্ডার সফলভাবে গ্রহণ করা হয়েছে! অ্যাডমিন আপনার অর্ডারটি রিভিউ করে খুব শীঘ্রই আপনাকে জানাবেন।');

        delete userSessions[userId]; // Clear session
    } else {
        await ctx.reply('আমি এখন স্ক্রিনশট গ্রহণ করার জন্য প্রস্তুত নই। অনুগ্রহ করে আপনার অর্ডার প্রক্রিয়াটি সঠিক ভাবে অনুসরণ করুন।');
    }
});

// Admin actions: Approve/Reject
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('আপনি এই কাজটি করার অনুমতিপ্রাপ্ত নন।');
    }

    const orderId = ctx.match[1];
    let orders = JSON.parse(fs.readFileSync(ordersFilePath, 'utf8'));
    const orderIndex = orders.findIndex(o => o.orderId === orderId);

    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Approved';
        fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), 'utf8');

        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
            [Markup.button.callback('✅ Approved', 'approved_dummy')]
        ])); // Update admin message to show status

        // Notify user
        await bot.telegram.sendMessage(orders[orderIndex].userId, `ধন্যবাদ! আপনার Free Fire Diamond টপ-আপ অর্ডার (ID: ${orderId}) সফলভাবে সম্পন্ন হয়েছে।`);
    } else {
        await ctx.reply('অর্ডারটি খুঁজে পাওয়া যায়নি।');
    }
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) {
        return ctx.reply('আপনি এই কাজটি করার অনুমতিপ্রাপ্ত নন।');
    }

    const orderId = ctx.match[1];
    let orders = JSON.parse(fs.readFileSync(ordersFilePath, 'utf8'));
    const orderIndex = orders.findIndex(o => o.orderId === orderId);

    if (orderIndex !== -1) {
        orders[orderIndex].status = 'Rejected';
        fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2), 'utf8');

        await ctx.editMessageReplyMarkup(Markup.inlineKeyboard([
            [Markup.button.callback('❌ Rejected', 'rejected_dummy')]
        ])); // Update admin message to show status

        // Notify user
        await bot.telegram.sendMessage(orders[orderIndex].userId, `দুঃখিত! আপনার Free Fire Diamond টপ-আপ অর্ডার (ID: ${orderId}) বাতিল করা হয়েছে। কোনো সমস্যা হলে অ্যাডমিনের সাথে যোগাযোগ করুন।`);
    } else {
        await ctx.reply('অর্ডারটি খুঁজে পাওয়া যায়নি।');
    }
});

// Set up webhook for Render deployment
if (process.env.NODE_ENV === 'production') {
    bot.launch({
        webhook: {
            domain: WEBHOOK_URL.replace('https://', ''),
            port: PORT
        }
    }).then(() => {
        console.log(`Bot running in production mode via webhook on port ${PORT}`);
    }).catch(err => {
        console.error('Failed to launch webhook:', err);
    });
} else {
    bot.launch().then(() => {
        console.log('Bot running in development mode (polling)');
    }).catch(err => {
        console.error('Failed to launch polling:', err);
    });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
